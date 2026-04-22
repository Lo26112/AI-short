import asyncio
import json
import os
import threading
from typing import Any, Dict, Optional

import fal_client
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from api_keys import resolve_fal_key

router = APIRouter()

_fal_subscribe_lock = threading.Lock()
LIPSYNC_MODEL_ID = "fal-ai/sync-lipsync/v3"
ALLOWED_SYNC_MODES = {"cut_off", "loop", "bounce", "silence", "remap"}


class WorkbenchLipsyncRequest(BaseModel):
    video_url: str
    audio_url: str
    sync_mode: Optional[str] = "cut_off"


def _extract_video_url(data: Any) -> Optional[str]:
    if isinstance(data, dict):
        video = data.get("video")
        if isinstance(video, dict):
            url = video.get("url")
            if isinstance(url, str) and url.startswith("http"):
                return url
        for v in data.values():
            found = _extract_video_url(v)
            if found:
                return found
    if isinstance(data, list):
        for item in data:
            found = _extract_video_url(item)
            if found:
                return found
    return None


def _subscribe_fal(model_id: str, arguments: Dict[str, Any], fal_key: str) -> Dict[str, Any]:
    try:
        print("fal_subscribe_request:", model_id, json.dumps(arguments, ensure_ascii=False, default=str))
    except (TypeError, ValueError):
        print("fal_subscribe_request:", model_id, arguments)

    old = os.environ.get("FAL_KEY")
    try:
        with _fal_subscribe_lock:
            os.environ["FAL_KEY"] = fal_key
            data = fal_client.subscribe(
                model_id,
                arguments=arguments,
                client_timeout=900.0,
            )
    finally:
        if old is None:
            os.environ.pop("FAL_KEY", None)
        else:
            os.environ["FAL_KEY"] = old
    return data


@router.post("/api/workbench/lipsync/generate")
async def workbench_lipsync_generate(
    req: WorkbenchLipsyncRequest,
    x_fal_key: Optional[str] = Header(None, alias="X-Fal-Key"),
):
    fal_key = resolve_fal_key(x_fal_key)
    if not fal_key:
        raise HTTPException(
            status_code=400,
            detail="Missing API key: fal_key (set FAL_KEY in .env, or X-Fal-Key for debug)",
        )

    video_url = (req.video_url or "").strip()
    audio_url = (req.audio_url or "").strip()
    sync_mode = str(req.sync_mode or "cut_off").strip() or "cut_off"

    if not video_url:
        raise HTTPException(status_code=400, detail="video_url is required")
    if not audio_url:
        raise HTTPException(status_code=400, detail="audio_url is required")
    if sync_mode not in ALLOWED_SYNC_MODES:
        raise HTTPException(status_code=400, detail=f"sync_mode must be one of: {', '.join(sorted(ALLOWED_SYNC_MODES))}")

    arguments = {
        "video_url": video_url,
        "audio_url": audio_url,
        "sync_mode": sync_mode,
    }

    loop = asyncio.get_running_loop()
    try:
        data = await loop.run_in_executor(
            None,
            lambda: _subscribe_fal(LIPSYNC_MODEL_ID, arguments, fal_key),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lipsync request failed: {str(e)}")

    video_out = _extract_video_url(data)
    if not video_out:
        raise HTTPException(status_code=500, detail="Lipsync response missing video.url")

    return {"video_url": video_out, "raw": data}
