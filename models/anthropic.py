import json
import requests
from typing import Generator, Optional
from .base import BaseModel

class AnthropicModel(BaseModel):
    def __init__(self, api_key, temperature=0.7, system_prompt=None, language=None, api_base_url=None, model_identifier=None, reasoning_tier="deep"):
        super().__init__(api_key, temperature, system_prompt or self.get_default_system_prompt(), language or "en", reasoning_tier=reasoning_tier)
        # 设置API基础URL，默认为Anthropic官方API
        self.api_base_url = api_base_url or "https://api.anthropic.com/v1"
        # 设置模型标识符，支持动态选择
        self.model_identifier = model_identifier or "claude-opus-4-8"
        # 初始化最大Token数
        self.max_tokens = None

    def _apply_reasoning_tier(self, payload: dict) -> None:
        """将 fast/deep/max 映射到 Anthropic 原生推理参数（原地修改 payload）。
        新型号用 output_config.effort + thinking；Haiku/旧型号不接受 effort，降级到 budget_tokens。"""
        model_id = self.get_model_identifier().lower()
        tier = self.reasoning_tier
        max_tokens = payload.get('max_tokens', 8192)

        # Haiku 4.5 / Sonnet 4.x 等型号拒绝 output_config.effort，降级到 budget_tokens
        uses_budget = 'haiku' in model_id or 'sonnet-4' in model_id
        if uses_budget:
            payload.pop('output_config', None)
            if tier == 'fast':
                payload.pop('thinking', None)
            else:
                ratio = 4 if tier == 'deep' else 2  # deep=1/4, max=1/2
                budget = max(1024, min(max_tokens // ratio, max_tokens - 1024))
                payload['thinking'] = {'type': 'enabled', 'budget_tokens': budget}
            return

        # 新型号：effort 三档 + adaptive/disabled thinking
        effort_map = {'fast': 'low', 'deep': 'high', 'max': 'max'}
        payload['output_config'] = {'effort': effort_map.get(tier, 'high')}
        payload['thinking'] = {'type': 'disabled'} if tier == 'fast' else {'type': 'adaptive'}
        
    def get_default_system_prompt(self) -> str:
        return """You are an expert at analyzing questions and providing detailed solutions. When presented with an image of a question:
1. First read and understand the question carefully
2. Break down the key components of the question
3. Provide a clear, step-by-step solution
4. If relevant, explain any concepts or theories involved
5. If there are multiple approaches, explain the most efficient one first"""

    def get_model_identifier(self) -> str:
        return self.model_identifier

    def analyze_text(self, text: str, proxies: Optional[dict] = None) -> Generator[dict, None, None]:
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

            # 按统一推理档位写入原生推理参数
            self._apply_reasoning_tier(payload)

            print(f"Debug - 推理档位: tier={self.reasoning_tier}, max_tokens={max_tokens}, thinking={payload.get('thinking')}, output_config={payload.get('output_config')}")

            # 使用配置的API基础URL
            api_endpoint = f"{self.api_base_url}/messages"
            
            response = requests.post(
                api_endpoint,
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

    def analyze_image(self, image_data, proxies: Optional[dict] = None, history: Optional[list] = None):
        yield {"status": "started"}
        
        api_key = self.api_key
        if api_key.startswith('Bearer '):
            api_key = api_key[7:]
            
        headers = {
            'x-api-key': api_key,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
        }
        
        # 使用系统提供的系统提示词，不再自动添加语言指令
        system_prompt = self.system_prompt
        
        # 获取最大输出Token设置
        max_tokens = 8192  # 默认值
        if hasattr(self, 'max_tokens') and self.max_tokens:
            max_tokens = self.max_tokens
            
        payload = {
            'model': self.get_model_identifier(),
            'stream': True,
            'max_tokens': max_tokens,
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
                        'text': "请分析这个问题并提供详细的解决方案。如果你看到多个问题，请逐一解决。"
                    }
                ]
            }]
        }

        # 同题追问：把既往问答与新追问追加在带图首轮之后（user/assistant 交替）
        for turn in self._text_history(history):
            payload['messages'].append({'role': turn['role'], 'content': turn['content']})

        # 按统一推理档位写入原生推理参数
        self._apply_reasoning_tier(payload)

        print(f"Debug - 图像分析推理档位: tier={self.reasoning_tier}, max_tokens={max_tokens}, thinking={payload.get('thinking')}, output_config={payload.get('output_config')}")

        # 使用配置的API基础URL
        api_endpoint = f"{self.api_base_url}/messages"
        
        response = requests.post(
            api_endpoint,
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
