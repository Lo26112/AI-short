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
import base64
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Header, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.responses import FileResponse, StreamingResponse
from generalprompt import router as generalprompt_router
from workbench_video import router as workbench_video_router
from workbench_rudio import router as workbench_rudio_router
from workbench_step5 import router as workbench_step5_router
from workbench_video_understanding import router as workbench_video_understanding_router
from workbench_lipsync import router as workbench_lipsync_router
from inspiration import router as workbench_inspiration_router

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
    "https://raw.githubusercontent.com/SuWeiheng200317/AI-shorts_Static_Resources/refs/heads/main",
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
WORKBENCH_GITHUB_REPO = os.environ.get(
    "WORKBENCH_GITHUB_REPO",
    "SuWeiheng200317/AI-shorts_Static_Resources",
).strip()
WORKBENCH_GITHUB_DEFAULT_BRANCH = os.environ.get("WORKBENCH_GITHUB_DEFAULT_BRANCH", "main").strip()
# GitHub Contents API 单文件建议上限（略低于 100MB 硬限制）
MAX_GITHUB_ASSET_UPLOAD_BYTES = int(os.environ.get("MAX_GITHUB_ASSET_UPLOAD_BYTES", str(95 * 1024 * 1024)))

_ASSET_IMAGE_EXTS = frozenset({".png", ".jpg", ".jpeg", ".webp", ".gif"})
_ASSET_VIDEO_EXTS = frozenset({".mp4", ".mov", ".webm", ".mkv"})
_ASSET_AUDIO_EXTS = frozenset({".mp3", ".wav", ".aac", ".m4a", ".flac", ".ogg"})
_ASSET_ALL_EXTS = _ASSET_IMAGE_EXTS | _ASSET_VIDEO_EXTS | _ASSET_AUDIO_EXTS

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
app.include_router(workbench_video_understanding_router)
app.include_router(workbench_lipsync_router)
app.include_router(workbench_inspiration_router)

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


def _category_from_rel_url_path(rel_url_path: str) -> Optional[str]:
    raw = (rel_url_path or "").strip().replace("\\", "/")
    if not raw:
        return None
    parts = [p for p in raw.split("/") if p and p not in (".", "..")]
    return parts[0] if parts else None


def _build_github_asset_url(rel_url_path: str) -> str:
     # Normalize configured base into raw.githubusercontent refs/heads style.
    base = WORKBENCH_GITHUB_ASSETS_RAW_BASE_URL
    m_blob = re.match(r"^https?://github\.com/([^/]+)/([^/]+)/(?:blob|tree)/([^/]+)$", base)
    if m_blob:
        owner, repo, branch = m_blob.group(1), m_blob.group(2), m_blob.group(3)
        base = f"https://raw.githubusercontent.com/{owner}/{repo}/refs/heads/{branch}"
    else:
        m_raw_legacy = re.match(r"^https?://raw\.githubusercontent\.com/([^/]+)/([^/]+)/([^/]+)$", base)
        if m_raw_legacy:
            owner, repo, branch = m_raw_legacy.group(1), m_raw_legacy.group(2), m_raw_legacy.group(3)
            if branch != "refs":
                base = f"https://raw.githubusercontent.com/{owner}/{repo}/refs/heads/{branch}"
    # Keep "/" separators while encoding special characters in each segment.
    encoded_path = "/".join(quote(part) for part in rel_url_path.split("/"))
    # return f"{WORKBENCH_GITHUB_ASSETS_RAW_BASE_URL}/{encoded_path}"
    return f"{base}/{encoded_path}"


def _ext_to_asset_type(ext: str) -> Optional[str]:
    e = ext.lower()
    if e in _ASSET_IMAGE_EXTS:
        return "image"
    if e in _ASSET_VIDEO_EXTS:
        return "video"
    if e in _ASSET_AUDIO_EXTS:
        return "audio"
    return None


def _validate_static_asset_relative_path(relative_path: str) -> str:
    raw = (relative_path or "").strip().replace("\\", "/")
    if not raw or ".." in raw or raw.startswith("/"):
        raise HTTPException(status_code=400, detail="Invalid relative_path")
    for seg in raw.split("/"):
        if not seg or seg in (".", ".."):
            raise HTTPException(status_code=400, detail="Invalid relative_path")
    ext = os.path.splitext(raw)[1].lower()
    if ext not in _ASSET_ALL_EXTS:
        raise HTTPException(status_code=400, detail="Unsupported file type for this path")
    return raw


