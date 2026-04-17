import os
from typing import Optional

from dotenv import load_dotenv

load_dotenv()


def _clean(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    v = value.strip()
    return v or None


def resolve_fal_key(header_value: Optional[str] = None) -> Optional[str]:
    # 调试时允许请求头覆盖；默认从 .env 读取
    return _clean(header_value) or _clean(os.getenv("FAL_KEY"))


def resolve_upload_post_key(header_value: Optional[str] = None) -> Optional[str]:
    return _clean(header_value) or _clean(os.getenv("UPLOAD_POST_API_KEY"))


def get_upload_post_default_username() -> Optional[str]:
    return _clean(os.getenv("UPLOAD_POST_DEFAULT_USERNAME"))

"""
Central API key resolution: request header (debug) > environment variable > config/api_keys.local.json
"""
from __future__ import annotations

import json
import os
from typing import Any, Dict, Optional

_ROOT = os.path.dirname(os.path.abspath(__file__))
_CONFIG_PATH = os.path.join(_ROOT, "config", "api_keys.local.json")

_file_cache: Optional[Dict[str, Any]] = None


def _load_json() -> Dict[str, Any]:
    global _file_cache
    if _file_cache is not None:
        return _file_cache
    _file_cache = {}
    if os.path.isfile(_CONFIG_PATH):
        try:
            with open(_CONFIG_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict):
                    _file_cache = data
        except Exception:
            _file_cache = {}
    return _file_cache


def _file_str(key: str) -> str:
    d = _load_json()
    v = d.get(key)
    return v.strip() if isinstance(v, str) else ""


def _env_or_file(env_names: tuple, file_key: str) -> str:
    for name in env_names:
        v = os.environ.get(name, "").strip()
        if v:
            return v
    return _file_str(file_key)


def resolve_gemini_key(x_header: Optional[str]) -> str:
    h = (x_header or "").strip()
    if h:
        return h
    return _env_or_file(("GEMINI_API_KEY",), "gemini_api_key")


def resolve_fal_key(x_header: Optional[str]) -> str:
    h = (x_header or "").strip()
    if h:
        return h
    return _env_or_file(("FAL_KEY", "FAL_API_KEY"), "fal_key")


def resolve_elevenlabs_key(x_header: Optional[str]) -> str:
    h = (x_header or "").strip()
    if h:
        return h
    return _env_or_file(("ELEVENLABS_API_KEY",), "elevenlabs_api_key")


def resolve_upload_post_key(x_header: Optional[str]) -> str:
    h = (x_header or "").strip()
    if h:
        return h
    return _env_or_file(("UPLOAD_POST_API_KEY",), "upload_post_api_key")


def get_upload_post_default_username() -> Optional[str]:
    v = os.environ.get("UPLOAD_POST_DEFAULT_USERNAME", "").strip()
    if v:
        return v
    u = _file_str("upload_post_default_username")
    return u or None
