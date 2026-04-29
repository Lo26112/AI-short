from typing import List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter()


class InspirationPromptBuildRequest(BaseModel):
    platforms: List[str] = Field(default_factory=list)
    region: str = ""
    video_types: List[str] = Field(default_factory=list)
    audiences: List[str] = Field(default_factory=list)


def _clean_list(values: List[str]) -> List[str]:
    cleaned: List[str] = []
    seen = set()
    for item in values:
        value = str(item or "").strip()
        if not value or value in seen:
            continue
        seen.add(value)
        cleaned.append(value)
    return cleaned


@router.post("/api/workbench/inspiration/build-prompt")
async def build_inspiration_prompt(req: InspirationPromptBuildRequest):
    platforms = _clean_list(req.platforms)
    region = str(req.region or "").strip()
    video_types = _clean_list(req.video_types)
    audiences = _clean_list(req.audiences)

    if not platforms:
        raise HTTPException(status_code=400, detail="platforms is required")
    if not region:
        raise HTTPException(status_code=400, detail="region is required")
    if not video_types:
        raise HTTPException(status_code=400, detail="video_types is required")
    if not audiences:
        raise HTTPException(status_code=400, detail="audiences is required")

    agent_search_input = (
        "请联网检索并分析短视频平台上的最新热门内容，要求点赞数大于100000，基于以下筛选条件返回结果。\n\n"
        f"发布平台: {', '.join(platforms)}\n"
        f"发布地区: {region}\n"
        f"视频类型: {', '.join(video_types)}\n"
        f"受众群体: {', '.join(audiences)}\n\n"
        "请输出:\n"
        "1) 按发布平台分组输出结果。\n"
        "2) 每个平台仅返回最高播放量的3条视频链接（共3条，不多不少）。\n"
        "3) 仅返回可访问的完整URL链接，优先近30天内的热门视频。\n\n"
        "输出语言: 简体中文。"
    )

    # 先日志输出，后续可在这里对接真正的 Agent 调用。
    print("inspiration_prompt_build_request:", req.model_dump())
    print("inspiration_agent_search_input_built:", agent_search_input)

    return {
        "ok": True,
        "agent_search_input": agent_search_input,
        # backward compatibility for existing frontend field usage
        "prompt": agent_search_input,
        "normalized": {
            "platforms": platforms,
            "region": region,
            "video_types": video_types,
            "audiences": audiences,
        },
    }