def _sanitize_upload_basename(name: str) -> str:
    base = os.path.basename((name or "").strip() or "upload.bin")
    base = re.sub(r'[<>:"|?*/\\\x00-\x1f]', "_", base).strip()
    if not base or base in (".", ".."):
        return "upload.bin"
    if len(base) > 200:
        base = base[:200]
    return base


def _github_rest_headers() -> dict:
    h = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "AI-short-main-workbench",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if GITHUB_TOKEN:
        h["Authorization"] = f"Bearer {GITHUB_TOKEN}"
    return h


def _github_raw_auth_headers() -> dict:
    """raw.githubusercontent.com：浏览器无法带 Token，由服务端代拉；私有仓库需 GITHUB_TOKEN。"""
    h = {
        "User-Agent": "AI-short-main-workbench",
        "Accept": "*/*",
    }
    if GITHUB_TOKEN:
        h["Authorization"] = f"Bearer {GITHUB_TOKEN}"
    return h


def _media_type_for_rel(rel: str) -> str:
    ext = os.path.splitext(rel)[1].lower()
    return {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".gif": "image/gif",
        ".mp4": "video/mp4",
        ".mov": "video/quicktime",
        ".webm": "video/webm",
        ".mkv": "video/x-matroska",
        ".mp3": "audio/mpeg",
        ".wav": "audio/wav",
        ".aac": "audio/aac",
        ".m4a": "audio/mp4",
        ".flac": "audio/flac",
        ".ogg": "audio/ogg",
    }.get(ext, "application/octet-stream")


def _github_contents_api_url(rel: str) -> str:
    owner_repo = WORKBENCH_GITHUB_REPO.strip("/")
    if "/" not in owner_repo:
        raise HTTPException(status_code=500, detail="WORKBENCH_GITHUB_REPO must be owner/repo")
    return "https://api.github.com/repos/" + owner_repo + "/contents/" + "/".join(
        quote(seg, safe="") for seg in rel.split("/")
    )


def _local_workbench_asset_path(rel: str) -> Optional[str]:
    """若本地 workbench 素材目录存在该文件，返回绝对路径，否则 None。"""
    if not rel:
        return None
    parts = [p for p in rel.replace("\\", "/").split("/") if p and p not in (".", "..")]
    if not parts:
        return None
    abs_path = os.path.normpath(os.path.join(WORKBENCH_ASSETS_ROOT, *parts))
    root = os.path.normpath(WORKBENCH_ASSETS_ROOT)
    if not abs_path.startswith(root) or not os.path.isfile(abs_path):
        return None
    return abs_path


async def _stream_github_raw(url: str):
    """从 GitHub Raw 流式拉取（可带 GITHUB_TOKEN）。"""
    async with httpx.AsyncClient(timeout=120.0, follow_redirects=True) as client:
        async with client.stream("GET", url, headers=_github_raw_auth_headers()) as resp:
            if resp.status_code != 200:
                body = await resp.aread()
                raise HTTPException(
                    status_code=502,
                    detail=f"Failed to load asset ({resp.status_code}): {body[:400]!r}",
                )
            async for chunk in resp.aiter_bytes(chunk_size=65536):
                yield chunk


async def _stream_github_contents_raw(rel: str):
    """
    通过 GitHub Contents API 以 raw 形式拉取文件内容。
    这是私有仓可用的方式（raw.githubusercontent.com 不支持在浏览器侧带 Token）。
    """
    api_url = _github_contents_api_url(rel)
    headers = _github_rest_headers()
    headers["Accept"] = "application/vnd.github.raw"
    async with httpx.AsyncClient(timeout=120.0, follow_redirects=True) as client:
        async with client.stream(
            "GET",
            api_url,
            headers=headers,
            params={"ref": WORKBENCH_GITHUB_DEFAULT_BRANCH},
        ) as resp:
            if resp.status_code != 200:
                body = await resp.aread()
                raise HTTPException(
                    status_code=502,
                    detail=f"GitHub contents returned {resp.status_code}: {body[:400]!r}",
                )
            async for chunk in resp.aiter_bytes(chunk_size=65536):
                yield chunk


