from typing import Dict, Type, Any
import json
import os
import importlib
from .base import BaseModel
from .mathpix import MathpixModel  # MathpixModel仍然需要直接导入，因为它是特殊工具

class ModelFactory:
    # 模型基本信息，包含类型和特性
    _models: Dict[str, Dict[str, Any]] = {}
    _class_map: Dict[str, Type[BaseModel]] = {}
    
    @classmethod
    def initialize(cls):
        """从配置文件加载模型信息"""
        try:
            config_path = os.path.join(os.path.dirname(__file__), '..', 'config', 'models.json')
            with open(config_path, 'r', encoding='utf-8') as f:
                config = json.load(f)
            
            # 加载提供商信息和类映射
            providers = config.get('providers', {})
            for provider_id, provider_info in providers.items():
                class_name = provider_info.get('class_name')
                if class_name:
                    # 从当前包动态导入模型类
                    module = importlib.import_module(f'.{provider_id.lower()}', package=__package__)
                    cls._class_map[provider_id] = getattr(module, class_name)
            
            # 加载模型信息
            for model_id, model_info in config.get('models', {}).items():
                provider_id = model_info.get('provider')
                if provider_id and provider_id in cls._class_map:
                    cls._models[model_id] = {
                        'class': cls._class_map[provider_id],
                        'is_multimodal': model_info.get('supportsMultimodal', False),
                        'is_reasoning': model_info.get('isReasoning', False),
                        'display_name': model_info.get('name', model_id),
                        'description': model_info.get('description', '')
                    }
            
            # 添加Mathpix模型（特殊工具模型）
            cls._models['mathpix'] = {
                'class': MathpixModel,
                'is_multimodal': True,
                'is_reasoning': False,
                'display_name': 'Mathpix OCR',
                'description': '文本提取工具，适用于数学公式和文本',
                'is_ocr_only': True
            }
            
            print(f"已从配置加载 {len(cls._models)} 个模型")
        except Exception as e:
            print(f"加载模型配置失败: {str(e)}")
            cls._initialize_defaults()
    
    @classmethod
    def _initialize_defaults(cls):
        """初始化默认模型（当配置加载失败时）"""
        print("使用默认模型配置")
        # 导入所有模型类作为备份
        from .anthropic import AnthropicModel
        from .openai import OpenAIModel 
        from .deepseek import DeepSeekModel
        
        cls._models = {
            'claude-3-7-sonnet-20250219': {
                'class': AnthropicModel,
                'is_multimodal': True,
                'is_reasoning': True,
                'display_name': 'Claude 3.7 Sonnet',
                'description': '强大的Claude 3.7 Sonnet模型，支持图像理解和思考过程'
            },
            'gpt-4o-2024-11-20': {
                'class': OpenAIModel,
                'is_multimodal': True,
                'is_reasoning': False,
                'display_name': 'GPT-4o',
                'description': 'OpenAI的GPT-4o模型，支持图像理解'
            },
            'deepseek-reasoner': {
                'class': DeepSeekModel,
                'is_multimodal': False,
                'is_reasoning': True,
                'display_name': 'DeepSeek Reasoner',
                'description': 'DeepSeek推理模型，提供详细思考过程（仅支持文本）'
            },
            'mathpix': {
                'class': MathpixModel,
                'is_multimodal': True,
                'is_reasoning': False,
                'display_name': 'Mathpix OCR',
                'description': '文本提取工具，适用于数学公式和文本',
                'is_ocr_only': True
            }
        }

    @classmethod
    def create_model(cls, model_name: str, api_key: str, temperature: float = 0.7, system_prompt: str = None, language: str = None) -> BaseModel:
        """
        Create and return an instance of the specified model.
        
        Args:
            model_name: The identifier of the model to create
            api_key: The API key for the model
            temperature: Optional temperature parameter for response generation
            system_prompt: Optional custom system prompt
            language: Optional language preference for responses
            
        Returns:
            An instance of the specified model
            
        Raises:
            ValueError: If the model_name is not recognized
        """
        model_info = cls._models.get(model_name)
        if not model_info:
            raise ValueError(f"Unknown model: {model_name}")
        
        model_class = model_info['class']
        
        # 对于Mathpix模型，不传递language参数
        if model_name == 'mathpix':
            return model_class(
                api_key=api_key,
                temperature=temperature,
                system_prompt=system_prompt
            )
        else:
            # 对于所有其他模型，传递model_name参数
            return model_class(
                api_key=api_key,
                temperature=temperature,
                system_prompt=system_prompt,
                language=language,
                model_name=model_name
            )

    @classmethod
    def get_available_models(cls) -> list[Dict[str, Any]]:
        """Return a list of available models with their information"""
        models_info = []
        for model_id, info in cls._models.items():
            # 跳过仅OCR工具模型
            if info.get('is_ocr_only', False):
                continue
                
            models_info.append({
                'id': model_id,
                'display_name': info.get('display_name', model_id),
                'description': info.get('description', ''),
                'is_multimodal': info.get('is_multimodal', False),
                'is_reasoning': info.get('is_reasoning', False)
            })
        return models_info
    
    @classmethod
    def get_model_ids(cls) -> list[str]:
        """Return a list of available model identifiers"""
        return [model_id for model_id in cls._models.keys() 
                if not cls._models[model_id].get('is_ocr_only', False)]

    @classmethod
    def is_multimodal(cls, model_name: str) -> bool:
        """判断模型是否支持多模态输入"""
        return cls._models.get(model_name, {}).get('is_multimodal', False)
    
    @classmethod
    def is_reasoning(cls, model_name: str) -> bool:
        """判断模型是否为推理模型"""
        return cls._models.get(model_name, {}).get('is_reasoning', False)
    
    @classmethod
    def get_model_display_name(cls, model_name: str) -> str:
        """获取模型的显示名称"""
        return cls._models.get(model_name, {}).get('display_name', model_name)

    @classmethod
    def register_model(cls, model_name: str, model_class: Type[BaseModel], 
                      is_multimodal: bool = False, is_reasoning: bool = False,
                      display_name: str = None, description: str = None) -> None:
        """
        Register a new model type with the factory.
        
        Args:
            model_name: The identifier for the model
            model_class: The model class to register
            is_multimodal: Whether the model supports image input
            is_reasoning: Whether the model provides reasoning process
            display_name: Human-readable name for the model
            description: Description of the model
        """
        cls._models[model_name] = {
            'class': model_class,
            'is_multimodal': is_multimodal,
            'is_reasoning': is_reasoning,
            'display_name': display_name or model_name,
            'description': description or ''
        }
