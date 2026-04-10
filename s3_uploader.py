import os
from dotenv import load_dotenv
load_dotenv()
import boto3
from botocore.exceptions import ClientError
import logging

# 将 boto3/botocore 日志降噪
logging.getLogger('boto3').setLevel(logging.CRITICAL)
logging.getLogger('botocore').setLevel(logging.CRITICAL)
logging.getLogger('s3transfer').setLevel(logging.CRITICAL)

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

def upload_file_to_s3(file_path, bucket_name, s3_key):
    """静默上传文件到 S3 bucket。"""
    access_key = os.environ.get('AWS_ACCESS_KEY_ID')
    secret_key = os.environ.get('AWS_SECRET_ACCESS_KEY')
    region = os.environ.get('AWS_REGION', 'eu-west-3')

    if not access_key or not secret_key:
        return False

    s3_client = boto3.client(
        's3',
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name=region
    )
    try:
        # 如需公开读权限可在此扩展 ExtraArgs（当前不强制设置）
        s3_client.upload_file(file_path, bucket_name, s3_key)
        return True
    except ClientError:
        return False
    except Exception:
        return False


from botocore.config import Config
import json
import time as time_module

# 简易内存缓存：画廊视频片段
_clips_cache = {
    "data": None,
    "timestamp": 0
}
CACHE_TTL_SECONDS = 300  # 缓存 5 分钟

def get_s3_client():
    """返回已认证的 S3 客户端。"""
    access_key = os.environ.get('AWS_ACCESS_KEY_ID')
    secret_key = os.environ.get('AWS_SECRET_ACCESS_KEY')
    region = os.environ.get('AWS_REGION', 'eu-west-3')

    if not access_key or not secret_key:
        return None

    return boto3.client(
        's3',
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name=region,
        config=Config(signature_version='s3v4')
    )

def generate_presigned_url(bucket_name, object_key, expiration=3600):
    """生成可分享的 S3 预签名 URL。"""
    s3_client = get_s3_client()
    if not s3_client:
        return None
    try:
        response = s3_client.generate_presigned_url('get_object',
                                                    Params={'Bucket': bucket_name,
                                                            'Key': object_key},
                                                    ExpiresIn=expiration)
        return response
    except ClientError as e:
        logger.error(e)
        return None

def list_all_clips(bucket_name=None, limit=50, force_refresh=False):
    """
    通过 metadata 文件从 S3 列出近期 clip。
    返回包含 clip 信息与签名 URL 的字典列表。

    参数：
        bucket_name: S3 bucket 名称（默认取 AWS_S3_BUCKET）
        limit: 返回数量上限（默认 50）
        force_refresh: 为 True 时跳过缓存
    """
    global _clips_cache
    
    # 优先命中缓存
    now = time_module.time()
    if not force_refresh and _clips_cache["data"] is not None:
        if now - _clips_cache["timestamp"] < CACHE_TTL_SECONDS:
            cached = _clips_cache["data"]
            return cached[:limit] if limit else cached
    
    if not bucket_name:
        bucket_name = os.environ.get('AWS_S3_BUCKET', 'my-clips-bucket')

    s3_client = get_s3_client()
    if not s3_client:
        return []

    all_clips = []
    
    try:
        # 列出 bucket 内对象（通过 paginator 自动分页）
        paginator = s3_client.get_paginator('list_objects_v2')
        pages = paginator.paginate(Bucket=bucket_name)

        metadata_files = []
        for page in pages:
            if 'Contents' in page:
                for obj in page['Contents']:
                    if obj['Key'].endswith('_metadata.json'):
                         metadata_files.append(obj)
        
        # 按 LastModified 倒序（最新优先）
        metadata_files.sort(key=lambda x: x['LastModified'], reverse=True)

        for meta_obj in metadata_files:
            key = meta_obj['Key']
            # key 格式：{job_id}/..._metadata.json
            
            # 读取 metadata 内容
            try:
                obj_resp = s3_client.get_object(Bucket=bucket_name, Key=key)
                content = obj_resp['Body'].read().decode('utf-8')
                data = json.loads(content)
                
                parts = key.split('/')
                job_id = parts[0] if len(parts) > 1 else "unknown"
                # 计算同目录 clip 的文件名前缀
                meta_filename = os.path.basename(key) 
                base_name = meta_filename.replace('_metadata.json', '')
                
                clips_data = data.get('shorts', [])
                
                for i, clip in enumerate(clips_data):
                    clip_filename = f"{base_name}_clip_{i+1}.mp4"
                    clip_key = f"{job_id}/{clip_filename}"
                    
                    # 生成签名 URL
                    signed_url = generate_presigned_url(bucket_name, clip_key, expiration=7200) # 2 小时
                    
                    if signed_url:
                        all_clips.append({
                            "job_id": job_id,
                            "index": i,
                            "url": signed_url,
                            "title": clip.get('video_title_for_youtube_short', 'Untitled Clip'),
                            "tiktok_desc": clip.get('video_description_for_tiktok', ''),
                            "insta_desc": clip.get('video_description_for_instagram', ''),
                            "created_at": meta_obj['LastModified'].isoformat(),
                            "duration": clip.get('end', 0) - clip.get('start', 0)
                        })
                        
                        # 达到数量上限后提前退出
                        if limit and len(all_clips) >= limit:
                            break
                
                # 达到数量上限后提前退出
                if limit and len(all_clips) >= limit:
                    break

            except Exception as e:
                logger.error(f"Error processing metadata {key}: {e}")
                continue

    except Exception as e:
        logger.error(f"Error listing bucket: {e}")
        return []
    
    # 更新缓存（保留完整结果，便于后续分页切片）
    _clips_cache["data"] = all_clips
    _clips_cache["timestamp"] = now

    return all_clips[:limit] if limit else all_clips

