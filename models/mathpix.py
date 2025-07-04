from typing import Generator, Dict
import requests
from .base import BaseModel

class MathpixModel(BaseModel):
    def __init__(self, api_key: str, **kwargs):
        super().__init__(api_key=api_key, **kwargs)
        try:
            self.app_id, self.app_key = api_key.split(':')
        except ValueError:
            raise ValueError("Mathpix API key must be in format 'app_id:app_key'")
        
        self.api_url = "https://api.mathpix.com/v3/text"
        self.headers = {"app_id": self.app_id, "app_key": self.app_key, "Content-Type": "application/json"}

    def _make_request(self, payload: Dict, proxies: dict = None, max_retries: int = 3) -> Dict:
        for _ in range(max_retries):
            try:
                response = requests.post(self.api_url, headers=self.headers, json=payload, proxies=proxies, timeout=25)
                if response.status_code == 429:
                    continue
                response.raise_for_status()
                return response.json()
            except (requests.exceptions.Timeout, requests.exceptions.ConnectionError):
                continue
        raise requests.exceptions.RequestException("Mathpix API request failed after multiple retries.")

    def analyze_image(self, image_data: str, proxies: dict = None) -> Generator[dict, None, None]:
        yield {"status": "started"}
        try:
            payload = {"src": f"data:image/jpeg;base64,{image_data}", "formats": ["text", "latex_styled"]}
            result = self._make_request(payload, proxies)
            yield {"status": "completed", "content": result.get('text', ''), "model": self.get_model_identifier()}
        except Exception as e:
            yield {"status": "error", "error": f"Mathpix API error: {str(e)}"}

    def extract_full_text(self, image_data: str, proxies: dict = None) -> str:
        try:
            payload = {"src": f"data:image/jpeg;base64,{image_data}", "formats": ["text"], "ocr_options": {"rm_spaces": False}}
            result = self._make_request(payload, proxies)
            return result.get('text', "Failed to extract text.")
        except Exception as e:
            return f"Mathpix API error: {str(e)}"

    def analyze_text(self, text: str, proxies: dict = None) -> Generator[dict, None, None]:
        yield {"status": "error", "error": "Text analysis is not supported by Mathpix."}

    def get_model_identifier(self) -> str:
        return "mathpix"