import os
import shutil
import asyncio
import re
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

load_dotenv()

# 常量
OUTPUT_DIR = "output"
os.makedirs(OUTPUT_DIR, exist_ok=True)
WORKBENCH_PROJECTS_ROOT = os.environ.get("WORKBENCH_PROJECTS_ROOT", os.path.join(OUTPUT_DIR, "projects"))
WORKBENCH_ASSETS_ROOT = os.environ.get("WORKBENCH_ASSETS_ROOT", os.path.join(OUTPUT_DIR, "workbench_assets"))
os.makedirs(WORKBENCH_PROJECTS_ROOT, exist_ok=True)
os.makedirs(WORKBENCH_ASSETS_ROOT, exist_ok=True)

# 配置
JOB_RETENTION_SECONDS = 3600  # 任务保留时长：1 小时

async def cleanup_jobs():
    """后台清理任务：定期删除过期输出目录。"""
    print("🧹 Cleanup task started.")
    while True:
        try:
            await asyncio.sleep(300)  # 每 5 分钟检查一次
            import time
            now = time.time()

            # 基于修改时间做目录清理（OUTPUT_DIR）
            for entry in os.listdir(OUTPUT_DIR):
                path = os.path.join(OUTPUT_DIR, entry)
                if os.path.isdir(path) and now - os.path.getmtime(path) > JOB_RETENTION_SECONDS:
                    print(f"🧹 Purging old output dir: {entry}")
                    shutil.rmtree(path, ignore_errors=True)
        except Exception as e:
            print(f"⚠️ Cleanup error: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    asyncio.create_task(cleanup_jobs())
    yield

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
app.mount("/workbench-assets", StaticFiles(directory=WORKBENCH_ASSETS_ROOT), name="workbench-assets")


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
                "url": f"/workbench-assets/{rel_url_path}",
                "mtime": os.path.getmtime(abs_path),
            })

    items.sort(key=lambda x: x.get("mtime", 0), reverse=True)
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


@app.get("/api/workbench/static-assets")
async def workbench_static_assets(kind: str = "all", limit: int = 100):
    allowed = {"all", "image", "video"}
    if kind not in allowed:
        raise HTTPException(status_code=400, detail=f"kind must be one of: {', '.join(sorted(allowed))}")
    safe_limit = max(1, min(limit, 500))
    assets = _collect_workbench_assets(kind, safe_limit)
    return {"assets": assets}
