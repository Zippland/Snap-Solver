from typing import Dict, Type
from .base import BaseModel
from .claude import ClaudeModel
from .gpt4o import GPT4oModel
from .deepseek import DeepSeekModel
from .mathpix import MathpixModel

class ModelFactory:
    _models: Dict[str, Type[BaseModel]] = {
        'claude-3-5-sonnet-20241022': ClaudeModel,
        'gpt-4o-2024-11-20': GPT4oModel,
        'deepseek-reasoner': DeepSeekModel,
        'mathpix': MathpixModel
    }

    @classmethod
    def create_model(cls, model_name: str, api_key: str, temperature: float = 0.7, system_prompt: str = None) -> BaseModel:
        """
        Create and return an instance of the specified model.
        
        Args:
            model_name: The identifier of the model to create
            api_key: The API key for the model
            temperature: Optional temperature parameter for response generation
            system_prompt: Optional custom system prompt
            
        Returns:
            An instance of the specified model
            
        Raises:
            ValueError: If the model_name is not recognized
        """
        model_class = cls._models.get(model_name)
        if not model_class:
            raise ValueError(f"Unknown model: {model_name}")
        
        return model_class(
            api_key=api_key,
            temperature=temperature,
            system_prompt=system_prompt
        )

    @classmethod
    def get_available_models(cls) -> list[str]:
        """Return a list of available model identifiers"""
        return list(cls._models.keys())

    @classmethod
    def register_model(cls, model_name: str, model_class: Type[BaseModel]) -> None:
        """
        Register a new model type with the factory.
        
        Args:
            model_name: The identifier for the model
            model_class: The model class to register
        """
        cls._models[model_name] = model_class
