from flask import Flask, jsonify, render_template, request, send_from_directory
from flask_socketio import SocketIO
import pyautogui
import base64
from io import BytesIO
import socket
from threading import Thread
import pystray
from PIL import Image, ImageDraw
import pyperclip
from models import ModelFactory
import time
import os
import json
import traceback

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*", ping_timeout=30, ping_interval=5, max_http_buffer_size=50 * 1024 * 1024)

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

def create_tray_icon():
    # Create a simple icon (a colored circle)
    icon_size = 64
    icon_image = Image.new('RGB', (icon_size, icon_size), color='white')
    draw = ImageDraw.Draw(icon_image)
    draw.ellipse([4, 4, icon_size-4, icon_size-4], fill='#2196F3')  # Using the primary color from our CSS

    # Get server URL
    ip_address = get_local_ip()
    server_url = f"http://{ip_address}:5000"

    # Create menu
    menu = pystray.Menu(
        pystray.MenuItem(server_url, lambda icon, item: None, enabled=False),
        pystray.MenuItem("Exit", lambda icon, item: icon.stop())
    )

    # Create icon
    icon = pystray.Icon(
        "SnapSolver",
        icon_image,
        "Snap Solver",
        menu
    )
    
    return icon

@app.route('/')
def index():
    local_ip = get_local_ip()
    return render_template('index.html', local_ip=local_ip)

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

def run_tray():
    icon = create_tray_icon()
    icon.run()

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

if __name__ == '__main__':
    local_ip = get_local_ip()
    print(f"Local IP Address: {local_ip}")
    print(f"Connect from your mobile device using: {local_ip}:5000")
    
    # 加载模型配置
    model_config = load_model_config()
    if hasattr(ModelFactory, 'update_model_capabilities'):
        ModelFactory.update_model_capabilities(model_config)
        print("已加载模型配置信息")
    
    # Run system tray icon in a separate thread
    tray_thread = Thread(target=run_tray)
    tray_thread.daemon = True
    tray_thread.start()
    
    # Run Flask in the main thread without debug mode
    socketio.run(app, host='0.0.0.0', port=5000, allow_unsafe_werkzeug=True)
