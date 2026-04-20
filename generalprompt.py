from typing import Any, Optional

import httpx
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field
from api_keys import resolve_fal_key

from Workbench_picture import NanoBanana2UserInput, run_nano_banana_image_pipeline


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
        """
        You are a professional Nano Banana image prompt optimization engineer specialized in serving the Nano Banana model (including Nano Banana 2 / Pro).
        Your sole task is to analyze the user's Chinese natural language input, intelligently extract all elements that the user wants to keep consistent with the uploaded reference photo, and transform them into a highly precise, richly detailed, and naturally fluent English prompt.
        Intelligent Extraction Principles (must be strictly followed):

        Automatically identify any consistency requirements mentioned by the user, such as style, skin tone, color grading, outfit/clothing, composition, shooting angle, scene and environment, facial expression, pose, lighting, overall atmosphere, or shooting feel.
        When the user mentions phrases like “和照片一样的”, “保持一样”, “都要一样”, “精致”, or lists multiple elements (e.g., “风格肤色色调穿搭构图角度场景环境表情”), treat these as core locked elements and explicitly emphasize in the prompt that they must remain highly faithful to the reference photo.
        Always incorporate the user’s overall style requirements, such as “写实自然” (photorealistic and natural), “像真人真实自然” (like a real person in real life), “镜头互动感强” (strong candid interaction feel), “细节特别详细” (extremely detailed), “色调要自然ins风” (natural warm Instagram/ins color grading), and “感觉是苹果手机拍的” (feels like taken with an iPhone).
        When the user does not explicitly request changes, default to preserving high consistency with the reference photo. If the user wants modifications to certain parts, incorporate the new descriptions while strictly maintaining the locked elements.
        The prompt must emphasize a real-life casual feel: like a natural iPhone snapshot, avoiding overly artistic or cinematic effects.

        Recommended Prompt Structure (organize strictly in this order for natural flow):

        Opening style definition: Photorealistic candid iPhone snapshot, natural warm Instagram/ins style color grading, authentic casual real-life feel...
        Precise character description (based on the reference photo: appearance, skin tone, hairstyle, outfit, expression, and other locked elements)
        Actions, pose, and strong candid interaction feel with natural hand details
        Scene, environment, composition, and shooting angle (strictly retain the parts the user requires to be consistent, including specific background details)
        Lighting, illumination, and natural atmosphere (matching the reference photo’s color tone and light quality)
        Technical quality and realism enhancement (ultra-detailed realistic textures, intricate yet natural details, sharp clear 8K resolution, highly authentic)

        Output Requirements:

        Output only the final complete English prompt for the user to copy and use directly in the Nano Banana model.
        Do not add any explanations, prefaces, quotation marks, optimization notes, or extra text unless the user explicitly requests them.
        Ensure the prompt language is natural and fluent, as if a professional photographer is giving detailed shooting instructions to the model, so that Nano Banana can generate images that are highly faithful to the reference photo’s core elements while remaining photorealistic, natural, and richly detailed.

        Always prioritize maximum accuracy, intelligent extraction of user intent, and real-life natural authenticity to ensure the system is compatible with various casual Chinese expressions from users and consistently delivers high-quality results.
        """
    ),
    1: (
        "You are a prompt engineer for image-to-video generation. "
        "Rewrite the user request into a cinematic video prompt including camera motion, scene action, "
        "lighting, style, and duration hints. Return only the final prompt text. "
        "Output language must be English only. Do not use Chinese."
    ),
}

SEED_V3_URL = "https://fal.run/fal-ai/bytedance/seed/v2/mini"


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
    context_image_urls: Optional[list[str]] = None
    prompt_element_urls: Optional[list[str]] = None
    nano_banana_description: Optional[str] = None
    nano_banana_image_urls: Optional[list[str]] = None


def _context_selection_key(project_slug: Optional[str], step: int) -> str:
    return f"{project_slug or 'default'}|step={step}"


def _clear_context_selection_state(project_slug: Optional[str], step: int) -> None:
    key = _context_selection_key(project_slug, step)
    _CONTEXT_IMAGE_URLS_BY_KEY.pop(key, None)


