from abc import ABC, abstractmethod
from typing import Generator, Any

class BaseModel(ABC):
    def __init__(self, api_key: str, temperature: float = 0.7, system_prompt: str = None, language: str = None):
        self.api_key = api_key
        self.temperature = temperature
        self.language = language
        self.system_prompt = system_prompt or self.get_default_system_prompt()

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

    @abstractmethod
    def get_default_system_prompt(self) -> str:
        """Return the default system prompt for this model"""
        pass

    @abstractmethod
    def get_model_identifier(self) -> str:
        """Return the model identifier used in API calls"""
        pass

    def validate_api_key(self) -> bool:
        """Validate if the API key is in the correct format"""
        return bool(self.api_key and self.api_key.strip())
