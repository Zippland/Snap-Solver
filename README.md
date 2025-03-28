[English](README_EN.md) | 中文

# 📚 Snap-Solver - AI笔试测评工具

> 🔍 一键识别，自动解答

## ✨ 项目简介

Snap-Solver 是一个强大的AI笔试测评工具，只需**按下快捷键**，即可自动截取您电脑屏幕上的题目，通过 AI 进行识别并给出详细解答。无论是数学题、物理题、化学题、编程问题还是其他学术问题，Snap-Solver 都能为您提供专业的解答。

<img src="pic.jpg" alt="Snap-Solver 截图" width="400" />

### 📞 代部署支持

如果您不擅长编程，需要该软件的**代部署服务**，可发送邮件至：[zylanjian@outlook.com](mailto:zylanjian@outlook.com)

## 🌟 核心功能

- 🖼️ **一键截图**：在手机上使用**截屏**按钮，即可远程监控电脑屏幕
- 🌐 **局域网共享**：一处部署，多处使用，同一网络下**所有设备**均可监控电脑
- 🔍 **OCR 文字识别**：支持 Mathpix API 识别数学公式和图片中的文字
- 🧠 **多模型支持**：同时支持 GPT、o3、Claude 和 DeepSeek 等多种 AI 模型
- 🔐 **VPN 代理支持**：可自定义 VPN 代理，支持国内用户通过代理访问
- 💻 **全平台支持**：Windows、MacOS（暂未调试）、Linux 系统可用，手机端可通过浏览器访问

## 🛠️ 技术架构

- **后端**：Flask + SocketIO，提供 Web 服务和 WebSocket 实时通信
- **前端**：HTML + CSS + JavaScript，提供直观的用户界面
- **AI 接口**：

   OpenAI:
  - GPT-4o
  - o3-mini

  Anthropic:
  - Claude-3.7-Sonnet

  DeepSeek:
  - DeepSeek-r1
  - DeepSeek-v3

  Mathpix:
  - Mathpix OCR

## 📋 使用前准备

1. **API Keys**: 
   - [OpenAI API Key](https://openai.com)（可选）
   - [Anthropic API Key](https://anthropic.com)（可选，推荐✅）
   - [DeepSeek API Key](https://deepseek.com)（可选，不推荐❌）
   - [Mathpix API Key](https://mathpix.com)（推荐✅）

2. **运行环境**:
   - [Python](https://www.python.org/downloads/) 3.x 版本
   - 必要的 Python 依赖包

## 🚀 快速开始

1. **启动应用**:
   ```bash
   python app.py
   ```

2. **访问服务**:
   - 💻 本机访问：
      打开浏览器，访问 http://localhost:5000
   - 📱 移动设备访问：
      使用同一局域网内的手机、平板等设备访问 `http://[服务器IP]:5000`

## 💡 使用指南

### 1. 首次配置

首次使用时，点击右上角的⚙️设置图标，配置：
- AI 模型 API 密钥（至少需要一个）
- OCR 识别设置（可选；为节约token成本，强烈推荐）
- 代理设置（如需）
- 系统提示词（可自定义）

### 2. 截图解题

1. 按下手机或平板上的 `截屏` 按钮键
2. 在手机或平板上，会自动显示您的电脑屏幕截图
3. 在移动设备上裁剪您想解答的题目区域
4. 选择"发送图片至 AI"（直接分析图片）或"提取图中文本"（先识别文字再分析）
5. 等待系统处理并查看详细解答

### 3. 文本解题

如果已有题目文本，或者想要修改识别出的文字：
1. 使用"提取图中文本"功能
2. 编辑文本框中的内容
3. 点击"发送文本至 AI"获取解答

## ⚙️ 高级配置

您可以在设置面板中自定义多项参数：

- **AI 模型**：选择不同的 AI 模型（GPT-4o、o3-mini、Claude-3.7、DeepSeek-r1 等）
- **语言**：设置 AI 回答的首选语言
- **温度**：调整 AI 回答的随机性（较低值更精确，较高值更创意）
- **思考深度**： Claude专属参数，可调整思维模式
- **系统提示词**：自定义 AI 的基础行为指令
- **代理设置**：配置 HTTP 代理，便于国内用户访问

## 📞 获取帮助

- 如有 bug 问题：请在本仓库提交 Issue
- 如需**部署帮助**，可联系：[zylanjian@outlook.com](mailto:zylanjian@outlook.com)

## 🔧 常见问题

### 1. 截图功能无响应？
- 确保以管理员权限运行应用
- 检查是否授予了屏幕录制权限
- 确认 Python 进程正在运行

### 2. 无法连接服务？
- 检查防火墙设置
- 确认移动设备与电脑在同一局域网
- 验证服务器 IP 地址是否正确

### 3. API 调用失败？
- 检查 API Key 是否正确设置
- 确认网络连接是否正常
- 如使用代理，检查代理设置是否正确

## 🔐 安全提示

- 您的 API 密钥存储在本地，不会上传到任何服务器
- 建议只在可信任的局域网中使用本服务
- 定期更新系统和依赖包以保障安全

## 🤝 参与贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 提交 Pull Request

## 📜 开源协议

本项目采用 [Apache 2.0](LICENSE) 协议。

---

⭐ 如果这个项目对您有帮助，请给个 Star！感谢支持！
