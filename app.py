import os
import uuid
import json
import shutil
import time
import asyncio
from dotenv import load_dotenv
from typing import Dict, Optional, List
from api_keys import (
    resolve_gemini_key,
    resolve_fal_key,
    resolve_elevenlabs_key,
    resolve_upload_post_key,
    get_upload_post_default_username,
)
from contextlib import asynccontextmanager
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from s3_uploader import upload_actor_to_s3, list_actor_gallery

load_dotenv()

# 常量
UPLOAD_DIR = "uploads"
OUTPUT_DIR = "output"
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

# 配置
# 未设置时使用默认值，性能较高的服务器可适当调大
MAX_CONCURRENT_JOBS = int(os.environ.get("MAX_CONCURRENT_JOBS", "5"))
JOB_RETENTION_SECONDS = 3600  # 任务保留时长：1 小时

# 应用运行时状态
# 通过信号量限制最大并发任务数
concurrency_semaphore = asyncio.Semaphore(MAX_CONCURRENT_JOBS)

async def cleanup_jobs():
    """后台清理任务：定期删除过期任务与文件。"""
    import time
    print("🧹 Cleanup task started.")
    while True:
        try:
            await asyncio.sleep(300) # 每 5 分钟检查一次
            now = time.time()
            
            # 基于修改时间做目录清理（OUTPUT_DIR）
            for job_id in os.listdir(OUTPUT_DIR):
                job_path = os.path.join(OUTPUT_DIR, job_id)
                if os.path.isdir(job_path) and now - os.path.getmtime(job_path) > JOB_RETENTION_SECONDS:
                    print(f"🧹 Purging old output dir: {job_id}")
                    shutil.rmtree(job_path, ignore_errors=True)

            # 清理内存中的 SaaSShorts 过期任务
            try:
                saas_expired = [
                    jid for jid, jdata in list(saas_jobs.items())
                    if jdata.get("status") in ("completed", "failed")
                    and jdata.get("output_dir")
                    and os.path.isdir(jdata["output_dir"])
                    and now - os.path.getmtime(jdata["output_dir"]) > JOB_RETENTION_SECONDS
                ]
                for jid in saas_expired:
                    del saas_jobs[jid]
            except NameError:
                pass

            # 清理上传目录
            for filename in os.listdir(UPLOAD_DIR):
                file_path = os.path.join(UPLOAD_DIR, filename)
                try:
                    if now - os.path.getmtime(file_path) > JOB_RETENTION_SECONDS:
                         os.remove(file_path)
                except Exception: pass

        except Exception as e:
            print(f"⚠️ Cleanup error: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动清理协程
    cleanup_task = asyncio.create_task(cleanup_jobs())
    yield
    # 关闭阶段（如有需要可在此取消后台协程）

app = FastAPI(lifespan=lifespan)

# 为前端启用 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 挂载静态目录：视频文件
app.mount("/videos", StaticFiles(directory=OUTPUT_DIR), name="videos")

import httpx

@app.get("/api/social/user")
async def get_social_user(
    x_upload_post_key: Optional[str] = Header(None, alias="X-Upload-Post-Key"),
):
    """代理 Upload-Post 用户信息接口，返回可用账号（密钥来自服务端配置，可选请求头覆盖用于调试）。"""
    api_key = resolve_upload_post_key(x_upload_post_key)
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail="Missing API key: upload_post_api_key (set UPLOAD_POST_API_KEY or config/api_keys.local.json, or X-Upload-Post-Key for debug)",
        )

    url = "https://api.upload-post.com/api/uploadposts/users"
    print(f"🔍 Fetching User ID from: {url}")
    headers = {"Authorization": f"Apikey {api_key}"}
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            resp = await client.get(url, headers=headers)
            if resp.status_code != 200:
                print(f"❌ Upload-Post User Fetch Error: {resp.text}")
                raise HTTPException(status_code=resp.status_code, detail=f"Failed to fetch user: {resp.text}")
            
            data = resp.json()
            print(f"🔍 Upload-Post User Response: {data}")
            
            user_id = None
            # 返回结构通常为 {'success': True, 'profiles': [{'username': '...'}, ...]}
            profiles_list = []
            if isinstance(data, dict):
                 raw_profiles = data.get('profiles', [])
                 if isinstance(raw_profiles, list):
                     for p in raw_profiles:
                         username = p.get('username')
                         if username:
                             # 提取已连接的平台
                             socials = p.get('social_accounts', {})
                             connected = []
                             # 检查常见平台
                             for platform in ['tiktok', 'instagram', 'youtube']:
                                 account_info = socials.get(platform)
                                 # 若为有效对象则视为已连接
                                 if isinstance(account_info, dict):
                                     connected.append(platform)
                             
                             profiles_list.append({
                                 "username": username,
                                 "connected": connected
                             })
            
            default_username = get_upload_post_default_username()
            if not profiles_list:
                return {"profiles": [], "error": "No profiles found", "default_username": default_username}

            return {"profiles": profiles_list, "default_username": default_username}
            
            
        except Exception as e:
             raise HTTPException(status_code=500, detail=str(e))

