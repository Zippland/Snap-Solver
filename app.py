from flask import Flask, jsonify, render_template, request
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
app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

# Commented out due to model file issues
# from pix2text import Pix2Text

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

# Commented out due to model file issues
# p2t = Pix2Text()

def stream_model_response(response_generator, sid):
    """Stream model responses to the client"""
    try:
        print("Starting response streaming...")
        
        # 初始化：发送开始状态
        socketio.emit('claude_response', {
            'status': 'started',
            'content': ''
        }, room=sid)
        print("Sent initial status to client")

        # 跟踪已发送的内容
        previous_thinking_content = ""
        
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
                # 确保只发送新增的思考内容
                if previous_thinking_content and content.startswith(previous_thinking_content):
                    # 只发送新增部分
                    new_content = content[len(previous_thinking_content):]
                    if new_content:  # 只有当有新内容时才发送
                        print(f"Streaming thinking content: {len(new_content)} chars")
                        socketio.emit('claude_response', {
                            'status': 'thinking',
                            'content': new_content
                        }, room=sid)
                else:
                    # 直接发送全部内容（首次或内容不连续的情况）
                    print(f"Streaming thinking content (reset): {len(content)} chars")
                    socketio.emit('claude_response', {
                        'status': 'thinking',
                        'content': content
                    }, room=sid)
                
                # 更新已发送的思考内容记录
                previous_thinking_content = content
                
            elif status == 'streaming':
                # 流式输出正常内容
                if content:
                    print(f"Streaming response content: {len(content)} chars")
                    socketio.emit('claude_response', {
                        'status': 'streaming',
                        'content': content
                    }, room=sid)
                    
            else:
                # 其他状态直接转发
                socketio.emit('claude_response', response, room=sid)
                
                # 调试信息
                if status == 'thinking_complete':
                    print(f"Thinking complete, total length: {len(content)} chars")
                elif status == 'completed':
                    print("Response completed")
                elif status == 'error':
                    print(f"Error: {response.get('error', 'Unknown error')}")

    except Exception as e:
        error_msg = f"Streaming error: {str(e)}"
        print(error_msg)
        socketio.emit('claude_response', {
            'status': 'error',
            'error': error_msg
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
            
        settings = data.get('settings', {})
        if not isinstance(settings, dict):
            raise ValueError("Invalid settings format")
        
        mathpix_key = settings.get('mathpixApiKey')
        if not mathpix_key:
            raise ValueError("Mathpix API key is required")
        
        try:
            app_id, app_key = mathpix_key.split(':')
            if not app_id.strip() or not app_key.strip():
                raise ValueError()
        except ValueError:
            raise ValueError("Invalid Mathpix API key format. Expected format: 'app_id:app_key'")

        print("Creating Mathpix model instance...")
        model = ModelFactory.create_model(
            model_name='mathpix',
            api_key=mathpix_key
        )

        print("Starting text extraction thread...")
        extraction_thread = Thread(
            target=stream_model_response,
            args=(model.analyze_image(image_data), request.sid)
        )
        extraction_thread.daemon = True  # Make thread daemon so it doesn't block shutdown
        extraction_thread.start()

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
        text = data.get('text')
        settings = data.get('settings', {})
        sid = request.sid

        print("Selected model:", settings.get('model', 'claude-3-7-sonnet-20250219'))
        
        # Get API key and create model
        model_name = settings.get('model', 'claude-3-7-sonnet-20250219')
        api_key = settings.get('api_keys', {}).get(model_name)

        # Validate required settings
        if not api_key:
            raise ValueError("API key is required for the selected model")

        # Configure proxy settings if enabled
        proxies = None
        if settings.get('proxyEnabled', False):
            proxy_host = settings.get('proxyHost', '127.0.0.1')
            proxy_port = settings.get('proxyPort', '4780')
            proxies = {
                'http': f'http://{proxy_host}:{proxy_port}',
                'https': f'http://{proxy_host}:{proxy_port}'
            }

        try:
            # Create model instance using factory
            model = ModelFactory.create_model(
                model_name=model_name,
                api_key=api_key,
                temperature=float(settings.get('temperature', 0.7)),
                system_prompt=settings.get('systemPrompt')
            )
            
            # Start streaming in a separate thread
            Thread(
                target=stream_model_response,
                args=(model.analyze_text(text, proxies), sid)
            ).start()

        except Exception as e:
            socketio.emit('claude_response', {
                'status': 'error',
                'error': f'API error: {str(e)}'
            }, room=sid)

    except Exception as e:
        print(f"Analysis error: {str(e)}")
        socketio.emit('claude_response', {
            'status': 'error',
            'error': f'Analysis error: {str(e)}'
        }, room=request.sid)

@socketio.on('analyze_image')
def handle_analyze_image(data):
    try:
        # 检查数据是否有效
        if not data or not isinstance(data, dict):
            raise ValueError("Invalid request data")
            
        image_data = data.get('image')
        if not image_data:
            raise ValueError("No image data provided")
            
        settings = data.get('settings', {})
        
        # 不需要分割了，因为前端已经做了分割
        # _, base64_data = image_data_url.split(',', 1)
        base64_data = image_data
        
        # Get API key and create model
        model_name = settings.get('model', 'claude-3-7-sonnet-20250219')
        api_key = settings.get('api_keys', {}).get(model_name)

        # Validate required settings
        if not api_key:
            raise ValueError(f"API key is required for the selected model: {model_name}")

        # Log with model name for better debugging
        print(f"Using API key for {model_name}: {api_key[:6]}...")
        print("Selected model:", model_name)
        
        # Configure proxy settings if enabled
        proxies = None
        if settings.get('proxyEnabled', False):
            proxy_host = settings.get('proxyHost', '127.0.0.1')
            proxy_port = settings.get('proxyPort', '4780')
            proxies = {
                'http': f'http://{proxy_host}:{proxy_port}',
                'https': f'http://{proxy_host}:{proxy_port}'
            }

        try:
            # Create model instance using factory
            model = ModelFactory.create_model(
                model_name=model_name,
                api_key=api_key,
                temperature=float(settings.get('temperature', 0.7)),
                system_prompt=settings.get('systemPrompt')
            )
            
            # Start streaming in a separate thread
            Thread(
                target=stream_model_response,
                args=(model.analyze_image(base64_data, proxies), request.sid)
            ).start()

        except Exception as e:
            socketio.emit('claude_response', {
                'status': 'error',
                'error': f'API error: {str(e)}'
            }, room=request.sid)

    except Exception as e:
        print(f"Analysis error: {str(e)}")
        socketio.emit('claude_response', {
            'status': 'error',
            'error': f'Analysis error: {str(e)}'
        }, room=request.sid)

def run_tray():
    icon = create_tray_icon()
    icon.run()

if __name__ == '__main__':
    local_ip = get_local_ip()
    print(f"Local IP Address: {local_ip}")
    print(f"Connect from your mobile device using: {local_ip}:5000")
    
    # Run system tray icon in a separate thread
    tray_thread = Thread(target=run_tray)
    tray_thread.daemon = True
    tray_thread.start()
    
    # Run Flask in the main thread without debug mode
    socketio.run(app, host='0.0.0.0', port=5000, allow_unsafe_werkzeug=True)
