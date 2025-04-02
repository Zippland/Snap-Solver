from flask import Flask, jsonify, render_template, request, send_from_directory
from flask_socketio import SocketIO
import pyautogui
import base64
from io import BytesIO
import socket
from threading import Thread, Event
import threading
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

# 常量定义
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_DIR = os.path.join(CURRENT_DIR, 'config')
STATIC_DIR = os.path.join(CURRENT_DIR, 'static')
# 确保配置目录存在
os.makedirs(CONFIG_DIR, exist_ok=True)

# 密钥和其他配置文件路径
API_KEYS_FILE = os.path.join(CONFIG_DIR, 'api_keys.json')
VERSION_FILE = os.path.join(CONFIG_DIR, 'version.json')
UPDATE_INFO_FILE = os.path.join(CONFIG_DIR, 'update_info.json')
PROMPT_FILE = os.path.join(CONFIG_DIR, 'prompts.json')  # 新增提示词配置文件路径

# 跟踪用户生成任务的字典
generation_tasks = {}

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

def create_model_instance(model_id, settings, is_reasoning=False):
    """创建模型实例"""
    # 提取API密钥
    api_keys = settings.get('apiKeys', {})
    
    # 确定需要哪个API密钥
    api_key_id = None
    # 特殊情况：o3-mini使用OpenAI API密钥
    if model_id.lower() == "o3-mini":
        api_key_id = "OpenaiApiKey"
    # 其他Anthropic/Claude模型
    elif "claude" in model_id.lower() or "anthropic" in model_id.lower():
        api_key_id = "AnthropicApiKey"
    elif any(keyword in model_id.lower() for keyword in ["gpt", "openai"]):
        api_key_id = "OpenaiApiKey"
    elif "deepseek" in model_id.lower():
        api_key_id = "DeepseekApiKey"
    elif "qvq" in model_id.lower() or "alibaba" in model_id.lower() or "qwen" in model_id.lower():
        api_key_id = "AlibabaApiKey"
    
    # 首先尝试从本地配置获取API密钥
    api_key = get_api_key(api_key_id)
    
    # 如果本地没有配置，尝试使用前端传递的密钥（向后兼容）
    if not api_key:
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
    
    # 设置最大输出Token，但不为阿里巴巴模型设置（它们有自己内部的处理逻辑）
    is_alibaba_model = "qvq" in model_id.lower() or "alibaba" in model_id.lower() or "qwen" in model_id.lower()
    if not is_alibaba_model:
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
        socketio.emit('ai_response', {
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
                        socketio.emit('ai_response', {
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
                    socketio.emit('ai_response', {
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
                    socketio.emit('ai_response', {
                        'status': 'streaming',
                        'content': response_buffer,
                        'is_reasoning': is_reasoning
                    }, room=sid)
                    last_emit_time = current_time
                    
            elif status == 'completed':
                # 确保发送最终完整内容
                socketio.emit('ai_response', {
                    'status': 'completed',
                    'content': content or response_buffer,
                    'is_reasoning': is_reasoning
                }, room=sid)
                print("Response completed")
                
            elif status == 'error':
                # 错误状态直接转发
                response['is_reasoning'] = is_reasoning
                socketio.emit('ai_response', response, room=sid)
                print(f"Error: {response.get('error', 'Unknown error')}")
                
            # 其他状态直接转发
            else:
                response['is_reasoning'] = is_reasoning
                socketio.emit('ai_response', response, room=sid)

    except Exception as e:
        error_msg = f"Streaming error: {str(e)}"
        print(error_msg)
        socketio.emit('ai_response', {
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
        
        # 尝试从本地配置获取Mathpix API密钥
        mathpix_app_id = get_api_key('MathpixAppId')
        mathpix_app_key = get_api_key('MathpixAppKey')
        
        # 构建完整的Mathpix API密钥（格式：app_id:app_key）
        mathpix_key = f"{mathpix_app_id}:{mathpix_app_key}" if mathpix_app_id and mathpix_app_key else None
        
        # 如果本地没有配置，尝试使用前端传递的密钥（向后兼容）
        if not mathpix_key:
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

@socketio.on('stop_generation')
def handle_stop_generation():
    """处理停止生成请求"""
    sid = request.sid
    print(f"接收到停止生成请求: {sid}")
    
    if sid in generation_tasks:
        # 设置停止标志
        stop_event = generation_tasks[sid]
        stop_event.set()
        
        # 发送已停止状态
        socketio.emit('ai_response', {
            'status': 'stopped',
            'content': '生成已停止'
        }, room=sid)
        
        print(f"已停止用户 {sid} 的生成任务")
    else:
        print(f"未找到用户 {sid} 的生成任务")

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
        
        if not text:
            socketio.emit('error', {'message': '文本内容不能为空'})
            return

        # 获取模型信息，判断是否为推理模型
        model_info = settings.get('modelInfo', {})
        is_reasoning = model_info.get('isReasoning', False)
        
        model_instance = create_model_instance(model_id, settings, is_reasoning)
        
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

        # 创建用于停止生成的事件
        sid = request.sid
        stop_event = Event()
        generation_tasks[sid] = stop_event
        
        try:
            for response in model_instance.analyze_text(text, proxies=proxies):
                # 检查是否收到停止信号
                if stop_event.is_set():
                    print(f"分析文本生成被用户 {sid} 停止")
                    break
                    
                socketio.emit('ai_response', response, room=sid)
        finally:
            # 清理任务
            if sid in generation_tasks:
                del generation_tasks[sid]
            
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
        
        if not image_data:
            socketio.emit('error', {'message': '图像数据不能为空'})
            return

        # 获取模型信息，判断是否为推理模型
        model_info = settings.get('modelInfo', {})
        is_reasoning = model_info.get('isReasoning', False)
        
        model_instance = create_model_instance(model_id, settings, is_reasoning)
        
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

        # 创建用于停止生成的事件
        sid = request.sid
        stop_event = Event()
        generation_tasks[sid] = stop_event
        
        try:
            for response in model_instance.analyze_image(image_data, proxies=proxies):
                # 检查是否收到停止信号
                if stop_event.is_set():
                    print(f"分析图像生成被用户 {sid} 停止")
                    break
                    
                socketio.emit('ai_response', response, room=sid)
        finally:
            # 清理任务
            if sid in generation_tasks:
                del generation_tasks[sid]
            
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

def load_prompts():
    """加载系统提示词配置"""
    try:
        if os.path.exists(PROMPT_FILE):
            with open(PROMPT_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        else:
            # 如果文件不存在，创建默认提示词配置
            default_prompts = {
                "default": {
                    "name": "默认提示词",
                    "content": "您是一位专业的问题解决专家。请逐步分析问题，找出问题所在，并提供详细的解决方案。始终使用用户偏好的语言回答。",
                    "description": "通用问题解决提示词"
                }
            }
            with open(PROMPT_FILE, 'w', encoding='utf-8') as f:
                json.dump(default_prompts, f, ensure_ascii=False, indent=4)
            return default_prompts
    except Exception as e:
        print(f"加载提示词配置失败: {e}")
        return {
            "default": {
                "name": "默认提示词",
                "content": "您是一位专业的问题解决专家。请逐步分析问题，找出问题所在，并提供详细的解决方案。始终使用用户偏好的语言回答。",
                "description": "通用问题解决提示词"
            }
        }

def save_prompt(prompt_id, prompt_data):
    """保存单个提示词到配置文件"""
    try:
        prompts = load_prompts()
        prompts[prompt_id] = prompt_data
        with open(PROMPT_FILE, 'w', encoding='utf-8') as f:
            json.dump(prompts, f, ensure_ascii=False, indent=4)
        return True
    except Exception as e:
        print(f"保存提示词配置失败: {e}")
        return False

def delete_prompt(prompt_id):
    """从配置文件中删除一个提示词"""
    try:
        prompts = load_prompts()
        if prompt_id in prompts:
            del prompts[prompt_id]
            with open(PROMPT_FILE, 'w', encoding='utf-8') as f:
                json.dump(prompts, f, ensure_ascii=False, indent=4)
            return True
        return False
    except Exception as e:
        print(f"删除提示词配置失败: {e}")
        return False

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

# 获取所有API密钥
@app.route('/api/keys', methods=['GET'])
def get_api_keys():
    """获取所有API密钥"""
    api_keys = load_api_keys()
    return jsonify(api_keys)

# 保存API密钥
@app.route('/api/keys', methods=['POST'])
def update_api_keys():
    """更新API密钥配置"""
    try:
        new_keys = request.json
        if not isinstance(new_keys, dict):
            return jsonify({"success": False, "message": "无效的API密钥格式"}), 400
        
        # 加载当前密钥
        current_keys = load_api_keys()
        
        # 更新密钥
        for key, value in new_keys.items():
            current_keys[key] = value
        
        # 保存回文件
        if save_api_keys(current_keys):
            return jsonify({"success": True, "message": "API密钥已保存"})
        else:
            return jsonify({"success": False, "message": "保存API密钥失败"}), 500
    
    except Exception as e:
        return jsonify({"success": False, "message": f"更新API密钥错误: {str(e)}"}), 500

# 加载API密钥配置
def load_api_keys():
    """从配置文件加载API密钥"""
    try:
        if os.path.exists(API_KEYS_FILE):
            with open(API_KEYS_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        else:
            # 如果文件不存在，创建默认配置
            default_keys = {
                "AnthropicApiKey": "",
                "OpenaiApiKey": "",
                "DeepseekApiKey": "",
                "AlibabaApiKey": "",
                "MathpixAppId": "",
                "MathpixAppKey": ""
            }
            save_api_keys(default_keys)
            return default_keys
    except Exception as e:
        print(f"加载API密钥配置失败: {e}")
        return {}

# 保存API密钥配置
def save_api_keys(api_keys):
    """保存API密钥到配置文件"""
    try:
        # 确保配置目录存在
        os.makedirs(os.path.dirname(API_KEYS_FILE), exist_ok=True)
        
        with open(API_KEYS_FILE, 'w', encoding='utf-8') as f:
            json.dump(api_keys, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        print(f"保存API密钥配置失败: {e}")
        return False

# 获取特定API密钥
def get_api_key(key_name):
    """获取指定的API密钥"""
    api_keys = load_api_keys()
    return api_keys.get(key_name, "")

@app.route('/api/models')
def api_models():
    """API端点：获取可用模型列表"""
    try:
        # 加载模型配置
        config = load_model_config()
        
        # 转换为前端需要的格式
        models = []
        for model_id, model_info in config['models'].items():
            models.append({
                'id': model_id,
                'display_name': model_info.get('name', model_id),
                'is_multimodal': model_info.get('supportsMultimodal', False),
                'is_reasoning': model_info.get('isReasoning', False),
                'description': model_info.get('description', ''),
                'version': model_info.get('version', 'latest')
            })
        
        # 返回模型列表
        return jsonify(models)
    except Exception as e:
        print(f"获取模型列表时出错: {e}")
        return jsonify([]), 500

@app.route('/api/prompts', methods=['GET'])
def get_prompts():
    """API端点：获取所有系统提示词"""
    try:
        prompts = load_prompts()
        return jsonify(prompts)
    except Exception as e:
        print(f"获取提示词列表时出错: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/prompts/<prompt_id>', methods=['GET'])
def get_prompt(prompt_id):
    """API端点：获取单个系统提示词"""
    try:
        prompts = load_prompts()
        if prompt_id in prompts:
            return jsonify(prompts[prompt_id])
        else:
            return jsonify({"error": "提示词不存在"}), 404
    except Exception as e:
        print(f"获取提示词时出错: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/prompts', methods=['POST'])
def add_prompt():
    """API端点：添加或更新系统提示词"""
    try:
        data = request.json
        if not data or not isinstance(data, dict):
            return jsonify({"error": "无效的请求数据"}), 400
            
        prompt_id = data.get('id')
        if not prompt_id:
            return jsonify({"error": "提示词ID不能为空"}), 400
            
        prompt_data = {
            "name": data.get('name', f"提示词{prompt_id}"),
            "content": data.get('content', ""),
            "description": data.get('description', "")
        }
        
        save_prompt(prompt_id, prompt_data)
        return jsonify({"success": True, "id": prompt_id})
    except Exception as e:
        print(f"保存提示词时出错: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/prompts/<prompt_id>', methods=['DELETE'])
def remove_prompt(prompt_id):
    """API端点：删除系统提示词"""
    try:
        success = delete_prompt(prompt_id)
        if success:
            return jsonify({"success": True})
        else:
            return jsonify({"error": "提示词不存在或删除失败"}), 404
    except Exception as e:
        print(f"删除提示词时出错: {e}")
        return jsonify({"error": str(e)}), 500

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