# ═══════════════════════════════════════════════════════════════════════
# SaaSShorts：面向 SaaS 的 AI UGC 视频生成
# ═══════════════════════════════════════════════════════════════════════

from saasshorts import (
    scrape_website,
    research_saas_online,
    analyze_saas,
    generate_scripts,
    generate_full_video,
    generate_actor_images,
    get_elevenlabs_voices,
    DEFAULT_VOICES,
)

# SaaSShorts 任务状态（与普通视频处理任务分离）
saas_jobs: Dict[str, Dict] = {}


class SaaSAnalyzeRequest(BaseModel):
    url: Optional[str] = None
    description: Optional[str] = None  # 手动输入的产品/业务描述
    num_scripts: int = 3
    style: str = "ugc"
    language: str = "en"
    actor_gender: str = "female"


@app.post("/api/saasshorts/analyze")
async def saasshorts_analyze(
    req: SaaSAnalyzeRequest,
    x_gemini_key: Optional[str] = Header(None, alias="X-Gemini-Key"),
):
    """分析 URL 或手动描述，并生成视频脚本。"""
    gemini_key = resolve_gemini_key(x_gemini_key)
    if not gemini_key:
        raise HTTPException(
            status_code=400,
            detail="Missing API key: gemini_api_key (set GEMINI_API_KEY or config/api_keys.local.json, or X-Gemini-Key for debug)",
        )

    if not req.url and not req.description:
        raise HTTPException(status_code=400, detail="Provide a URL or a product description")

    try:
        loop = asyncio.get_event_loop()

        def run_analysis():
            web_research = None

            if req.url and req.url.strip():
                # URL 模式：执行完整抓取与调研流程
                scraped = scrape_website(req.url)
                web_research = research_saas_online(req.url, gemini_key)
                analysis = analyze_saas(scraped, gemini_key, web_research=web_research)
            else:
                # 描述模式：直接基于文本构建分析结果
                analysis = {
                    "product_name": req.description.split(",")[0].strip()[:60] if req.description else "Product",
                    "description": req.description,
                    "value_proposition": req.description,
                    "target_audience": "general audience",
                    "key_features": [req.description],
                    "pain_points": [],
                    "tone": "casual and authentic",
                }

            scripts = generate_scripts(analysis, gemini_key, req.num_scripts, req.style, req.language, req.actor_gender)
            return {
                "analysis": analysis,
                "scripts": scripts,
                "web_research": web_research,
            }

        result = await loop.run_in_executor(None, run_analysis)
        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class SaaSActorRequest(BaseModel):
    actor_description: str
    num_options: int = 3
    product_description: Optional[str] = None


