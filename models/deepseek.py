from typing import Generator

from openai import DefaultHttpxClient, OpenAI

from .base import BaseModel


class DeepSeekModel(BaseModel):
    """DeepSeek Chat Completions adapter, including Flash image input."""

    def __init__(self, api_key: str, temperature: float = 0.7,
                 system_prompt: str = None, language: str = None,
                 model_name: str = "deepseek-flash", api_base_url: str = None,
                 reasoning_tier: str = "deep"):
        super().__init__(api_key, temperature, system_prompt, language,
                         api_base_url=api_base_url,
                         reasoning_tier=reasoning_tier)
        self.model_name = model_name

    def get_model_identifier(self) -> str:
        # Preserve exact IDs, including IDs configured for compatible relays.
        return self.model_name

    def _apply_reasoning_tier(self, payload: dict) -> None:
        # Keep legacy text-only endpoints usable on compatible relays.
        if self.model_name in ("deepseek-chat", "deepseek-reasoner"):
            thinking = self.model_name == "deepseek-reasoner"
        else:
            thinking = self.reasoning_tier != "fast"
            payload["extra_body"] = {
                "thinking": {"type": "enabled" if thinking else "disabled"}
            }
            if thinking:
                # extra_body works with the pinned SDK, whose typed
                # reasoning_effort predates DeepSeek's max tier.
                payload["extra_body"]["reasoning_effort"] = (
                    "max" if self.reasoning_tier == "max" else "high"
                )
        if not thinking and self.temperature is not None:
            payload["temperature"] = self.temperature

    def _stream(self, messages: list, proxies: dict = None
                ) -> Generator[dict, None, None]:
        yield {"status": "started", "content": ""}
        params = {
            "model": self.get_model_identifier(),
            "messages": messages,
            "stream": True,
        }
        if getattr(self, "max_tokens", None) is not None:
            params["max_tokens"] = self.max_tokens
        self._apply_reasoning_tier(params)
        client_options = {
            "api_key": self.api_key,
            "base_url": (self.api_base_url or "").strip()
                        or "https://api.deepseek.com",
        }
        try:
            # Per-request proxy settings avoid changing other clients' traffic.
            proxy = (proxies or {}).get("https") or (proxies or {}).get("http")
            if proxy:
                client_options["http_client"] = DefaultHttpxClient(proxy=proxy)
            with OpenAI(**client_options) as client:
                with client.chat.completions.create(**params) as response:
                    answer = ""
                    thinking = ""
                    finish_reason = None
                    for chunk in response:
                        if not chunk.choices:
                            continue
                        choice = chunk.choices[0]
                        delta = choice.delta
                        reason = getattr(delta, "reasoning_content", None)
                        content = getattr(delta, "content", None)
                        if reason:
                            thinking += reason
                            yield {"status": "thinking", "content": thinking}
                        if content:
                            answer += content
                            yield {"status": "streaming", "content": answer}
                        if choice.finish_reason:
                            finish_reason = choice.finish_reason

                    if thinking:
                        yield {"status": "thinking_complete", "content": thinking}
                    if finish_reason and finish_reason != "stop":
                        message = (
                            "输出达到长度限制，请提高 maxTokens 或缩小题目范围后重试"
                            if finish_reason == "length"
                            else f"生成未正常完成（{finish_reason}），请重试"
                        )
                        yield {"status": "error", "error": f"DeepSeek：{message}"}
                    elif answer:
                        yield {"status": "completed", "content": answer}
                    else:
                        yield {"status": "error", "error": "DeepSeek 未返回最终答案，请重试"}
        except Exception as exc:
            status = getattr(exc, "status_code", None)
            message = {
                401: "API 密钥无效，请检查 DeepSeek 密钥",
                402: "账户余额不足，请检查 DeepSeek 余额",
                429: "请求频率超限，请稍后再试",
            }.get(status, str(exc))
            yield {"status": "error", "error": f"DeepSeek API错误: {message}"}

    def analyze_text(self, text: str, proxies: dict = None
                     ) -> Generator[dict, None, None]:
        messages = [
            {"role": "system", "content": self.system_prompt},
            {"role": "user", "content": text},
        ]
        yield from self._stream(messages, proxies)

    def analyze_image(self, image_data: str, proxies: dict = None,
                      history: list = None) -> Generator[dict, None, None]:
        if self.model_name != "deepseek-flash":
            yield {
                "status": "error",
                "error": "此 DeepSeek 模型未启用图像输入，请选择 DeepSeek Flash",
            }
            return
        image_url = (image_data if image_data.startswith("data:image/")
                     else f"data:image/png;base64,{image_data}")
        messages = [
            {"role": "system", "content": self.system_prompt},
            {"role": "user", "content": [
                {"type": "text", "text": "请分析图片中的题目并给出解答。"},
                {"type": "image_url", "image_url": {"url": image_url}},
            ]},
        ]
        messages.extend(self._text_history(history))
        yield from self._stream(messages, proxies)
