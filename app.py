import os
import shutil
import asyncio
import re
from urllib.parse import quote, unquote
from dotenv import load_dotenv
from typing import Optional
from api_keys import (
    resolve_upload_post_key,
    get_upload_post_default_username,
)
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from generalprompt import router as generalprompt_router
from workbench_video import router as workbench_video_router
from workbench_rudio import router as workbench_rudio_router
from workbench_step5 import router as workbench_step5_router

load_dotenv()

# 常量
UPLOAD_DIR = "uploads"
OUTPUT_DIR = "output"
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)
WORKBENCH_PROJECTS_ROOT = os.environ.get("WORKBENCH_PROJECTS_ROOT", os.path.join(OUTPUT_DIR, "projects"))
WORKBENCH_ASSETS_ROOT = os.environ.get("WORKBENCH_ASSETS_ROOT", os.path.join(OUTPUT_DIR, "workbench_assets"))
WORKBENCH_GITHUB_ASSETS_RAW_BASE_URL = os.environ.get(
    "WORKBENCH_GITHUB_ASSETS_RAW_BASE_URL",
    "https://raw.githubusercontent.com/SuWeiheng200317/AI-shorts_Static_Resources/main",
).rstrip("/")
WORKBENCH_GITHUB_REPO_API_TREE_URL = os.environ.get(
    "WORKBENCH_GITHUB_REPO_API_TREE_URL",
    "https://api.github.com/repos/SuWeiheng200317/AI-shorts_Static_Resources/git/trees/main?recursive=1",
)
WORKBENCH_GITHUB_REPO_TREE_PAGE_URL = os.environ.get(
    "WORKBENCH_GITHUB_REPO_TREE_PAGE_URL",
    "https://github.com/SuWeiheng200317/AI-shorts_Static_Resources/tree/main",
)
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "").strip()
os.makedirs(WORKBENCH_PROJECTS_ROOT, exist_ok=True)
os.makedirs(WORKBENCH_ASSETS_ROOT, exist_ok=True)

# 配置
# 未设置时使用默认值，性能较高的服务器可适当调大
MAX_CONCURRENT_JOBS = int(os.environ.get("MAX_CONCURRENT_JOBS", "5"))
JOB_RETENTION_SECONDS = 3600  # 任务保留时长：1 小时

# 应用运行时状态
# 通过信号量限制最大并发任务数
concurrency_semaphore = asyncio.Semaphore(MAX_CONCURRENT_JOBS)

