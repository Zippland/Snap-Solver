import base64
import json
import os
import socket
import threading
import time
import traceback
from io import BytesIO
import sys

import pyautogui
import requests
from flask import Flask, jsonify, render_template, request, send_from_directory
from flask_socketio import SocketIO

from models import ModelFactory

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_DIR = os.path.join(CURRENT_DIR, 'config')
STATIC_DIR = os.path.join(CURRENT_DIR, 'static')

os.makedirs(CONFIG_DIR, exist_ok=True)

API_KEYS_FILE = os.path.join(CONFIG_DIR, 'api_keys.json')
VERSION_FILE = os.path.join(CONFIG_DIR, 'version.json')
UPDATE_INFO_FILE = os.path.join(CONFIG_DIR, 'update_info.json')
PROMPT_FILE = os.path.join(CONFIG_DIR, 'prompts.json')
PROXY_API_FILE = os.path.join(CONFIG_DIR, 'proxy_api.json')
MODEL_CONFIG_FILE = os.path.join(CONFIG_DIR, 'models.json')

DEFAULT_API_KEYS = {
    "AnthropicApiKey": "", "OpenaiApiKey": "", "DeepseekApiKey": "",
    "AlibabaApiKey": "", "MathpixAppId": "", "MathpixAppKey": "", "GoogleApiKey": ""
}
DEFAULT_PROMPTS = {
    "default": {
        "name": "Default Prompt",
        "content": "You are a professional problem-solving expert. Please analyze the problem step-by-step, identify the issue, and provide a detailed solution. Always respond in the user's preferred language.",
        "description": "A general-purpose problem-solving prompt."
    }
}
DEFAULT_PROXY_APIS = {
    "enabled": False,
    "apis": {"anthropic": "", "openai": "", "deepseek": "", "alibaba": "", "google": ""}
}
DEFAULT_MODEL_CONFIG = {"providers": {}, "models": {}}

app = Flask(__name__)
socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    ping_timeout=30,
    ping_interval=5,
    max_http_buffer_size=50 * 1024 * 1024,
    async_mode='threading',
    engineio_logger=True,
    logger=True              # Socket.IO logs
)

generation_tasks = {}

ModelFactory.initialize()


def _read_json_config(file_path, default_data=None):
    if default_data is None:
        default_data = {}
    if not os.path.exists(file_path):
        _write_json_config(file_path, default_data)
        return default_data
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return default_data

def _write_json_config(file_path, data):
    try:
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return True
    except IOError:
        return False

def get_local_ip():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"

def _get_model_provider_details(model_id):
    model_id_lower = model_id.lower()
    provider_map = {
        'anthropic': ('AnthropicApiKey', ["claude", "anthropic"]),
        'openai': ('OpenaiApiKey', ["gpt", "openai", "o3-mini"]),
        'deepseek': ('DeepseekApiKey', ["deepseek"]),
        'alibaba': ('AlibabaApiKey', ["qwen", "alibaba", "qvq"]),
        'google': ('GoogleApiKey', ["gemini", "google"]),
    }
    for provider, (key_id, keywords) in provider_map.items():
        if any(keyword in model_id_lower for keyword in keywords):
            return provider, key_id
    return None, None

def create_model_instance(model_id, settings, is_reasoning=False):
    provider, api_key_id = _get_model_provider_details(model_id)
    if not api_key_id:
        raise ValueError(f"Could not determine provider for model: {model_id}")

    api_key = _read_json_config(API_KEYS_FILE, DEFAULT_API_KEYS).get(api_key_id)
    if not api_key:
        api_key = settings.get('apiKeys', {}).get(api_key_id)
    if not api_key:
        raise ValueError(f"API key ({api_key_id}) is required for the selected model.")

    base_url = None
    custom_base_urls = settings.get('apiBaseUrls', {})
    if custom_base_urls.get(provider):
        base_url = custom_base_urls[provider]
    else:
        proxy_config = _read_json_config(PROXY_API_FILE, DEFAULT_PROXY_APIS)
        if proxy_config.get('enabled', False):
            base_url = proxy_config.get('apis', {}).get(provider)

    model_instance = ModelFactory.create_model(
        model_name=model_id,
        api_key=api_key,
        temperature=None if is_reasoning else float(settings.get('temperature', 0.7)),
        system_prompt=settings.get('systemPrompt'),
        language=settings.get('language', '中文'),
        api_base_url=base_url
    )
    
    if provider != 'alibaba':
        model_instance.max_tokens = int(settings.get('maxTokens', 8192))
        
    return model_instance

def _capture_and_send_screenshot(event_name):
    sid = request.sid
    try:
        screenshot = pyautogui.screenshot()
        buffered = BytesIO()
        screenshot.save(buffered, format="PNG")
        img_str = base64.b64encode(buffered.getvalue()).decode()
        
        socketio.emit(event_name, {'success': True, 'image': img_str}, room=sid)
    except Exception as e:
        error_msg = f"Screenshot error: {str(e)}"
        print(error_msg)
        socketio.emit(event_name, {'success': False, 'error': error_msg}, room=sid)

