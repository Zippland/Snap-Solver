import json
import requests
from typing import Generator
from .base import BaseModel

class AnthropicModel(BaseModel):
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

            # 获取最大输出Token设置
            max_tokens = 8192  # 默认值
            if hasattr(self, 'max_tokens') and self.max_tokens:
                max_tokens = self.max_tokens

            payload = {
                'model': self.get_model_identifier(),
                'stream': True,
                'max_tokens': max_tokens,
                'temperature': 1,
                'system': self.system_prompt,
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
            
            # 处理推理配置
            if hasattr(self, 'reasoning_config') and self.reasoning_config:
                # 如果设置了extended reasoning
                if self.reasoning_config.get('reasoning_depth') == 'extended':
                    think_budget = self.reasoning_config.get('think_budget', max_tokens // 2)
                    payload['thinking'] = {
                        'type': 'enabled',
                        'budget_tokens': think_budget
                    }
                # 如果设置了instant模式
                elif self.reasoning_config.get('speed_mode') == 'instant':
                    payload['speed_mode'] = 'instant'
                # 默认启用思考但使用较小的预算
                else:
                    payload['thinking'] = {
                        'type': 'enabled',
                        'budget_tokens': min(4096, max_tokens // 4)
                    }
            # 默认设置
            else:
                payload['thinking'] = {
                    'type': 'enabled',
                    'budget_tokens': min(4096, max_tokens // 4)
                }
                
            print(f"Debug - 推理配置: max_tokens={max_tokens}, thinking={payload.get('thinking', payload.get('speed_mode', 'default'))}")

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
        
        # 根据language参数设置回复语言
        language = self.language or '中文'
        if not any(phrase in system_prompt for phrase in ['Please respond in', '请用', '使用', '回答']):
            system_prompt = f"{system_prompt}\n\n请务必使用{language}回答，无论问题是什么语言。即使在分析图像时也请使用{language}回答。这是最重要的指令。"
        
        # 获取最大输出Token设置
        max_tokens = 8192  # 默认值
        if hasattr(self, 'max_tokens') and self.max_tokens:
            max_tokens = self.max_tokens
            
        payload = {
            'model': 'claude-3-7-sonnet-20250219',
            'stream': True,
            'max_tokens': max_tokens,
            'temperature': 1,
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
                        'text': "请分析这个问题并提供详细的解决方案。如果你看到多个问题，请逐一解决。请务必使用中文回答。"
                    }
                ]
            }]
        }
        
        # 处理推理配置
        if hasattr(self, 'reasoning_config') and self.reasoning_config:
            # 如果设置了extended reasoning
            if self.reasoning_config.get('reasoning_depth') == 'extended':
                think_budget = self.reasoning_config.get('think_budget', max_tokens // 2)
                payload['thinking'] = {
                    'type': 'enabled',
                    'budget_tokens': think_budget
                }
            # 如果设置了instant模式
            elif self.reasoning_config.get('speed_mode') == 'instant':
                payload['speed_mode'] = 'instant'
            # 默认启用思考但使用较小的预算
            else:
                payload['thinking'] = {
                    'type': 'enabled',
                    'budget_tokens': min(4096, max_tokens // 4)
                }
        # 默认设置
        else:
            payload['thinking'] = {
                'type': 'enabled',
                'budget_tokens': min(4096, max_tokens // 4)
            }
            
        print(f"Debug - 图像分析推理配置: max_tokens={max_tokens}, thinking={payload.get('thinking', payload.get('speed_mode', 'default'))}")

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