def _collect_workbench_assets(kind: str, limit: int):
    items = []
    for root, _, files in os.walk(WORKBENCH_ASSETS_ROOT):
        for filename in files:
            ext = os.path.splitext(filename)[1].lower()
            asset_type = _ext_to_asset_type(ext)
            if asset_type is None:
                continue
            else:
                continue

            if kind != "all" and kind != asset_type:
                continue

            abs_path = os.path.join(root, filename)
            rel_path = os.path.relpath(abs_path, WORKBENCH_ASSETS_ROOT)
            rel_url_path = _safe_relpath(rel_path)
            items.append({
                "type": asset_type,
                "category": _category_from_rel_url_path(rel_url_path),
                "name": filename,
                "relative_path": rel_url_path,
                "url": _build_github_asset_url(rel_url_path),
                "mtime": os.path.getmtime(abs_path),
            })

    items.sort(key=lambda x: x.get("mtime", 0), reverse=True)
    return items[:limit]


async def _collect_workbench_assets_from_github(kind: str, limit: int):
    items = []

    headers = _github_rest_headers()
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
        asset_type = _ext_to_asset_type(ext)
        if asset_type is None:
            continue

        if kind != "all" and kind != asset_type:
            continue

        rel_url_path = _safe_relpath(path)
        items.append({
            "type": asset_type,
            "category": _category_from_rel_url_path(rel_url_path),
            "name": filename,
            "relative_path": rel_url_path,
            "url": _build_github_asset_url(rel_url_path),
            # Git tree API does not include mtime; keep 0 for stable shape.
            "mtime": 0,
        })

    items.sort(key=lambda x: x.get("relative_path", ""))
    return items[:limit]


