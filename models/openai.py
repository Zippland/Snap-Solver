import os
from typing import Generator, Dict, Optional
from openai import OpenAI
from .base import BaseModel

class OpenAIModel(BaseModel):
    def __init__(self, api_key, temperature=0.7, system_prompt=None, language=None, api_base_url=None, model_identifier=None):
        super().__init__(api_key, temperature, system_prompt, language)
        # 设置API基础URL，默认为OpenAI官方API
        self.api_base_url = api_base_url
        # 允许从外部配置显式指定模型标识符
        self.model_identifier = model_identifier or "gpt-4o-2024-11-20"
        
    def get_default_system_prompt(self) -> str:
        return """You are an expert at analyzing questions and providing detailed solutions. When presented with an image of a question:
1. First read and understand the question carefully
2. Break down the key components of the question
3. Provide a clear, step-by-step solution
4. If relevant, explain any concepts or theories involved
5. If there are multiple approaches, explain the most efficient one first"""

    def get_model_identifier(self) -> str:
        return self.model_identifier

    def analyze_text(self, text: str, proxies: dict = None) -> Generator[dict, None, None]:
        """Stream GPT-4o's response for text analysis"""
        try:
            # Initial status
            yield {"status": "started", "content": ""}

            # Save original environment state
            original_env = {
                'http_proxy': os.environ.get('http_proxy'),
                'https_proxy': os.environ.get('https_proxy')
            }

            try:
                # Set proxy environment variables if provided
                if proxies:
                    if 'http' in proxies:
                        os.environ['http_proxy'] = proxies['http']
                    if 'https' in proxies:
                        os.environ['https_proxy'] = proxies['https']

                # Initialize OpenAI client with base_url if provided
                if self.api_base_url:
                    client = OpenAI(api_key=self.api_key, base_url=self.api_base_url)
                else:
                    client = OpenAI(api_key=self.api_key)

                # Prepare messages
                messages = [
                    {
                        "role": "system",
                        "content": self.system_prompt
                    },
                    {
                        "role": "user",
                        "content": text
                    }
                ]

                response = client.chat.completions.create(
                    model=self.get_model_identifier(),
                    messages=messages,
                    temperature=self.temperature,
                    stream=True,
                    max_tokens=4000
                )

                # 使用累积缓冲区
                response_buffer = ""
                
                for chunk in response:
                    if hasattr(chunk.choices[0].delta, 'content'):
                        content = chunk.choices[0].delta.content
                        if content:
                            # 累积内容
                            response_buffer += content
                            
                            # 只在累积一定数量的字符或遇到句子结束标记时才发送
                            if len(content) >= 10 or content.endswith(('.', '!', '?', '。', '！', '？', '\n')):
                                yield {
                                    "status": "streaming",
                                    "content": response_buffer
                                }

                # 确保发送最终完整内容
                if response_buffer:
                    yield {
                        "status": "streaming",
                        "content": response_buffer
                    }

                # Send completion status
                yield {
                    "status": "completed",
                    "content": response_buffer
                }

            finally:
                # Restore original environment state
                for key, value in original_env.items():
                    if value is None:
                        if key in os.environ:
                            del os.environ[key]
                    else:
                        os.environ[key] = value

        except Exception as e:
            yield {
                "status": "error",
                "error": str(e)
            }

    def analyze_image(self, image_data: str, proxies: dict = None) -> Generator[dict, None, None]:
        """Stream GPT-4o's response for image analysis"""
        try:
            # Initial status
            yield {"status": "started", "content": ""}

            # Save original environment state
            original_env = {
                'http_proxy': os.environ.get('http_proxy'),
                'https_proxy': os.environ.get('https_proxy')
            }

            try:
                # Set proxy environment variables if provided
                if proxies:
                    if 'http' in proxies:
                        os.environ['http_proxy'] = proxies['http']
                    if 'https' in proxies:
                        os.environ['https_proxy'] = proxies['https']

                # Initialize OpenAI client with base_url if provided
                if self.api_base_url:
                    client = OpenAI(api_key=self.api_key, base_url=self.api_base_url)
                else:
                    client = OpenAI(api_key=self.api_key)

                # 使用系统提供的系统提示词，不再自动添加语言指令
                system_prompt = self.system_prompt

                # Prepare messages with image
                messages = [
                    {
                        "role": "system",
                        "content": system_prompt
                    },
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/jpeg;base64,{image_data}"
                                }
                            },
                            {
                                "type": "text",
                                "text": "Please analyze this image and provide a detailed solution."
                            }
                        ]
                    }
                ]

                response = client.chat.completions.create(
                    model=self.get_model_identifier(),
                    messages=messages,
                    temperature=self.temperature,
                    stream=True,
                    max_tokens=4000
                )

                # 使用累积缓冲区
                response_buffer = ""
                
                for chunk in response:
                    if hasattr(chunk.choices[0].delta, 'content'):
                        content = chunk.choices[0].delta.content
                        if content:
                            # 累积内容
                            response_buffer += content
                            
                            # 只在累积一定数量的字符或遇到句子结束标记时才发送
                            if len(content) >= 10 or content.endswith(('.', '!', '?', '。', '！', '？', '\n')):
                                yield {
                                    "status": "streaming",
                                    "content": response_buffer
                                }

                # 确保发送最终完整内容
                if response_buffer:
                    yield {
                        "status": "streaming",
                        "content": response_buffer
                    }

                # Send completion status
                yield {
                    "status": "completed",
                    "content": response_buffer
                }

            finally:
                # Restore original environment state
                for key, value in original_env.items():
                    if value is None:
                        if key in os.environ:
                            del os.environ[key]
                    else:
                        os.environ[key] = value

        except Exception as e:
            yield {
                "status": "error",
                "error": str(e)
            }
