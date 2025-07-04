from abc import ABC, abstractmethod
from typing import Generator

class BaseModel(ABC):
    def __init__(self, api_key: str, temperature: float = 0.7, system_prompt: str = None, language: str = 'English', api_base_url: str = None, **kwargs):
        self.api_key = api_key
        self.temperature = temperature
        self.language = language
        self.system_prompt = system_prompt or self.get_default_system_prompt()
        self.api_base_url = api_base_url

    @abstractmethod
    def analyze_image(self, image_data: str, proxies: dict = None) -> Generator[dict, None, None]:
        pass

    @abstractmethod
    def analyze_text(self, text: str, proxies: dict = None) -> Generator[dict, None, None]:
        pass

    def get_default_system_prompt(self) -> str:
        prompts = {
            "English": "You are a professional problem-solving expert. Please analyze the problem step-by-step, identify the issue, and provide a detailed solution. Always respond in the user's preferred language.",
            "Chinese": "你是一位专业的问题解决专家。请逐步分析问题，找出问题所在，并提供详细的解决方案。始终使用用户偏好的语言回答。",
            "Spanish": "Usted es un experto profesional en la resolución de problemas. Por favor, analice el problema paso a paso, identifique el inconveniente y proporcione una solución detallada. Responda siempre en el idioma preferido del usuario.",
            "French": "Vous êtes un expert professionnel en résolution de problèmes. Veuillez analyser le problème étape par étape, identifier le problème et fournir une solution détaillée. Répondez toujours dans la langue préférée de l'utilisateur.",
            "German": "Sie sind ein professioneller Experte für Problemlösungen. Bitte analysieren Sie das Problem Schritt für Schritt, identifizieren Sie das Problem und stellen Sie eine detaillierte Lösung bereit. Antworten Sie immer in der bevorzugten Sprache des Benutzers."
        }
        return prompts.get(self.language, prompts["English"])

    @abstractmethod
    def get_model_identifier(self) -> str:
        pass