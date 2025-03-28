from flask import Flask, jsonify, render_template, request, send_from_directory
from flask_socketio import SocketIO
import pyautogui
import base64
from io import BytesIO
import socket
from threading import Thread
from PIL import Image
import pyperclip
from models import ModelFactory
import time
import os
import json
import traceback
import requests
from datetime import datetime
import sys

app = Flask(__name__)
socketio = SocketIO(
    app, 
    cors_allowed_origins="*", 
    ping_timeout=30, 
    ping_interval=5, 
    max_http_buffer_size=50 * 1024 * 1024,
    async_mode='threading',  # 使用threading模式提高兼容性
    engineio_logger=True,    # 启用引擎日志，便于调试
    logger=True              # 启用Socket.IO日志
)

# 添加配置文件路径
CONFIG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'config')

# 初始化模型工厂
ModelFactory.initialize()

def get_local_ip():
    try:
        # Get local IP address
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

@app.route('/')
def index():
    local_ip = get_local_ip()
    
    # 检查更新
    try:
        update_info = check_for_updates()
    except:
        update_info = {'has_update': False}
        
    return render_template('index.html', local_ip=local_ip, update_info=update_info)

@socketio.on('connect')
def handle_connect():
    print('Client connected')

@socketio.on('disconnect')
def handle_disconnect():
    print('Client disconnected')

def create_model_instance(model_id, api_keys, settings):
    """创建模型实例并配置参数"""
    
    # 获取模型信息
    model_info = settings.get('modelInfo', {})
    is_reasoning = model_info.get('isReasoning', False)
    provider = model_info.get('provider', '').lower()
    
    # 确定API密钥ID
    api_key_id = None
    if provider == 'anthropic':
        api_key_id = "AnthropicApiKey"
    elif provider == 'openai':
        api_key_id = "OpenaiApiKey"
    elif provider == 'deepseek':
        api_key_id = "DeepseekApiKey"
    else:
        # 根据模型名称
        if "claude" in model_id.lower():
            api_key_id = "AnthropicApiKey"
        elif any(keyword in model_id.lower() for keyword in ["gpt", "openai"]):
            api_key_id = "OpenaiApiKey"
        elif "deepseek" in model_id.lower():
            api_key_id = "DeepseekApiKey"
    
    api_key = api_keys.get(api_key_id)
    if not api_key:
        raise ValueError(f"API key is required for the selected model (keyId: {api_key_id})")
    
    # 获取maxTokens参数，默认为8192
    max_tokens = int(settings.get('maxTokens', 8192))
    
    # 创建模型实例
    model_instance = ModelFactory.create_model(
        model_name=model_id,
        api_key=api_key,
        temperature=None if is_reasoning else float(settings.get('temperature', 0.7)),
        system_prompt=settings.get('systemPrompt'),
        language=settings.get('language', '中文')
    )
    
    # 设置最大输出Token
    model_instance.max_tokens = max_tokens
    
    return model_instance

