from flask import Flask, jsonify, render_template, request
from flask_socketio import SocketIO
import pyautogui
import base64
from io import BytesIO
import socket
import requests
import json
import asyncio
from threading import Thread

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

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
    return render_template('index.html', local_ip=local_ip)

@socketio.on('connect')
def handle_connect():
    print('Client connected')

@socketio.on('disconnect')
def handle_disconnect():
    print('Client disconnected')

def stream_claude_response(response, sid):
    """Stream Claude's response to the client"""
    try:
        for chunk in response.iter_lines():
            if chunk:
                data = json.loads(chunk.decode('utf-8').removeprefix('data: '))
                if data['type'] == 'content_block_delta':
                    socketio.emit('claude_response', {
                        'content': data['delta']['text']
                    }, room=sid)
                elif data['type'] == 'error':
                    socketio.emit('claude_response', {
                        'error': data['error']['message']
                    }, room=sid)
    except Exception as e:
        socketio.emit('claude_response', {
            'error': str(e)
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

@socketio.on('analyze_image')
def handle_image_analysis(data):
    try:
        settings = data['settings']
        image_data = data['image']  # Base64 encoded image

        headers = {
            'x-api-key': settings['apiKey'],
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
        }

        payload = {
            'model': settings['model'],
            'max_tokens': 4096,
            'temperature': settings['temperature'],
            'system': settings['systemPrompt'],
            'messages': [{
                'role': 'user',
                'content': [
                    {
                        'type': 'image',
                        'source': {
                            'type': 'base64',
                            'media_type': 'image/png',
                            'data': image_data
                        }
                    },
                    {
                        'type': 'text',
                        'text': "Please analyze this image and provide a detailed explanation."
                    }
                ]
            }]
        }

        response = requests.post(
            'https://api.anthropic.com/v1/messages',
            headers=headers,
            json=payload,
            stream=True
        )

        if response.status_code != 200:
            socketio.emit('claude_response', {
                'error': f'Claude API error: {response.status_code} - {response.text}'
            })
            return

        # Start streaming in a separate thread to not block
        Thread(target=stream_claude_response, args=(response, request.sid)).start()

    except Exception as e:
        socketio.emit('claude_response', {
            'error': str(e)
        })

if __name__ == '__main__':
    local_ip = get_local_ip()
    print(f"Local IP Address: {local_ip}")
    print(f"Connect from your mobile device using: {local_ip}:5000")
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)
