import json
from typing import Any, Optional

import httpx
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field
from api_keys import resolve_fal_key


router = APIRouter(prefix="/api/generalprompt", tags=["generalprompt"])

# In-memory state for currently selected context images per (project_slug, step).
# This is only for debugging / log tracing in a single server process.
_CONTEXT_IMAGE_URLS_BY_KEY: dict[str, list[str]] = {}


STEP_LABELS = {
    0: "image",
    1: "video",
}

STEP_SYSTEM_PROMPTS = {
    0: (
        "You are a prompt engineer for image generation. "
        "Rewrite the user request into a concise, production-ready image prompt. "
        "Return only the final image prompt text. "
        "Output language must be English only. Do not use Chinese."
    ),
    1: (
        "You are a prompt engineer for image-to-video generation. "
        "Rewrite the user request into a cinematic video prompt including camera motion, scene action, "
        "lighting, style, and duration hints. Return only the final prompt text. "
        "Output language must be English only. Do not use Chinese."
    ),
}

SEED_V3_URL = "https://fal.run/fal-ai/bytedance/seed/v2/mini"
NANO_BANANA_2_URL = "https://fal.run/fal-ai/nano-banana-2"
NANO_BANANA_2_EDIT_URL = "https://fal.run/fal-ai/nano-banana-2/edit"

# Server-side defaults for fal-ai/nano-banana-2 (user-facing fields come from the client).
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
    resolution: str = "1K"
    enable_web_search: bool = False
    thinking_level: Optional[str] = None  # "minimal" | "high" | None to omit


class GeneralPromptRequest(BaseModel):
    step: int
    prompt: str
    project_slug: Optional[str] = None
    model: Optional[str] = "low"
    image_asset: Optional[str] = None
    video_asset: Optional[str] = None
    audio_asset: Optional[str] = None
    context_image_urls: list[str] = Field(default_factory=list)
    prompt_element_urls: list[str] = Field(default_factory=list)
    nano_banana_2: Optional[NanoBanana2UserInput] = None


class ContextSelectionRequest(BaseModel):
    step: int
    project_slug: Optional[str] = None
    context_image_urls: list[str] = Field(default_factory=list)


class GeneralPromptResponse(BaseModel):
    ok: bool
    step: int
    step_name: str
    received_prompt: str
    generated_prompt: str
    project_slug: Optional[str] = None
    nano_banana_description: Optional[str] = None
    nano_banana_image_urls: Optional[list[str]] = None


@router.post("/context-selection")
async def receive_context_selection(req: ContextSelectionRequest):
    key = f"{req.project_slug or 'default'}|step={req.step}"
    urls = req.context_image_urls or []
    _CONTEXT_IMAGE_URLS_BY_KEY[key] = urls

    print("context_selection:", req.model_dump())
    if urls:
        print("context_image_urls:", urls)
    print("context_selection_state:", {k: v for k, v in _CONTEXT_IMAGE_URLS_BY_KEY.items()})
    return {
        "ok": True,
        "step": req.step,
        "project_slug": req.project_slug,
        "context_image_count": len(req.context_image_urls),
    }


def _build_nano_banana_2_request_body(nano_prompt: str, user: Optional[NanoBanana2UserInput]) -> dict[str, Any]:
    """`nano_prompt` is the final text sent to fal-ai/nano-banana-2 (step 0生成图片: Seed output). Client `prompt` on user input is ignored."""
    body: dict[str, Any] = {
        **NANO_BANANA_2_DEFAULTS,
        "num_images": 1,
        "aspect_ratio": "auto",
        "output_format": "png",
        "resolution": "1K",
        "enable_web_search": False,
    }
    if user:
        d = user.model_dump(exclude_none=True)
        d.pop("prompt", None)  # always use server-provided nano_prompt (Seed result on step 0)
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
    """Build request for fal-ai/nano-banana-2/edit (image-to-image)."""
    urls = [u for u in (image_urls or []) if isinstance(u, str) and u.strip()][:6]
    if not urls:
        raise HTTPException(status_code=400, detail="nano-banana-2/edit requires image_urls")

    body = _build_nano_banana_2_request_body(nano_prompt, user)
    body["image_urls"] = urls
    return body


