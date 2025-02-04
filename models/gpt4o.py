import os
from typing import Generator, Dict, Optional
from openai import OpenAI
from .base import BaseModel

class GPT4oModel(BaseModel):
    def get_default_system_prompt(self) -> str:
        return """You are an expert at analyzing questions and providing detailed solutions. When presented with an image of a question:
1. First read and understand the question carefully
2. Break down the key components of the question
3. Provide a clear, step-by-step solution
4. If relevant, explain any concepts or theories involved
5. If there are multiple approaches, explain the most efficient one first"""

    def get_model_identifier(self) -> str:
        return "gpt-4o-2024-11-20"

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

                # Create OpenAI client
                client = OpenAI(
                    api_key=self.api_key,
                    base_url="https://api.openai.com/v1"  # Replace with actual GPT-4o API endpoint
                )

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

                for chunk in response:
                    if hasattr(chunk.choices[0].delta, 'content'):
                        content = chunk.choices[0].delta.content
                        if content:
                            yield {
                                "status": "streaming",
                                "content": content
                            }

                # Send completion status
                yield {
                    "status": "completed",
                    "content": ""
                }

            finally:
                # Restore original environment state
                for key, value in original_env.items():
                    if value is None:
                        os.environ.pop(key, None)
                    else:
                        os.environ[key] = value

        except Exception as e:
            error_msg = str(e)
            if "invalid_api_key" in error_msg.lower():
                error_msg = "Invalid API key provided"
            elif "rate_limit" in error_msg.lower():
                error_msg = "Rate limit exceeded. Please try again later."
            
            yield {
                "status": "error",
                "error": f"GPT-4o API error: {error_msg}"
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

                # Create OpenAI client
                client = OpenAI(
                    api_key=self.api_key,
                    base_url="https://api.openai.com/v1"  # Replace with actual GPT-4o API endpoint
                )

                messages = [
                    {
                        "role": "system",
                        "content": self.system_prompt
                    },
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/png;base64,{image_data}",
                                    "detail": "high"
                                }
                            },
                            {
                                "type": "text",
                                "text": "Please analyze this question and provide a detailed solution. If you see multiple questions, focus on solving them one at a time."
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

                for chunk in response:
                    if hasattr(chunk.choices[0].delta, 'content'):
                        content = chunk.choices[0].delta.content
                        if content:
                            yield {
                                "status": "streaming",
                                "content": content
                            }

                # Send completion status
                yield {
                    "status": "completed",
                    "content": ""
                }

            finally:
                # Restore original environment state
                for key, value in original_env.items():
                    if value is None:
                        os.environ.pop(key, None)
                    else:
                        os.environ[key] = value

        except Exception as e:
            error_msg = str(e)
            if "invalid_api_key" in error_msg.lower():
                error_msg = "Invalid API key provided"
            elif "rate_limit" in error_msg.lower():
                error_msg = "Rate limit exceeded. Please try again later."
            
            yield {
                "status": "error",
                "error": f"GPT-4o API error: {error_msg}"
            }
