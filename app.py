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
        
        # Send initial status
        socketio.emit('claude_response', {
            'status': 'started',
            'content': ''
        }, room=sid)
        print("Sent initial status to client")

        # Stream responses
        for response in response_generator:
            socketio.emit('claude_response', response, room=sid)

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
        image_data = data['image']  # Base64 encoded image
        
        # Convert base64 to PIL Image
        image_bytes = base64.b64decode(image_data)
        image = Image.open(BytesIO(image_bytes))
        
        # Temporarily disabled text extraction
        extracted_text = "Text extraction is currently disabled"
        
        # Send the extracted text back to the client
        socketio.emit('text_extraction_response', {
            'success': True,
            'text': extracted_text
        }, room=request.sid)
        
    except Exception as e:
        print(f"Text extraction error: {str(e)}")
        socketio.emit('text_extraction_response', {
            'success': False,
            'error': f'Text extraction error: {str(e)}'
        }, room=request.sid)

@socketio.on('analyze_text')
def handle_text_analysis(data):
    try:
        print("Starting text analysis...")
        text = data['text']
        settings = data['settings']

        # Validate required settings
        if not settings.get('apiKey'):
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
                model_name=settings.get('model', 'claude-3-5-sonnet-20241022'),
                api_key=settings['apiKey'],
                temperature=float(settings.get('temperature', 0.7)),
                system_prompt=settings.get('systemPrompt')
            )
            
            # Start streaming in a separate thread
            Thread(
                target=stream_model_response,
                args=(model.analyze_text(text, proxies), request.sid)
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

@socketio.on('analyze_image')
def handle_image_analysis(data):
    try:
        print("Starting image analysis...")
        settings = data['settings']
        image_data = data['image']  # Base64 encoded image

        # Validate required settings
        if not settings.get('apiKey'):
            raise ValueError("API key is required for the selected model")

        # Log with model name for better debugging
        print(f"Using API key for {settings.get('model', 'unknown')}: {settings['apiKey'][:6]}...")
        print("Selected model:", settings.get('model', 'claude-3-5-sonnet-20241022'))
        
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
                model_name=settings.get('model', 'claude-3-5-sonnet-20241022'),
                api_key=settings['apiKey'],
                temperature=float(settings.get('temperature', 0.7)),
                system_prompt=settings.get('systemPrompt')
            )
            
            # Start streaming in a separate thread
            Thread(
                target=stream_model_response,
                args=(model.analyze_image(image_data, proxies), request.sid)
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
