from abc import ABC, abstractmethod
from typing import Generator, Any

class BaseModel(ABC):
    def __init__(self, api_key: str, temperature: float = 0.7, system_prompt: str = None, language: str = None, api_base_url: str = None):
        self.api_key = api_key
        self.temperature = temperature
        self.language = language
        self.system_prompt = system_prompt or self.get_default_system_prompt()
        self.api_base_url = api_base_url

    @abstractmethod
    def analyze_image(self, image_data: str, proxies: dict = None) -> Generator[dict, None, None]:
        """
        Analyze the given image and yield response chunks.
        
        Args:
            image_data: Base64 encoded image data
            proxies: Optional proxy configuration
            
        Yields:
            dict: Response chunks with status and content
        """
        pass

    @abstractmethod
    def analyze_text(self, text: str, proxies: dict = None) -> Generator[dict, None, None]:
        """
        Analyze the given text and yield response chunks.
        
        Args:
            text: Text to analyze
            proxies: Optional proxy configuration
            
        Yields:
            dict: Response chunks with status and content
        """
        pass

    def get_default_system_prompt(self) -> str:
        """返回默认的系统提示词，子类可覆盖但不再是必须实现的方法"""
        return "您是一位专业的问题解决专家。请逐步分析问题，找出问题所在，并提供详细的解决方案。始终使用用户偏好的语言回答。"

    @abstractmethod
    def get_model_identifier(self) -> str:
        """Return the model identifier used in API calls"""
        pass