@app.post("/api/saasshorts/actor-upload")
async def saasshorts_actor_upload(file: UploadFile = File(...)):
    """上传自定义演员图（仅本地保存，不上传 S3）。"""
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    try:
        content = await file.read()

        # 校验最小体积，过滤异常文件
        if len(content) < 1000:
            raise HTTPException(status_code=400, detail="File too small to be a valid image")

        upload_id = uuid.uuid4().hex[:8]
        upload_dir = os.path.join(OUTPUT_DIR, "actor_uploads")
        os.makedirs(upload_dir, exist_ok=True)
        filename = f"custom_{upload_id}.png"
        file_path = os.path.join(upload_dir, filename)

        with open(file_path, "wb") as f:
            f.write(content)

        return {"url": f"/videos/actor_uploads/{filename}"}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/saasshorts/actor-options")
async def saasshorts_actor_options(
    req: SaaSActorRequest,
    x_fal_key: Optional[str] = Header(None, alias="X-Fal-Key"),
):
    """生成多张演员候选图供用户选择。"""
    fal_key = resolve_fal_key(x_fal_key)
    if not fal_key:
        raise HTTPException(
            status_code=400,
            detail="Missing API key: fal_key (set FAL_KEY or config/api_keys.local.json, or X-Fal-Key for debug)",
        )

    try:
        job_id = str(uuid.uuid4())
        out_dir = os.path.join(OUTPUT_DIR, f"saas_actors_{job_id}")
        os.makedirs(out_dir, exist_ok=True)

        loop = asyncio.get_running_loop()
        import functools
        paths = await loop.run_in_executor(
            None,
            functools.partial(
                generate_actor_images,
                req.actor_description, fal_key, out_dir, "actor", req.num_options,
                product_description=req.product_description,
            ),
        )

        # 将每张演员图上传到公开 S3（携带描述）
        desc = req.actor_description
        if req.product_description:
            desc += f" (holding {req.product_description})"
        urls = []
        for p in paths:
            s3_url = upload_actor_to_s3(p, description=desc)
            if s3_url:
                urls.append(s3_url)
            else:
                # S3 失败时回退到本地 URL
                urls.append(f"/videos/saas_actors_{job_id}/{os.path.basename(p)}")

        return {"images": urls}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class SaaSPostRequest(BaseModel):
    job_id: str
    user_id: Optional[str] = None
    platforms: List[str]
    title: Optional[str] = None
    description: Optional[str] = None
    scheduled_date: Optional[str] = None
    timezone: Optional[str] = "UTC"


