from flask import Flask, jsonify, render_template, request
from flask_socketio import SocketIO
import pyautogui
import base64
from io import BytesIO
import socket
from threading import Event
from models import ModelFactory
import os
import json
import shutil
import traceback
import requests
import faulthandler
import signal

# kill -USR1 <pid> 可随时导出全线程堆栈，便于排查生成卡顿
faulthandler.register(signal.SIGUSR1)

app = Flask(__name__)
app.config['TEMPLATES_AUTO_RELOAD'] = True  # 非 debug 下也随文件更新模板，避免改完页面不生效
socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    ping_timeout=30,
    ping_interval=5,
    max_http_buffer_size=50 * 1024 * 1024,
    async_mode='threading'  # 使用threading模式提高兼容性
)

# 常量定义
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_DIR = os.path.join(CURRENT_DIR, 'config')      # 随仓库分发的只读配置（models/version/提示词种子）
DATA_DIR = os.path.join(CURRENT_DIR, '.snapsolver')   # 运行期产生的数据：密钥/中转/提示词/更新缓存
STATIC_DIR = os.path.join(CURRENT_DIR, 'static')
os.makedirs(DATA_DIR, exist_ok=True)

def _data_file(name, seed=None, migrate=True):
    """返回 DATA_DIR 下的数据文件路径。
    首次运行时：老部署从 config/ 原地迁移（migrate=True 时移动），
    新部署从随仓库分发的 seed 拷贝。"""
    path = os.path.join(DATA_DIR, name)
    if not os.path.exists(path):
        legacy = os.path.join(CONFIG_DIR, name)
        try:
            if migrate and os.path.exists(legacy):
                shutil.move(legacy, path)
                print(f"已迁移 {name} → .snapsolver/")
            elif seed and os.path.exists(seed):
                shutil.copy(seed, path)
        except Exception as e:
            print(f"初始化数据文件 {name} 失败: {e}")
    return path

# 随仓库分发（只读）
VERSION_FILE = os.path.join(CONFIG_DIR, 'version.json')
# 运行期数据（读写，统一在 .snapsolver/）
API_KEYS_FILE = _data_file('api_keys.json')
PROXY_API_FILE = _data_file('proxy_api.json')
UPDATE_INFO_FILE = _data_file('update_info.json')
# 提示词：config/prompts.json 是内置种子（保留在仓库），运行副本在 .snapsolver/
PROMPT_FILE = _data_file('prompts.json', seed=os.path.join(CONFIG_DIR, 'prompts.json'), migrate=False)

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
    # 校验模型选择
    if not model_id:
        raise ValueError("未选择模型，请先在设置中选择一个模型")

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
    elif "gemini" in model_id.lower() or "google" in model_id.lower():
        api_key_id = "GoogleApiKey"
    elif "doubao" in model_id.lower():
        api_key_id = "DoubaoApiKey"
    elif "kimi" in model_id.lower() or "moonshot" in model_id.lower():
        api_key_id = "MoonshotApiKey"
    
    # 首先尝试从本地配置获取API密钥
    api_key = get_api_key(api_key_id)
    
    # 如果本地没有配置，尝试使用前端传递的密钥（向后兼容）
    if not api_key:
        api_key = api_keys.get(api_key_id)
    
    if not api_key:
        raise ValueError(f"API key is required for the selected model (keyId: {api_key_id})")
    
    # 获取maxTokens参数，默认为8192
    max_tokens = int(settings.get('maxTokens', 8192))
    
    # 检查是否启用中转API
    proxy_api_config = load_proxy_api()
    base_url = None
    
    if proxy_api_config.get('enabled', False):
        # 根据模型类型选择对应的中转API
        if "claude" in model_id.lower() or "anthropic" in model_id.lower():
            base_url = proxy_api_config.get('apis', {}).get('anthropic', '')
        elif any(keyword in model_id.lower() for keyword in ["gpt", "openai"]):
            base_url = proxy_api_config.get('apis', {}).get('openai', '')
        elif "deepseek" in model_id.lower():
            base_url = proxy_api_config.get('apis', {}).get('deepseek', '')
        elif "qvq" in model_id.lower() or "alibaba" in model_id.lower() or "qwen" in model_id.lower():
            base_url = proxy_api_config.get('apis', {}).get('alibaba', '')
        elif "gemini" in model_id.lower() or "google" in model_id.lower():
            base_url = proxy_api_config.get('apis', {}).get('google', '')
        elif "doubao" in model_id.lower():
            base_url = proxy_api_config.get('apis', {}).get('doubao', '')
        elif "kimi" in model_id.lower() or "moonshot" in model_id.lower():
            base_url = proxy_api_config.get('apis', {}).get('moonshot', '')

    # 创建模型实例
    model_instance = ModelFactory.create_model(
        model_name=model_id,
        api_key=api_key,
        temperature=None if is_reasoning else float(settings.get('temperature', 0.7)),
        system_prompt=settings.get('systemPrompt'),
        language=settings.get('language', '中文'),
        api_base_url=base_url,  # 现在BaseModel支持api_base_url参数
        reasoning_tier=settings.get('reasoningTier', 'deep')  # 统一推理档位 fast/deep/max
    )
    
    # 设置最大输出Token，但不为阿里巴巴模型设置（它们有自己内部的处理逻辑）
    is_alibaba_model = "qvq" in model_id.lower() or "alibaba" in model_id.lower() or "qwen" in model_id.lower()
    if not is_alibaba_model:
        model_instance.max_tokens = max_tokens
    
    return model_instance

