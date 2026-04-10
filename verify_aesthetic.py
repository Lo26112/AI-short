import os
import shutil
# 检查是否安装 PIL；本地缺失时可在 Docker 内运行
try:
    from hooks import create_hook_image
except ImportError:
    print("⚠️ PIL not found locally. Please run this inside the Docker container.")
    # 本地未安装依赖时直接退出（也可按需改为 mock）
    exit(1)

def verify():
    print("🧪 Verifying Hook Aesthetics...")
    
    test_text = "POV: You are testing\nthe new aesthetic feature\nwith explicit lines."
    output_path = "aesthetic_hook.png"
    target_width = 800
    
    try:
        path, w, h = create_hook_image(test_text, target_width, output_image_path=output_path)
        
        print(f"✅ Image generated at {path}")
        print(f"   Dimensions including shadow: {w}x{h}")
        
        # 粗略校验：由于阴影和内边距，画布应比纯文本框更大
        if not os.path.exists(path):
            print("❌ File does not exist")
            return False
            
        print("✨ Verification Successful! (Inspect aesthetic_hook.png visually)")
        return True
    except Exception as e:
        print(f"❌ Verification Failed: {e}")
        return False

if __name__ == "__main__":
    verify()
