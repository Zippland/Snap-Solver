import json
import requests
import os
from typing import Generator
from openai import OpenAI
from .base import BaseModel

class DeepSeekModel(BaseModel):
    def __init__(self, api_key: str, temperature: float = 0.7, system_prompt: str = None, language: str = None, model_name: str = "deepseek-reasoner"):
        super().__init__(api_key, temperature, system_prompt, language)
        self.model_name = model_name

    def get_default_system_prompt(self) -> str:
        return """You are an expert at analyzing questions and providing detailed solutions. When presented with an image of a question:
1. First read and understand the question carefully
2. Break down the key components of the question
3. Provide a clear, step-by-step solution
4. If relevant, explain any concepts or theories involved
5. If there are multiple approaches, explain the most efficient one first"""

    def get_model_identifier(self) -> str:
        """根据模型名称返回正确的API标识符"""
        # 通过模型名称来确定实际的API调用标识符
        if self.model_name == "deepseek-chat":
            return "deepseek-chat"
        # deepseek-reasoner是默认的推理模型名称
        return "deepseek-reasoner"

    def analyze_text(self, text: str, proxies: dict = None) -> Generator[dict, None, None]:
        """Stream DeepSeek's response for text analysis"""
        try:
            # Initial status
            yield {"status": "started", "content": ""}

            # 保存原始环境变量
            original_env = {
                'http_proxy': os.environ.get('http_proxy'),
                'https_proxy': os.environ.get('https_proxy')
            }

            try:
                # 如果提供了代理设置，通过环境变量设置
                if proxies:
                    if 'http' in proxies:
                        os.environ['http_proxy'] = proxies['http']
                    if 'https' in proxies:
                        os.environ['https_proxy'] = proxies['https']

                # 初始化DeepSeek客户端，不再使用session对象
                client = OpenAI(
                    api_key=self.api_key,
                    base_url="https://api.deepseek.com"
                )

                # 添加系统语言指令
                system_prompt = self.system_prompt
                language = self.language or '中文'
                if not any(phrase in system_prompt for phrase in ['Please respond in', '请用', '使用', '回答']):
                    system_prompt = f"{system_prompt}\n\n请务必使用{language}回答。"

                # 构建请求参数
                params = {
                    "model": self.get_model_identifier(),
                    "messages": [
                        {
                            'role': 'system',
                            'content': system_prompt
                        }, 
                        {
                            'role': 'user',
                            'content': text
                        }
                    ],
                    "stream": True
                }
                
                # 只有非推理模型才设置temperature参数
                if not self.model_name.endswith('reasoner') and self.temperature is not None:
                    params["temperature"] = self.temperature
                    
                print(f"调用DeepSeek API: {self.get_model_identifier()}, 是否设置温度: {not self.model_name.endswith('reasoner')}")

                response = client.chat.completions.create(**params)
                
                # 使用两个缓冲区，分别用于常规内容和思考内容
                response_buffer = ""
                thinking_buffer = ""
                
                for chunk in response:
                    # 打印chunk以调试
                    try:
                        print(f"DeepSeek API返回chunk: {chunk}")
                    except:
                        print("无法打印chunk")
                        
                    try:
                        # 同时处理两种不同的内容，确保正确区分思考内容和最终内容
                        delta = chunk.choices[0].delta
                        
                        # 处理推理模型的思考内容
                        if hasattr(delta, 'reasoning_content') and delta.reasoning_content:
                            content = delta.reasoning_content
                            thinking_buffer += content
                            
                            # 发送思考内容更新
                            if len(content) >= 20 or content.endswith(('.', '!', '?', '。', '！', '？', '\n')):
                                yield {
                                    "status": "thinking",
                                    "content": thinking_buffer
                                }
                        
                        # 处理最终结果内容 - 即使在推理模型中也会有content字段
                        if hasattr(delta, 'content') and delta.content:
                            content = delta.content
                            response_buffer += content
                            print(f"累积响应内容: '{content}', 当前buffer: '{response_buffer}'")
                            
                            # 发送结果内容更新
                            if len(content) >= 10 or content.endswith(('.', '!', '?', '。', '！', '？', '\n')):
                                yield {
                                    "status": "streaming",
                                    "content": response_buffer
                                }
                        
                        # 处理消息结束
                        if hasattr(chunk.choices[0], 'finish_reason') and chunk.choices[0].finish_reason:
                            print(f"生成结束，原因: {chunk.choices[0].finish_reason}")
                            # 注意：不要在这里把思考内容作为正文，因为这可能导致重复内容
                    except Exception as e:
                        print(f"解析响应chunk时出错: {str(e)}")
                        continue

                # 确保发送最终的缓冲内容
                if thinking_buffer:
                    yield {
                        "status": "thinking_complete",
                        "content": thinking_buffer
                    }
                
                # 发送最终响应内容
                if response_buffer:
                    yield {
                        "status": "completed",
                        "content": response_buffer
                    }
                
                # 如果没有正常的响应内容，但有思考内容，则将思考内容作为最终结果
                elif thinking_buffer:
                    yield {
                        "status": "completed",
                        "content": thinking_buffer
                    }
                else:
                    # 如果两者都没有，返回一个空结果
                    yield {
                        "status": "completed",
                        "content": "没有获取到内容"
                    }

            except Exception as e:
                error_msg = str(e)
                print(f"DeepSeek API调用出错: {error_msg}")
                
                # 提供具体的错误信息
                if "invalid_api_key" in error_msg.lower():
                    error_msg = "DeepSeek API密钥无效，请检查您的API密钥"
                elif "rate_limit" in error_msg.lower():
                    error_msg = "DeepSeek API请求频率超限，请稍后再试"
                elif "quota_exceeded" in error_msg.lower():
                    error_msg = "DeepSeek API配额已用完，请续费或等待下个计费周期"
                
                yield {
                    "status": "error",
                    "error": f"DeepSeek API错误: {error_msg}"
                }
            finally:
                # 恢复原始环境变量
                for key, value in original_env.items():
                    if value is None:
                        if key in os.environ:
                            del os.environ[key]
                    else:
                        os.environ[key] = value

        except Exception as e:
            error_msg = str(e)
            print(f"调用DeepSeek模型时发生错误: {error_msg}")
            
            if "invalid_api_key" in error_msg.lower():
                error_msg = "API密钥无效，请检查设置"
            elif "rate_limit" in error_msg.lower():
                error_msg = "API请求频率超限，请稍后再试"
            
            yield {
                "status": "error",
                "error": f"DeepSeek API错误: {error_msg}"
            }

    def analyze_image(self, image_data: str, proxies: dict = None) -> Generator[dict, None, None]:
        """Stream DeepSeek's response for image analysis"""
        try:
            # 检查我们是否有支持图像的模型
            if self.model_name == "deepseek-chat" or self.model_name == "deepseek-reasoner":
                yield {
                    "status": "error",
                    "error": "当前DeepSeek模型不支持图像分析，请使用Anthropic或OpenAI的多模态模型"
                }
                return
                
            # Initial status
            yield {"status": "started", "content": ""}

            # 保存原始环境变量
            original_env = {
                'http_proxy': os.environ.get('http_proxy'),
                'https_proxy': os.environ.get('https_proxy')
            }

            try:
                # 如果提供了代理设置，通过环境变量设置
                if proxies:
                    if 'http' in proxies:
                        os.environ['http_proxy'] = proxies['http']
                    if 'https' in proxies:
                        os.environ['https_proxy'] = proxies['https']

                # 初始化DeepSeek客户端，不再使用session对象
                client = OpenAI(
                    api_key=self.api_key,
                    base_url="https://api.deepseek.com"
                )

                # 检查系统提示词是否已包含语言设置指令
                system_prompt = self.system_prompt
                language = self.language or '中文'
                if not any(phrase in system_prompt for phrase in ['Please respond in', '请用', '使用', '回答']):
                    system_prompt = f"{system_prompt}\n\n请务必使用{language}回答，无论问题是什么语言。即使在分析图像时也请使用{language}回答。"

                # 构建请求参数
                params = {
                    "model": self.get_model_identifier(),
                    "messages": [
                        {
                            'role': 'system',
                            'content': system_prompt
                        }, 
                        {
                            'role': 'user',
                            'content': f"Here's an image of a question to analyze: data:image/png;base64,{image_data}"
                        }
                    ],
                    "stream": True
                }
                
                # 只有非推理模型才设置temperature参数
                if not self.model_name.endswith('reasoner') and self.temperature is not None:
                    params["temperature"] = self.temperature

                response = client.chat.completions.create(**params)
                
                # 使用两个缓冲区，分别用于常规内容和思考内容
                response_buffer = ""
                thinking_buffer = ""
                
                for chunk in response:
                    # 打印chunk以调试
                    try:
                        print(f"DeepSeek图像API返回chunk: {chunk}")
                    except:
                        print("无法打印chunk")
                
                    try:
                        # 同时处理两种不同的内容，确保正确区分思考内容和最终内容
                        delta = chunk.choices[0].delta
                        
                        # 处理推理模型的思考内容
                        if hasattr(delta, 'reasoning_content') and delta.reasoning_content:
                            content = delta.reasoning_content
                            thinking_buffer += content
                            
                            # 发送思考内容更新
                            if len(content) >= 20 or content.endswith(('.', '!', '?', '。', '！', '？', '\n')):
                                yield {
                                    "status": "thinking",
                                    "content": thinking_buffer
                                }
                        
                        # 处理最终结果内容 - 即使在推理模型中也会有content字段
                        if hasattr(delta, 'content') and delta.content:
                            content = delta.content
                            response_buffer += content
                            print(f"累积图像响应内容: '{content}', 当前buffer: '{response_buffer}'")
                            
                            # 发送结果内容更新
                            if len(content) >= 10 or content.endswith(('.', '!', '?', '。', '！', '？', '\n')):
                                yield {
                                    "status": "streaming",
                                    "content": response_buffer
                                }
                        
                        # 处理消息结束
                        if hasattr(chunk.choices[0], 'finish_reason') and chunk.choices[0].finish_reason:
                            print(f"图像生成结束，原因: {chunk.choices[0].finish_reason}")
                    except Exception as e:
                        print(f"解析图像响应chunk时出错: {str(e)}")
                        continue

                # 确保发送最终的缓冲内容
                if thinking_buffer:
                    yield {
                        "status": "thinking_complete",
                        "content": thinking_buffer
                    }
                
                # 发送最终响应内容
                if response_buffer:
                    yield {
                        "status": "completed",
                        "content": response_buffer
                    }
                
            except Exception as e:
                error_msg = str(e)
                print(f"DeepSeek API调用出错: {error_msg}")
                
                # 提供具体的错误信息
                if "invalid_api_key" in error_msg.lower():
                    error_msg = "DeepSeek API密钥无效，请检查您的API密钥"
                elif "rate_limit" in error_msg.lower():
                    error_msg = "DeepSeek API请求频率超限，请稍后再试"
                
                yield {
                    "status": "error",
                    "error": f"DeepSeek API错误: {error_msg}"
                }
            finally:
                # 恢复原始环境变量
                for key, value in original_env.items():
                    if value is None:
                        if key in os.environ:
                            del os.environ[key]
                    else:
                        os.environ[key] = value

        except Exception as e:
            error_msg = str(e)
            if "invalid_api_key" in error_msg.lower():
                error_msg = "API密钥无效，请检查设置"
            elif "rate_limit" in error_msg.lower():
                error_msg = "API请求频率超限，请稍后再试"
            
            yield {
                "status": "error",
                "error": f"DeepSeek API错误: {error_msg}"
            }
