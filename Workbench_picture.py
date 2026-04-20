"""Workbench step 0: fal-ai nano-banana-2 / nano-banana-2/edit (after Seed prompt rewrite).

Called from generalprompt.generate after `_call_seed_v3` returns the image prompt."""

import json
from typing import Any, Optional

import httpx
from fastapi import HTTPException
from pydantic import BaseModel, Field

# Server-side defaults for fal-ai/nano-banana-2 (user-facing fields come from the client).
NANO_BANANA_2_URL = "https://fal.run/fal-ai/nano-banana-2"
NANO_BANANA_2_EDIT_URL = "https://fal.run/fal-ai/nano-banana-2/edit"

NANO_BANANA_2_DEFAULTS: dict[str, Any] = {
    "safety_tolerance": "4",
    "limit_generations": True,
    "sync_mode": False,
}

NANO_BANANA_2_ASPECT_RATIOS = frozenset({
    "auto", "21:9", "16:9", "3:2", "4:3", "5:4", "1:1", "4:5", "3:4", "2:3", "9:16",
    "4:1", "1:4", "8:1", "1:8",
})
NANO_BANANA_2_OUTPUT_FORMATS = frozenset({"jpeg", "png", "webp"})
NANO_BANANA_2_RESOLUTIONS = frozenset({"0.5K", "1K", "2K", "4K"})
NANO_BANANA_2_THINKING_LEVELS = frozenset({"minimal", "high"})


class NanoBanana2UserInput(BaseModel):
    """User-configurable subset of fal-ai/nano-banana-2 input (see api_file/nano banana2.txt)."""

    prompt: Optional[str] = None
    num_images: int = Field(default=1, ge=1, le=4)
    aspect_ratio: str = "auto"
    output_format: str = "png"
    resolution: str = "0.5K"
    enable_web_search: bool = False
    thinking_level: Optional[str] = None  # "minimal" | "high" | None to omit


def _build_nano_banana_2_request_body(nano_prompt: str, user: Optional[NanoBanana2UserInput]) -> dict[str, Any]:
    """`nano_prompt` is the final text from Seed; client `prompt` on user input is ignored."""
    body: dict[str, Any] = {
        **NANO_BANANA_2_DEFAULTS,
        "num_images": 1,
        "aspect_ratio": "auto",
        "output_format": "png",
        "resolution": "0.5K",
        "enable_web_search": False,
    }
    if user:
        d = user.model_dump(exclude_none=True)
        d.pop("prompt", None)
        tl = d.pop("thinking_level", None)
        if isinstance(tl, str) and tl.strip() in NANO_BANANA_2_THINKING_LEVELS:
            body["thinking_level"] = tl.strip()
        body.update(d)

    ar = body.get("aspect_ratio")
    if ar not in NANO_BANANA_2_ASPECT_RATIOS:
        raise HTTPException(status_code=400, detail=f"Invalid aspect_ratio: {ar!r}")
    of = body.get("output_format")
    if of not in NANO_BANANA_2_OUTPUT_FORMATS:
        raise HTTPException(status_code=400, detail=f"Invalid output_format: {of!r}")
    res = body.get("resolution")
    if res not in NANO_BANANA_2_RESOLUTIONS:
        raise HTTPException(status_code=400, detail=f"Invalid resolution: {res!r}")

    ni = body.get("num_images", 1)
    if not isinstance(ni, int) or ni < 1 or ni > 4:
        raise HTTPException(status_code=400, detail="num_images must be between 1 and 4")

    body["prompt"] = (nano_prompt or "").strip()
    if not body["prompt"]:
        raise HTTPException(status_code=400, detail="Nano Banana 2 prompt is empty after Seed step")
    return body


def _build_nano_banana_2_edit_request_body(
    nano_prompt: str,
    user: Optional[NanoBanana2UserInput],
    image_urls: list[str],
) -> dict[str, Any]:
    urls = [u for u in (image_urls or []) if isinstance(u, str) and u.strip()][:6]
    if not urls:
        raise HTTPException(status_code=400, detail="nano-banana-2/edit requires image_urls")

    body = _build_nano_banana_2_request_body(nano_prompt, user)
    body["image_urls"] = urls
    return body


async def run_nano_banana_image_pipeline(
    client: httpx.AsyncClient,
    fal_key: str,
    *,
    prompt_element_urls: list[str],
    context_image_urls: list[str],
    nano_banana_2: Optional[NanoBanana2UserInput],
    seed_prompt: str,
) -> tuple[list[str], Optional[str]]:
    """
    Call nano-banana-2 (t2i) or nano-banana-2/edit (i2i) with Seed output as prompt.
    Returns (output image URLs, optional description).
    """
    try:
        ordered_element_urls = [u for u in (prompt_element_urls or []) if isinstance(u, str) and u.strip()]
        image_urls = (ordered_element_urls or context_image_urls or [])[:6]
        use_edit = len(image_urls) > 0
        endpoint = NANO_BANANA_2_EDIT_URL if use_edit else NANO_BANANA_2_URL
        if use_edit:
            request_body = _build_nano_banana_2_edit_request_body(seed_prompt, nano_banana_2, image_urls)
            print("nano_banana_2_mode: edit")
        else:
            request_body = _build_nano_banana_2_request_body(seed_prompt, nano_banana_2)
            print("nano_banana_2_mode: t2i")

        print("nano_banana_2_request:", request_body)

        resp = await client.post(
            endpoint,
            headers={
                "Authorization": f"Key {fal_key}",
                "Content-Type": "application/json",
            },
            json=request_body,
        )
        try:
            data = resp.json()
        except Exception:
            data = {"detail": resp.text}

        if resp.status_code >= 400:
            raise HTTPException(status_code=resp.status_code, detail=data)

        images = data.get("images") or []
        image_urls_out: list[str] = []
        for item in images:
            if isinstance(item, dict) and item.get("url"):
                image_urls_out.append(str(item["url"]))
        description = (data.get("description") or "").strip()
        try:
            print("nano_banana_2_response_full:\n" + json.dumps(data, ensure_ascii=False, indent=2))
        except (TypeError, ValueError):
            print("nano_banana_2_response_full:", data)

        return image_urls_out, description or None
    finally:
        # request-scoped cleanup: avoid accidental reuse in chained calls
        prompt_element_urls.clear()
        context_image_urls.clear()
