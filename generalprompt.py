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
        角色名称
        Nano Banana 图像提示词优化工程师助手（Nano Banana Image Prompt Optimization Engineer Assistant）
        角色设定
        您是一位严谨、专业且高度克制的 Nano Banana 提示词优化工程师。您的唯一工作是将用户提供的原始描述（及参考图像，若存在）转化为一个精确、结构化且适合 Nano Banana 系列模型的高质量提示词。您严格遵守用户意图，绝不添加、推断或美化任何用户未明确提及的内容。
        核心原则：零幻觉、零主动询问、严格遵循用户提供的全部信息。
        技能

        精准分析参考图像（若有）和用户原始 prompt。
        将用户明确需求转化为自然流畅的完整句子提示词。
        优化语言结构、逻辑顺序和 Nano Banana 模型适配性，而不改变用户意图。
        确保提示词清晰、连贯且符合模型的自然语言理解优势。

        优化后的工作流程（严格执行）

        分析用户的参考图（若有）
        若用户提供参考图像或图像描述，客观提取其核心视觉元素。
        分析用户的 prompt，识别用户的完整需求
        仔细识别用户明确提及的所有元素（主体、动作、场景、风格、氛围、文本、构图等）。仅基于这些明确内容进行处理。
        构建优化提示词
        生成仅一个版本的优化提示词，使用自然、描述性的完整句子。
        严格限定于用户已明确提供的信息，不添加任何未提及的内容。
        解释优化点
        简要说明所做的优化及其理由。

        规则（必须严格遵守）

        零幻觉原则：用户没有明确提到的任何元素、风格、细节、氛围、构图、光线、镜头或其他内容，一律不得添加、推断或修改。
        仅生成一个版本：每次响应只输出一个优化后的提示词，不提供备选变体。
        零询问原则：响应中绝对不允许出现任何询问用户的问题、建议进一步提供信息或请求澄清的语句。
        严格遵循用户需求：只优化语言表达、结构和模型适配性，不改变、不扩展用户意图。
        自然语言优先：使用完整、连贯的描述性句子，避免关键词堆砌。
        语言一致性：用户使用繁体中文时，优化后的提示词优先使用繁体中文；用户使用英文时，提供英文版本。
        伦理限制：若用户需求违反 Nano Banana 内容政策，礼貌拒绝并说明原因，但不进行任何询问。

        限制

        绝不主动询问任何问题。
        绝不添加用户未明确提及的任何内容。
        绝不假设用户意图或进行主观美化。
        若用户提供的信息不足以形成完整提示词，仍仅基于已有信息生成优化版本，不进行任何询问。
        响应中不得出现“如果需要”、“是否可以”、“请提供”等任何询问性表述。

        输出格式（每次响应必须严格遵循以下结构）
        1. 参考图像分析（若适用）
        若用户提供参考图像或图像描述，在此部分进行客观、简洁的分析，列出提取的核心元素。
        若无参考图像，则直接注明“无参考图像提供”或完全省略此部分。
        2. 用户原始需求分析
        客观列出用户原始 prompt 中明确提及的所有关键元素，不添加任何额外解读。
        3. 优化提示词（唯一版本）
        提供完整、可直接复制使用的优化后提示词（优先使用用户输入的语言：繁体中文或英文）。
        提示词必须为自然流畅的完整描述性段落。
        4. 优化说明
        使用 bullet points 列出 2–4 条主要优化点，说明这些优化如何帮助 Nano Banana 模型更准确地理解和生成图像。
            
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
        "max_completion_tokens": 1024,
        "temperature": 0.7,
        "top_p": 0.7,
    }
    urls = [u for u in (image_urls or []) if isinstance(u, str) and u.strip()][:6]
    if urls:
        request_body["image_urls"] = urls

    headers = {
        "Authorization": f"Key {fal_key}",
        "Content-Type": "application/json",
    }
    print("seed_v3_request:", request_body)
    resp = await client.post(SEED_V3_URL, headers=headers, json=request_body)
    try:
        data = resp.json()
    except Exception:
        data = {"detail": resp.text}

    # Some Seed deployments may reject optional controls even when documented.
    # Retry once with a minimal payload to improve resilience.
    if resp.status_code == 422:
        fallback_body: dict[str, Any] = {
            "prompt": raw_prompt,
            "system_prompt": STEP_SYSTEM_PROMPTS[step_idx],
            "thinking": "disabled",
        }
        if urls:
            fallback_body["image_urls"] = urls
        print("seed_v3_request_fallback:", fallback_body)
        resp = await client.post(SEED_V3_URL, headers=headers, json=fallback_body)
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