async def _collect_workbench_assets_from_github_tree_page(kind: str, limit: int):
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
        asset_type = _ext_to_asset_type(ext)
        if asset_type is None:
            continue
        if kind != "all" and kind != asset_type:
            continue
        items.append({
            "type": asset_type,
            "category": _category_from_rel_url_path(rel_url_path),
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
    allowed = {"all", "image", "video", "audio"}
    if kind not in allowed:
        raise HTTPException(status_code=400, detail=f"kind must be one of: {', '.join(sorted(allowed))}")
    safe_limit = max(1, min(limit, 500))

    if GITHUB_TOKEN:
        try:
            assets = await _collect_workbench_assets_from_github(kind, safe_limit)
            return {"assets": assets}
        except Exception as e:
            print(f"⚠️ GitHub tree API failed, fallback to tree page / local: {e}")

    try:
        assets = await _collect_workbench_assets_from_github_tree_page(kind, safe_limit)
        if not assets:
            print("⚠️ GitHub tree page returned no assets, fallback to local assets")
            assets = _collect_workbench_assets(kind, safe_limit)
    except Exception as e:
        print(f"⚠️ GitHub tree page parse failed, fallback to local assets: {e}")
        assets = _collect_workbench_assets(kind, safe_limit)
    return {"assets": assets}


@app.get("/api/workbench/static-assets/inline")
async def workbench_static_asset_inline(relative_path: str):
    """浏览器内预览/播放：同域 + 通过 GitHub Contents API 读取（支持私有仓）；若本地有同名文件则优先本地。"""
    rel = _validate_static_asset_relative_path(relative_path)
    mt = _media_type_for_rel(rel)
    local = _local_workbench_asset_path(rel)
    if local:
        return FileResponse(local, media_type=mt, content_disposition_type="inline", filename=os.path.basename(rel))
    return StreamingResponse(
        _stream_github_contents_raw(rel),
        media_type=mt,
        headers={"Cache-Control": "public, max-age=300"},
    )


@app.get("/api/workbench/static-assets/download")
async def workbench_static_asset_download(relative_path: str):
    rel = _validate_static_asset_relative_path(relative_path)
    filename = os.path.basename(rel)
    mt = _media_type_for_rel(rel)
    local = _local_workbench_asset_path(rel)
    if local:
        return FileResponse(
            local,
            media_type=mt,
            content_disposition_type="attachment",
            filename=filename,
        )
    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"',
    }
    return StreamingResponse(_stream_github_contents_raw(rel), media_type=mt, headers=headers)


@app.post("/api/workbench/static-assets/upload")
async def workbench_static_asset_upload(
    file: UploadFile = File(...),
    repo_path: Optional[str] = Form(None),
):
    if not GITHUB_TOKEN:
        raise HTTPException(
            status_code=400,
            detail="GITHUB_TOKEN is required to upload assets to GitHub (repo Contents: write).",
        )

    raw_name = (repo_path or "").strip().replace("\\", "/")
    if raw_name:
        target = _validate_static_asset_relative_path(raw_name)
    else:
        safe_base = _sanitize_upload_basename(file.filename or "")
        target = _validate_static_asset_relative_path(safe_base)

    body = await file.read()
    if not body:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(body) > MAX_GITHUB_ASSET_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large (max {MAX_GITHUB_ASSET_UPLOAD_BYTES} bytes for GitHub upload)",
        )

    owner_repo = WORKBENCH_GITHUB_REPO.strip("/")
    if "/" not in owner_repo:
        raise HTTPException(status_code=500, detail="WORKBENCH_GITHUB_REPO must be owner/repo")

    api_path = "https://api.github.com/repos/" + owner_repo + "/contents/" + "/".join(
        quote(seg, safe="") for seg in target.split("/")
    )

    headers = _github_rest_headers()
    async with httpx.AsyncClient(timeout=120.0) as client:
        check = await client.get(
            api_path,
            headers=headers,
            params={"ref": WORKBENCH_GITHUB_DEFAULT_BRANCH},
        )
        if check.status_code == 200:
            raise HTTPException(status_code=409, detail="A file already exists at this path; choose another name or path.")
        if check.status_code not in (404,):
            raise HTTPException(
                status_code=502,
                detail=f"GitHub API error checking path: {check.status_code} {check.text[:500]}",
            )

        # Contents API 对大文件限制较多，使用 Git Data API：blob -> tree -> commit -> update ref
        # 1) create blob
        blob_url = f"https://api.github.com/repos/{owner_repo}/git/blobs"
        blob_payload = {
            "content": base64.b64encode(body).decode("ascii"),
            "encoding": "base64",
        }
        blob_resp = await client.post(blob_url, headers=headers, json=blob_payload)
        if blob_resp.status_code not in (201, 200):
            raise HTTPException(status_code=502, detail=f"GitHub blob failed: {blob_resp.status_code} {blob_resp.text[:800]}")
        blob_sha = (blob_resp.json() or {}).get("sha")
        if not isinstance(blob_sha, str) or not blob_sha:
            raise HTTPException(status_code=502, detail="GitHub blob response missing sha")

        # 2) resolve branch ref -> latest commit
        ref_url = f"https://api.github.com/repos/{owner_repo}/git/ref/heads/{quote(WORKBENCH_GITHUB_DEFAULT_BRANCH, safe='')}"
        ref_resp = await client.get(ref_url, headers=headers)
        if ref_resp.status_code != 200:
            raise HTTPException(status_code=502, detail=f"GitHub ref failed: {ref_resp.status_code} {ref_resp.text[:800]}")
        commit_sha = (((ref_resp.json() or {}).get("object") or {}).get("sha"))
        if not isinstance(commit_sha, str) or not commit_sha:
            raise HTTPException(status_code=502, detail="GitHub ref response missing commit sha")

        # 3) get base tree sha
        commit_url = f"https://api.github.com/repos/{owner_repo}/git/commits/{commit_sha}"
        commit_resp = await client.get(commit_url, headers=headers)
        if commit_resp.status_code != 200:
            raise HTTPException(status_code=502, detail=f"GitHub commit lookup failed: {commit_resp.status_code} {commit_resp.text[:800]}")
        base_tree_sha = (((commit_resp.json() or {}).get("tree") or {}).get("sha"))
        if not isinstance(base_tree_sha, str) or not base_tree_sha:
            raise HTTPException(status_code=502, detail="GitHub commit response missing tree sha")

        # 4) create tree with new blob at path
        tree_url = f"https://api.github.com/repos/{owner_repo}/git/trees"
        tree_payload = {
            "base_tree": base_tree_sha,
            "tree": [
                {
                    "path": target,
                    "mode": "100644",
                    "type": "blob",
                    "sha": blob_sha,
                }
            ],
        }
        tree_resp = await client.post(tree_url, headers=headers, json=tree_payload)
        if tree_resp.status_code not in (201, 200):
            raise HTTPException(status_code=502, detail=f"GitHub tree failed: {tree_resp.status_code} {tree_resp.text[:800]}")
        new_tree_sha = (tree_resp.json() or {}).get("sha")
        if not isinstance(new_tree_sha, str) or not new_tree_sha:
            raise HTTPException(status_code=502, detail="GitHub tree response missing sha")

        # 5) create commit
        create_commit_url = f"https://api.github.com/repos/{owner_repo}/git/commits"
        create_commit_payload = {
            "message": f"Add media asset: {target}",
            "tree": new_tree_sha,
            "parents": [commit_sha],
        }
        create_commit_resp = await client.post(create_commit_url, headers=headers, json=create_commit_payload)
        if create_commit_resp.status_code not in (201, 200):
            raise HTTPException(status_code=502, detail=f"GitHub create commit failed: {create_commit_resp.status_code} {create_commit_resp.text[:800]}")
        new_commit_sha = (create_commit_resp.json() or {}).get("sha")
        if not isinstance(new_commit_sha, str) or not new_commit_sha:
            raise HTTPException(status_code=502, detail="GitHub create commit response missing sha")

        # 6) update ref
        patch_url = f"https://api.github.com/repos/{owner_repo}/git/refs/heads/{quote(WORKBENCH_GITHUB_DEFAULT_BRANCH, safe='')}"
        patch_resp = await client.patch(patch_url, headers=headers, json={"sha": new_commit_sha, "force": False})
        if patch_resp.status_code not in (200,):
            raise HTTPException(status_code=502, detail=f"GitHub update ref failed: {patch_resp.status_code} {patch_resp.text[:800]}")

    rel_url_path = _safe_relpath(target)
    return {
        "ok": True,
        "relative_path": rel_url_path,
        "url": _build_github_asset_url(rel_url_path),
    }


