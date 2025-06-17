from typing import Dict, Type, Any, Optional
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
        print("配置加载失败，使用空模型列表")
        
        # 不再硬编码模型定义，而是使用空字典
        cls._models = {}
        
        # 只保留Mathpix作为基础工具
        try:
            # 导入MathpixModel类
            from .mathpix import MathpixModel
            
            # 添加Mathpix作为基础工具
            cls._models['mathpix'] = {
                'class': MathpixModel,
                'is_multimodal': True,
                'is_reasoning': False,
                'display_name': 'Mathpix OCR',
                'description': '文本提取工具，适用于数学公式和文本',
                'is_ocr_only': True
            }
        except Exception as e:
            print(f"无法加载基础Mathpix工具: {str(e)}")

    @classmethod
    def create_model(cls, model_name: str, api_key: str, temperature: float = 0.7, 
                     system_prompt: Optional[str] = None, language: Optional[str] = None, api_base_url: Optional[str] = None) -> BaseModel:
        """
        Create a model instance based on the model name.
        
        Args:
            model_name: The identifier for the model
            api_key: The API key for the model service
            temperature: The temperature to use for generation
            system_prompt: The system prompt to use
            language: The preferred language for responses
            api_base_url: The base URL for API requests
            
        Returns:
            A model instance
        """
        if model_name not in cls._models:
            raise ValueError(f"Unknown model: {model_name}")
            
        model_info = cls._models[model_name]
        model_class = model_info['class']
        
        # 对于DeepSeek模型，需要传递正确的模型名称
        if 'deepseek' in model_name.lower():
            return model_class(
                api_key=api_key,
                temperature=temperature,
                system_prompt=system_prompt,
                language=language,
                model_name=model_name,
                api_base_url=api_base_url
            )
        # 对于阿里巴巴模型，也需要传递正确的模型名称
        elif 'qwen' in model_name.lower() or 'qvq' in model_name.lower() or 'alibaba' in model_name.lower():
            return model_class(
                api_key=api_key,
                temperature=temperature,
                system_prompt=system_prompt,
                language=language,
                model_name=model_name,
                api_base_url=api_base_url
            )
        # 对于Mathpix模型，不传递language参数
        elif model_name == 'mathpix':
            return model_class(
                api_key=api_key,
                temperature=temperature,
                system_prompt=system_prompt
            )
        # 对于Anthropic模型，需要传递model_identifier参数
        elif 'claude' in model_name.lower() or 'anthropic' in model_name.lower():
            return model_class(
                api_key=api_key,
                temperature=temperature,
                system_prompt=system_prompt,
                language=language,
                api_base_url=api_base_url,
                model_identifier=model_name
            )
        else:
            # 其他模型仅传递标准参数
            return model_class(
                api_key=api_key,
                temperature=temperature,
                system_prompt=system_prompt,
                language=language,
                api_base_url=api_base_url
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
                      display_name: Optional[str] = None, description: Optional[str] = None) -> None:
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
