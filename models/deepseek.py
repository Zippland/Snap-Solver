import json
import requests
from typing import Generator
from openai import OpenAI
from .base import BaseModel

class DeepSeekModel(BaseModel):
    def get_default_system_prompt(self) -> str:
        return """You are an expert at analyzing questions and providing detailed solutions. When presented with an image of a question:
1. First read and understand the question carefully
2. Break down the key components of the question
3. Provide a clear, step-by-step solution
4. If relevant, explain any concepts or theories involved
5. If there are multiple approaches, explain the most efficient one first"""

    def get_model_identifier(self) -> str:
        return "deepseek-reasoner"

    def analyze_text(self, text: str, proxies: dict = None) -> Generator[dict, None, None]:
        """Stream DeepSeek's response for text analysis"""
        try:
            # Initial status
            yield {"status": "started", "content": ""}

            # Configure client with proxy if needed
            client_args = {
                "api_key": self.api_key,
                "base_url": "https://api.deepseek.com"
            }
            
            if proxies:
                session = requests.Session()
                session.proxies = proxies
                client_args["http_client"] = session

            client = OpenAI(**client_args)

            response = client.chat.completions.create(
                model=self.get_model_identifier(),
                messages=[{
                    'role': 'system',
                    'content': self.system_prompt
                }, {
                    'role': 'user',
                    'content': text
                }],
                stream=True
            )

            for chunk in response:
                try:
                    if hasattr(chunk.choices[0].delta, 'reasoning_content'):
                        content = chunk.choices[0].delta.reasoning_content
                        if content:
                            yield {
                                "status": "streaming",
                                "content": content
                            }
                    elif hasattr(chunk.choices[0].delta, 'content'):
                        content = chunk.choices[0].delta.content
                        if content:
                            yield {
                                "status": "streaming",
                                "content": content
                            }

                except Exception as e:
                    print(f"Chunk processing error: {str(e)}")
                    continue

            # Send completion status
            yield {
                "status": "completed",
                "content": ""
            }

        except Exception as e:
            error_msg = str(e)
            if "invalid_api_key" in error_msg.lower():
                error_msg = "Invalid API key provided"
            elif "rate_limit" in error_msg.lower():
                error_msg = "Rate limit exceeded. Please try again later."
            
            yield {
                "status": "error",
                "error": f"DeepSeek API error: {error_msg}"
            }

    def analyze_image(self, image_data: str, proxies: dict = None) -> Generator[dict, None, None]:
        """Stream DeepSeek's response for image analysis"""
        try:
            # Initial status
            yield {"status": "started", "content": ""}

            # Configure client with proxy if needed
            client_args = {
                "api_key": self.api_key,
                "base_url": "https://api.deepseek.com"
            }
            
            if proxies:
                session = requests.Session()
                session.proxies = proxies
                client_args["http_client"] = session

            client = OpenAI(**client_args)

            # 检查系统提示词是否已包含语言设置指令
            system_prompt = self.system_prompt
            language = self.language or '中文'
            if not any(phrase in system_prompt for phrase in ['Please respond in', '请用', '使用', '回答']):
                system_prompt = f"{system_prompt}\n\n请务必使用{language}回答，无论问题是什么语言。即使在分析图像时也请使用{language}回答。"

            response = client.chat.completions.create(
                model=self.get_model_identifier(),
                messages=[{
                    'role': 'system',
                    'content': system_prompt
                }, {
                    'role': 'user',
                    'content': f"Here's an image of a question to analyze: data:image/png;base64,{image_data}"
                }],
                stream=True
            )

            for chunk in response:
                try:
                    if hasattr(chunk.choices[0].delta, 'reasoning_content'):
                        content = chunk.choices[0].delta.reasoning_content
                        if content:
                            yield {
                                "status": "streaming",
                                "content": content
                            }
                    elif hasattr(chunk.choices[0].delta, 'content'):
                        content = chunk.choices[0].delta.content
                        if content:
                            yield {
                                "status": "streaming",
                                "content": content
                            }

                except Exception as e:
                    print(f"Chunk processing error: {str(e)}")
                    continue

            # Send completion status
            yield {
                "status": "completed",
                "content": ""
            }

        except Exception as e:
            error_msg = str(e)
            if "invalid_api_key" in error_msg.lower():
                error_msg = "Invalid API key provided"
            elif "rate_limit" in error_msg.lower():
                error_msg = "Rate limit exceeded. Please try again later."
            
            yield {
                "status": "error",
                "error": f"DeepSeek API error: {error_msg}"
            }