def upload_actor_to_s3(file_path, description=""):
    """
    上传演员图片到公开 S3 bucket。
    成功返回公开 URL，失败返回 None。
    """
    bucket_name = os.environ.get('AWS_S3_PUBLIC_BUCKET', 'my-public-bucket')
    region = os.environ.get('AWS_REGION', 'eu-west-3')

    s3_client = get_s3_client()
    if not s3_client:
        return None

    import uuid
    unique_id = str(uuid.uuid4())[:8]
    filename = os.path.basename(file_path)
    name, ext = os.path.splitext(filename)
    s3_key = f"avatars/{name}_{unique_id}{ext}"

    try:
        # 跳过异常或过小文件
        if os.path.getsize(file_path) < 1000:
            logger.warning(f"Skipping tiny file ({os.path.getsize(file_path)} bytes): {file_path}")
            return None

        s3_client.upload_file(
            file_path, bucket_name, s3_key,
            ExtraArgs={'ContentType': 'image/png'},
        )
        public_url = f"https://{bucket_name}.s3.{region}.amazonaws.com/{s3_key}"

        # 在图片旁写入 metadata JSON
        if description:
            import datetime
            meta_key = s3_key.rsplit('.', 1)[0] + '.json'
            meta = json.dumps({
                "description": description,
                "url": public_url,
                "created_at": datetime.datetime.utcnow().isoformat() + "Z",
            }, ensure_ascii=False)
            s3_client.put_object(
                Bucket=bucket_name, Key=meta_key,
                Body=meta.encode('utf-8'),
                ContentType='application/json',
            )

        logger.info(f"Uploaded actor to S3: {public_url}")
        return public_url
    except Exception as e:
        logger.error(f"Failed to upload actor to S3: {e}")
        return None


def list_actor_gallery():
    """
    列出公开 S3 bucket 中的演员图片。
    返回包含 URL 与描述的列表，按时间倒序。
    """
    bucket_name = os.environ.get('AWS_S3_PUBLIC_BUCKET', 'my-public-bucket')
    region = os.environ.get('AWS_REGION', 'eu-west-3')

    s3_client = get_s3_client()
    if not s3_client:
        return []

    try:
        paginator = s3_client.get_paginator('list_objects_v2')
        pages = paginator.paginate(Bucket=bucket_name, Prefix='avatars/')

        all_objects = {}
        for page in pages:
            for obj in page.get('Contents', []):
                key = obj['Key']
                base = key.rsplit('.', 1)[0]
                if base not in all_objects:
                    all_objects[base] = {}
                if key.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')):
                    all_objects[base]['image'] = obj
                elif key.endswith('.json'):
                    all_objects[base]['meta_key'] = key

        images = []
        for base, data in all_objects.items():
            if 'image' not in data:
                continue
            obj = data['image']
            key = obj['Key']
            public_url = f"https://{bucket_name}.s3.{region}.amazonaws.com/{key}"
            entry = {
                "url": public_url,
                "key": key,
                "created_at": obj['LastModified'].isoformat(),
                "description": "",
            }
            # 尝试读取对应 metadata JSON
            if 'meta_key' in data:
                try:
                    meta_resp = s3_client.get_object(Bucket=bucket_name, Key=data['meta_key'])
                    meta = json.loads(meta_resp['Body'].read().decode('utf-8'))
                    entry['description'] = meta.get('description', '')
                except Exception:
                    pass
            images.append(entry)

        images.sort(key=lambda x: x['created_at'], reverse=True)
        return images

    except Exception as e:
        logger.error(f"Failed to list actor gallery: {e}")
        return []


# ── SaaS 视频画廊（公开 S3）──────────────────────────────────

