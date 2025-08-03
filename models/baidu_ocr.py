import base64
import json
import time
import urllib.request
import urllib.parse
from typing import Generator, Dict, Any
from .base import BaseModel

class BaiduOCRModel(BaseModel):
    """
    百度OCR模型，用于图像文字识别
    """
    
    def __init__(self, api_key: str, secret_key: str = None, temperature: float = 0.7, system_prompt: str = None):
        """
        初始化百度OCR模型
        
        Args:
            api_key: 百度API Key
            secret_key: 百度Secret Key（可以在api_key中用冒号分隔传入）
            temperature: 不用于OCR但保持BaseModel兼容性
            system_prompt: 不用于OCR但保持BaseModel兼容性
            
        Raises:
            ValueError: 如果API密钥格式无效
        """
        super().__init__(api_key, temperature, system_prompt)
        
        # 支持两种格式：单独传递或在api_key中用冒号分隔
        if secret_key:
            self.api_key = api_key
            self.secret_key = secret_key
        else:
            try:
                self.api_key, self.secret_key = api_key.split(':')
            except ValueError:
                raise ValueError("百度OCR API密钥必须是 'API_KEY:SECRET_KEY' 格式或单独传递secret_key参数")
        
        # 百度API URLs
        self.token_url = "https://aip.baidubce.com/oauth/2.0/token"
        self.ocr_url = "https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic"
        
        # 缓存access_token
        self._access_token = None
        self._token_expires = 0
    
    def get_access_token(self) -> str:
        """获取百度API的access_token"""
        # 检查是否需要刷新token（提前5分钟刷新）
        if self._access_token and time.time() < self._token_expires - 300:
            return self._access_token
        
        # 请求新的access_token
        params = {
            'grant_type': 'client_credentials',
            'client_id': self.api_key,
            'client_secret': self.secret_key
        }
        
        data = urllib.parse.urlencode(params).encode('utf-8')
        request = urllib.request.Request(self.token_url, data=data)
        request.add_header('Content-Type', 'application/x-www-form-urlencoded')
        
        try:
            with urllib.request.urlopen(request) as response:
                result = json.loads(response.read().decode('utf-8'))
                
            if 'access_token' in result:
                self._access_token = result['access_token']
                # 设置过期时间（默认30天，但我们提前刷新）
                self._token_expires = time.time() + result.get('expires_in', 2592000)
                return self._access_token
            else:
                raise Exception(f"获取access_token失败: {result.get('error_description', '未知错误')}")
                
        except Exception as e:
            raise Exception(f"请求access_token失败: {str(e)}")
    
    def ocr_image(self, image_data: str) -> str:
        """
        对图像进行OCR识别
        
        Args:
            image_data: Base64编码的图像数据
            
        Returns:
            str: 识别出的文字内容
        """
        access_token = self.get_access_token()
        
        # 准备请求数据
        params = {
            'image': image_data,
            'language_type': 'auto_detect',  # 自动检测语言
            'detect_direction': 'true',      # 检测图像朝向
            'probability': 'false'           # 不返回置信度（减少响应大小）
        }
        
        data = urllib.parse.urlencode(params).encode('utf-8')
        url = f"{self.ocr_url}?access_token={access_token}"
        
        request = urllib.request.Request(url, data=data)
        request.add_header('Content-Type', 'application/x-www-form-urlencoded')
        
        try:
            with urllib.request.urlopen(request) as response:
                result = json.loads(response.read().decode('utf-8'))
                
            if 'error_code' in result:
                raise Exception(f"百度OCR API错误: {result.get('error_msg', '未知错误')}")
            
            # 提取识别的文字
            words_result = result.get('words_result', [])
            text_lines = [item['words'] for item in words_result]
            
            return '\n'.join(text_lines)
            
        except Exception as e:
            raise Exception(f"OCR识别失败: {str(e)}")
    
    def extract_full_text(self, image_data: str) -> str:
        """
        提取图像中的完整文本（与Mathpix兼容的接口）
        
        Args:
            image_data: Base64编码的图像数据
            
        Returns:
            str: 提取的文本内容
        """
        return self.ocr_image(image_data)
    
    def analyze_image(self, image_data: str, proxies: dict = None) -> Generator[Dict[str, Any], None, None]:
        """
        分析图像并返回OCR结果（流式输出以保持接口一致性）
        
        Args:
            image_data: Base64编码的图像数据
            proxies: 代理配置（未使用）
            
        Yields:
            dict: 包含OCR结果的响应
        """
        try:
            text = self.ocr_image(image_data)
            yield {
                'status': 'completed',
                'content': text,
                'model': 'baidu-ocr'
            }
        except Exception as e:
            yield {
                'status': 'error',
                'content': f'OCR识别失败: {str(e)}',
                'model': 'baidu-ocr'
            }
    
    def analyze_text(self, text: str, proxies: dict = None) -> Generator[Dict[str, Any], None, None]:
        """
        分析文本（OCR模型不支持文本分析）
        
        Args:
            text: 输入文本
            proxies: 代理配置（未使用）
            
        Yields:
            dict: 错误响应
        """
        yield {
            'status': 'error',
            'content': 'OCR模型不支持文本分析功能',
            'model': 'baidu-ocr'
        }
    
    def get_model_identifier(self) -> str:
        """返回模型标识符"""
        return "baidu-ocr"
