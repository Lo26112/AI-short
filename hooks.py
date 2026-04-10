import os
import textwrap
import subprocess
import urllib.request
from PIL import Image, ImageDraw, ImageFont, ImageFilter

FONT_URL = "https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSerif/NotoSerif-Bold.ttf"
FONT_DIR = "fonts"
FONT_PATH = os.path.join(FONT_DIR, "NotoSerif-Bold.ttf")

def download_font_if_needed():
    """若本地缺少字体，则下载用于 Hook 文案的衬线字体。"""
    if not os.path.exists(FONT_DIR):
        os.makedirs(FONT_DIR)
    if not os.path.exists(FONT_PATH):
        print(f"⬇️ Downloading font from {FONT_URL}...")
        try:
            # 添加 User-Agent，降低被 403 拒绝的概率
            req = urllib.request.Request(
                FONT_URL, 
                headers={'User-Agent': 'Mozilla/5.0'}
            )
            with urllib.request.urlopen(req) as response, open(FONT_PATH, 'wb') as out_file:
                out_file.write(response.read())
            print("✅ Font downloaded.")
        except Exception as e:
            print(f"❌ Failed to download font: {e}")

def create_hook_image(text, target_width, output_image_path="hook_overlay.png", font_scale=1.0):
    """
    使用像素级换行生成白底黑字的衬线文案框。
    target_width: 文案框允许占用的最大宽度（例如视频宽度的 85%）。
    """
    download_font_if_needed()
    
    # 样式配置
    padding_x = 30 # 左右内边距
    padding_y = 25 
    line_spacing = 20 # 行间距
    cornerradius = 20
    shadow_offset = (5, 5) 
    shadow_blur = 10
    
    # 字号计算（约为宽度的 5%，并按 Noto Serif Bold 视觉效果微调）
    base_font_size = int(target_width * 0.05)
    font_size = int(base_font_size * font_scale)
    
    try:
        font = ImageFont.truetype(FONT_PATH, font_size)
    except Exception as e:
        print(f"⚠️ Warning: Could not load font {FONT_PATH}, using default. Error: {e}")
        font = ImageFont.load_default()

    # 像素级自动换行
    dummy_img = Image.new('RGBA', (1, 1))
    draw = ImageDraw.Draw(dummy_img)
    
    max_text_width = target_width - (2 * padding_x)
    
    # 先处理手动换行
    paragraphs = text.split('\n')
    lines = []
    
    for p in paragraphs:
        if not p.strip():
            lines.append("") 
            continue
            
        words = p.split()
        current_line = []
        
        for word in words:
            # 试探加入当前单词后是否超宽
            test_line = ' '.join(current_line + [word])
            bbox = draw.textbbox((0, 0), test_line, font=font)
            w = bbox[2] - bbox[0]
            
            if w <= max_text_width:
                current_line.append(word)
            else:
                # 当前行已满，换行
                if current_line:
                    lines.append(' '.join(current_line))
                    current_line = [word]
                else:
                    # 单词过长时强制单独成行
                    lines.append(word)
                    current_line = []
        
        if current_line:
            lines.append(' '.join(current_line))
    
    # 重新计算文本真实宽高
    max_line_width = 0
    text_heights = []
    
    for line in lines:
        if not line:
            text_heights.append(font_size) # 空行按字号估算高度
            continue
            
        bbox = draw.textbbox((0, 0), line, font=font)
        w = bbox[2] - bbox[0]
        h = bbox[3] - bbox[1]
        max_line_width = max(max_line_width, w)
        text_heights.append(h)
    
    # 计算文案框尺寸：文本尺寸 + 内边距，并设置最小宽度保证观感
    box_width = max(max_line_width + (2 * padding_x), int(target_width * 0.3))
    
    # 文本总高度：各行高度之和 + 行间距
    if not text_heights:
         total_text_height = font_size
    else:
         total_text_height = sum(text_heights) + (len(text_heights) - 1) * line_spacing
         
    box_height = total_text_height + (2 * padding_y)
    
    # 创建最终图层（圆角 + 阴影）
    # 1) 先创建比文案框更大的画布用于容纳阴影
    canvas_w = box_width + 40
    canvas_h = box_height + 40
    
    img = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # 2) 绘制阴影
    shadow_box = [
        (20 + shadow_offset[0], 20 + shadow_offset[1]),
        (20 + box_width + shadow_offset[0], 20 + box_height + shadow_offset[1])
    ]
    draw.rounded_rectangle(shadow_box, radius=cornerradius, fill=(0, 0, 0, 100))
    
    # 3) 模糊阴影
    img = img.filter(ImageFilter.GaussianBlur(5))
    
    # 4) 绘制白色主体框（叠在阴影上）
    draw_final = ImageDraw.Draw(img)
    
    main_box = [
        (20, 20),
        (20 + box_width, 20 + box_height)
    ]
    # 半透明白底（alpha=240，约 94% 不透明）
    draw_final.rounded_rectangle(main_box, radius=cornerradius, fill=(255, 255, 255, 240))
    
    # 5) 绘制文本
    current_y = 20 + padding_y - 2 # 轻微视觉微调
    for i, line in enumerate(lines):
        if not line:
            current_y += font_size + line_spacing 
            continue
            
        bbox = draw_final.textbbox((0, 0), line, font=font)
        line_w = bbox[2] - bbox[0]
        line_h = text_heights[i] if i < len(text_heights) else bbox[3] - bbox[1]
        
        # 水平居中
        x = 20 + (box_width - line_w) // 2
        
        # 绘制黑色文本
        draw_final.text((x, current_y), line, font=font, fill="black")
        
        current_y += line_h + line_spacing
        
    img.save(output_image_path)
    return output_image_path, canvas_w, canvas_h