def stream_model_response(response_generator, sid, model_name=None):
    """Stream model responses to the client"""
    try:
        print("Starting response streaming...")
        
        # 判断模型是否为推理模型
        is_reasoning = model_name and ModelFactory.is_reasoning(model_name)
        if is_reasoning:
            print(f"使用推理模型 {model_name}，将显示思考过程")
        
        # 初始化：发送开始状态
        socketio.emit('claude_response', {
            'status': 'started',
            'content': '',
            'is_reasoning': is_reasoning
        }, room=sid)
        print("Sent initial status to client")

        # 维护服务端缓冲区以累积完整内容
        response_buffer = ""
        thinking_buffer = ""
        
        # 上次发送的时间戳，用于控制发送频率
        last_emit_time = time.time()
        
        # 流式处理响应
        for response in response_generator:
            # 处理Mathpix响应
            if isinstance(response.get('content', ''), str) and 'mathpix' in response.get('model', ''):
                socketio.emit('text_extracted', {
                    'content': response['content']
                }, room=sid)
                continue
                
            # 获取状态和内容
            status = response.get('status', '')
            content = response.get('content', '')
            
            # 根据不同的状态进行处理
            if status == 'thinking':
                # 仅对推理模型处理思考过程
                if is_reasoning:
                    # 直接使用模型提供的完整思考内容
                    thinking_buffer = content
                    
                    # 控制发送频率，至少间隔0.3秒
                    current_time = time.time()
                    if current_time - last_emit_time >= 0.3:
                        socketio.emit('claude_response', {
                            'status': 'thinking',
                            'content': thinking_buffer,
                            'is_reasoning': True
                        }, room=sid)
                        last_emit_time = current_time
                
            elif status == 'thinking_complete':
                # 仅对推理模型处理思考过程
                if is_reasoning:
                    # 直接使用完整的思考内容
                    thinking_buffer = content
                    
                    print(f"Thinking complete, total length: {len(thinking_buffer)} chars")
                    socketio.emit('claude_response', {
                        'status': 'thinking_complete',
                        'content': thinking_buffer,
                        'is_reasoning': True
                    }, room=sid)
                    
            elif status == 'streaming':
                # 直接使用模型提供的完整内容
                response_buffer = content
                
                # 控制发送频率，至少间隔0.3秒
                current_time = time.time()
                if current_time - last_emit_time >= 0.3:
                    socketio.emit('claude_response', {
                        'status': 'streaming',
                        'content': response_buffer,
                        'is_reasoning': is_reasoning
                    }, room=sid)
                    last_emit_time = current_time
                    
            elif status == 'completed':
                # 确保发送最终完整内容
                socketio.emit('claude_response', {
                    'status': 'completed',
                    'content': content or response_buffer,
                    'is_reasoning': is_reasoning
                }, room=sid)
                print("Response completed")
                
            elif status == 'error':
                # 错误状态直接转发
                response['is_reasoning'] = is_reasoning
                socketio.emit('claude_response', response, room=sid)
                print(f"Error: {response.get('error', 'Unknown error')}")
                
            # 其他状态直接转发
            else:
                response['is_reasoning'] = is_reasoning
                socketio.emit('claude_response', response, room=sid)

    except Exception as e:
        error_msg = f"Streaming error: {str(e)}"
        print(error_msg)
        socketio.emit('claude_response', {
            'status': 'error',
            'error': error_msg,
            'is_reasoning': model_name and ModelFactory.is_reasoning(model_name)
        }, room=sid)

@socketio.on('request_screenshot')
def handle_screenshot_request():
    try:
        # Capture the screen
        screenshot = pyautogui.screenshot()
        
        # Convert the image to base64 string
        buffered = BytesIO()
        screenshot.save(buffered, format="PNG")
        img_str = base64.b64encode(buffered.getvalue()).decode()
        
        # Emit the screenshot back to the client
        socketio.emit('screenshot_response', {
            'success': True,
            'image': img_str
        })
    except Exception as e:
        socketio.emit('screenshot_response', {
            'success': False,
            'error': str(e)
        })

@socketio.on('extract_text')
def handle_text_extraction(data):
    try:
        print("Starting text extraction...")
        
        # Validate input data
        if not data or not isinstance(data, dict):
            raise ValueError("Invalid request data")
            
        if 'image' not in data:
            raise ValueError("No image data provided")
            
        image_data = data['image']
        if not isinstance(image_data, str):
            raise ValueError("Invalid image data format")
        
        # 检查图像大小，避免处理过大的图像导致断开连接
        image_size_bytes = len(image_data) * 3 / 4  # 估算base64的实际大小
        if image_size_bytes > 10 * 1024 * 1024:  # 10MB
            raise ValueError("Image too large, please crop to a smaller area")
            
        settings = data.get('settings', {})
        if not isinstance(settings, dict):
            raise ValueError("Invalid settings format")
        
        mathpix_key = settings.get('mathpixApiKey')
        if not mathpix_key:
            raise ValueError("Mathpix API key is required")
        
        # 先回复客户端，确认已收到请求，防止超时断开
        # 注意：这里不能使用return，否则后续代码不会执行
        socketio.emit('request_acknowledged', {
            'status': 'received', 
            'message': 'Image received, text extraction in progress'
        }, room=request.sid)
        
        try:
            app_id, app_key = mathpix_key.split(':')
            if not app_id.strip() or not app_key.strip():
                raise ValueError()
        except ValueError:
            raise ValueError("Invalid Mathpix API key format. Expected format: 'app_id:app_key'")

        print("Creating Mathpix model instance...")
        # 只传递必需的参数，ModelFactory.create_model会处理不同模型类型
        model = ModelFactory.create_model(
            model_name='mathpix',
            api_key=mathpix_key
        )

        print("Starting text extraction...")
        # 使用新的extract_full_text方法直接提取完整文本
        extracted_text = model.extract_full_text(image_data)
        
        # 直接返回文本结果
        socketio.emit('text_extracted', {
            'content': extracted_text
        }, room=request.sid)

    except ValueError as e:
        error_msg = str(e)
        print(f"Validation error: {error_msg}")
        socketio.emit('text_extracted', {
            'error': error_msg
        }, room=request.sid)
    except Exception as e:
        error_msg = f"Text extraction error: {str(e)}"
        print(f"Unexpected error: {error_msg}")
        print(f"Error details: {type(e).__name__}")
        socketio.emit('text_extracted', {
            'error': error_msg
        }, room=request.sid)