# 各家模型的思考事件命名归一：对外协议只有 thinking / thinking_complete
_STATUS_ALIASES = {
    'reasoning': 'thinking',
    'reasoning_complete': 'thinking_complete',
}

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

@socketio.on('analyze_image')
def handle_analyze_image(data):
    """事件处理器只做校验与建模，生成循环放后台任务——
    threading 模式下处理器占用的是该 WebSocket 连接的服务线程，
    分钟级的生成循环若留在这里会堵死事件下发。"""
    sid = request.sid
    try:
        image_data = data.get('image')
        settings = data.get('settings', {})

        reasoning_tier = settings.get('reasoningTier', 'deep')
        model_id = settings.get('model')
        print(f"Debug - 图像分析请求, 模型: {model_id}, 推理档位: {reasoning_tier}, sid: {sid}")

        if not image_data:
            socketio.emit('ai_response', {'status': 'error', 'error': '图像数据不能为空'}, room=sid)
            return

        # 同题追问历史（可选）：纯文本轮次列表，只取最近 20 条防滥用
        history = data.get('history')
        if not isinstance(history, list):
            history = []
        history = history[-20:]
        if history:
            print(f"Debug - 追问请求, 历史轮次: {len(history)}")

        # 获取模型信息，判断是否为推理模型
        model_info = settings.get('modelInfo', {})
        is_reasoning = model_info.get('isReasoning', False)

        model_instance = create_model_instance(model_id, settings, is_reasoning)

        # 如果启用代理，配置代理设置
        proxies = None
        if settings.get('proxyEnabled'):
            proxies = {
                'http': f"http://{settings.get('proxyHost')}:{settings.get('proxyPort')}",
                'https': f"http://{settings.get('proxyHost')}:{settings.get('proxyPort')}"
            }

        # 创建用于停止生成的事件（同 sid 新请求会顶替旧的停止句柄）
        stop_event = Event()
        generation_tasks[sid] = stop_event

        socketio.start_background_task(_run_image_analysis, model_instance, image_data, proxies, sid, stop_event, history)

    except Exception as e:
        print(f"Error in analyze_image: {str(e)}")
        traceback.print_exc()
        socketio.emit('ai_response', {'status': 'error', 'error': f'分析图像时出错: {str(e)}'}, room=sid)

def _run_image_analysis(model_instance, image_data, proxies, sid, stop_event, history=None):
    """后台任务：消费模型流式生成器并逐事件下发"""
    try:
        sent = 0
        last_status = None
        for response in model_instance.analyze_image(image_data, proxies=proxies, history=history):
            # 检查是否收到停止信号
            if stop_event.is_set():
                print(f"分析图像生成被用户 {sid} 停止")
                break

            # 思考事件命名归一后再发出
            status = response.get('status')
            if status in _STATUS_ALIASES:
                response['status'] = _STATUS_ALIASES[status]
            socketio.emit('ai_response', response, room=sid)
            socketio.sleep(0)  # 让出调度，保证写线程及时刷出
            sent += 1
            last_status = response.get('status')
        print(f"Debug - 图像分析结束: 发送 {sent} 个事件, 末状态 {last_status}")
    except Exception as e:
        print(f"Error in image analysis task: {str(e)}")
        traceback.print_exc()
        socketio.emit('ai_response', {'status': 'error', 'error': f'分析图像时出错: {str(e)}'}, room=sid)
    finally:
        # 清理任务（仅当仍是本次的停止句柄时）
        if generation_tasks.get(sid) is stop_event:
            del generation_tasks[sid]

