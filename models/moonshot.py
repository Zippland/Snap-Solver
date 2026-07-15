import os
from typing import Generator, Optional
from openai import OpenAI
from .base import BaseModel


class MoonshotModel(BaseModel):
    """
    Moonshot / Kimi 模型（OpenAI-SDK 兼容）。
    视觉 + 思考：kimi-k2.6 / kimi-k2.5，原生多模态，thinking 可开关。
    结构照 AlibabaModel（同为 OpenAI 兼容 + reasoning_content 流式），
    差异：思考开关用 Kimi 的 thinking 对象；base_url 优先自定义/中转。

    注：滚动版本号变动较快，上线前建议用 /v1/models 端点核对实际可用 id。
    """

    def __init__(self, api_key: str, temperature: float = 0.7, system_prompt: str = None,
                 language: str = None, model_name: str = None, api_base_url: str = None,
                 reasoning_tier: str = "deep"):
        self.model_name = model_name if model_name else "kimi-k2.6"
        super().__init__(api_key, temperature, system_prompt, language, reasoning_tier=reasoning_tier)
        # 优先自定义/中转 base_url，回退官方国内端点
        self.api_base_url = api_base_url or "https://api.moonshot.cn/v1"

    def get_default_system_prompt(self) -> str:
        return """你是一位专业的问题分析与解答助手。当看到一个问题图片时，请：
1. 仔细阅读并理解问题
2. 分析问题的关键组成部分
3. 提供清晰的、逐步的解决方案
4. 如果相关，解释涉及的概念或理论
5. 如果有多种解决方法，先解释最高效的方法"""

    def get_model_identifier(self) -> str:
        """透传 Kimi 模型 id"""
        known = {"kimi-k2.6", "kimi-k2.5"}
        if self.model_name in known:
            return self.model_name
        name = (self.model_name or "").lower()
        if "k2.5" in name:
            return "kimi-k2.5"
        return "kimi-k2.6"  # 兜底

    def _reasoning_extra_body(self) -> dict:
        """fast→关闭思考；deep/max→开启思考（max 靠 _get_max_tokens 放宽预算加深）"""
        if self.reasoning_tier == 'fast':
            return {"thinking": {"type": "disabled"}}
        return {"thinking": {"type": "enabled"}}

    def _is_thinking_model(self) -> bool:
        """仅 fast 档不产生 reasoning_content"""
        return self.reasoning_tier != 'fast'

    def _get_max_tokens(self) -> int:
        base = self.max_tokens if getattr(self, 'max_tokens', None) else 4000
        # max 档放宽预算（思考 token 计入 max_tokens，是当前 API 加深的唯一手段）
        return base * 2 if self.reasoning_tier == 'max' else base

    def analyze_text(self, text: str, proxies: dict = None) -> Generator[dict, None, None]:
        """Stream Kimi's response for text analysis"""
        try:
            yield {"status": "started", "content": ""}

            original_env = {
                'http_proxy': os.environ.get('http_proxy'),
                'https_proxy': os.environ.get('https_proxy')
            }
            try:
                if proxies:
                    if 'http' in proxies:
                        os.environ['http_proxy'] = proxies['http']
                    if 'https' in proxies:
                        os.environ['https_proxy'] = proxies['https']

                client = OpenAI(api_key=self.api_key, base_url=self.api_base_url)

                messages = [
                    {"role": "system", "content": self.system_prompt},
                    {"role": "user", "content": text}
                ]

                response = client.chat.completions.create(
                    model=self.get_model_identifier(),
                    messages=messages,
                    temperature=self.temperature,
                    stream=True,
                    max_tokens=self._get_max_tokens(),
                    extra_body=self._reasoning_extra_body()
                )

                reasoning_content = ""
                answer_content = ""
                is_answering = False
                has_thinking = self._is_thinking_model()
                # 节流：按累计字符批量 yield，避免逐 chunk 洪泛（与其余模型一致）
                reasoning_sent = 0
                answer_sent = 0

                for chunk in response:
                    if not chunk.choices:
                        continue
                    delta = chunk.choices[0].delta

                    if has_thinking and hasattr(delta, 'reasoning_content') and delta.reasoning_content is not None:
                        reasoning_content += delta.reasoning_content
                        if len(reasoning_content) - reasoning_sent >= 48:
                            reasoning_sent = len(reasoning_content)
                            yield {"status": "reasoning", "content": reasoning_content, "is_reasoning": True}
                    elif delta.content:
                        if not is_answering and has_thinking:
                            is_answering = True
                            if reasoning_content:
                                yield {"status": "reasoning_complete", "content": reasoning_content, "is_reasoning": True}
                        answer_content += delta.content
                        if len(answer_content) - answer_sent >= 24:
                            answer_sent = len(answer_content)
                            yield {"status": "streaming", "content": answer_content}

                if answer_content:
                    yield {"status": "completed", "content": answer_content}

            finally:
                for key, value in original_env.items():
                    if value is None:
                        if key in os.environ:
                            del os.environ[key]
                    else:
                        os.environ[key] = value

        except Exception as e:
            yield {"status": "error", "error": str(e)}

    def analyze_image(self, image_data: str, proxies: dict = None, history: list = None) -> Generator[dict, None, None]:
        """Stream Kimi's response for image analysis"""
        try:
            yield {"status": "started", "content": ""}

            original_env = {
                'http_proxy': os.environ.get('http_proxy'),
                'https_proxy': os.environ.get('https_proxy')
            }
            try:
                if proxies:
                    if 'http' in proxies:
                        os.environ['http_proxy'] = proxies['http']
                    if 'https' in proxies:
                        os.environ['https_proxy'] = proxies['https']

                client = OpenAI(api_key=self.api_key, base_url=self.api_base_url)

                if image_data.startswith('data:image'):
                    image_data = image_data.split(',', 1)[1]

                messages = [
                    {"role": "system", "content": self.system_prompt},
                    {
                        "role": "user",
                        "content": [
                            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_data}"}},
                            {"type": "text", "text": "请分析这个图片并提供详细的解答。"}
                        ]
                    }
                ]

                # 同题追问：既往问答与新追问追加在带图首轮之后
                messages.extend(self._text_history(history))

                response = client.chat.completions.create(
                    model=self.get_model_identifier(),
                    messages=messages,
                    temperature=self.temperature,
                    stream=True,
                    max_tokens=self._get_max_tokens(),
                    extra_body=self._reasoning_extra_body()
                )

                reasoning_content = ""
                answer_content = ""
                is_answering = False
                has_thinking = self._is_thinking_model()
                # 节流：按累计字符批量 yield，避免逐 chunk 洪泛（与其余模型一致）
                reasoning_sent = 0
                answer_sent = 0

                for chunk in response:
                    if not chunk.choices:
                        continue
                    delta = chunk.choices[0].delta

                    if has_thinking and hasattr(delta, 'reasoning_content') and delta.reasoning_content is not None:
                        reasoning_content += delta.reasoning_content
                        if len(reasoning_content) - reasoning_sent >= 48:
                            reasoning_sent = len(reasoning_content)
                            yield {"status": "reasoning", "content": reasoning_content, "is_reasoning": True}
                    elif delta.content:
                        if not is_answering and has_thinking:
                            is_answering = True
                            if reasoning_content:
                                yield {"status": "reasoning_complete", "content": reasoning_content, "is_reasoning": True}
                        answer_content += delta.content
                        if len(answer_content) - answer_sent >= 24:
                            answer_sent = len(answer_content)
                            yield {"status": "streaming", "content": answer_content}

                if answer_content:
                    yield {"status": "completed", "content": answer_content}

            finally:
                for key, value in original_env.items():
                    if value is None:
                        if key in os.environ:
                            del os.environ[key]
                    else:
                        os.environ[key] = value

        except Exception as e:
            yield {"status": "error", "error": str(e)}