@app.delete("/api/workbench/static-assets")
async def workbench_static_asset_delete(relative_path: str):
    rel = _validate_static_asset_relative_path(relative_path)

    if not GITHUB_TOKEN:
        raise HTTPException(
            status_code=400,
            detail="GITHUB_TOKEN is required to delete assets from GitHub.",
        )

    owner_repo = WORKBENCH_GITHUB_REPO.strip("/")
    if "/" not in owner_repo:
        raise HTTPException(status_code=500, detail="WORKBENCH_GITHUB_REPO must be owner/repo")

    api_path = _github_contents_api_url(rel)
    headers = _github_rest_headers()

    async with httpx.AsyncClient(timeout=120.0) as client:
        # 先读取文件，拿到 sha（DELETE contents 必需）
        check = await client.get(
            api_path,
            headers=headers,
            params={"ref": WORKBENCH_GITHUB_DEFAULT_BRANCH},
        )
        if check.status_code == 404:
            raise HTTPException(status_code=404, detail="Asset not found on GitHub")
        if check.status_code != 200:
            raise HTTPException(
                status_code=502,
                detail=f"GitHub lookup failed: {check.status_code} {check.text[:500]}",
            )

        data = check.json() if check.headers.get("content-type", "").startswith("application/json") else {}
        sha = data.get("sha") if isinstance(data, dict) else None
        if not isinstance(sha, str) or not sha:
            raise HTTPException(status_code=502, detail="GitHub file sha missing, cannot delete")

        payload = {
            "message": f"Delete media asset: {rel}",
            "sha": sha,
            "branch": WORKBENCH_GITHUB_DEFAULT_BRANCH,
        }
        dele = await client.request("DELETE", api_path, headers=headers, json=payload)
        if dele.status_code not in (200, 204):
            raise HTTPException(
                status_code=502,
                detail=f"GitHub delete failed: {dele.status_code} {dele.text[:800]}",
            )

    # 本地若有同名缓存文件，也一并删除，避免列表回退时仍显示旧文件
    local = _local_workbench_asset_path(rel)
    if local:
        try:
            os.remove(local)
        except Exception:
            pass

    return {"ok": True, "deleted_relative_path": rel}
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

