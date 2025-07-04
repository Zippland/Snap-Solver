import os
import base64
from contextlib import contextmanager
from typing import Generator, Dict, Optional
import google.generativeai as genai
from .base import BaseModel

class GoogleModel(BaseModel):
    def __init__(self, api_key: str, model_name: str, **kwargs):
        self.model_name = model_name or self.get_model_identifier()
        super().__init__(api_key=api_key, model_name=model_name, **kwargs)
        self.max_tokens = 8192
        
        genai.configure(
            api_key=api_key,
            transport="rest",
            client_options={"api_endpoint": self.api_base_url} if self.api_base_url else None
        )
    
    def get_default_system_prompt(self) -> str:
        return "You are an expert at analyzing questions and providing detailed solutions."

    def get_model_identifier(self) -> str:
        return "gemini-1.5-pro-latest"

    @contextmanager
    def _proxy_context(self, proxies: Optional[dict]):
        original_proxies = {
            'http': os.environ.get('HTTP_PROXY'),
            'https': os.environ.get('HTTPS_PROXY')
        }
        if proxies:
            os.environ['HTTP_PROXY'] = proxies.get('http', '')
            os.environ['HTTPS_PROXY'] = proxies.get('https', '')
        try:
            yield
        finally:
            for key, value in original_proxies.items():
                env_key = f'{key.upper()}_PROXY'
                if value is None:
                    os.environ.pop(env_key, None)
                else:
                    os.environ[env_key] = value

    def _stream_analysis(self, prompt_parts: list, proxies: Optional[dict]) -> Generator[Dict, None, None]:
        yield {"status": "started"}
        try:
            with self._proxy_context(proxies):
                model = genai.GenerativeModel(self.model_name)
                generation_config = {
                    'temperature': self.temperature,
                    'max_output_tokens': self.max_tokens,
                }
                
                response = model.generate_content(
                    prompt_parts, generation_config=generation_config, stream=True
                )
                
                response_buffer = ""
                for chunk in response:
                    if chunk.text:
                        response_buffer += chunk.text
                        yield {"status": "streaming", "content": response_buffer}
                
                yield {"status": "completed", "content": response_buffer}
        except Exception as e:
            yield {"status": "error", "error": f"Gemini API error: {str(e)}"}
    
    def analyze_text(self, text: str, proxies: dict = None) -> Generator[dict, None, None]:
        prompt_parts = [self.system_prompt, text]
        yield from self._stream_analysis(prompt_parts, proxies)

    def analyze_image(self, image_data: str, proxies: dict = None) -> Generator[dict, None, None]:
        image_part = {"mime_type": "image/jpeg", "data": base64.b64decode(image_data.split(',', 1)[-1])}
        prompt_parts = [self.system_prompt, "Please analyze this image and provide a detailed solution.", image_part]
        yield from self._stream_analysis(prompt_parts, proxies)