async def _call_seed_v3(
    client: httpx.AsyncClient,
    fal_key: str,
    step_idx: int,
    raw_prompt: str,
) -> str:
    request_body = {
        "prompt": raw_prompt,
        "system_prompt": STEP_SYSTEM_PROMPTS[step_idx],
        "thinking": "disabled",
        "reasoning_effort": "minimal",
        "max_completion_tokens": 1024,
        "temperature": 0.7,
        "top_p": 0.7,
    }

    resp = await client.post(
        SEED_V3_URL,
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

    out = (data.get("output") or "").strip()
    return out or raw_prompt


@router.post("/generate", response_model=GeneralPromptResponse)
async def generate_general_prompt(
    req: GeneralPromptRequest,
    x_fal_key: Optional[str] = Header(None, alias="X-Fal-Key"),
):
    raw_prompt = (req.prompt or "").strip()
    if not raw_prompt:
        raise HTTPException(status_code=400, detail="Prompt is required")

    if req.step not in STEP_LABELS:
        raise HTTPException(status_code=400, detail="Only step 0 and step 1 support prompt generation")

    fal_key = resolve_fal_key(x_fal_key)
    if not fal_key:
        raise HTTPException(
            status_code=400,
            detail="Missing API key: fal_key (set FAL_KEY/FAL_API_KEY or config/api_keys.local.json, or X-Fal-Key)",
        )

    step_name = STEP_LABELS[req.step]
    print("received:", req.model_dump())
    if req.context_image_urls:
        print("context_image_urls:", req.context_image_urls)
    if req.prompt_element_urls:
        print("prompt_element_urls:", req.prompt_element_urls)

    # Step 0 生成图片:
    # - if user provided images: use fal-ai/nano-banana-2/edit (image-to-image)
    # - else: use fal-ai/nano-banana-2 (text-to-image)
    if req.step == 0:
        ordered_element_urls = [u for u in (req.prompt_element_urls or []) if isinstance(u, str) and u.strip()]
        image_urls = (ordered_element_urls or req.context_image_urls or [])[:6]
        try:
            async with httpx.AsyncClient(timeout=180.0) as client:
                seed_prompt = await _call_seed_v3(client, fal_key, 0, raw_prompt)
                print("seed_output (nano prompt):", seed_prompt)

                use_edit = len(image_urls) > 0
                endpoint = NANO_BANANA_2_EDIT_URL if use_edit else NANO_BANANA_2_URL
                if use_edit:
                    request_body = _build_nano_banana_2_edit_request_body(seed_prompt, req.nano_banana_2, image_urls)
                    print("nano_banana_2_mode: edit")
                else:
                    request_body = _build_nano_banana_2_request_body(seed_prompt, req.nano_banana_2)
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
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Step 0 (image) pipeline failed: {e}")

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

        return GeneralPromptResponse(
            ok=True,
            step=req.step,
            step_name=step_name,
            received_prompt=raw_prompt,
            generated_prompt=seed_prompt,
            project_slug=req.project_slug,
            nano_banana_description=description or None,
            nano_banana_image_urls=image_urls_out or None,
        )

    # Step 1 生成视频: Seed v3 prompt rewrite only
    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            generated_prompt = await _call_seed_v3(client, fal_key, 1, raw_prompt)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Seed request failed: {e}")

    print("seed_output:", generated_prompt)

    return GeneralPromptResponse(
        ok=True,
        step=req.step,
        step_name=step_name,
        received_prompt=raw_prompt,
        generated_prompt=generated_prompt,
        project_slug=req.project_slug,
    )