def add_hook_to_video(video_path, text, output_path, position="top", font_scale=1.0):
    """
    将 Hook 文案叠加到视频画面。
    position: 顶部 / 中间 / 底部
    font_scale: 字号缩放系数（1.0 为默认）
    """
    if not os.path.exists(video_path):
        raise FileNotFoundError(f"Video {video_path} not found")

    # 1) 读取视频分辨率，用于按比例生成文案框
    try:
        cmd = ['ffprobe', '-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=s=x:p=0', video_path]
        res = subprocess.check_output(cmd).decode().strip()
        # 多流场景下默认取第一路视频流
        dims = res.split('\n')[0].split('x')
        video_width = int(dims[0])
        video_height = int(dims[1])
    except Exception as e:
        print(f"⚠️ FFprobe failed: {e}. Assuming 1080x1920")
        video_width = 1080
        video_height = 1920
        
    # 2) 生成文案图片（宽度不超过画面 90%）
    target_box_width = int(video_width * 0.9)
    
    hook_filename = f"temp_hook_{os.path.basename(video_path)}.png"
    # 当前项目结构下使用相对临时文件名即可
    
    try:
        img_path, box_w, box_h = create_hook_image(text, target_box_width, hook_filename, font_scale=font_scale)
        
        # 3) 计算叠加位置
        overlay_x = (video_width - box_w) // 2
        
        if position == "center":
            overlay_y = (video_height - box_h) // 2
        elif position == "bottom":
             # 约位于底部 20% 区域
             overlay_y = int(video_height * 0.70)
        else:
             # 约位于顶部 20% 区域
             overlay_y = int(video_height * 0.20)
        
        # 4) 执行 FFmpeg 叠加
        print(f"🎬 Overlaying hook: '{text}' at {overlay_x},{overlay_y}")
        
        ffmpeg_cmd = [
            'ffmpeg', '-y',
            '-i', video_path,
            '-i', img_path,
            '-filter_complex', f"[0:v][1:v]overlay={overlay_x}:{overlay_y}",
            '-c:a', 'copy',
            '-c:v', 'libx264', '-preset', 'fast', '-crf', '22',
            output_path
        ]
        
        subprocess.run(ffmpeg_cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        print(f"✅ Hook added to {output_path}")
        return True
        
    except subprocess.CalledProcessError as e:
        print(f"❌ FFmpeg Error: {e.stderr.decode() if e.stderr else 'Unknown'}")
        raise e
    except Exception as e:
        print(f"❌ Hook Gen Error: {e}")
        raise e
    finally:
        # 清理临时图片
        if os.path.exists(hook_filename):
            os.remove(hook_filename)
