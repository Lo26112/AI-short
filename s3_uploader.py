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

from botocore.config import Config
import json

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
