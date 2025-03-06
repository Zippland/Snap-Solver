import json
import requests
from typing import Generator
from .base import BaseModel

class ClaudeModel(BaseModel):
    def get_default_system_prompt(self) -> str:
        return """You are an expert at analyzing questions and providing detailed solutions. When presented with an image of a question:
1. First read and understand the question carefully
2. Break down the key components of the question
3. Provide a clear, step-by-step solution
4. If relevant, explain any concepts or theories involved
5. If there are multiple approaches, explain the most efficient one first"""

    def get_model_identifier(self) -> str:
        return "claude-3-7-sonnet-20250219"

    def analyze_text(self, text: str, proxies: dict = None) -> Generator[dict, None, None]:
        """Stream Claude's response for text analysis"""
        try:
            yield {"status": "started"}
            
            api_key = self.api_key
            if api_key.startswith('Bearer '):
                api_key = api_key[7:]
                
            headers = {
                'x-api-key': api_key,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json',
                'accept': 'application/json',
            }

            payload = {
                'model': self.get_model_identifier(),
                'stream': True,
                'max_tokens': 8192,
                'temperature': 1,
                'system': self.system_prompt,
                'thinking': {
                    'type': 'enabled',
                    'budget_tokens': 4096
                },
                'messages': [{
                    'role': 'user',
                    'content': [
                        {
                            'type': 'text',
                            'text': text
                        }
                    ]
                }]
            }

            response = requests.post(
                'https://api.anthropic.com/v1/messages',
                headers=headers,
                json=payload,
                stream=True,
                proxies=proxies,
                timeout=60
            )

            if response.status_code != 200:
                error_msg = f'API error: {response.status_code}'
                try:
                    error_data = response.json()
                    if 'error' in error_data:
                        error_msg += f" - {error_data['error']['message']}"
                except:
                    error_msg += f" - {response.text}"
                yield {"status": "error", "error": error_msg}
                return

            thinking_content = ""
            response_buffer = ""
            
            for chunk in response.iter_lines():
                if not chunk:
                    continue

                try:
                    chunk_str = chunk.decode('utf-8')
                    if not chunk_str.startswith('data: '):
                        continue

                    chunk_str = chunk_str[6:]
                    data = json.loads(chunk_str)

                    if data.get('type') == 'content_block_delta':
                        if 'delta' in data:
                            if 'text' in data['delta']:
                                text_chunk = data['delta']['text']
                                response_buffer += text_chunk
                                # 只在每累积一定数量的字符后才发送，减少UI跳变
                                if len(text_chunk) >= 10 or text_chunk.endswith(('.', '!', '?', '。', '！', '？', '\n')):
                                    yield {
                                        "status": "streaming",
                                        "content": response_buffer
                                    }
                                
                            elif 'thinking' in data['delta']:
                                thinking_chunk = data['delta']['thinking']
                                thinking_content += thinking_chunk
                                # 只在每累积一定数量的字符后才发送，减少UI跳变
                                if len(thinking_chunk) >= 20 or thinking_chunk.endswith(('.', '!', '?', '。', '！', '？', '\n')):
                                    yield {
                                        "status": "thinking",
                                        "content": thinking_content
                                    }
                    
                    # 处理新的extended_thinking格式
                    elif data.get('type') == 'extended_thinking_delta':
                        if 'delta' in data and 'text' in data['delta']:
                            thinking_chunk = data['delta']['text']
                            thinking_content += thinking_chunk
                            # 只在每累积一定数量的字符后才发送，减少UI跳变
                            if len(thinking_chunk) >= 20 or thinking_chunk.endswith(('.', '!', '?', '。', '！', '？', '\n')):
                                yield {
                                    "status": "thinking",
                                    "content": thinking_content
                                }

                    elif data.get('type') == 'message_stop':
                        # 确保发送完整的思考内容
                        if thinking_content:
                            yield {
                                "status": "thinking_complete",
                                "content": thinking_content
                            }
                        # 确保发送完整的响应内容
                        yield {
                            "status": "completed",
                            "content": response_buffer
                        }

                    elif data.get('type') == 'error':
                        error_msg = data.get('error', {}).get('message', 'Unknown error')
                        yield {
                            "status": "error",
                            "error": error_msg
                        }
                        break

                except json.JSONDecodeError as e:
                    print(f"JSON decode error: {str(e)}")
                    continue

        except Exception as e:
            yield {
                "status": "error",
                "error": f"Streaming error: {str(e)}"
            }

    def analyze_image(self, image_data, proxies=None):
        yield {"status": "started"}
        
        api_key = self.api_key
        if api_key.startswith('Bearer '):
            api_key = api_key[7:]
            
        headers = {
            'x-api-key': api_key,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
        }
        
        # 获取系统提示词，确保包含语言设置
        system_prompt = self.system_prompt
        
        payload = {
            'model': 'claude-3-7-sonnet-20250219',
            'stream': True,
            'max_tokens': 8192,
            'temperature': 1,
            'thinking': {
                'type': 'enabled',
                'budget_tokens': 4096
            },
            'system': system_prompt,
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
                        'text': "Please analyze this question and provide a detailed solution. If you see multiple questions, focus on solving them one at a time."
                    }
                ]
            }]
        }

        response = requests.post(
            'https://api.anthropic.com/v1/messages',
            headers=headers,
            json=payload,
            stream=True,
            proxies=proxies,
            timeout=60
        )

        if response.status_code != 200:
            error_msg = f'API error: {response.status_code}'
            try:
                error_data = response.json()
                if 'error' in error_data:
                    error_msg += f" - {error_data['error']['message']}"
            except:
                error_msg += f" - {response.text}"
            yield {"status": "error", "error": error_msg}
            return

        thinking_content = ""
        response_buffer = ""
        
        for chunk in response.iter_lines():
            if not chunk:
                continue

            try:
                chunk_str = chunk.decode('utf-8')
                if not chunk_str.startswith('data: '):
                    continue

                chunk_str = chunk_str[6:]
                data = json.loads(chunk_str)

                if data.get('type') == 'content_block_delta':
                    if 'delta' in data:
                        if 'text' in data['delta']:
                            text_chunk = data['delta']['text']
                            response_buffer += text_chunk
                            # 只在每累积一定数量的字符后才发送，减少UI跳变
                            if len(text_chunk) >= 10 or text_chunk.endswith(('.', '!', '?', '。', '！', '？', '\n')):
                                yield {
                                    "status": "streaming",
                                    "content": response_buffer
                                }
                            
                        elif 'thinking' in data['delta']:
                            thinking_chunk = data['delta']['thinking']
                            thinking_content += thinking_chunk
                            # 只在每累积一定数量的字符后才发送，减少UI跳变
                            if len(thinking_chunk) >= 20 or thinking_chunk.endswith(('.', '!', '?', '。', '！', '？', '\n')):
                                yield {
                                    "status": "thinking",
                                    "content": thinking_content
                                }
                
                # 处理新的extended_thinking格式
                elif data.get('type') == 'extended_thinking_delta':
                    if 'delta' in data and 'text' in data['delta']:
                        thinking_chunk = data['delta']['text']
                        thinking_content += thinking_chunk
                        # 只在每累积一定数量的字符后才发送，减少UI跳变
                        if len(thinking_chunk) >= 20 or thinking_chunk.endswith(('.', '!', '?', '。', '！', '？', '\n')):
                            yield {
                                "status": "thinking",
                                "content": thinking_content
                            }

                elif data.get('type') == 'message_stop':
                    # 确保发送完整的思考内容
                    if thinking_content:
                        yield {
                            "status": "thinking_complete",
                            "content": thinking_content
                        }
                    # 确保发送完整的响应内容
                    yield {
                        "status": "completed",
                        "content": response_buffer
                    }
                    
                elif data.get('type') == 'error':
                    error_message = data.get('error', {}).get('message', 'Unknown error')
                    yield {
                        "status": "error",
                        "error": error_message
                    }
                    
            except Exception as e:
                yield {
                    "status": "error",
                    "error": f"Error processing response: {str(e)}"
                }
                break