async def cleanup_jobs():
    """后台清理任务：定期删除过期任务与文件。"""
    import time
    print("🧹 Cleanup task started.")
    while True:
        try:
            await asyncio.sleep(300) # 每 5 分钟检查一次
            now = time.time()
            
            # 基于修改时间做目录清理（OUTPUT_DIR）
            # 排除持久化目录：项目与静态素材
            protected_dirs = {
                os.path.normpath(WORKBENCH_PROJECTS_ROOT),
                os.path.normpath(WORKBENCH_ASSETS_ROOT),
            }
            for job_id in os.listdir(OUTPUT_DIR):
                job_path = os.path.join(OUTPUT_DIR, job_id)
                job_path_norm = os.path.normpath(job_path)
                if job_path_norm in protected_dirs:
                    continue
                if os.path.isdir(job_path) and now - os.path.getmtime(job_path) > JOB_RETENTION_SECONDS:
                    print(f"🧹 Purging old output dir: {job_id}")
                    shutil.rmtree(job_path, ignore_errors=True)

            # 清理上传目录
            for filename in os.listdir(UPLOAD_DIR):
                file_path = os.path.join(UPLOAD_DIR, filename)
                try:
                    if now - os.path.getmtime(file_path) > JOB_RETENTION_SECONDS:
                         os.remove(file_path)
                except Exception: pass

        except Exception as e:
            print(f"⚠️ Cleanup error: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动清理协程
    cleanup_task = asyncio.create_task(cleanup_jobs())
    yield
    # 关闭阶段（如有需要可在此取消后台协程）

app = FastAPI(lifespan=lifespan)

# 为前端启用 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 挂载静态目录：视频文件
app.mount("/videos", StaticFiles(directory=OUTPUT_DIR), name="videos")
app.mount("/workbench-assets", StaticFiles(directory=WORKBENCH_ASSETS_ROOT), name="workbench-assets")
app.include_router(generalprompt_router)
app.include_router(workbench_video_router)
app.include_router(workbench_rudio_router)
app.include_router(workbench_step5_router)

import httpx


def _sanitize_workbench_project_folder_name(name: str) -> str:
    """将用户输入的项目名转为安全的文件夹名（禁止路径穿越与非法字符）。"""
    raw = (name or "").strip()
    if not raw:
        raise ValueError("empty")
    if ".." in raw or "/" in raw or "\\" in raw:
        raise ValueError("invalid")
    # Windows 非法文件名字符等
    safe = re.sub(r'[<>:"|?*\x00-\x1f]', "_", raw)
    safe = re.sub(r"\s+", " ", safe).strip()
    if len(safe) > 120:
        safe = safe[:120].rstrip()
    safe = safe.strip(" .")
    if not safe:
        raise ValueError("empty")
    return safe


def _safe_relpath(path: str) -> str:
    return path.replace("\\", "/")


def _build_github_asset_url(rel_url_path: str) -> str:
    # Keep "/" separators while encoding special characters in each segment.
    encoded_path = "/".join(quote(part) for part in rel_url_path.split("/"))
    return f"{WORKBENCH_GITHUB_ASSETS_RAW_BASE_URL}/{encoded_path}"


def _collect_workbench_assets(kind: str, limit: int):
    image_exts = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
    video_exts = {".mp4", ".mov", ".webm", ".mkv"}

    items = []
    for root, _, files in os.walk(WORKBENCH_ASSETS_ROOT):
        for filename in files:
            ext = os.path.splitext(filename)[1].lower()
            asset_type = None
            if ext in image_exts:
                asset_type = "image"
            elif ext in video_exts:
                asset_type = "video"
            else:
                continue

            if kind != "all" and kind != asset_type:
                continue

            abs_path = os.path.join(root, filename)
            rel_path = os.path.relpath(abs_path, WORKBENCH_ASSETS_ROOT)
            rel_url_path = _safe_relpath(rel_path)
            items.append({
                "type": asset_type,
                "name": filename,
                "relative_path": rel_url_path,
                "url": _build_github_asset_url(rel_url_path),
                "mtime": os.path.getmtime(abs_path),
            })

    items.sort(key=lambda x: x.get("mtime", 0), reverse=True)
    return items[:limit]


async def _collect_workbench_assets_from_github(kind: str, limit: int):
    image_exts = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
    video_exts = {".mp4", ".mov", ".webm", ".mkv"}
    items = []

    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "AI-short-main-workbench",
    }
    if GITHUB_TOKEN:
        headers["Authorization"] = f"Bearer {GITHUB_TOKEN}"
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.get(WORKBENCH_GITHUB_REPO_API_TREE_URL, headers=headers)
        resp.raise_for_status()
        data = resp.json()

    tree = data.get("tree", []) if isinstance(data, dict) else []
    for node in tree:
        if not isinstance(node, dict):
            continue
        if node.get("type") != "blob":
            continue

        path = str(node.get("path") or "")
        filename = os.path.basename(path)
        ext = os.path.splitext(filename)[1].lower()
        asset_type = None
        if ext in image_exts:
            asset_type = "image"
        elif ext in video_exts:
            asset_type = "video"
        else:
            continue

        if kind != "all" and kind != asset_type:
            continue

        rel_url_path = _safe_relpath(path)
        items.append({
            "type": asset_type,
            "name": filename,
            "relative_path": rel_url_path,
            "url": _build_github_asset_url(rel_url_path),
            # Git tree API does not include mtime; keep 0 for stable shape.
            "mtime": 0,
        })

    items.sort(key=lambda x: x.get("relative_path", ""))
    return items[:limit]


async def _collect_workbench_assets_from_github_tree_page(kind: str, limit: int):
    image_exts = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
    video_exts = {".mp4", ".mov", ".webm", ".mkv"}
    items = []

    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.get(
            WORKBENCH_GITHUB_REPO_TREE_PAGE_URL,
            headers={"User-Agent": "AI-short-main-workbench"},
        )
        resp.raise_for_status()
        html = resp.text

    # Fallback parser for root-level files from GitHub tree page.
    # Example href: /SuWeiheng200317/AI-shorts_Static_Resources/blob/main/222.png
    blob_paths = set(re.findall(r'href="/SuWeiheng200317/AI-shorts_Static_Resources/blob/main/([^"#?]+)"', html))
    for encoded_path in blob_paths:
        rel_url_path = _safe_relpath(unquote(encoded_path))
        filename = os.path.basename(rel_url_path)
        ext = os.path.splitext(filename)[1].lower()
        asset_type = None
        if ext in image_exts:
            asset_type = "image"
        elif ext in video_exts:
            asset_type = "video"
        else:
            continue
        if kind != "all" and kind != asset_type:
            continue
        items.append({
            "type": asset_type,
            "name": filename,
            "relative_path": rel_url_path,
            "url": _build_github_asset_url(rel_url_path),
            "mtime": 0,
        })

    items.sort(key=lambda x: x.get("relative_path", ""))
    return items[:limit]


class WorkbenchCreateProjectRequest(BaseModel):
    name: str


@app.get("/api/workbench/projects")
async def workbench_projects(limit: int = 100):
    safe_limit = max(1, min(limit, 500))
    projects = []

    for entry in os.listdir(WORKBENCH_PROJECTS_ROOT):
        abs_dir = os.path.join(WORKBENCH_PROJECTS_ROOT, entry)
        if not os.path.isdir(abs_dir):
            continue
        rel_dir = os.path.relpath(abs_dir, ".")
        projects.append({
            "slug": entry,
            "display_name": entry,
            "relative_dir": _safe_relpath(rel_dir),
            "videos_base_url": "/videos",
            "mtime": os.path.getmtime(abs_dir),
        })

    projects.sort(key=lambda x: x.get("mtime", 0), reverse=True)
    return {"projects": projects[:safe_limit]}