def _perform_analysis(data, analysis_func_name):
    sid = request.sid
    try:
        settings = data.get('settings', {})
        model_id = settings.get('model', 'claude-3-haiku-20240307')
        is_reasoning = settings.get('modelInfo', {}).get('isReasoning', False)

        model_instance = create_model_instance(model_id, settings, is_reasoning)
        
        if 'reasoningConfig' in settings:
            model_instance.reasoning_config = settings['reasoningConfig']

        proxies = None
        if settings.get('proxyEnabled'):
            proxies = {
                'http': f"http://{settings.get('proxyHost')}:{settings.get('proxyPort')}",
                'https': f"http://{settings.get('proxyHost')}:{settings.get('proxyPort')}"
            }
            
        analysis_method = getattr(model_instance, analysis_func_name)
        
        input_data = data.get('text') if analysis_func_name == 'analyze_text' else data.get('image')
        if not input_data:
            raise ValueError("Input data (text or image) is missing.")

        stop_event = threading.Event()
        generation_tasks[sid] = stop_event

        try:
            for response in analysis_method(input_data, proxies=proxies):
                if stop_event.is_set():
                    print(f"Analysis for user {sid} was stopped.")
                    break
                socketio.emit('ai_response', response, room=sid)
        finally:
            if sid in generation_tasks:
                del generation_tasks[sid]

    except Exception as e:
        print(f"Error in {analysis_func_name}: {str(e)}")
        traceback.print_exc()
        socketio.emit('ai_response', {'status': 'error', 'error': f'Analysis failed: {str(e)}'}, room=sid)

@app.route('/')
def index():
    local_ip = get_local_ip()
    update_info = check_for_updates()
    return render_template('index.html', local_ip=local_ip, update_info=update_info)

@app.route('/config/<path:filename>')
def serve_config(filename):
    return send_from_directory(CONFIG_DIR, filename)

@app.route('/api/models', methods=['GET'])
def get_models():
    return jsonify(ModelFactory.get_available_models())

@app.route('/api/keys', methods=['GET', 'POST'])
def handle_api_keys():
    if request.method == 'GET':
        return jsonify(_read_json_config(API_KEYS_FILE, DEFAULT_API_KEYS))
    
    if request.method == 'POST':
        new_keys = request.json
        if not isinstance(new_keys, dict):
            return jsonify({"success": False, "message": "Invalid data format"}), 400
        
        current_keys = _read_json_config(API_KEYS_FILE, DEFAULT_API_KEYS)
        current_keys.update(new_keys)
        
        if _write_json_config(API_KEYS_FILE, current_keys):
            return jsonify({"success": True, "message": "API keys saved successfully."})
        else:
            return jsonify({"success": False, "message": "Failed to save API keys."}), 500

@app.route('/api/prompts', methods=['GET', 'POST'])
def handle_prompts():
    if request.method == 'GET':
        return jsonify(_read_json_config(PROMPT_FILE, DEFAULT_PROMPTS))
    
    if request.method == 'POST':
        data = request.json
        prompt_id = data.get('id')
        if not prompt_id:
            return jsonify({"error": "Prompt ID is required"}), 400
            
        prompts = _read_json_config(PROMPT_FILE, DEFAULT_PROMPTS)
        prompts[prompt_id] = {
            "name": data.get('name', f"Prompt {prompt_id}"),
            "content": data.get('content', ""),
            "description": data.get('description', "")
        }
        
        if _write_json_config(PROMPT_FILE, prompts):
            return jsonify({"success": True, "id": prompt_id})
        else:
            return jsonify({"error": "Failed to save prompt"}), 500

@app.route('/api/prompts/<prompt_id>', methods=['DELETE'])
def remove_prompt(prompt_id):
    prompts = _read_json_config(PROMPT_FILE, DEFAULT_PROMPTS)
    if prompt_id in prompts:
        del prompts[prompt_id]
        if _write_json_config(PROMPT_FILE, prompts):
            return jsonify({"success": True})
        else:
            return jsonify({"error": "Failed to save after deletion"}), 500
    return jsonify({"error": "Prompt not found"}), 404

@app.route('/api/proxy-api', methods=['GET', 'POST'])
def handle_proxy_api_config():
    if request.method == 'GET':
        return jsonify(_read_json_config(PROXY_API_FILE, DEFAULT_PROXY_APIS))
    
    if request.method == 'POST':
        new_config = request.json
        if not isinstance(new_config, dict):
            return jsonify({"success": False, "message": "Invalid data format"}), 400
        if _write_json_config(PROXY_API_FILE, new_config):
            return jsonify({"success": True, "message": "Proxy API config saved."})
        else:
            return jsonify({"success": False, "message": "Failed to save proxy API config."}), 500

