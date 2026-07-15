import json
import os
import base64
from typing import Generator, Dict, Any, Optional, List
import google.generativeai as genai
from .base import BaseModel

class GoogleModel(BaseModel):
    """
    Google Gemini API模型实现类
    支持Gemini 2.5 Pro等模型，可处理文本和图像输入
    """
    
    def __init__(self, api_key: str, temperature: float = 0.7, system_prompt: str = None, language: str = None, model_name: str = None, api_base_url: str = None, reasoning_tier: str = "deep"):
        """
        初始化Google模型

        Args:
            api_key: Google API密钥
            temperature: 生成温度
            system_prompt: 系统提示词
            language: 首选语言
            model_name: 指定具体模型名称，如不指定则使用默认值
            api_base_url: API基础URL，用于设置自定义API端点
            reasoning_tier: 统一推理档位 fast/deep/max
        """
        super().__init__(api_key, temperature, system_prompt, language, reasoning_tier=reasoning_tier)
        self.model_name = model_name or self.get_model_identifier()
        self.max_tokens = 8192  # 默认最大输出token数
        self.api_base_url = api_base_url
        
        # 配置Google API
        if api_base_url:
            # 配置中转API - 使用环境变量方式
            # 移除末尾的斜杠以避免重复路径问题
            clean_base_url = api_base_url.rstrip('/')
            # 设置环境变量来指定API端点
            os.environ['GOOGLE_AI_API_ENDPOINT'] = clean_base_url
            genai.configure(api_key=api_key)
        else:
            # 使用默认API端点
            # 清除可能存在的自定义端点环境变量
            if 'GOOGLE_AI_API_ENDPOINT' in os.environ:
                del os.environ['GOOGLE_AI_API_ENDPOINT']
            genai.configure(api_key=api_key)
    
    def get_default_system_prompt(self) -> str:
        return """You are an expert at analyzing questions and providing detailed solutions. When presented with an image of a question:
1. First read and understand the question carefully
2. Break down the key components of the question
3. Provide a clear, step-by-step solution
4. If relevant, explain any concepts or theories involved
5. If there are multiple approaches, explain the most efficient one first"""

    def get_model_identifier(self) -> str:
        """返回默认的模型标识符"""
        return "gemini-3.5-flash"  # 当前 Flash 主力作为默认值

    def _apply_reasoning_tier(self, generation_config: dict) -> None:
        """将 fast/deep/max 写入 generation_config（原地修改）。
        Gemini 3 系用字符串 thinking_level；2.5 系用整数 thinkingBudget。"""
        model_id = (self.model_name or "").lower()
        tier = self.reasoning_tier
        if model_id.startswith("gemini-3") or "gemini-3" in model_id:
            level_map = {'fast': 'low', 'deep': 'medium', 'max': 'high'}
            generation_config['thinking_config'] = {'thinking_level': level_map.get(tier, 'medium')}
        else:
            # Gemini 2.5 系：整数 thinking 预算，-1 为动态上限
            budget_map = {'fast': 2048, 'deep': 8192, 'max': -1}
            generation_config['thinking_config'] = {'thinking_budget': budget_map.get(tier, 8192)}
    
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
                # 初始化模型
                model = genai.GenerativeModel(self.model_name)
                
                # 获取最大输出Token设置
                max_tokens = self.max_tokens if hasattr(self, 'max_tokens') else 8192
                
                # 创建配置参数
                generation_config = {
                    'temperature': self.temperature,
                    'max_output_tokens': max_tokens,
                    'top_p': 0.95,
                    'top_k': 64,
                }

                # 按统一推理档位写入 thinking 配置
                self._apply_reasoning_tier(generation_config)

                # 构建提示
                prompt_parts = []
                
                # 添加系统提示词
                if self.system_prompt:
                    prompt_parts.append(self.system_prompt)
                
                # 添加用户查询
                if self.language and self.language != 'auto':
                    prompt_parts.append(f"请使用{self.language}回答以下问题: {text}")
                else:
                    prompt_parts.append(text)
                
                # 初始化响应缓冲区
                response_buffer = ""
                
                # 流式生成响应
                response = model.generate_content(
                    prompt_parts,
                    generation_config=generation_config,
                    stream=True
                )
                
                for chunk in response:
                    if not chunk.text:
                        continue
                    
                    # 累积响应文本
                    response_buffer += chunk.text
                    
                    # 发送响应进度
                    if len(chunk.text) >= 10 or chunk.text.endswith(('.', '!', '?', '。', '！', '？', '\n')):
                        yield {
                            "status": "streaming",
                            "content": response_buffer
                        }
                
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
                "error": f"Gemini API错误: {str(e)}"
            }
    
    def analyze_image(self, image_data: str, proxies: dict = None, history: list = None) -> Generator[dict, None, None]:
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
                # 初始化模型
                model = genai.GenerativeModel(self.model_name)
                
                # 获取最大输出Token设置
                max_tokens = self.max_tokens if hasattr(self, 'max_tokens') else 8192
                
                # 创建配置参数
                generation_config = {
                    'temperature': self.temperature,
                    'max_output_tokens': max_tokens,
                    'top_p': 0.95,
                    'top_k': 64,
                }

                # 按统一推理档位写入 thinking 配置
                self._apply_reasoning_tier(generation_config)

                # 构建提示词
                prompt_parts = []
                
                # 添加系统提示词
                if self.system_prompt:
                    prompt_parts.append(self.system_prompt)
                
                # 添加默认图像分析指令
                if self.language and self.language != 'auto':
                    prompt_parts.append(f"请使用{self.language}分析这张图片并提供详细解答。")
                else:
                    prompt_parts.append("请分析这张图片并提供详细解答。")
                
                # 处理图像数据
                if image_data.startswith('data:image'):
                    # 如果是data URI，提取base64部分
                    image_data = image_data.split(',', 1)[1]
                
                # 使用genai的特定方法处理图像
                image_part = {
                    "mime_type": "image/jpeg",
                    "data": base64.b64decode(image_data)
                }
                prompt_parts.append(image_part)

                # 同题追问：改用多轮 contents（assistant → model），无历史时保持单轮 parts
                turns = self._text_history(history)
                if turns:
                    contents = [{'role': 'user', 'parts': prompt_parts}]
                    for turn in turns:
                        contents.append({
                            'role': 'user' if turn['role'] == 'user' else 'model',
                            'parts': [turn['content']]
                        })
                else:
                    contents = prompt_parts

                # 初始化响应缓冲区
                response_buffer = ""

                # 流式生成响应
                response = model.generate_content(
                    contents,
                    generation_config=generation_config,
                    stream=True
                )
                
                for chunk in response:
                    if not chunk.text:
                        continue
                    
                    # 累积响应文本
                    response_buffer += chunk.text
                    
                    # 发送响应进度
                    if len(chunk.text) >= 10 or chunk.text.endswith(('.', '!', '?', '。', '！', '？', '\n')):
                        yield {
                            "status": "streaming",
                            "content": response_buffer
                        }
                
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
                "error": f"Gemini图像分析错误: {str(e)}"
            } 