@socketio.on('capture_screenshot')
def handle_capture_screenshot(data):
    try:
        # 添加调试信息
        print("DEBUG: 执行capture_screenshot截图")
        
        # Capture the screen
        screenshot = pyautogui.screenshot()
        
        # Convert the image to base64 string
        buffered = BytesIO()
        screenshot.save(buffered, format="PNG")
        img_str = base64.b64encode(buffered.getvalue()).decode()
        
        # Emit the screenshot back to the client，不打印base64数据
        print("DEBUG: 完成capture_screenshot截图，图片大小: {} KB".format(len(img_str) // 1024))
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
        with open(VERSION_FILE, 'r', encoding='utf-8') as f:
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
            with open(UPDATE_INFO_FILE, 'w', encoding='utf-8') as f:
                json.dump(update_info, f, ensure_ascii=False, indent=2)
                
            return update_info
        
        # 如果无法连接GitHub，尝试读取缓存的更新信息
        if os.path.exists(UPDATE_INFO_FILE):
            with open(UPDATE_INFO_FILE, 'r', encoding='utf-8') as f:
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
        default_keys = {
            "AnthropicApiKey": "",
            "OpenaiApiKey": "",
            "AlibabaApiKey": "",
            "MathpixAppId": "",
            "MathpixAppKey": "",
            "GoogleApiKey": "",
            "DoubaoApiKey": "",
            "MoonshotApiKey": "",
            "BaiduApiKey": "",
            "BaiduSecretKey": ""
        }
        if os.path.exists(API_KEYS_FILE):
            with open(API_KEYS_FILE, 'r', encoding='utf-8') as f:
                api_keys = json.load(f)

            # 确保新增的密钥占位符能自动补充
            missing_key_added = False
            for key, default_value in default_keys.items():
                if key not in api_keys:
                    api_keys[key] = default_value
                    missing_key_added = True

            if missing_key_added:
                save_api_keys(api_keys)

            return api_keys
        else:
            # 如果文件不存在，创建默认配置
            save_api_keys(default_keys)
            return default_keys
    except Exception as e:
        print(f"加载API密钥配置失败: {e}")
        return {}

# 加载中转API配置
def load_proxy_api():
    """从配置文件加载中转API配置"""
    try:
        if os.path.exists(PROXY_API_FILE):
            with open(PROXY_API_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        else:
            # 如果文件不存在，创建默认配置
            default_proxy_apis = {
                "enabled": False,
                "apis": {
                    "anthropic": "",
                    "openai": "",
                    "alibaba": "",
                    "google": "",
                    "doubao": "",
                    "moonshot": ""
                }
            }
            save_proxy_api(default_proxy_apis)
            return default_proxy_apis
    except Exception as e:
        print(f"加载中转API配置失败: {e}")
        return {"enabled": False, "apis": {}}

# 保存中转API配置
def save_proxy_api(proxy_api_config):
    """保存中转API配置到文件"""
    try:
        # 确保配置目录存在
        os.makedirs(os.path.dirname(PROXY_API_FILE), exist_ok=True)
        
        with open(PROXY_API_FILE, 'w', encoding='utf-8') as f:
            json.dump(proxy_api_config, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        print(f"保存中转API配置失败: {e}")
        return False

# 保存API密钥配置
def save_api_keys(api_keys):
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
            is_reasoning = model_info.get('isReasoning', False)
            models.append({
                'id': model_id,
                'display_name': model_info.get('name', model_id),
                'is_multimodal': model_info.get('supportsMultimodal', False),
                'is_reasoning': is_reasoning,
                'description': model_info.get('description', ''),
                'version': model_info.get('version', 'latest'),
                'reasoning_tiers': model_info.get('reasoningTiers', ['fast', 'deep', 'max'] if is_reasoning else ['fast']),
                'default_tier': model_info.get('defaultTier', 'deep' if is_reasoning else 'fast'),
                'provider': model_info.get('provider', '')
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

@app.route('/api/proxy-api', methods=['GET'])
def get_proxy_api():
    """API端点：获取中转API配置"""
    try:
        proxy_api_config = load_proxy_api()
        return jsonify(proxy_api_config)
    except Exception as e:
        print(f"获取中转API配置时出错: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/proxy-api', methods=['POST'])
def update_proxy_api():
    """API端点：更新中转API配置"""
    try:
        new_config = request.json
        if not isinstance(new_config, dict):
            return jsonify({"success": False, "message": "无效的中转API配置格式"}), 400
        
        # 保存回文件
        if save_proxy_api(new_config):
            return jsonify({"success": True, "message": "中转API配置已保存"})
        else:
            return jsonify({"success": False, "message": "保存中转API配置失败"}), 500
    
    except Exception as e:
        return jsonify({"success": False, "message": f"更新中转API配置错误: {str(e)}"}), 500

if __name__ == '__main__':
    # 尝试使用5000端口，如果被占用则使用5001
    port = 5000
    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.bind(('0.0.0.0', port))
        s.close()
    except OSError:
        port = 5001
        print(f"端口5000被占用，将使用端口{port}")
    
    local_ip = get_local_ip()
    print(f"Local IP Address: {local_ip}")
    print(f"Connect from your mobile device using: {local_ip}:{port}")
    
    # 加载模型配置
    model_config = load_model_config()
    if hasattr(ModelFactory, 'update_model_capabilities'):
        ModelFactory.update_model_capabilities(model_config)
        print("已加载模型配置信息")
    
    # Run Flask in the main thread without debug mode
    socketio.run(app, host='0.0.0.0', port=port, allow_unsafe_werkzeug=True)