@app.post("/api/saasshorts/post")
async def saasshorts_post_to_socials(req: SaaSPostRequest):
    """通过 Upload-Post 将 AI Shorts 视频发布到社媒。"""
    if req.job_id not in saas_jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    job = saas_jobs[req.job_id]
    result = job.get("result")
    if not result or not result.get("video_url"):
        raise HTTPException(status_code=400, detail="No video available for this job")

    try:
        # 解析本地视频路径
        video_url = result["video_url"]  # 例如：/videos/saas_xxx/slug_final.mp4
        rel_path = video_url.replace("/videos/", "")
        file_path = os.path.join(OUTPUT_DIR, rel_path)

        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail=f"Video file not found")

        script = result.get("script", {})
        final_title = req.title or script.get("title", "AI Short")
        final_description = req.description or script.get("caption", "")
        if not final_description:
            final_description = script.get("full_narration", "Check this out!")

        upload_key = resolve_upload_post_key(None)
        if not upload_key:
            raise HTTPException(
                status_code=400,
                detail="Missing API key: upload_post_api_key (set UPLOAD_POST_API_KEY or config/api_keys.local.json)",
            )
        final_user = (req.user_id or "").strip() or get_upload_post_default_username() or ""
        if not final_user:
            raise HTTPException(
                status_code=400,
                detail="Missing user_id: set upload_post_default_username in config or pass user_id in request body",
            )

        url = "https://api.upload-post.com/api/upload"
        headers = {"Authorization": f"Apikey {upload_key}"}

        data_payload = {
            "user": final_user,
            "title": final_title,
            "platform[]": req.platforms,
            "async_upload": "true",
        }

        if req.scheduled_date:
            data_payload["scheduled_date"] = req.scheduled_date
            if req.timezone:
                data_payload["timezone"] = req.timezone

        if "tiktok" in req.platforms:
            data_payload["tiktok_title"] = final_description
        if "instagram" in req.platforms:
            data_payload["instagram_title"] = final_description
            data_payload["media_type"] = "REELS"
        if "youtube" in req.platforms:
            data_payload["youtube_title"] = final_title
            data_payload["youtube_description"] = final_description
            data_payload["privacyStatus"] = "public"

        filename = os.path.basename(file_path)
        with open(file_path, "rb") as f:
            file_content = f.read()

        files = {"video": (filename, file_content, "video/mp4")}

        with httpx.Client(timeout=120.0) as client:
            print(f"📡 [AI Shorts] Sending to Upload-Post: {req.platforms}")
            response = client.post(url, headers=headers, data=data_payload, files=files)

        if response.status_code not in [200, 201, 202]:
            raise HTTPException(status_code=response.status_code, detail=f"Upload-Post Error: {response.text}")

        return response.json()

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ [AI Shorts] Post Exception: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/saasshorts/actor-gallery")
async def saasshorts_actor_gallery():
    """列出公开 S3 中历史生成的演员图片。"""
    try:
        loop = asyncio.get_running_loop()
        images = await loop.run_in_executor(None, list_actor_gallery)
        return {"images": images}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class SaaSGenerateRequest(BaseModel):
    script: dict
    voice_id: Optional[str] = None
    actor_description: Optional[str] = None
    selected_actor_url: Optional[str] = None  # 预选演员图片 URL
    retry_job_id: Optional[str] = None
    video_mode: str = "lowcost"  # "lowcost" 或 "premium"