@router.post("/context-selection")
async def receive_context_selection(req: ContextSelectionRequest):
    key = _context_selection_key(req.project_slug, req.step)
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


def _image_asset_url_for_seed(ia: str) -> Optional[str]:
    """Skip UI placeholders; only pass plausible asset/HTTP URLs to Seed."""
    s = (ia or "").strip()
    if not s or len(s) < 4:
        return None
    low = s.lower()
    if low in ("provided", "none", "null"):
        return None
    return s


def _merge_image_urls_for_seed(req: GeneralPromptRequest) -> list[str]:
    """Collect up to 6 image URLs for Seed multimodal (prompt_element_urls, then context, then image_asset)."""
    out: list[str] = []
    seen: set[str] = set()
    for u in req.prompt_element_urls or []:
        if isinstance(u, str) and (s := u.strip()) and s not in seen:
            seen.add(s)
            out.append(s)
    for u in req.context_image_urls or []:
        if isinstance(u, str) and (s := u.strip()) and s not in seen:
            seen.add(s)
            out.append(s)
    ia = _image_asset_url_for_seed(req.image_asset or "")
    if ia and ia not in seen:
        out.append(ia)
    return out[:6]


async def _call_seed_v3(
    client: httpx.AsyncClient,
    fal_key: str,
    step_idx: int,
    raw_prompt: str,
    image_urls: Optional[list[str]] = None,
) -> str:
    """POST to fal-ai/bytedance/seed/v2/mini; optional image_urls for visual understanding (max 6)."""
    request_body: dict[str, Any] = {
        "prompt": raw_prompt,
        "system_prompt": STEP_SYSTEM_PROMPTS[step_idx],
        "thinking": "disabled",
        "reasoning_effort": "minimal",
        "max_completion_tokens": 1024,
        "temperature": 0.7,
        "top_p": 0.7,
    }
    urls = [u for u in (image_urls or []) if isinstance(u, str) and u.strip()][:6]
    if urls:
        request_body["image_urls"] = urls

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
    target_step = req.step
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

    # Step 0: Seed rewrite (user input + optional images) → nano-banana-2 / edit (workbench_picture)
    if req.step == 0:
        seed_image_urls = _merge_image_urls_for_seed(req)
        try:
            async with httpx.AsyncClient(timeout=180.0) as client:
                seed_prompt = await _call_seed_v3(client, fal_key, 0, raw_prompt, seed_image_urls)
                print("seed_output (nano prompt):", seed_prompt)

                image_urls_out, description = await run_nano_banana_image_pipeline(
                    client,
                    fal_key,
                    prompt_element_urls=req.prompt_element_urls or [],
                    context_image_urls=req.context_image_urls or [],
                    nano_banana_2=req.nano_banana_2,
                    seed_prompt=seed_prompt,
                )
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Step 0 (image) pipeline failed: {e}")
        finally:
            # One-shot context for this request: clear persisted selection state after generation.
            _clear_context_selection_state(req.project_slug, target_step)

        return GeneralPromptResponse(
            ok=True,
            step=req.step,
            step_name=step_name,
            received_prompt=raw_prompt,
            generated_prompt=seed_prompt,
            project_slug=req.project_slug,
            context_image_urls=req.context_image_urls or None,
            prompt_element_urls=req.prompt_element_urls or None,
            nano_banana_description=description,
            nano_banana_image_urls=image_urls_out or None,
        )

    # Step 1 生成视频: Seed v3 prompt rewrite only (multimodal when images are present)
    seed_image_urls = _merge_image_urls_for_seed(req)
    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            generated_prompt = await _call_seed_v3(client, fal_key, 1, raw_prompt, seed_image_urls)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Seed request failed: {e}")
    finally:
        # One-shot context for this request: clear persisted selection state after generation.
        _clear_context_selection_state(req.project_slug, target_step)

    print("seed_output:", generated_prompt)

    return GeneralPromptResponse(
        ok=True,
        step=req.step,
        step_name=step_name,
        received_prompt=raw_prompt,
        generated_prompt=generated_prompt,
        project_slug=req.project_slug,
        context_image_urls=req.context_image_urls or None,
        prompt_element_urls=req.prompt_element_urls or None,
    )
