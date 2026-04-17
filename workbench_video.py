import asyncio
import base64
import json
import os
import threading
from typing import Any, Dict, Optional

import fal_client
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from api_keys import resolve_fal_key

router = APIRouter()

# fal_client.subscribe 会长时间占用；避免并发时互相覆盖 FAL_KEY
_fal_subscribe_lock = threading.Lock()

ASSETS_PREFIX = "/workbench-assets/"


def _assets_root() -> str:
    return os.environ.get("WORKBENCH_ASSETS_ROOT", os.path.join("output", "workbench_assets"))


def _guess_mime(path: str) -> Optional[str]:
    ext = os.path.splitext(path)[1].lower()
    return {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".gif": "image/gif",
    }.get(ext)


def _to_kling_start_image(start_image_url: str) -> str:
    """Kling 只接受 https URL 或 data URI；本地 /workbench-assets/ 转为 data URI。"""
    u = (start_image_url or "").strip()
    if not u:
        raise HTTPException(status_code=400, detail="start_image_url is required")

    if u.startswith(ASSETS_PREFIX):
        rel = u[len(ASSETS_PREFIX) :].lstrip("/")
        if not rel or ".." in rel.replace("\\", "/"):
            raise HTTPException(status_code=400, detail="Invalid workbench-assets path")
        abs_path = os.path.normpath(os.path.join(_assets_root(), rel.replace("/", os.sep)))
        root = os.path.normpath(_assets_root())
        if not abs_path.startswith(root) or not os.path.isfile(abs_path):
            raise HTTPException(status_code=400, detail=f"Image not found under workbench assets: {u}")
        mime = _guess_mime(abs_path)
        if not mime:
            raise HTTPException(status_code=400, detail="Unsupported image type for data URI")
        with open(abs_path, "rb") as f:
            b64 = base64.b64encode(f.read()).decode("ascii")
        return f"data:{mime};base64,{b64}"

    if u.startswith("https://"):
        return u
    if u.startswith("http://"):
        raise HTTPException(status_code=400, detail="Kling requires https:// URL, data URI, or /workbench-assets/...")
    if u.startswith("data:"):
        return u
    raise HTTPException(status_code=400, detail="Input must be https URL, data URI, or /workbench-assets/...")


def _extract_video_url_from_fal(data: Any) -> Optional[str]:
    """
    fal JS SDK 使用 result.data；队列 HTTP 有时会把业务结果包在 data/output 里。
    递归查找任意层级的 { "video": { "url": "..." } }。
    """
    if isinstance(data, dict):
        video = data.get("video")
        if isinstance(video, dict):
            url = video.get("url")
            if isinstance(url, str) and url.startswith("http"):
                return url
        for v in data.values():
            found = _extract_video_url_from_fal(v)
            if found:
                return found
    if isinstance(data, list):
        for item in data:
            found = _extract_video_url_from_fal(item)
            if found:
                return found
    return None


def _subscribe_kling(model_id: str, arguments: Dict[str, Any], fal_key: str) -> Dict[str, Any]:
    """同步调用 fal 队列 API（subscribe），避免 httpx 长连接被服务端断开。"""
    old = os.environ.get("FAL_KEY")
    try:
        with _fal_subscribe_lock:
            os.environ["FAL_KEY"] = fal_key
            return fal_client.subscribe(
                model_id,
                arguments=arguments,
                client_timeout=900.0,
            )
    finally:
        if old is None:
            os.environ.pop("FAL_KEY", None)
        else:
            os.environ["FAL_KEY"] = old


class WorkbenchKlingImageToVideoRequest(BaseModel):
    start_image_url: str
    prompt: str
    duration: Optional[str] = "5"
    generate_audio: Optional[bool] = False


class WorkbenchKlingTextToVideoRequest(BaseModel):
    prompt: str
    duration: Optional[str] = "5"
    generate_audio: Optional[bool] = False
    aspect_ratio: Optional[str] = "16:9"
    negative_prompt: Optional[str] = "blur, distort, and low quality"
    cfg_scale: Optional[float] = 0.5


@router.post("/api/workbench/kling/image-to-video")
async def workbench_kling_image_to_video(
    req: WorkbenchKlingImageToVideoRequest,
    x_fal_key: Optional[str] = Header(None, alias="X-Fal-Key"),
):
    fal_key = resolve_fal_key(x_fal_key)
    if not fal_key:
        raise HTTPException(
            status_code=400,
            detail="Missing API key: fal_key (set FAL_KEY in .env, or X-Fal-Key for debug)",
        )

    prompt = (req.prompt or "").strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="prompt is required")

    start_image_url = _to_kling_start_image(req.start_image_url)

    arguments = {
        "start_image_url": start_image_url,
        "prompt": prompt,
        "duration": str(req.duration or "5"),
        "generate_audio": bool(req.generate_audio),
    }

    loop = asyncio.get_running_loop()
    try:
        data = await loop.run_in_executor(
            None,
            lambda: _subscribe_kling(
                "fal-ai/kling-video/v3/pro/image-to-video",
                arguments,
                fal_key,
            ),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Kling request failed: {str(e)}")

    video_url = _extract_video_url_from_fal(data)
    if not video_url:
        try:
            snippet = json.dumps(data, ensure_ascii=False)[:800]
        except Exception:
            snippet = str(data)[:800]
        raise HTTPException(
            status_code=500,
            detail=f"Kling response missing video.url: {snippet}",
        )

    return {"video_url": video_url, "raw": data}


@router.post("/api/workbench/kling/text-to-video")
async def workbench_kling_text_to_video(
    req: WorkbenchKlingTextToVideoRequest,
    x_fal_key: Optional[str] = Header(None, alias="X-Fal-Key"),
):
    fal_key = resolve_fal_key(x_fal_key)
    if not fal_key:
        raise HTTPException(
            status_code=400,
            detail="Missing API key: fal_key (set FAL_KEY in .env, or X-Fal-Key for debug)",
        )

    prompt = (req.prompt or "").strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="prompt is required")

    arguments = {
        "prompt": prompt,
        "duration": str(req.duration or "5"),
        "generate_audio": bool(req.generate_audio),
        "aspect_ratio": str(req.aspect_ratio or "16:9"),
        "negative_prompt": str(req.negative_prompt or "blur, distort, and low quality"),
        "cfg_scale": float(req.cfg_scale if req.cfg_scale is not None else 0.5),
    }

    loop = asyncio.get_running_loop()
    try:
        data = await loop.run_in_executor(
            None,
            lambda: _subscribe_kling(
                "fal-ai/kling-video/v3/pro/text-to-video",
                arguments,
                fal_key,
            ),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Kling request failed: {str(e)}")

    video_url = _extract_video_url_from_fal(data)
    if not video_url:
        try:
            snippet = json.dumps(data, ensure_ascii=False)[:800]
        except Exception:
            snippet = str(data)[:800]
        raise HTTPException(
            status_code=500,
            detail=f"Kling response missing video.url: {snippet}",
        )

    return {"video_url": video_url, "raw": data}
