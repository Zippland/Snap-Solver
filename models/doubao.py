import json
import os
import base64
from typing import Generator, Dict, Any, Optional
import requests
from .base import BaseModel

class DoubaoModel(BaseModel):
    """
    豆包API模型实现类
    支持字节跳动的豆包AI模型，可处理文本和图像输入
    """
    
    def __init__(self, api_key: str, temperature: float = 0.7, system_prompt: str = None, language: str = None, model_name: str = None, api_base_url: str = None):
        """
        初始化豆包模型
        
        Args:
            api_key: 豆包API密钥
            temperature: 生成温度
            system_prompt: 系统提示词
            language: 首选语言
            model_name: 指定具体模型名称，如不指定则使用默认值
            api_base_url: API基础URL，用于设置自定义API端点
        """
        super().__init__(api_key, temperature, system_prompt, language)
        self.model_name = model_name or self.get_model_identifier()
        self.base_url = api_base_url or "https://ark.cn-beijing.volces.com/api/v3"
        self.max_tokens = 4096  # 默认最大输出token数
        self.reasoning_config = None  # 推理配置，类似于AnthropicModel
    
    def get_default_system_prompt(self) -> str:
        return """你是一个专业的问题分析专家。当看到问题图片时：
1. 仔细阅读并理解问题
2. 分解问题的关键组成部分
3. 提供清晰的分步解决方案
4. 如果相关，解释涉及的概念或理论
5. 如果有多种方法，优先解释最有效的方法"""

    def get_model_identifier(self) -> str:
        """返回默认的模型标识符"""
        return "doubao-seed-1-6-250615"  # Doubao-Seed-1.6
    
    def get_actual_model_name(self) -> str:
        """根据配置的模型名称返回实际的API调用标识符"""
        # 豆包API的实际模型名称映射
        model_mapping = {
            "doubao-seed-1-6-250615": "doubao-seed-1-6-250615"
        }
        
        return model_mapping.get(self.model_name, "doubao-seed-1-6-250615")
    
    def analyze_text(self, text: str, proxies: dict = None) -> Generator[dict, None, None]:
        """流式生成文本响应"""
        try:
            yield {"status": "started"}
            
            # 设置环境变量代理（如果提供）
            original_proxies = None
            if proxies:
                original_proxies = {
                    'http_proxy': os.environ.get('http_proxy'),
                    'https_proxy': os.environ.get('https_proxy')
                }
                if 'http' in proxies:
                    os.environ['http_proxy'] = proxies['http']
                if 'https' in proxies:
                    os.environ['https_proxy'] = proxies['https']
            
            try:
                # 构建请求头
                headers = {
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json"
                }
                
                # 构建消息 - 添加系统提示词
                messages = []
                
                # 添加系统提示词
                if self.system_prompt:
                    messages.append({
                        "role": "system",
                        "content": self.system_prompt
                    })
                
                # 添加用户查询
                user_content = text
                if self.language and self.language != 'auto':
                    user_content = f"请使用{self.language}回答以下问题: {text}"
                
                messages.append({
                    "role": "user",
                    "content": user_content
                })

                # 处理推理配置
                thinking = {
                    "type": "auto"  # 默认值
                }
                
                if hasattr(self, 'reasoning_config') and self.reasoning_config:
                    # 从reasoning_config中获取thinking_mode
                    thinking_mode = self.reasoning_config.get('thinking_mode', "auto")
                    thinking = {
                        "type": thinking_mode
                    }

                # 构建请求数据
                data = {
                    "model": self.get_actual_model_name(),
                    "messages": messages,
                    "thinking": thinking,
                    "temperature": self.temperature,
                    "max_tokens": self.max_tokens,
                    "stream": True
                }
                
                # 发送流式请求
                response = requests.post(
                    f"{self.base_url}/chat/completions",
                    headers=headers,
                    json=data,
                    stream=True,
                    proxies=proxies if proxies else None,
                    timeout=60
                )
                
                if response.status_code != 200:
                    error_text = response.text
                    raise Exception(f"HTTP {response.status_code}: {error_text}")
                
                response.raise_for_status()
                
                # 初始化响应缓冲区
                response_buffer = ""
                
                # 处理流式响应
                for line in response.iter_lines():
                    if not line:
                        continue
                    
                    line = line.decode('utf-8')
                    if not line.startswith('data: '):
                        continue
                    
                    line = line[6:]  # 移除 'data: ' 前缀
                    
                    if line == '[DONE]':
                        break
                    
                    try:
                        chunk_data = json.loads(line)
                        choices = chunk_data.get('choices', [])
                        
                        if choices and len(choices) > 0:
                            delta = choices[0].get('delta', {})
                            content = delta.get('content', '')
                            
                            if content:
                                response_buffer += content
                                
                                # 发送响应进度
                                yield {
                                    "status": "streaming",
                                    "content": response_buffer
                                }
                    
                    except json.JSONDecodeError:
                        continue
                
                # 确保发送完整的最终内容
                yield {
                    "status": "completed",
                    "content": response_buffer
                }
            
            finally:
                # 恢复原始代理设置
                if original_proxies:
                    for key, value in original_proxies.items():
                        if value is None:
                            if key in os.environ:
                                del os.environ[key]
                        else:
                            os.environ[key] = value
                
        except Exception as e:
            yield {
                "status": "error",
                "error": f"豆包API错误: {str(e)}"
            }
    
    def analyze_image(self, image_data: str, proxies: dict = None) -> Generator[dict, None, None]:
        """分析图像并流式生成响应"""
        try:
            yield {"status": "started"}
            
            # 设置环境变量代理（如果提供）
            original_proxies = None
            if proxies:
                original_proxies = {
                    'http_proxy': os.environ.get('http_proxy'),
                    'https_proxy': os.environ.get('https_proxy')
                }
                if 'http' in proxies:
                    os.environ['http_proxy'] = proxies['http']
                if 'https' in proxies:
                    os.environ['https_proxy'] = proxies['https']
            
            try:
                # 构建请求头
                headers = {
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json"
                }
                
                # 处理图像数据
                if image_data.startswith('data:image'):
                    # 如果是data URI，提取base64部分
                    image_data = image_data.split(',', 1)[1]
                
                # 构建用户消息 - 使用豆包API官方示例格式
                # 首先检查图像数据的格式，确保是有效的图像
                image_format = "jpeg"  # 默认使用jpeg
                if image_data.startswith('/9j/'):  # JPEG magic number in base64
                    image_format = "jpeg"
                elif image_data.startswith('iVBORw0KGgo'):  # PNG magic number in base64
                    image_format = "png"
                
                # 构建消息
                messages = []
                
                # 添加系统提示词
                if self.system_prompt:
                    messages.append({
                        "role": "system",
                        "content": self.system_prompt
                    })
                
                user_content = [
                    {
                        "type": "text",
                        "text": f"请使用{self.language}分析这张图片并提供详细解答。" if self.language and self.language != 'auto' else "请分析这张图片并提供详细解答?"
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/{image_format};base64,{image_data}"
                        }
                    }
                ]
                
                messages.append({
                    "role": "user",
                    "content": user_content
                })

                # 处理推理配置
                thinking = {
                    "type": "auto"  # 默认值
                }
                
                if hasattr(self, 'reasoning_config') and self.reasoning_config:
                    # 从reasoning_config中获取thinking_mode
                    thinking_mode = self.reasoning_config.get('thinking_mode', "auto")
                    thinking = {
                        "type": thinking_mode
                    }
                
                # 构建请求数据
                data = {
                    "model": self.get_actual_model_name(),
                    "messages": messages,
                    "thinking": thinking,
                    "temperature": self.temperature,
                    "max_tokens": self.max_tokens,
                    "stream": True
                }
                
                # 发送流式请求
                response = requests.post(
                    f"{self.base_url}/chat/completions",
                    headers=headers,
                    json=data,
                    stream=True,
                    proxies=proxies if proxies else None,
                    timeout=60
                )
                
                if response.status_code != 200:
                    error_text = response.text
                    raise Exception(f"HTTP {response.status_code}: {error_text}")
                
                response.raise_for_status()
                
                # 初始化响应缓冲区
                response_buffer = ""
                
                # 处理流式响应
                for line in response.iter_lines():
                    if not line:
                        continue
                    
                    line = line.decode('utf-8')
                    if not line.startswith('data: '):
                        continue
                    
                    line = line[6:]  # 移除 'data: ' 前缀
                    
                    if line == '[DONE]':
                        break
                    
                    try:
                        chunk_data = json.loads(line)
                        choices = chunk_data.get('choices', [])
                        
                        if choices and len(choices) > 0:
                            delta = choices[0].get('delta', {})
                            content = delta.get('content', '')
                            
                            if content:
                                response_buffer += content
                                
                                # 发送响应进度
                                yield {
                                    "status": "streaming",
                                    "content": response_buffer
                                }
                    
                    except json.JSONDecodeError:
                        continue
                
                # 确保发送完整的最终内容
                yield {
                    "status": "completed",
                    "content": response_buffer
                }
            
            finally:
                # 恢复原始代理设置
                if original_proxies:
                    for key, value in original_proxies.items():
                        if value is None:
                            if key in os.environ:
                                del os.environ[key]
                        else:
                            os.environ[key] = value
                
        except Exception as e:
            yield {
                "status": "error",
                "error": f"豆包图像分析错误: {str(e)}"
            }