@app.route('/api/check-update', methods=['GET'])
def api_check_update():
    return jsonify(check_for_updates())

@socketio.on('connect')
def handle_connect():
    print(f"Client connected: {request.sid}")

@socketio.on('disconnect')
def handle_disconnect():
    print(f"Client disconnected: {request.sid}")
    if request.sid in generation_tasks:
        del generation_tasks[request.sid]

@socketio.on('request_screenshot')
def handle_request_screenshot(data=None):
    _capture_and_send_screenshot('screenshot_response')

@socketio.on('capture_screenshot')
def handle_capture_screenshot(data=None):
    _capture_and_send_screenshot('screenshot_complete')

@socketio.on('extract_text')
def handle_text_extraction(data):
    sid = request.sid
    try:
        image_data = data.get('image')
        if not image_data:
            raise ValueError("No image data provided")
        
        if (len(image_data) * 3 / 4) > (10 * 1024 * 1024):
            raise ValueError("Image is too large. Please crop to a smaller area.")

        keys = _read_json_config(API_KEYS_FILE, DEFAULT_API_KEYS)
        app_id = keys.get('MathpixAppId')
        app_key = keys.get('MathpixAppKey')

        if not (app_id and app_key):
             raise ValueError("Mathpix App ID and Key must be configured in settings.")
        
        socketio.emit('request_acknowledged', {'status': 'received'}, room=sid)

        model = ModelFactory.create_model(model_name='mathpix', api_key=f"{app_id}:{app_key}")
        extracted_text = model.extract_full_text(image_data)
        
        socketio.emit('text_extracted', {'content': extracted_text}, room=sid)

    except Exception as e:
        error_msg = f"Text extraction failed: {str(e)}"
        print(error_msg)
        socketio.emit('text_extracted', {'error': error_msg}, room=sid)

@socketio.on('analyze_text')
def handle_analyze_text(data):
    _perform_analysis(data, 'analyze_text')

@socketio.on('analyze_image')
def handle_analyze_image(data):
    _perform_analysis(data, 'analyze_image')

@socketio.on('stop_generation')
def handle_stop_generation():
    sid = request.sid
    if sid in generation_tasks:
        generation_tasks[sid].set()
        socketio.emit('ai_response', {'status': 'stopped', 'content': 'Generation stopped by user.'}, room=sid)
        print(f"Stop signal sent for user {sid}")
    else:
        print(f"No active generation task found for user {sid} to stop.")

def compare_versions(v1, v2):
    try:
        parts1 = list(map(int, v1.split('.')))
        parts2 = list(map(int, v2.split('.')))
        return parts1 > parts2
    except (ValueError, AttributeError):
        return False

def check_for_updates():
    try:
        version_info = _read_json_config(VERSION_FILE)
        current_version = version_info.get('version', '0.0.0')
        repo = version_info.get('github_repo', 'Zippland/Snap-Solver')
        
        api_url = f"https://api.github.com/repos/{repo}/releases/latest"
        headers = {'User-Agent': 'Snap-Solver-Update-Checker'}
        
        response = requests.get(api_url, headers=headers, timeout=5)
        response.raise_for_status()

        latest_release = response.json()
        latest_version = latest_release.get('tag_name', '').lstrip('v')
        
        update_info = {
            'has_update': compare_versions(latest_version, current_version),
            'current_version': current_version,
            'latest_version': latest_version,
            'release_url': latest_release.get('html_url'),
            'release_date': latest_release.get('published_at'),
            'release_notes': latest_release.get('body', ''),
        }
        _write_json_config(UPDATE_INFO_FILE, update_info)
        return update_info

    except requests.RequestException as e:
        print(f"Update check failed: {e}. Reading from cache.")
        return _read_json_config(UPDATE_INFO_FILE, {'has_update': False})
    except Exception as e:
        print(f"An unexpected error occurred during update check: {e}")
        return {'has_update': False, 'error': str(e)}

def initialize_app():
    model_config = _read_json_config(MODEL_CONFIG_FILE, DEFAULT_MODEL_CONFIG)
    if hasattr(ModelFactory, 'update_model_capabilities'):
        ModelFactory.update_model_capabilities(model_config)
    print("Model capabilities loaded from config.")

@app.before_request
def before_request_handler():
    if not getattr(app, '_initialized', False):
        initialize_app()
        app._initialized = True

if __name__ == '__main__':
    port = 5000
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind(('0.0.0.0', port))
    except OSError:
        port = 5001
        print(f"Port 5000 is in use, switching to port {port}.")
    
    local_ip = get_local_ip()
    print("-" * 40)
    print("Snap Solver is running!")
    print(f"  Local Access: http://localhost:{port}")
    print(f"  Network Access: http://{local_ip}:{port}")
    print("Connect from another device on the same network using the Network Access URL.")
    print("-" * 40)
    
    socketio.run(app, host='0.0.0.0', port=port, allow_unsafe_werkzeug=True)