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
MINIMAX_MODEL_ID = "fal-ai/minimax/speech-02-hd"
MAX_TEXT_LEN = 5000
ALLOWED_LANGUAGE_BOOSTS = {
    "Chinese", "Chinese,Yue", "English", "Arabic", "Russian", "Spanish", "French", "Portuguese",
    "German", "Turkish", "Dutch", "Ukrainian", "Vietnamese", "Indonesian", "Japanese", "Italian",
    "Korean", "Thai", "Polish", "Romanian", "Greek", "Czech", "Finnish", "Hindi", "Bulgarian",
    "Danish", "Hebrew", "Malay", "Slovak", "Swedish", "Croatian", "Hungarian", "Norwegian",
    "Slovenian", "Catalan", "Nynorsk", "Afrikaans", "auto",
}
ALLOWED_OUTPUT_FORMATS = {"url", "hex"}


class WorkbenchRudioRequest(BaseModel):
    text: str
    voice_id: Optional[str] = None
    speed: Optional[float] = None
    vol: Optional[float] = None
    pitch: Optional[int] = None
    emotion: Optional[str] = None
    english_normalization: Optional[bool] = None
    sample_rate: Optional[int] = None
    bitrate: Optional[int] = None
    audio_format: Optional[str] = None
    channel: Optional[int] = None
    language_boost: Optional[str] = None
    output_format: Optional[str] = "url"
    tone_list: Optional[list[str]] = None


def _fal_arguments_for_log(arguments: Dict[str, Any]) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    for k, v in arguments.items():
        if isinstance(v, str) and len(v) > 120:
            out[k] = v[:120] + f"...<truncated, {len(v)} chars>"
        else:
            out[k] = v
    return out


def _subscribe_fal(model_id: str, arguments: Dict[str, Any], fal_key: str) -> Dict[str, Any]:
    safe_args = _fal_arguments_for_log(arguments)
    try:
        print("fal_subscribe_request:", model_id, json.dumps(safe_args, ensure_ascii=False, default=str))
    except (TypeError, ValueError):
        print("fal_subscribe_request:", model_id, safe_args)

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


def _extract_audio_url(data: Any) -> Optional[str]:
    if isinstance(data, dict):
        audio = data.get("audio")
        if isinstance(audio, dict):
            url = audio.get("url")
            if isinstance(url, str) and url.startswith("http"):
                return url
        for v in data.values():
            found = _extract_audio_url(v)
            if found:
                return found
    if isinstance(data, list):
        for item in data:
            found = _extract_audio_url(item)
            if found:
                return found
    return None


@router.post("/api/workbench/rudio/generate")
async def workbench_rudio_generate(
    req: WorkbenchRudioRequest,
    x_fal_key: Optional[str] = Header(None, alias="X-Fal-Key"),
):
    fal_key = resolve_fal_key(x_fal_key)
    if not fal_key:
        raise HTTPException(
            status_code=400,
            detail="Missing API key: fal_key (set FAL_KEY in .env, or X-Fal-Key for debug)",
        )

    text = (req.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is required")
    if len(text) > MAX_TEXT_LEN:
        raise HTTPException(status_code=400, detail=f"text exceeds max length {MAX_TEXT_LEN}")

    arguments: Dict[str, Any] = {
        "text": text,
        "output_format": str(req.output_format or "url"),
    }
    if arguments["output_format"] not in ALLOWED_OUTPUT_FORMATS:
        raise HTTPException(status_code=400, detail="output_format must be one of: url, hex")

    voice_setting: Dict[str, Any] = {}
    if req.voice_id:
        voice_setting["voice_id"] = str(req.voice_id).strip()
    if req.speed is not None:
        voice_setting["speed"] = float(req.speed)
    if req.vol is not None:
        voice_setting["vol"] = float(req.vol)
    if req.pitch is not None:
        voice_setting["pitch"] = int(req.pitch)
    if req.emotion:
        voice_setting["emotion"] = str(req.emotion).strip()
    if req.english_normalization is not None:
        voice_setting["english_normalization"] = bool(req.english_normalization)
    if voice_setting:
        arguments["voice_setting"] = voice_setting

    audio_setting: Dict[str, Any] = {}
    if req.sample_rate is not None:
        audio_setting["sample_rate"] = int(req.sample_rate)
    if req.bitrate is not None:
        audio_setting["bitrate"] = int(req.bitrate)
    if req.audio_format:
        audio_setting["format"] = str(req.audio_format).strip()
    if req.channel is not None:
        audio_setting["channel"] = int(req.channel)
    if audio_setting:
        arguments["audio_setting"] = audio_setting

    if req.language_boost:
        language_boost = str(req.language_boost).strip()
        if language_boost not in ALLOWED_LANGUAGE_BOOSTS:
            raise HTTPException(status_code=400, detail="invalid language_boost")
        arguments["language_boost"] = language_boost

    tone_list = [str(x).strip() for x in (req.tone_list or []) if str(x).strip()]
    if tone_list:
        arguments["pronunciation_dict"] = {"tone_list": tone_list}

    loop = asyncio.get_running_loop()
    try:
        data = await loop.run_in_executor(
            None,
            lambda: _subscribe_fal(MINIMAX_MODEL_ID, arguments, fal_key),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"MiniMax request failed: {str(e)}")

    audio_url = _extract_audio_url(data)
    if arguments["output_format"] == "url" and not audio_url:
        raise HTTPException(status_code=500, detail="MiniMax response missing audio.url")

    return {
        "audio_url": audio_url,
        "duration_ms": data.get("duration_ms") if isinstance(data, dict) else None,
        "raw": data,
    }
