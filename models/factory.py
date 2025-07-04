from typing import Dict, Type, Any, Optional
import json
import os
import importlib
from .base import BaseModel
from .mathpix import MathpixModel

class ModelFactory:
    _models: Dict[str, Dict[str, Any]] = {}
    _class_map: Dict[str, Type[BaseModel]] = {}
    
    @classmethod
    def initialize(cls):
        try:
            config_path = os.path.join(os.path.dirname(__file__), '..', 'config', 'models.json')
            with open(config_path, 'r', encoding='utf-8') as f:
                config = json.load(f)
            
            for provider_id, provider_info in config.get('providers', {}).items():
                if class_name := provider_info.get('class_name'):
                    module = importlib.import_module(f'.{provider_id.lower()}', package=__package__)
                    cls._class_map[provider_id] = getattr(module, class_name)
            
            for model_id, model_info in config.get('models', {}).items():
                if (provider_id := model_info.get('provider')) and provider_id in cls._class_map:
                    cls._models[model_id] = {
                        'class': cls._class_map[provider_id],
                        'provider': provider_id,
                        **model_info
                    }
            
            cls._models['mathpix'] = {
                'class': MathpixModel, 'provider': 'mathpix', 'is_multimodal': True, 'is_reasoning': False,
                'display_name': 'Mathpix OCR', 'description': 'Text extraction tool', 'is_ocr_only': True
            }
        except Exception as e:
            print(f"Failed to load model config: {e}")
            cls._models = {}

    @classmethod
    def create_model(cls, model_name: str, **kwargs) -> BaseModel:
        if model_name not in cls._models:
            raise ValueError(f"Unknown model: {model_name}")
            
        model_info = cls._models[model_name]
        model_class = model_info['class']
        provider_id = model_info['provider']
        
        init_kwargs = kwargs.copy()

        if provider_id in ['deepseek', 'alibaba', 'google']:
            init_kwargs['model_name'] = model_name
        elif provider_id == 'anthropic':
            init_kwargs['model_identifier'] = model_name

        # Filter kwargs to only those accepted by the constructor
        import inspect
        sig = inspect.signature(model_class.__init__)
        accepted_kwargs = {k: v for k, v in init_kwargs.items() if k in sig.parameters}
        
        return model_class(**accepted_kwargs)

    @classmethod
    def get_available_models(cls) -> list[Dict[str, Any]]:
        return [
            {
                'id': model_id,
                'display_name': info.get('name', model_id),
                'description': info.get('description', ''),
                'is_multimodal': info.get('supportsMultimodal', False),
                'is_reasoning': info.get('isReasoning', False)
            }
            for model_id, info in cls._models.items() if not info.get('is_ocr_only')
        ]
    
    @classmethod
    def is_multimodal(cls, model_name: str) -> bool:
        return cls._models.get(model_name, {}).get('supportsMultimodal', False)
    
    @classmethod
    def is_reasoning(cls, model_name: str) -> bool:
        return cls._models.get(model_name, {}).get('isReasoning', False)