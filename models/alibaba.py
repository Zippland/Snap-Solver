from typing import Generator, Dict, Optional
from openai import OpenAI
import httpx
from .base import BaseModel

class AlibabaModel(BaseModel):
    def __init__(self, api_key: str, model_name: str, **kwargs):
        self.model_name = model_name
        super().__init__(api_key=api_key, model_name=model_name, **kwargs)
        self.max_tokens = 4000

    def get_default_system_prompt(self) -> str:
        if self.model_name and "qwen-vl" in self.model_name:
            return """You are Tongyi Qianwen VL, a visual language assistant. Based on the user's image, please:
1. Carefully read and understand the question.
2. Analyze the key components of the problem.
3. Provide a clear, step-by-step solution."""
        else:
            return """You are a professional problem analysis and resolution assistant. When you see a question in an image, please:
1. Carefully read and understand the question.
2. Analyze the key components of the problem.
3. Provide a clear, step-by-step solution."""

    def get_model_identifier(self) -> str:
        model_mapping = {
            "QVQ-Max-2025-03-25": "qvq-max",
            "qwen-vl-max-latest": "qwen-vl-max",
        }
        return model_mapping.get(self.model_name, "qvq-max")

    def _get_max_tokens(self) -> int:
        return 2000 if "qwen-vl" in self.get_model_identifier() else self.max_tokens

    def _stream_analysis(self, messages: list, proxies: Optional[dict]) -> Generator[Dict, None, None]:
        yield {"status": "started"}
        try:
            http_client = httpx.Client(proxies=proxies) if proxies else None
            client = OpenAI(
                api_key=self.api_key,
                base_url=self.api_base_url or "https://dashscope.aliyuncs.com/compatible-mode/v1",
                http_client=http_client
            )

            response = client.chat.completions.create(
                model=self.get_model_identifier(),
                messages=messages,
                temperature=self.temperature,
                stream=True,
                max_tokens=self._get_max_tokens()
            )

            reasoning_content = ""
            answer_content = ""
            is_answering = False
            is_qwen_vl = "qwen-vl" in self.get_model_identifier().lower()

            for chunk in response:
                if not chunk.choices:
                    continue
                delta = chunk.choices[0].delta
                
                if not is_qwen_vl and hasattr(delta, 'reasoning_content') and delta.reasoning_content:
                    reasoning_content += delta.reasoning_content
                    yield {"status": "reasoning", "content": reasoning_content, "is_reasoning": True}
                elif delta.content:
                    if not is_answering and not is_qwen_vl and reasoning_content:
                        is_answering = True
                        yield {"status": "reasoning_complete", "content": reasoning_content, "is_reasoning": True}
                    answer_content += delta.content
                    yield {"status": "streaming", "content": answer_content}

            yield {"status": "completed", "content": answer_content}
        except Exception as e:
            yield {"status": "error", "error": str(e)}

    def analyze_text(self, text: str, proxies: dict = None) -> Generator[dict, None, None]:
        messages = [
            {"role": "system", "content": [{"type": "text", "text": self.system_prompt}]},
            {"role": "user", "content": [{"type": "text", "text": text}]}
        ]
        yield from self._stream_analysis(messages, proxies)

    def analyze_image(self, image_data: str, proxies: dict = None) -> Generator[dict, None, None]:
        messages = [
            {"role": "system", "content": [{"type": "text", "text": self.system_prompt}]},
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_data}"}},
                    {"type": "text", "text": "Please analyze this image and provide a detailed solution."}
                ]
            }
        ]
        yield from self._stream_analysis(messages, proxies)