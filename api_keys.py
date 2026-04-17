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

