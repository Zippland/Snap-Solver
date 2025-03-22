from typing import Generator, Dict, Any
import json
import requests
from .base import BaseModel

class MathpixModel(BaseModel):
    """
    Mathpix OCR model for processing images containing mathematical formulas,
    text, and tables.
    """
    
    def __init__(self, api_key: str, temperature: float = 0.7, system_prompt: str = None):
        """
        Initialize the Mathpix model.
        
        Args:
            api_key: Mathpix API key in format "app_id:app_key"
            temperature: Not used for Mathpix but kept for BaseModel compatibility
            system_prompt: Not used for Mathpix but kept for BaseModel compatibility
            
        Raises:
            ValueError: If the API key format is invalid
        """
        # 只传递必需的参数，不传递language参数
        super().__init__(api_key, temperature, system_prompt)
        try:
            self.app_id, self.app_key = api_key.split(':')
        except ValueError:
            raise ValueError("Mathpix API key must be in format 'app_id:app_key'")
        
        self.api_url = "https://api.mathpix.com/v3/text"
        self.headers = {
            "app_id": self.app_id,
            "app_key": self.app_key,
            "Content-Type": "application/json"
        }
        
        # Content type presets
        self.presets = {
            "math": {
                "formats": ["latex_normal", "latex_styled", "asciimath"],
                "data_options": {
                    "include_asciimath": True,
                    "include_latex": True,
                    "include_mathml": True
                },
                "ocr_options": {
                    "detect_formulas": True,
                    "enable_math_ocr": True,
                    "enable_handwritten": True,
                    "rm_spaces": True
                }
            },
            "text": {
                "formats": ["text"],
                "data_options": {
                    "include_latex": False,
                    "include_asciimath": False
                },
                "ocr_options": {
                    "enable_spell_check": True,
                    "enable_handwritten": True,
                    "rm_spaces": False
                }
            },
            "table": {
                "formats": ["text", "data"],
                "data_options": {
                    "include_latex": True
                },
                "ocr_options": {
                    "detect_tables": True,
                    "enable_spell_check": True,
                    "rm_spaces": True
                }
            },
            "full_text": {
                "formats": ["text"],
                "data_options": {
                    "include_latex": False,
                    "include_asciimath": False
                },
                "ocr_options": {
                    "enable_spell_check": True,
                    "enable_handwritten": True,
                    "rm_spaces": False,
                    "detect_paragraphs": True,
                    "enable_tables": False,
                    "enable_math_ocr": False
                }
            }
        }
        
        # Default to math preset
        self.current_preset = "math"

    def analyze_image(self, image_data: str, proxies: dict = None, content_type: str = None, 
                     confidence_threshold: float = 0.8, max_retries: int = 3) -> Generator[dict, None, None]:
        """
        Analyze an image using Mathpix OCR API.
        
        Args:
            image_data: Base64 encoded image data
            proxies: Optional proxy configuration
            content_type: Type of content to analyze ('math', 'text', or 'table')
            confidence_threshold: Minimum confidence score to accept (0.0 to 1.0)
            max_retries: Maximum number of retry attempts for failed requests
            
        Yields:
            dict: Response chunks with status and content
        """
        if content_type and content_type in self.presets:
            self.current_preset = content_type

        preset = self.presets[self.current_preset]
        
        try:
            # Prepare request payload
            payload = {
                "src": f"data:image/jpeg;base64,{image_data}",
                "formats": preset["formats"],
                "data_options": preset["data_options"],
                "ocr_options": preset["ocr_options"]
            }
            
            # Initialize retry counter
            retry_count = 0
            
            while retry_count < max_retries:
                try:
                    # Send request to Mathpix API with timeout
                    response = requests.post(
                        self.api_url,
                        headers=self.headers,
                        json=payload,
                        proxies=proxies,
                        timeout=25  # 25 second timeout
                    )
                    
                    # Handle specific API error codes
                    if response.status_code == 429:  # Rate limit exceeded
                        if retry_count < max_retries - 1:
                            retry_count += 1
                            continue
                        else:
                            raise requests.exceptions.RequestException("Rate limit exceeded")
                    
                    response.raise_for_status()
                    result = response.json()
                    
                    # Check confidence threshold
                    if 'confidence' in result and result['confidence'] < confidence_threshold:
                        yield {
                            "status": "warning",
                            "content": f"Low confidence score: {result['confidence']:.2%}"
                        }
                    
                    break  # Success, exit retry loop
                    
                except (requests.exceptions.Timeout, requests.exceptions.ConnectionError):
                    if retry_count < max_retries - 1:
                        retry_count += 1
                        continue
                    raise
            
            # Format the response
            formatted_response = self._format_response(result)
            
            # Yield initial status
            yield {
                "status": "started",
                "content": ""
            }
            
            # Yield the formatted response
            yield {
                "status": "completed",
                "content": formatted_response,
                "model": self.get_model_identifier()
            }
            
        except requests.exceptions.RequestException as e:
            yield {
                "status": "error",
                "error": f"Mathpix API error: {str(e)}"
            }
        except Exception as e:
            yield {
                "status": "error",
                "error": f"Error processing image: {str(e)}"
            }

    def analyze_text(self, text: str, proxies: dict = None) -> Generator[dict, None, None]:
        """
        Not implemented for Mathpix model as it only processes images.
        """
        yield {
            "status": "error",
            "error": "Text analysis is not supported by Mathpix model"
        }

    def get_default_system_prompt(self) -> str:
        """
        Not used for Mathpix model.
        """
        return ""

    def get_model_identifier(self) -> str:
        """
        Return the model identifier.
        """
        return "mathpix"

    def validate_api_key(self) -> bool:
        """
        Validate if the API key is in the correct format (app_id:app_key).
        """
        try:
            app_id, app_key = self.api_key.split(':')
            return bool(app_id.strip() and app_key.strip())
        except ValueError:
            return False

    def _format_response(self, result: Dict[str, Any]) -> str:
        """
        Format the Mathpix API response into a readable string.
        
        Args:
            result: Raw API response from Mathpix
            
        Returns:
            str: Formatted response string with all available formats
        """
        formatted_parts = []
        
        # Add confidence score if available
        if 'confidence' in result:
            formatted_parts.append(f"Confidence: {result['confidence']:.2%}\n")
        
        # Add text content
        if 'text' in result:
            formatted_parts.append("Text Content:")
            formatted_parts.append(result['text'])
            formatted_parts.append("")
        
        # Add LaTeX content
        if 'latex_normal' in result:
            formatted_parts.append("LaTeX (Normal):")
            formatted_parts.append(result['latex_normal'])
            formatted_parts.append("")
            
        if 'latex_styled' in result:
            formatted_parts.append("LaTeX (Styled):")
            formatted_parts.append(result['latex_styled'])
            formatted_parts.append("")
        
        # Add data formats (ASCII math, MathML)
        if 'data' in result and isinstance(result['data'], list):
            for item in result['data']:
                item_type = item.get('type', '')
                if item_type and 'value' in item:
                    formatted_parts.append(f"{item_type.upper()}:")
                    formatted_parts.append(item['value'])
                    formatted_parts.append("")
        
        # Add table data if present
        if 'tables' in result and result['tables']:
            formatted_parts.append("Tables Detected:")
            for i, table in enumerate(result['tables'], 1):
                formatted_parts.append(f"Table {i}:")
                if 'cells' in table:
                    # Format table as a grid
                    cells = table['cells']
                    if cells:
                        max_col = max(cell.get('col', 0) for cell in cells) + 1
                        max_row = max(cell.get('row', 0) for cell in cells) + 1
                        grid = [['' for _ in range(max_col)] for _ in range(max_row)]
                        
                        for cell in cells:
                            row = cell.get('row', 0)
                            col = cell.get('col', 0)
                            text = cell.get('text', '')
                            grid[row][col] = text
                        
                        # Format grid as table
                        col_widths = [max(len(str(grid[r][c])) for r in range(max_row)) for c in range(max_col)]
                        for row in grid:
                            row_str = ' | '.join(f"{str(cell):<{width}}" for cell, width in zip(row, col_widths))
                            formatted_parts.append(f"| {row_str} |")
                formatted_parts.append("")
        
        # Add error message if present
        if 'error' in result:
            error_msg = result['error']
            if isinstance(error_msg, dict):
                error_msg = error_msg.get('message', str(error_msg))
            formatted_parts.append(f"Error: {error_msg}")
        
        return "\n".join(formatted_parts).strip()

    def extract_full_text(self, image_data: str, proxies: dict = None, max_retries: int = 3) -> str:
        """
        专门用于提取图像中的全部文本内容，忽略数学公式和表格等其他元素。
        
        Args:
            image_data: Base64编码的图像数据
            proxies: 可选的代理配置
            max_retries: 请求失败时的最大重试次数
            
        Returns:
            str: 图像中提取的完整文本内容
        """
        try:
            # 准备请求负载，使用专为全文提取配置的参数
            payload = {
                "src": f"data:image/jpeg;base64,{image_data}",
                "formats": ["text"],
                "data_options": {
                    "include_latex": False,
                    "include_asciimath": False
                },
                "ocr_options": {
                    "enable_spell_check": True,
                    "enable_handwritten": True,
                    "rm_spaces": False,
                    "detect_paragraphs": True,
                    "enable_tables": False,
                    "enable_math_ocr": False
                }
            }
            
            # 初始化重试计数器
            retry_count = 0
            
            while retry_count < max_retries:
                try:
                    # 发送请求到Mathpix API
                    response = requests.post(
                        self.api_url,
                        headers=self.headers,
                        json=payload,
                        proxies=proxies,
                        timeout=30  # 30秒超时
                    )
                    
                    # 处理特定API错误代码
                    if response.status_code == 429:  # 超出速率限制
                        if retry_count < max_retries - 1:
                            retry_count += 1
                            continue
                        else:
                            raise requests.exceptions.RequestException("超出API速率限制")
                    
                    response.raise_for_status()
                    result = response.json()
                    
                    # 直接返回文本内容
                    if 'text' in result:
                        return result['text']
                    else:
                        return "未能提取到文本内容"
                    
                except (requests.exceptions.Timeout, requests.exceptions.ConnectionError):
                    if retry_count < max_retries - 1:
                        retry_count += 1
                        continue
                    raise
            
        except requests.exceptions.RequestException as e:
            return f"Mathpix API错误: {str(e)}"
        except Exception as e:
            return f"处理图像时出错: {str(e)}"
