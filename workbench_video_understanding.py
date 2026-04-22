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
VIDEO_UNDERSTANDING_MODEL_ID = "fal-ai/video-understanding"


class VideoUnderstandingRequest(BaseModel):
    video_url: str
    prompt: str
    detailed_analysis: Optional[bool] = False


def _extract_output_text(data: Any) -> Optional[str]:
    if isinstance(data, str):
        t = data.strip()
        return t or None
    if isinstance(data, dict):
        output = data.get("output")
        if isinstance(output, str) and output.strip():
            return output.strip()
        for value in data.values():
            found = _extract_output_text(value)
            if found:
                return found
    if isinstance(data, list):
        for item in data:
            found = _extract_output_text(item)
            if found:
                return found
    return None


def _subscribe_video_understanding(arguments: Dict[str, Any], fal_key: str) -> Dict[str, Any]:
    queue_logs = []

    def on_queue_update(update: Any):
        if isinstance(update, fal_client.InProgress):
            for log in (update.logs or []):
                message = str(log.get("message") or "").strip()
                if message:
                    queue_logs.append(message)
                    print("video_understanding_queue_log:", message)

    try:
        print(
            "fal_subscribe_request:",
            VIDEO_UNDERSTANDING_MODEL_ID,
            json.dumps(arguments, ensure_ascii=False, default=str),
        )
    except (TypeError, ValueError):
        print("fal_subscribe_request:", VIDEO_UNDERSTANDING_MODEL_ID, arguments)

    old = os.environ.get("FAL_KEY")
    try:
        with _fal_subscribe_lock:
            os.environ["FAL_KEY"] = fal_key
            try:
                data = fal_client.subscribe(
                    VIDEO_UNDERSTANDING_MODEL_ID,
                    arguments=arguments,
                    with_logs=True,
                    on_queue_update=on_queue_update,
                    client_timeout=900.0,
                )
            except Exception as e:
                print("fal_subscribe_error:", VIDEO_UNDERSTANDING_MODEL_ID, str(e))
                raise
    finally:
        if old is None:
            os.environ.pop("FAL_KEY", None)
        else:
            os.environ["FAL_KEY"] = old

    try:
        print("fal_subscribe_response:\n" + json.dumps(data, ensure_ascii=False, indent=2, default=str))
    except (TypeError, ValueError):
        print("fal_subscribe_response:", data)

    if queue_logs:
        print("video_understanding_queue_logs_count:", len(queue_logs))

    return data


@router.post("/api/workbench/video-understanding")
async def workbench_video_understanding(
    req: VideoUnderstandingRequest,
    x_fal_key: Optional[str] = Header(None, alias="X-Fal-Key"),
):
    fal_key = resolve_fal_key(x_fal_key)
    if not fal_key:
        raise HTTPException(
            status_code=400,
            detail="Missing API key: fal_key (set FAL_KEY in .env, or X-Fal-Key for debug)",
        )

    video_url = str(req.video_url or "").strip()
    prompt = str(req.prompt or "").strip()
    if not video_url:
        raise HTTPException(status_code=400, detail="video_url is required")
    if not (video_url.startswith("https://") or video_url.startswith("http://")):
        raise HTTPException(status_code=400, detail="video_url must be http(s) URL")
    if not prompt:
        raise HTTPException(status_code=400, detail="prompt is required")

    arguments = {
        "video_url": video_url,
        "prompt": prompt,
        "detailed_analysis": bool(req.detailed_analysis),
    }

    loop = asyncio.get_running_loop()
    try:
        data = await loop.run_in_executor(
            None,
            lambda: _subscribe_video_understanding(arguments, fal_key),
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Video understanding request failed: {str(e)}")

    output_text = _extract_output_text(data)
    if not output_text:
        try:
            snippet = json.dumps(data, ensure_ascii=False)[:800]
        except Exception:
            snippet = str(data)[:800]
        raise HTTPException(status_code=500, detail=f"Video understanding response missing output: {snippet}")

    return {"output": output_text, "raw": data}
