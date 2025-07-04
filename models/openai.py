from typing import Generator, Dict, Optional
from openai import OpenAI
import httpx
from .base import BaseModel

class OpenAIModel(BaseModel):
    def __init__(self, api_key: str, **kwargs):
        super().__init__(api_key=api_key, **kwargs)

    def get_default_system_prompt(self) -> str:
        return "You are an expert at analyzing questions and providing detailed solutions."

    def get_model_identifier(self) -> str:
        return "gpt-4o"

    def _stream_analysis(self, messages: list, proxies: Optional[dict]) -> Generator[Dict, None, None]:
        yield {"status": "started"}
        try:
            http_client = httpx.Client(proxies=proxies) if proxies else None
            client = OpenAI(
                api_key=self.api_key,
                base_url=self.api_base_url,
                http_client=http_client
            )
            response = client.chat.completions.create(
                model=self.get_model_identifier(),
                messages=messages,
                temperature=self.temperature,
                stream=True,
                max_tokens=4000
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
                    {"type": "text", "text": "Please analyze this image and provide a detailed solution."}
                ]
            }
        ]
        yield from self._stream_analysis(messages, proxies)