_video_gallery_cache = {
    "data": None,
    "timestamp": 0,
}

def upload_video_to_gallery(video_path, actor_image_path, metadata, video_id=None):
    """
    将生成的 UGC 视频、演员图和 metadata 上传到公开 S3 bucket。
    成功返回包含公开 URL 的字典，失败返回 None。
    """
    import uuid
    bucket_name = os.environ.get('AWS_S3_PUBLIC_BUCKET', 'my-public-bucket')
    region = os.environ.get('AWS_REGION', 'eu-west-3')

    s3_client = get_s3_client()
    if not s3_client:
        return None

    if not video_id:
        video_id = str(uuid.uuid4())[:8]

    base_url = f"https://{bucket_name}.s3.{region}.amazonaws.com"
    results = {}

    try:
        # 上传视频
        if os.path.exists(video_path):
            s3_key = f"videos/{video_id}/video.mp4"
            s3_client.upload_file(video_path, bucket_name, s3_key,
                                 ExtraArgs={'ContentType': 'video/mp4'})
            results["video_url"] = f"{base_url}/{s3_key}"

        # 上传演员图片
        if actor_image_path and os.path.exists(actor_image_path):
            s3_key = f"videos/{video_id}/actor.png"
            s3_client.upload_file(actor_image_path, bucket_name, s3_key,
                                 ExtraArgs={'ContentType': 'image/png'})
            results["actor_url"] = f"{base_url}/{s3_key}"

        # 构造并上传 metadata
        import datetime
        metadata["video_id"] = video_id
        metadata["video_url"] = results.get("video_url", "")
        metadata["actor_url"] = results.get("actor_url", "")
        metadata["created_at"] = datetime.datetime.utcnow().isoformat() + "Z"

        meta_json = json.dumps(metadata, ensure_ascii=False, indent=2)
        s3_key = f"videos/{video_id}/metadata.json"
        s3_client.put_object(
            Bucket=bucket_name, Key=s3_key,
            Body=meta_json.encode('utf-8'),
            ContentType='application/json',
        )
        results["metadata_url"] = f"{base_url}/{s3_key}"
        results["video_id"] = video_id

        logger.info(f"Uploaded video gallery: {video_id}")

        # 使缓存失效
        _video_gallery_cache["data"] = None

        return results

    except Exception as e:
        logger.error(f"Failed to upload video to gallery: {e}")
        return None


def list_video_gallery(limit=50, force_refresh=False):
    """
    列出公开 S3 bucket 中的全部 UGC 视频。
    返回 metadata 字典列表，最新优先。
    """
    global _video_gallery_cache

    now = time_module.time()
    if not force_refresh and _video_gallery_cache["data"] is not None:
        if now - _video_gallery_cache["timestamp"] < CACHE_TTL_SECONDS:
            cached = _video_gallery_cache["data"]
            return cached[:limit] if limit else cached

    bucket_name = os.environ.get('AWS_S3_PUBLIC_BUCKET', 'my-public-bucket')

    s3_client = get_s3_client()
    if not s3_client:
        return []

    videos = []

    try:
        paginator = s3_client.get_paginator('list_objects_v2')
        pages = paginator.paginate(Bucket=bucket_name, Prefix='videos/')

        meta_files = []
        for page in pages:
            for obj in page.get('Contents', []):
                if obj['Key'].endswith('/metadata.json'):
                    meta_files.append(obj)

        # 最新优先
        meta_files.sort(key=lambda x: x['LastModified'], reverse=True)

        for meta_obj in meta_files:
            try:
                obj_resp = s3_client.get_object(Bucket=bucket_name, Key=meta_obj['Key'])
                content = obj_resp['Body'].read().decode('utf-8')
                data = json.loads(content)
                videos.append(data)
                if limit and len(videos) >= limit:
                    break
            except Exception as e:
                logger.error(f"Error reading metadata {meta_obj['Key']}: {e}")
                continue

    except Exception as e:
        logger.error(f"Failed to list video gallery: {e}")
        return []

    _video_gallery_cache["data"] = videos
    _video_gallery_cache["timestamp"] = now

    return videos[:limit] if limit else videos


def upload_job_artifacts(directory, job_id):
    """将某个任务生成的 clip 与 metadata 全部上传到 S3。"""
    bucket_name = os.environ.get('AWS_S3_BUCKET', 'my-clips-bucket')
    
    if not os.path.exists(directory):
        return

    for filename in os.listdir(directory):
        # 上传 .mp4 片段与 metadata JSON（跳过 temp_ 文件）
        if (filename.endswith(".mp4") or filename.endswith(".json")) and not filename.startswith("temp_"):
            file_path = os.path.join(directory, filename)
            s3_key = f"{job_id}/{filename}"
            upload_file_to_s3(file_path, bucket_name, s3_key)


