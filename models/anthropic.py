import json
import requests
from typing import Generator, Optional, Dict
from .base import BaseModel

class AnthropicModel(BaseModel):
    def __init__(self, api_key: str, model_identifier: str, **kwargs):
        super().__init__(api_key=api_key, model_identifier=model_identifier, **kwargs)
        self.api_base_url = self.api_base_url or "https://api.anthropic.com/v1"
        self.model_identifier = model_identifier
        self.reasoning_config = None
        self.max_tokens = 8192

    def get_default_system_prompt(self) -> str:
        return "You are an expert at analyzing questions and providing detailed solutions."

    def get_model_identifier(self) -> str:
        return self.model_identifier

    def _stream_analysis(self, payload: Dict, proxies: Optional[dict]) -> Generator[Dict, None, None]:
        yield {"status": "started"}
        try:
            api_key = self.api_key.replace('Bearer ', '')
            headers = {
                'x-api-key': api_key,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json',
            }
            api_endpoint = f"{self.api_base_url}/messages"

            response = requests.post(
                api_endpoint, headers=headers, json=payload, stream=True, proxies=proxies, timeout=60
            )

            if response.status_code != 200:
                error_info = f"API error: {response.status_code} - {response.text}"
                yield {"status": "error", "error": error_info}
                return

            thinking_content = ""
            response_buffer = ""

            for line in response.iter_lines():
                if not line:
                    continue
                line_str = line.decode('utf-8')
                if not line_str.startswith('data: '):
                    continue
                
                try:
                    data = json.loads(line_str[6:])
                    event_type = data.get('type')
                    delta = data.get('delta', {})

                    if event_type == 'content_block_delta':
                        if 'text' in delta:
                            response_buffer += delta['text']
                            yield {"status": "streaming", "content": response_buffer}
                    elif event_type in ['thinking_delta', 'extended_thinking_delta']:
                        if 'text' in delta:
                            thinking_content += delta['text']
                            yield {"status": "thinking", "content": thinking_content}
                    elif event_type == 'message_stop':
                        if thinking_content:
                            yield {"status": "thinking_complete", "content": thinking_content}
                        yield {"status": "completed", "content": response_buffer}
                    elif event_type == 'error':
                        yield {"status": "error", "error": data.get('error', {}).get('message', 'Unknown API error')}
                        return
                except json.JSONDecodeError:
                    continue

        except Exception as e:
            yield {"status": "error", "error": f"Streaming error: {str(e)}"}

    def _prepare_payload(self, messages: list) -> Dict:
        max_tokens = self.max_tokens or 8192
        payload = {
            'model': self.get_model_identifier(),
            'stream': True,
            'max_tokens': max_tokens,
            'temperature': 1,
            'system': self.system_prompt,
            'messages': messages,
        }
        
        if self.reasoning_config:
            if self.reasoning_config.get('reasoning_depth') == 'extended':
                payload['thinking'] = {'type': 'enabled', 'budget_tokens': self.reasoning_config.get('think_budget', max_tokens // 2)}
            elif self.reasoning_config.get('speed_mode') != 'instant':
                payload['thinking'] = {'type': 'enabled', 'budget_tokens': min(4096, max_tokens // 4)}
        else:
            payload['thinking'] = {'type': 'enabled', 'budget_tokens': min(4096, max_tokens // 4)}
        return payload

    def analyze_text(self, text: str, proxies: Optional[dict] = None) -> Generator[dict, None, None]:
        messages = [{'role': 'user', 'content': [{'type': 'text', 'text': text}]}]
        payload = self._prepare_payload(messages)
        yield from self._stream_analysis(payload, proxies)

    def analyze_image(self, image_data: str, proxies: Optional[dict] = None) -> Generator[dict, None, None]:
        messages = [{'role': 'user', 'content': [
            {'type': 'image', 'source': {'type': 'base64', 'media_type': 'image/png', 'data': image_data}},
            {'type': 'text', 'text': "Please analyze this image and provide a detailed solution."}
        ]}]
        payload = self._prepare_payload(messages)
        yield from self._stream_analysis(payload, proxies)