@app.post("/api/saasshorts/generate")
async def saasshorts_generate(
    req: SaaSGenerateRequest,
    x_fal_key: Optional[str] = Header(None, alias="X-Fal-Key"),
    x_elevenlabs_key: Optional[str] = Header(None, alias="X-ElevenLabs-Key"),
):
    """根据脚本生成 SaaS UGC 视频，返回可轮询的 job_id。"""
    fal_key = resolve_fal_key(x_fal_key)
    elevenlabs_key = resolve_elevenlabs_key(x_elevenlabs_key)

    if not fal_key:
        raise HTTPException(
            status_code=400,
            detail="Missing API key: fal_key (set FAL_KEY or config/api_keys.local.json, or X-Fal-Key for debug)",
        )
    if not elevenlabs_key:
        raise HTTPException(
            status_code=400,
            detail="Missing API key: elevenlabs_api_key (set ELEVENLABS_API_KEY or config/api_keys.local.json, or X-ElevenLabs-Key for debug)",
        )

    # 支持重试：复用 output_dir，保留已缓存资产（图片/音色/head/broll）
    reused = False
    if req.retry_job_id:
        # 先查内存，再查磁盘
        old_dir = os.path.join(OUTPUT_DIR, f"saas_{req.retry_job_id}")
        if req.retry_job_id in saas_jobs:
            old_dir = saas_jobs[req.retry_job_id]["output_dir"]

        if os.path.isdir(old_dir):
            job_id = req.retry_job_id
            job_output_dir = old_dir
            reused = True
            # 清理 0 字节成品，确保流水线可重新生成
            for f in os.listdir(old_dir):
                fp = os.path.join(old_dir, f)
                if f.endswith("_final.mp4") and os.path.getsize(fp) == 0:
                    os.remove(fp)
            saas_jobs[job_id] = {
                "status": "processing",
                "logs": [f"Retrying job {job_id[:8]}... reusing cached assets from disk."],
                "result": None,
                "output_dir": job_output_dir,
            }

    if not reused:
        job_id = str(uuid.uuid4())
        job_output_dir = os.path.join(OUTPUT_DIR, f"saas_{job_id}")
        os.makedirs(job_output_dir, exist_ok=True)
        saas_jobs[job_id] = {
            "status": "processing",
            "logs": ["SaaSShorts job started."],
            "result": None,
            "output_dir": job_output_dir,
        }

    # 若用户选择了预生成演员图，解析为本地路径
    selected_actor_path = None
    if req.selected_actor_url:
        if req.selected_actor_url.startswith("http"):
            # 从 S3 公共 URL 下载到任务目录
            import httpx
            try:
                actor_local = os.path.join(job_output_dir, "selected_actor.png")
                with httpx.Client(timeout=30.0) as client:
                    resp = client.get(req.selected_actor_url)
                    if resp.status_code == 200:
                        with open(actor_local, "wb") as f:
                            f.write(resp.content)
                        selected_actor_path = actor_local
            except Exception:
                pass
        else:
            src = os.path.join(OUTPUT_DIR, req.selected_actor_url.replace("/videos/", ""))
            if os.path.exists(src):
                selected_actor_path = src

    config = {
        "fal_key": fal_key,
        "elevenlabs_key": elevenlabs_key,
        "voice_id": req.voice_id or "21m00Tcm4TlvDq8ikWAM",
        "actor_description": req.actor_description,
        "selected_actor_path": selected_actor_path,
        "video_mode": req.video_mode,
    }

    async def run_generation():
        await concurrency_semaphore.acquire()
        try:
            loop = asyncio.get_running_loop()

            def log_msg(msg):
                print(f"[SaaSShorts Job {job_id[:8]}] {msg}")
                if job_id in saas_jobs:
                    saas_jobs[job_id]["logs"].append(msg)

            def run():
                return generate_full_video(req.script, config, job_output_dir, log_msg)

            result = await loop.run_in_executor(None, run)

            if job_id in saas_jobs:
                video_filename = result["video_filename"]
                saas_jobs[job_id]["status"] = "completed"
                saas_jobs[job_id]["result"] = {
                    "video_url": f"/videos/saas_{job_id}/{video_filename}",
                    "video_filename": video_filename,
                    "duration": result.get("duration", 0),
                    "cost_estimate": result.get("cost_estimate", {}),
                    "script": req.script,
                }
                saas_jobs[job_id]["logs"].append("Video generation completed!")

        except Exception as e:
            print(f"[SaaSShorts] ❌ Job {job_id} failed: {e}")
            if job_id in saas_jobs:
                saas_jobs[job_id]["status"] = "failed"
                saas_jobs[job_id]["logs"].append(f"Error: {str(e)}")
        finally:
            concurrency_semaphore.release()

    asyncio.create_task(run_generation())

    return {"job_id": job_id, "status": "processing"}


@app.get("/api/saasshorts/status/{job_id}")
async def saasshorts_status(job_id: str):
    """查询 SaaSShorts 任务状态。"""
    if job_id not in saas_jobs:
        raise HTTPException(status_code=404, detail="SaaSShorts job not found")

    job = saas_jobs[job_id]
    return {
        "status": job["status"],
        "logs": job["logs"],
        "result": job.get("result"),
    }


@app.get("/api/saasshorts/voices")
async def saasshorts_voices(
    x_elevenlabs_key: Optional[str] = Header(None, alias="X-ElevenLabs-Key"),
):
    """列出可用 ElevenLabs 声音。"""
    eleven_key = resolve_elevenlabs_key(x_elevenlabs_key)
    if eleven_key:
        try:
            loop = asyncio.get_event_loop()
            voices = await loop.run_in_executor(
                None, get_elevenlabs_voices, eleven_key
            )
            if voices:
                return {"voices": voices, "source": "elevenlabs"}
        except Exception:
            pass

    # 回退到内置默认音色
    return {
        "voices": [
            {"voice_id": vid, "name": name, "category": "default"}
            for name, vid in DEFAULT_VOICES.items()
        ],
        "source": "defaults",
    }
