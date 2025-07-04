from typing import Generator, Dict, Optional
from openai import OpenAI
import httpx
from .base import BaseModel

class DeepSeekModel(BaseModel):
    def __init__(self, api_key: str, model_name: str, **kwargs):
        self.model_name = model_name
        super().__init__(api_key=api_key, model_name=model_name, **kwargs)

    def get_default_system_prompt(self) -> str:
        return "You are an expert at analyzing questions and providing detailed solutions."

    def get_model_identifier(self) -> str:
        if "reasoner" in self.model_name.lower():
            return "deepseek-reasoner"
        return "deepseek-chat"

    def _stream_analysis(self, messages: list, proxies: Optional[dict]) -> Generator[Dict, None, None]:
        yield {"status": "started"}
        try:
            http_client = httpx.Client(proxies=proxies) if proxies else None
            client = OpenAI(
                api_key=self.api_key,
                base_url=self.api_base_url or "https://api.deepseek.com",
                http_client=http_client
            )
            params = {"model": self.get_model_identifier(), "messages": messages, "stream": True}
            if 'reasoner' not in self.get_model_identifier():
                params["temperature"] = self.temperature

            response = client.chat.completions.create(**params)
            response_buffer = ""
            thinking_buffer = ""

            for chunk in response:
                delta = chunk.choices[0].delta
                if hasattr(delta, 'reasoning_content') and delta.reasoning_content:
                    thinking_buffer += delta.reasoning_content
                    yield {"status": "thinking", "content": thinking_buffer}
                if hasattr(delta, 'content') and delta.content:
                    response_buffer += delta.content
                    yield {"status": "streaming", "content": response_buffer}

            if thinking_buffer:
                yield {"status": "thinking_complete", "content": thinking_buffer}
            yield {"status": "completed", "content": response_buffer or thinking_buffer}

        except Exception as e:
            yield {"status": "error", "error": f"DeepSeek API error: {str(e)}"}

    def analyze_text(self, text: str, proxies: dict = None) -> Generator[dict, None, None]:
        messages = [{'role': 'system', 'content': self.system_prompt}, {'role': 'user', 'content': text}]
        yield from self._stream_analysis(messages, proxies)

    def analyze_image(self, image_data: str, proxies: dict = None) -> Generator[dict, None, None]:
        yield {"status": "error", "error": "This DeepSeek model does not support image analysis."}