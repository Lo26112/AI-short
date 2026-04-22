import asyncio
import json
import os
import threading
from typing import Any, Dict, List, Optional

import fal_client
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from api_keys import resolve_fal_key

router = APIRouter()

_fal_subscribe_lock = threading.Lock()


class Step5ElementInput(BaseModel):
    frontal_image_url: str
    reference_image_urls: List[str] = Field(default_factory=list)


class Step5VideoEditRequest(BaseModel):
    prompt: str
    video_url: str
    image_urls: List[str] = Field(default_factory=list)
    keep_audio: bool = True
    elements: List[Step5ElementInput] = Field(default_factory=list)
    shot_type: str = "customize"


def _extract_video_url_from_fal(data: Any) -> Optional[str]:
    if isinstance(data, dict):
        video = data.get("video")
        if isinstance(video, dict):
            url = video.get("url")
            if isinstance(url, str) and url.startswith("http"):
                return url
        for value in data.values():
            found = _extract_video_url_from_fal(value)
            if found:
                return found
    if isinstance(data, list):
        for item in data:
            found = _extract_video_url_from_fal(item)
            if found:
                return found
    return None


def _normalize_https_or_data_url(url: str, field_name: str) -> str:
    raw = (url or "").strip()
    if not raw:
        raise HTTPException(status_code=400, detail=f"{field_name} is required")
    if raw.startswith("http://"):
        raise HTTPException(status_code=400, detail=f"{field_name} must be https:// or data URI")
    if raw.startswith("https://") or raw.startswith("data:"):
        return raw
    raise HTTPException(status_code=400, detail=f"{field_name} must be https:// or data URI")


def _subscribe_step5(arguments: Dict[str, Any], fal_key: str) -> Dict[str, Any]:
    logs: List[str] = []

    def on_queue_update(update: Any):
        if isinstance(update, fal_client.InProgress):
            for log in (update.logs or []):
                message = str(log.get("message") or "").strip()
                if message:
                    logs.append(message)

    old = os.environ.get("FAL_KEY")
    try:
        with _fal_subscribe_lock:
            os.environ["FAL_KEY"] = fal_key
            data = fal_client.subscribe(
                "fal-ai/kling-video/o3/pro/video-to-video/edit",
                arguments=arguments,
                with_logs=True,
                on_queue_update=on_queue_update,
                client_timeout=900.0,
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Step5 model request failed: {str(e)}")
    finally:
        if old is None:
            os.environ.pop("FAL_KEY", None)
        else:
            os.environ["FAL_KEY"] = old

    return {"data": data, "logs": logs}


@router.post("/api/workbench/kling/o3/video-edit")
async def workbench_kling_o3_video_edit(
    req: Step5VideoEditRequest,
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

    video_url = _normalize_https_or_data_url(req.video_url, "video_url")
    image_urls = [_normalize_https_or_data_url(u, "image_urls[]") for u in (req.image_urls or [])]

    elements_payload = []
    for idx, element in enumerate(req.elements or []):
        frontal = _normalize_https_or_data_url(element.frontal_image_url, f"elements[{idx}].frontal_image_url")
        refs = [
            _normalize_https_or_data_url(ref, f"elements[{idx}].reference_image_urls[]")
            for ref in (element.reference_image_urls or [])
            if str(ref or "").strip()
        ]
        elements_payload.append(
            {
                "frontal_image_url": frontal,
                "reference_image_urls": refs,
            }
        )

    arguments: Dict[str, Any] = {
        "prompt": prompt,
        "video_url": video_url,
        "keep_audio": bool(req.keep_audio),
        "shot_type": str(req.shot_type or "customize").strip() or "customize",
    }
    if image_urls:
        arguments["image_urls"] = image_urls
    if elements_payload:
        arguments["elements"] = elements_payload

    try:
        print("step5_request:", json.dumps(arguments, ensure_ascii=False, default=str))
    except Exception:
        print("step5_request:", arguments)

    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(None, lambda: _subscribe_step5(arguments, fal_key))
    data = result.get("data")
    logs = result.get("logs", [])

    video_result_url = _extract_video_url_from_fal(data)
    if not video_result_url:
        try:
            snippet = json.dumps(data, ensure_ascii=False)[:800]
        except Exception:
            snippet = str(data)[:800]
        raise HTTPException(status_code=500, detail=f"Step5 response missing video.url: {snippet}")

    return {"video_url": video_result_url, "raw": data, "logs": logs}