@app.post("/api/workbench/projects")
async def workbench_create_project(req: WorkbenchCreateProjectRequest):
    name = (req.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Project name is required")

    try:
        folder_name = _sanitize_workbench_project_folder_name(name)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project name")

    project_dir = os.path.normpath(os.path.join(WORKBENCH_PROJECTS_ROOT, folder_name))
    root_norm = os.path.normpath(WORKBENCH_PROJECTS_ROOT)
    if not project_dir.startswith(root_norm):
        raise HTTPException(status_code=400, detail="Invalid path")

    if os.path.exists(project_dir) and not os.path.isdir(project_dir):
        raise HTTPException(status_code=409, detail="A file exists with this name")

    if os.path.isdir(project_dir):
        raise HTTPException(status_code=409, detail="Project already exists")

    os.makedirs(project_dir, exist_ok=False)

    rel_dir = os.path.relpath(project_dir, ".")
    return {
        "slug": folder_name,
        "display_name": name,
        "relative_dir": _safe_relpath(rel_dir),
        "videos_base_url": "/videos",
    }


@app.delete("/api/workbench/projects/{slug}")
async def workbench_delete_project(slug: str):
    raw_slug = (slug or "").strip()
    if not raw_slug:
        raise HTTPException(status_code=400, detail="Project slug is required")

    try:
        folder_name = _sanitize_workbench_project_folder_name(raw_slug)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project slug")

    project_dir = os.path.normpath(os.path.join(WORKBENCH_PROJECTS_ROOT, folder_name))
    root_norm = os.path.normpath(WORKBENCH_PROJECTS_ROOT)
    if not project_dir.startswith(root_norm):
        raise HTTPException(status_code=400, detail="Invalid path")

    if not os.path.exists(project_dir):
        raise HTTPException(status_code=404, detail="Project not found")
    if not os.path.isdir(project_dir):
        raise HTTPException(status_code=409, detail="Target is not a project directory")

    try:
        shutil.rmtree(project_dir)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete project: {e}")

    return {"ok": True, "deleted_slug": folder_name}


@app.get("/api/workbench/static-assets")
async def workbench_static_assets(kind: str = "all", limit: int = 100):
    allowed = {"all", "image", "video"}
    if kind not in allowed:
        raise HTTPException(status_code=400, detail=f"kind must be one of: {', '.join(sorted(allowed))}")
    safe_limit = max(1, min(limit, 500))
    try:
        assets = await _collect_workbench_assets_from_github_tree_page(kind, safe_limit)
        if not assets:
            print("⚠️ GitHub tree page returned no assets, fallback to local assets")
            assets = _collect_workbench_assets(kind, safe_limit)
    except Exception as e:
        # Final fallback to local directory scan if GitHub page parsing is unavailable.
        print(f"⚠️ GitHub tree page parse failed, fallback to local assets: {e}")
        assets = _collect_workbench_assets(kind, safe_limit)
    return {"assets": assets}
@app.get("/api/social/user")
async def get_social_user(
    x_upload_post_key: Optional[str] = Header(None, alias="X-Upload-Post-Key"),
):
    """代理 Upload-Post 用户信息接口，返回可用账号（密钥来自服务端配置，可选请求头覆盖用于调试）。"""
    api_key = resolve_upload_post_key(x_upload_post_key)
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail="Missing API key: upload_post_api_key (set UPLOAD_POST_API_KEY or config/api_keys.local.json, or X-Upload-Post-Key for debug)",
        )

    url = "https://api.upload-post.com/api/uploadposts/users"
    print(f"🔍 Fetching User ID from: {url}")
    headers = {"Authorization": f"Apikey {api_key}"}
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            resp = await client.get(url, headers=headers)
            if resp.status_code != 200:
                print(f"❌ Upload-Post User Fetch Error: {resp.text}")
                raise HTTPException(status_code=resp.status_code, detail=f"Failed to fetch user: {resp.text}")
            
            data = resp.json()
            print(f"🔍 Upload-Post User Response: {data}")
            
            user_id = None
            # 返回结构通常为 {'success': True, 'profiles': [{'username': '...'}, ...]}
            profiles_list = []
            if isinstance(data, dict):
                 raw_profiles = data.get('profiles', [])
                 if isinstance(raw_profiles, list):
                     for p in raw_profiles:
                         username = p.get('username')
                         if username:
                             # 提取已连接的平台
                             socials = p.get('social_accounts', {})
                             connected = []
                             # 检查常见平台
                             for platform in ['tiktok', 'instagram', 'youtube']:
                                 account_info = socials.get(platform)
                                 # 若为有效对象则视为已连接
                                 if isinstance(account_info, dict):
                                     connected.append(platform)
                             
                             profiles_list.append({
                                 "username": username,
                                 "connected": connected
                             })
            
            default_username = get_upload_post_default_username()
            if not profiles_list:
                return {"profiles": [], "error": "No profiles found", "default_username": default_username}

            return {"profiles": profiles_list, "default_username": default_username}
            
            
        except Exception as e:
             raise HTTPException(status_code=500, detail=str(e))

