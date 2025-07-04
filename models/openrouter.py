from typing import Generator, Dict, Optional
from openai import OpenAI
import httpx
from .base import BaseModel

class OpenRouterModel(BaseModel):
    def __init__(self, api_key: str, model_name: str, **kwargs):
        self.model_name = model_name
        super().__init__(api_key=api_key, model_name=model_name, api_base_url="https://openrouter.ai/api/v1", **kwargs)
        self.max_tokens = 16000

    def get_default_system_prompt(self) -> str:
        return "You are a helpful assistant."

    def get_model_identifier(self) -> str:
        return self.model_name

    def _stream_analysis(self, messages: list, proxies: Optional[dict]) -> Generator[Dict, None, None]:
        yield {"status": "started"}
        try:
            http_client = httpx.Client(proxies=proxies) if proxies else None
            client = OpenAI(
                api_key=self.api_key,
                base_url=self.api_base_url,
                http_client=http_client,
                default_headers={
                    "HTTP-Referer": "https://github.com/KHROTU/Snap-Solver-Plus",
                    "X-Title": "Snap Solver Plus",
                }
            )
            response = client.chat.completions.create(
                model=self.get_model_identifier(),
                messages=messages,
                temperature=self.temperature,
                stream=True,
                max_tokens=self.max_tokens
            )
            response_buffer = ""
            for chunk in response:
                if hasattr(chunk.choices[0].delta, 'content') and chunk.choices[0].delta.content:
                    response_buffer += chunk.choices[0].delta.content
                    yield {"status": "streaming", "content": response_buffer}
            
            yield {"status": "completed", "content": response_buffer}

        except Exception as e:
            yield {"status": "error", "error": str(e)}

    def analyze_text(self, text: str, proxies: dict = None) -> Generator[dict, None, None]:
        messages = [{"role": "system", "content": self.system_prompt}, {"role": "user", "content": text}]
        yield from self._stream_analysis(messages, proxies)

    def analyze_image(self, image_data: str, proxies: dict = None) -> Generator[dict, None, None]:
        messages = [
            {"role": "system", "content": self.system_prompt},
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_data}"}},
                    {"type": "text", "text": "Please analyze this image."}
                ]
            }
        ]
        yield from self._stream_analysis(messages, proxies)