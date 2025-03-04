# Snap Solver II

## 项目概述

Snap Solver II 是基于 Snap Solver 进化而来的强大的截图分析工具，可以帮助用户捕获屏幕内容，提取文本，并使用多种先进的AI模型进行智能分析。该应用程序使用Flask作为后端，提供网页界面，同时在系统托盘中运行，方便快速访问。

## 主要功能

- **屏幕捕获**：快速截取屏幕图像
- **文本提取**：从图像中自动识别和提取文本（通过 mathpix 模型）
- **AI分析**：使用多种AI模型（包括GPT-4o、Claude、DeepSeek等）对提取的内容进行智能分析
- **实时响应**：通过WebSocket技术实现实时交互和响应
- **系统托盘集成**：应用在后台运行，通过系统托盘图标轻松访问

## 技术栈

- **后端**：Flask, Flask-SocketIO
- **前端**：HTML5, CSS3, JavaScript
- **AI模型集成**：
  - GPT-4o
  - Claude
  - DeepSeek （尚在优化中）
- **图像处理**：Pillow, Mathpix
- **系统集成**：pyautogui, pystray

## 安装指南

### 环境要求

- Python 3.8+
- pip（Python包管理器）

### 安装步骤

1. **克隆仓库**

```bash
git clone https://github.com/yourusername/Snap-Solver-II.git
cd Snap-Solver-II
```

2. **创建并激活虚拟环境**（推荐）

```bash
python -m venv .venv
# Windows
.venv\Scripts\activate
# Linux/Mac
source .venv/bin/activate
```

3. **安装依赖**

```bash
pip install -r requirements.txt
```

4. **启动应用**

```bash
python app.py
```

应用启动后，会在系统托盘中显示一个图标，同时在同一局域网下的浏览器中访问 `http://XXX.XXX.XXX.XXX:5000` 即可打开Web界面。

## 使用说明

1. **截图分析**：
   - 点击"截图"按钮捕获屏幕内容
   - 系统自动提取图像中的文本
   - 选择AI模型进行智能分析

2. **文本分析**：
   - 直接输入或粘贴文本内容
   - 选择合适的AI模型进行分析
   - 获取实时智能响应

## API密钥配置

本应用集成了多种AI模型，需要相应的API密钥才能正常工作：

- OpenAI (GPT-4o)
- Anthropic (Claude)
- DeepSeek
- Mathpix

请确保在使用相应功能前配置正确的API密钥。

## 注意事项

- 应用默认在端口5000上运行
- 首次使用时可能需要授予屏幕截图权限
- 所有分析都在本地处理，但AI请求会发送到相应的服务提供商

## 贡献指南

欢迎贡献代码、报告问题或提出功能建议！请通过以下方式参与项目：
1. Fork仓库
2. 创建功能分支 (git checkout -b feature/amazing-feature)
3. 提交更改 (git commit -m 'Add some amazing feature')
4. 推送到分支 (git push origin feature/amazing-feature)
5. 创建Pull Request

## 许可证
[Apache License](LICENCE.md)