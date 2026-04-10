"""
ElevenLabs 视频翻译/配音模块。

使用 ElevenLabs Dubbing API 将视频音轨翻译为其他语言。
"""

import os
import time
import httpx
from typing import Optional

ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1"

# 配音支持的目标语言
SUPPORTED_LANGUAGES = {
    "en": "English",
    "es": "Spanish",
    "fr": "French",
    "de": "German",
    "it": "Italian",
    "pt": "Portuguese",
    "pl": "Polish",
    "hi": "Hindi",
    "ja": "Japanese",
    "ko": "Korean",
    "zh": "Chinese",
    "ar": "Arabic",
    "ru": "Russian",
    "tr": "Turkish",
    "nl": "Dutch",
    "sv": "Swedish",
    "id": "Indonesian",
    "fil": "Filipino",
    "ms": "Malay",
    "vi": "Vietnamese",
    "th": "Thai",
    "uk": "Ukrainian",
    "el": "Greek",
    "cs": "Czech",
    "fi": "Finnish",
    "ro": "Romanian",
    "da": "Danish",
    "bg": "Bulgarian",
    "hr": "Croatian",
    "sk": "Slovak",
    "ta": "Tamil",
}


def create_dubbing_project(
    video_path: str,
    target_language: str,
    api_key: str,
    source_language: Optional[str] = None,
) -> dict:
    """
    在 ElevenLabs 创建新的配音任务。

    参数：
        video_path: 视频文件路径
        target_language: 目标语言代码（如 es/fr/de）
        api_key: ElevenLabs API Key
        source_language: 源语言代码（为空则自动识别）

    返回：
        包含 dubbing_id 与 expected_duration_sec 的字典
    """
    url = f"{ELEVENLABS_API_BASE}/dubbing"

    headers = {
        "xi-api-key": api_key,
    }

    # 组装表单参数
    data = {
        "target_lang": target_language,
        "mode": "automatic",
        "num_speakers": "0",
        "watermark": "false",
    }

    if source_language:
        data["source_lang"] = source_language

    # 打开并上传视频文件
    with open(video_path, "rb") as video_file:
        files = {
            "file": (os.path.basename(video_path), video_file, "video/mp4")
        }

        print(f"[ElevenLabs] Creating dubbing project for {target_language}...")
        with httpx.Client(timeout=300.0) as client:
            response = client.post(url, headers=headers, data=data, files=files)

    if response.status_code not in [200, 201]:
        error_msg = response.text
        try:
            error_data = response.json()
            error_msg = error_data.get("detail", {}).get("message", response.text)
        except:
            pass
        raise Exception(f"ElevenLabs API error: {error_msg}")

    result = response.json()
    print(f"[ElevenLabs] Dubbing project created: {result.get('dubbing_id')}")
    return result


def get_dubbing_status(dubbing_id: str, api_key: str) -> dict:
    """
    查询配音任务状态。

    返回：
        含状态（dubbing/dubbed/failed）及其他信息的字典
    """
    url = f"{ELEVENLABS_API_BASE}/dubbing/{dubbing_id}"

    headers = {
        "xi-api-key": api_key,
    }

    with httpx.Client(timeout=30.0) as client:
        response = client.get(url, headers=headers)

    if response.status_code != 200:
        raise Exception(f"Failed to get dubbing status: {response.text}")

    return response.json()


def download_dubbed_video(
    dubbing_id: str,
    target_language: str,
    output_path: str,
    api_key: str
) -> str:
    """
    下载配音后的视频文件。

    参数：
        dubbing_id: 配音任务 ID
        target_language: 目标语言代码
        output_path: 输出文件路径
        api_key: ElevenLabs API Key

    返回：
        下载后的文件路径
    """
    url = f"{ELEVENLABS_API_BASE}/dubbing/{dubbing_id}/audio/{target_language}"

    headers = {
        "xi-api-key": api_key,
    }

    print(f"[ElevenLabs] Downloading dubbed video...")
    with httpx.Client(timeout=120.0) as client:
        with client.stream("GET", url, headers=headers) as response:
            if response.status_code != 200:
                raise Exception(f"Failed to download dubbed video: {response.text}")

            with open(output_path, "wb") as f:
                for chunk in response.iter_bytes(chunk_size=8192):
                    f.write(chunk)

    print(f"[ElevenLabs] Dubbed video saved to: {output_path}")
    return output_path


def translate_video(
    video_path: str,
    output_path: str,
    target_language: str,
    api_key: str,
    source_language: Optional[str] = None,
    max_wait_seconds: int = 600,
    poll_interval: int = 5,
) -> str:
    """
    使用 ElevenLabs 将视频翻译到目标语言。

    该函数为阻塞调用，会一直等待直到配音完成或超时。

    参数：
        video_path: 输入视频路径
        output_path: 翻译后视频保存路径
        target_language: 目标语言代码
        api_key: ElevenLabs API Key
        source_language: 源语言代码（为空则自动识别）
        max_wait_seconds: 最大等待时长（默认 10 分钟）
        poll_interval: 状态轮询间隔（秒）

    返回：
        翻译后视频路径
    """
    # 创建配音任务
    project = create_dubbing_project(
        video_path=video_path,
        target_language=target_language,
        api_key=api_key,
        source_language=source_language,
    )

    dubbing_id = project["dubbing_id"]
    expected_duration = project.get("expected_duration_sec", 60)

    print(f"[ElevenLabs] Dubbing ID: {dubbing_id}, Expected duration: {expected_duration}s")

    # 轮询直到任务完成
    start_time = time.time()
    while True:
        elapsed = time.time() - start_time
        if elapsed > max_wait_seconds:
            raise Exception(f"Dubbing timed out after {max_wait_seconds} seconds")

        status = get_dubbing_status(dubbing_id, api_key)
        current_status = status.get("status", "unknown")

        print(f"[ElevenLabs] Status: {current_status} (elapsed: {int(elapsed)}s)")

        if current_status == "dubbed":
            # 完成后下载结果
            return download_dubbed_video(
                dubbing_id=dubbing_id,
                target_language=target_language,
                output_path=output_path,
                api_key=api_key,
            )

        elif current_status == "failed":
            error = status.get("error", "Unknown error")
            raise Exception(f"Dubbing failed: {error}")

        # 仍在处理中，等待后继续轮询
        time.sleep(poll_interval)


def get_supported_languages() -> dict:
    """返回支持语言代码与名称的映射。"""
    return SUPPORTED_LANGUAGES.copy()