@socketio.on('analyze_text')
def handle_analyze_text(data):
    try:
        text = data.get('text', '')
        settings = data.get('settings', {})
        
        # 获取推理配置
        reasoning_config = settings.get('reasoningConfig', {})
        
        # 获取maxTokens
        max_tokens = int(settings.get('maxTokens', 8192))
        
        print(f"Debug - 文本分析请求: {text[:50]}...")
        print(f"Debug - 最大Token: {max_tokens}, 推理配置: {reasoning_config}")
        
        # 获取模型和API密钥
        model_id = settings.get('model', 'claude-3-7-sonnet-20250219')
        api_keys = settings.get('apiKeys', {})
        
        if not text:
            socketio.emit('error', {'message': '文本内容不能为空'})
            return

        model_instance = create_model_instance(model_id, api_keys, settings)
        
        # 将推理配置传递给模型
        if reasoning_config:
            model_instance.reasoning_config = reasoning_config
        
        # 如果启用代理，配置代理设置
        proxies = None
        if settings.get('proxyEnabled'):
            proxies = {
                'http': f"http://{settings.get('proxyHost')}:{settings.get('proxyPort')}",
                'https': f"http://{settings.get('proxyHost')}:{settings.get('proxyPort')}"
            }

        for response in model_instance.analyze_text(text, proxies=proxies):
            socketio.emit('claude_response', response)
            
    except Exception as e:
        print(f"Error in analyze_text: {str(e)}")
        traceback.print_exc()
        socketio.emit('error', {'message': f'分析文本时出错: {str(e)}'})

@socketio.on('analyze_image')
def handle_analyze_image(data):
    try:
        image_data = data.get('image')
        settings = data.get('settings', {})
        
        # 获取推理配置
        reasoning_config = settings.get('reasoningConfig', {})
        
        # 获取maxTokens
        max_tokens = int(settings.get('maxTokens', 8192))
        
        print(f"Debug - 图像分析请求")
        print(f"Debug - 最大Token: {max_tokens}, 推理配置: {reasoning_config}")
        
        # 获取模型和API密钥
        model_id = settings.get('model', 'claude-3-7-sonnet-20250219')
        api_keys = settings.get('apiKeys', {})
        
        if not image_data:
            socketio.emit('error', {'message': '图像数据不能为空'})
            return

        model_instance = create_model_instance(model_id, api_keys, settings)
        
        # 将推理配置传递给模型
        if reasoning_config:
            model_instance.reasoning_config = reasoning_config
            
        # 如果启用代理，配置代理设置
        proxies = None
        if settings.get('proxyEnabled'):
            proxies = {
                'http': f"http://{settings.get('proxyHost')}:{settings.get('proxyPort')}",
                'https': f"http://{settings.get('proxyHost')}:{settings.get('proxyPort')}"
            }

        for response in model_instance.analyze_image(image_data, proxies=proxies):
            socketio.emit('claude_response', response)
            
    except Exception as e:
        print(f"Error in analyze_image: {str(e)}")
        traceback.print_exc()
        socketio.emit('error', {'message': f'分析图像时出错: {str(e)}'})

@socketio.on('capture_screenshot')
def handle_capture_screenshot(data):
    try:
        # Capture the screen
        screenshot = pyautogui.screenshot()
        
        # Convert the image to base64 string
        buffered = BytesIO()
        screenshot.save(buffered, format="PNG")
        img_str = base64.b64encode(buffered.getvalue()).decode()
        
        # Emit the screenshot back to the client
        socketio.emit('screenshot_complete', {
            'success': True,
            'image': img_str
        }, room=request.sid)
    except Exception as e:
        error_msg = f"Screenshot error: {str(e)}"
        print(f"Error capturing screenshot: {error_msg}")
        socketio.emit('screenshot_complete', {
            'success': False,
            'error': error_msg
        }, room=request.sid)

def load_model_config():
    """加载模型配置信息"""
    try:
        config_path = os.path.join(CONFIG_DIR, 'models.json')
        with open(config_path, 'r', encoding='utf-8') as f:
            config = json.load(f)
        return config
    except Exception as e:
        print(f"加载模型配置失败: {e}")
        return {
            "providers": {},
            "models": {}
        }

