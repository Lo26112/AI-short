from typing import Any, Optional

import httpx
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field
from api_keys import resolve_fal_key

from Workbench_picture import NanoBanana2UserInput, run_nano_banana_image_pipeline


router = APIRouter(prefix="/api/generalprompt", tags=["generalprompt"])


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
        """你是一位专业的提示词优化专家，专精于为 Kling AI 视频生成模型优化提示词。你的唯一任务是优化用户提供的原始提示词，使其在 Kling 中生成时最大程度减少幻觉，同时对用户描述的词语进行适度详细化。

            优化要求（必须严格遵守，不得违反任何一条）：
            1. 严格保真：必须完整保留原始提示词中的所有必要信息、意图、约束和细节。不得删除、简化或遗漏任何必要内容。
            2. 受控扩写：允许对用户明确描述的词语或概念进行详细化（例如将“美丽的海边”扩写为“阳光明媚、色彩层次丰富、海浪轻柔拍岸的美丽海边”），但扩写内容必须：
            - 始终与用户输入的自然语言风格和表述习惯完全贴合；
            - 仅基于用户已使用的词语进行合理延伸，不得添加任何原提示词中未提及的新元素、动作、风格、镜头或要求；
            - 保持高精度：扩写后的描述必须精确、具体、可量化，避免模糊或过度修饰。
            3. Kling 适配优化：优化后的提示词应自然融入以下结构元素（仅在用户原始描述中已有对应概念时使用）：
            - 主体（Subject）及其详细描述
            - 动作（Action/Movement）
            - 场景环境（Context/Setting）
            - 风格与氛围（Style/Atmosphere）
            - 镜头运动（Camera movement，如 slow tracking shot、gentle pan 等，仅当用户已提及相关意图时）
            但不得强行新增用户未描述的镜头或运动。
            4. 减少幻觉：必须在优化后的提示词中加入以下强制机制：
            - 要求 Kling 仅基于提示中明确提供的信息生成视频；
            - 强制逐步思考动作和画面过渡；
            - 明确禁止添加未提及的元素、人物、物体或效果；
            - 使用自然语言描述，避免过度技术术语。
        """
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
    prompt_element_urls: list[str] = Field(default_factory=list)
    nano_banana_2: Optional[NanoBanana2UserInput] = None

class GeneralPromptResponse(BaseModel):
    ok: bool
    step: int
    step_name: str
    received_prompt: str
    generated_prompt: str
    project_slug: Optional[str] = None
    prompt_element_urls: Optional[list[str]] = None
    nano_banana_description: Optional[str] = None
    nano_banana_image_urls: Optional[list[str]] = None

def _merge_image_urls_for_seed(req: GeneralPromptRequest) -> list[str]:
    """Collect up to 6 image URLs for Seed multimodal from @ prompt elements only."""
    out: list[str] = []
    seen: set[str] = set()
    for u in req.prompt_element_urls or []:
        if isinstance(u, str) and (s := u.strip()) and s not in seen:
            seen.add(s)
            out.append(s)
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
                    nano_banana_2=req.nano_banana_2,
                    seed_prompt=seed_prompt,
                )
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Step 0 (image) pipeline failed: {e}")

        return GeneralPromptResponse(
            ok=True,
            step=req.step,
            step_name=step_name,
            received_prompt=raw_prompt,
            generated_prompt=seed_prompt,
            project_slug=req.project_slug,
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

    print("seed_output:", generated_prompt)

    return GeneralPromptResponse(
        ok=True,
        step=req.step,
        step_name=step_name,
        received_prompt=raw_prompt,
        generated_prompt=generated_prompt,
        project_slug=req.project_slug,
        prompt_element_urls=req.prompt_element_urls or None,
    )
