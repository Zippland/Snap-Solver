import os
from typing import Generator, Dict, Optional, Any
from openai import OpenAI
from .base import BaseModel

class AlibabaModel(BaseModel):
    def __init__(self, api_key: str, temperature: float = 0.7, system_prompt: str = None, language: str = None, model_name: str = None):
        self.model_name = model_name or "QVQ-Max-2025-03-25"  # 默认使用QVQ-Max模型
        # 在super().__init__之前设置model_name，这样get_default_system_prompt能使用它
        super().__init__(api_key, temperature, system_prompt, language)
    
    def get_default_system_prompt(self) -> str:
        """根据模型名称返回不同的默认系统提示词"""
        # 检查是否是通义千问VL模型
        if self.model_name and "qwen-vl" in self.model_name:
            return """你是通义千问VL视觉语言助手，擅长图像理解、文字识别、内容分析和创作。请根据用户提供的图像：
                1. 仔细阅读并理解问题
                2. 分析问题的关键组成部分
                3. 提供清晰的、逐步的解决方案
                4. 如果相关，解释涉及的概念或理论
                5. 如果有多种解决方法，先解释最高效的方法"""
        else:
            # QVQ模型使用原先的提示词
            return """你是一位专业的问题分析与解答助手。当看到一个问题图片时，请：
                1. 仔细阅读并理解问题
                2. 分析问题的关键组成部分
                3. 提供清晰的、逐步的解决方案
                4. 如果相关，解释涉及的概念或理论
                5. 如果有多种解决方法，先解释最高效的方法"""

    def get_model_identifier(self) -> str:
        """根据模型名称返回对应的模型标识符"""
        # 直接映射模型ID到DashScope API使用的标识符
        model_mapping = {
            "QVQ-Max-2025-03-25": "qvq-max",
            "qwen-vl-max-latest": "qwen-vl-max",  # 修正为正确的API标识符
        }
        
        # 从模型映射表中获取模型标识符，如果不存在则使用默认值
        model_id = model_mapping.get(self.model_name)
        if model_id:
            return model_id
            
        # 如果没有精确匹配，检查是否包含特定前缀
        if self.model_name and "qwen-vl" in self.model_name:
            if "max" in self.model_name:
                return "qwen-vl-max"
            elif "plus" in self.model_name:
                return "qwen-vl-plus"
            elif "lite" in self.model_name:
                return "qwen-vl-lite"
            return "qwen-vl-max"  # 默认使用最强版本
            
        # 最后的默认值
        return "qvq-max"

    def analyze_text(self, text: str, proxies: dict = None) -> Generator[dict, None, None]:
        """Stream QVQ-Max's response for text analysis"""
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

                # Initialize OpenAI compatible client for DashScope
                client = OpenAI(
                    api_key=self.api_key,
                    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1"
                )

                # Prepare messages
                messages = [
                    {
                        "role": "system",
                        "content": [{"type": "text", "text": self.system_prompt}]
                    },
                    {
                        "role": "user",
                        "content": [{"type": "text", "text": text}]
                    }
                ]

                # 创建聊天完成请求
                response = client.chat.completions.create(
                    model=self.get_model_identifier(),
                    messages=messages,
                    temperature=self.temperature,
                    stream=True,
                    max_tokens=self._get_max_tokens()
                )

                # 记录思考过程和回答
                reasoning_content = ""
                answer_content = ""
                is_answering = False
                
                # 检查是否为通义千问VL模型（不支持reasoning_content）
                is_qwen_vl = "qwen-vl" in self.get_model_identifier()
                
                for chunk in response:
                    if not chunk.choices:
                        continue
                        
                    delta = chunk.choices[0].delta
                    
                    # 处理思考过程（仅适用于QVQ模型）
                    if not is_qwen_vl and hasattr(delta, 'reasoning_content') and delta.reasoning_content is not None:
                        reasoning_content += delta.reasoning_content
                        # 思考过程作为一个独立的内容发送
                        yield {
                            "status": "reasoning",
                            "content": reasoning_content,
                            "is_reasoning": True
                        }
                    elif delta.content != "":
                        # 判断是否开始回答（从思考过程切换到回答）
                        if not is_answering and not is_qwen_vl:
                            is_answering = True
                            # 发送完整的思考过程
                            if reasoning_content:
                                yield {
                                    "status": "reasoning_complete",
                                    "content": reasoning_content,
                                    "is_reasoning": True
                                }
                        
                        # 累积回答内容
                        answer_content += delta.content
                        
                        # 发送回答内容
                        yield {
                            "status": "streaming",
                            "content": answer_content
                        }

                # 确保发送最终完整内容
                if answer_content:
                    yield {
                        "status": "completed",
                        "content": answer_content
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
        """Stream model's response for image analysis"""
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

                # Initialize OpenAI compatible client for DashScope
                client = OpenAI(
                    api_key=self.api_key,
                    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1"
                )

                # 检查系统提示词是否已包含语言设置指令
                system_prompt = self.system_prompt
                language = self.language or '中文'
                if not any(phrase in system_prompt for phrase in ['Please respond in', '请用', '使用', '回答']):
                    system_prompt = f"{system_prompt}\n\n请务必使用{language}回答，无论问题是什么语言。即使在分析图像时也请使用{language}回答。"

                # Prepare messages with image
                messages = [
                    {
                        "role": "system",
                        "content": [{"type": "text", "text": system_prompt}]
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
                                "text": "请分析这个图片并提供详细的解答。"
                            }
                        ]
                    }
                ]

                # 创建聊天完成请求
                response = client.chat.completions.create(
                    model=self.get_model_identifier(),
                    messages=messages,
                    temperature=self.temperature,
                    stream=True,
                    max_tokens=self._get_max_tokens()
                )

                # 记录思考过程和回答
                reasoning_content = ""
                answer_content = ""
                is_answering = False
                
                # 检查是否为通义千问VL模型（不支持reasoning_content）
                is_qwen_vl = "qwen-vl" in self.get_model_identifier()
                
                for chunk in response:
                    if not chunk.choices:
                        continue
                        
                    delta = chunk.choices[0].delta
                    
                    # 处理思考过程（仅适用于QVQ模型）
                    if not is_qwen_vl and hasattr(delta, 'reasoning_content') and delta.reasoning_content is not None:
                        reasoning_content += delta.reasoning_content
                        # 思考过程作为一个独立的内容发送
                        yield {
                            "status": "reasoning",
                            "content": reasoning_content,
                            "is_reasoning": True
                        }
                    elif delta.content != "":
                        # 判断是否开始回答（从思考过程切换到回答）
                        if not is_answering and not is_qwen_vl:
                            is_answering = True
                            # 发送完整的思考过程
                            if reasoning_content:
                                yield {
                                    "status": "reasoning_complete",
                                    "content": reasoning_content,
                                    "is_reasoning": True
                                }
                        
                        # 累积回答内容
                        answer_content += delta.content
                        
                        # 发送回答内容
                        yield {
                            "status": "streaming",
                            "content": answer_content
                        }

                # 确保发送最终完整内容
                if answer_content:
                    yield {
                        "status": "completed",
                        "content": answer_content
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

    def _get_max_tokens(self) -> int:
        """根据模型类型返回合适的max_tokens值"""
        # 检查是否为通义千问VL模型
        if "qwen-vl" in self.get_model_identifier():
            return 2000  # 通义千问VL模型最大支持2048，留一些余量
        # QVQ模型或其他模型
        return self.max_tokens if hasattr(self, 'max_tokens') and self.max_tokens else 4000 