# 替换 before_first_request 装饰器
def init_model_config():
    """初始化模型配置"""
    try:
        model_config = load_model_config()
        # 更新ModelFactory的模型信息
        if hasattr(ModelFactory, 'update_model_capabilities'):
            ModelFactory.update_model_capabilities(model_config)
        print("已加载模型配置")
    except Exception as e:
        print(f"初始化模型配置失败: {e}")

# 在请求处理前注册初始化函数
@app.before_request
def before_request_handler():
    # 使用全局变量跟踪是否已初始化
    if not getattr(app, '_model_config_initialized', False):
        init_model_config()
        app._model_config_initialized = True

# 版本检查函数
def check_for_updates():
    """检查GitHub上是否有新版本"""
    try:
        # 读取当前版本信息
        version_file = os.path.join(CONFIG_DIR, 'version.json')
        with open(version_file, 'r', encoding='utf-8') as f:
            version_info = json.load(f)
            
        current_version = version_info.get('version', '0.0.0')
        repo = version_info.get('github_repo', 'Zippland/Snap-Solver')
        
        # 请求GitHub API获取最新发布版本
        api_url = f"https://api.github.com/repos/{repo}/releases/latest"
        
        # 添加User-Agent以符合GitHub API要求
        headers = {'User-Agent': 'Snap-Solver-Update-Checker'}
        
        response = requests.get(api_url, headers=headers, timeout=5)
        if response.status_code == 200:
            latest_release = response.json()
            latest_version = latest_release.get('tag_name', '').lstrip('v')
            
            # 如果版本号为空，尝试从名称中提取
            if not latest_version and 'name' in latest_release:
                import re
                version_match = re.search(r'v?(\d+\.\d+\.\d+)', latest_release['name'])
                if version_match:
                    latest_version = version_match.group(1)
            
            # 比较版本号（简单比较，可以改进为更复杂的语义版本比较）
            has_update = compare_versions(latest_version, current_version)
            
            update_info = {
                'has_update': has_update,
                'current_version': current_version,
                'latest_version': latest_version,
                'release_url': latest_release.get('html_url', f"https://github.com/{repo}/releases/latest"),
                'release_date': latest_release.get('published_at', ''),
                'release_notes': latest_release.get('body', ''),
            }
            
            # 缓存更新信息
            update_info_file = os.path.join(CONFIG_DIR, 'update_info.json')
            with open(update_info_file, 'w', encoding='utf-8') as f:
                json.dump(update_info, f, ensure_ascii=False, indent=2)
                
            return update_info
        
        # 如果无法连接GitHub，尝试读取缓存的更新信息
        update_info_file = os.path.join(CONFIG_DIR, 'update_info.json')
        if os.path.exists(update_info_file):
            with open(update_info_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        
        return {'has_update': False, 'current_version': current_version}
            
    except Exception as e:
        print(f"检查更新失败: {str(e)}")
        # 出错时返回一个默认的值
        return {'has_update': False, 'error': str(e)}

def compare_versions(version1, version2):
    """比较两个版本号，如果version1比version2更新，则返回True"""
    try:
        v1_parts = [int(x) for x in version1.split('.')]
        v2_parts = [int(x) for x in version2.split('.')]
        
        # 确保两个版本号的组成部分长度相同
        while len(v1_parts) < len(v2_parts):
            v1_parts.append(0)
        while len(v2_parts) < len(v1_parts):
            v2_parts.append(0)
            
        # 逐部分比较
        for i in range(len(v1_parts)):
            if v1_parts[i] > v2_parts[i]:
                return True
            elif v1_parts[i] < v2_parts[i]:
                return False
                
        # 完全相同的版本
        return False
    except:
        # 如果解析出错，默认不更新
        return False

@app.route('/api/check-update', methods=['GET'])
def api_check_update():
    """检查更新的API端点"""
    update_info = check_for_updates()
    return jsonify(update_info)

# 添加配置文件路由
@app.route('/config/<path:filename>')
def serve_config(filename):
    return send_from_directory(CONFIG_DIR, filename)

# 添加用于获取所有模型信息的API
@app.route('/api/models', methods=['GET'])
def get_models():
    """返回可用的模型列表"""
    models = ModelFactory.get_available_models()
    return jsonify(models)

if __name__ == '__main__':
    local_ip = get_local_ip()
    print(f"Local IP Address: {local_ip}")
    print(f"Connect from your mobile device using: {local_ip}:5000")
    
    # 加载模型配置
    model_config = load_model_config()
    if hasattr(ModelFactory, 'update_model_capabilities'):
        ModelFactory.update_model_capabilities(model_config)
        print("已加载模型配置信息")
    
    # Run Flask in the main thread without debug mode
    socketio.run(app, host='0.0.0.0', port=5000, allow_unsafe_werkzeug=True)
