[English README](README_EN.md)

# 📚 Snap-Solver-基础版

> 一键识题，自动解答 —— 你的智能解题助手

Snap-Solver 是一个智能题目解答工具，只需**按下快捷键**，即可**在另一台设备上**自动识别题目并给出详细解答。

## ✨ 特色功能

- 🎯 **一键截图**：使用快捷键（可自定义）即可远程监控电脑屏幕
- 🌐 **局域网共享**：一处部署，多处使用，同一网络下**所有设备**都是监控设备
- 🔍 **智能识图**：使用Mathpix接口识别图片，可对识别结果进行编辑修改
- 🤖 **AI 解答**：混合使用 GPT-4o 及 Claude-3.7 来深度解析题目
- 🔐 **VPN代理支持**：可自定义VPN代理，支持国内用户通过代理访问 gpt 及 claude
- 💻 **跨平台支持**：Windows、MacOS、Linux、ios、Android全平台可用
> 此版本为基础版，只包含gpt实现，需要命令行启动。
> 如需获取**高级版本**或者**部署帮助**，请发送邮件至 [zylanjian@outlook.com](mailto:zylanjian@outlook.com) 

## 📋 使用前准备

1. **OpenAI API Key**: 
   - 访问 [OpenAI 官网](https://openai.com) 注册账号
   - 在 API 设置页面获取 API Key

2. **运行环境**:
   - [Node.js](https://nodejs.org/) 14.0 或更高版本
   - [Python](https://www.python.org/downloads/) 3.x 版本

## 🚀 快速开始

1. **安装环境**：确保系统中安装了 Node.js 和 Python3，并加入环境变量路径。

2. **安装依赖**：
   - 打开终端（或命令提示符），进入项目根目录。
   - 执行以下命令安装 Node.js 依赖：
     ```bash
     npm install
     ```
   - 安装 Python 依赖：
     ```bash
     python3 -m pip install keyboard Pillow requests
     ```
     （**Windows 用户**可以使用 `python -m pip install`）

3. **配置 API 密钥**：在项目根目录创建 `.env` 文件，写入以下内容：
   ```plaintext
   HOST=0.0.0.0
   PORT=3000
   OPENAI_API_KEY=your_api_key_here
   ```
   将 `your_api_key_here` 替换为您的 OpenAI API 密钥。

4. **启动项目**：在终端（或命令提示符）中执行以下命令启动服务：
   ```bash
   npm start
   ```

## 💡 使用说明

### 1. 访问服务

- **本机访问**：打开浏览器，访问 http://localhost:3000
- **局域网访问**：其他设备使用 http://[服务器IP]:3000
  > 💡 服务器 IP 会在启动时显示在控制台中

### 2. 截图解题

1. 按下 `Alt + Ctrl + S` 组合键
2. 拖动鼠标选择题目区域
3. 松开鼠标完成截图
4. 等待系统自动处理和解答

### 3. 手动解题

如果截图不清晰或需要手动输入：
1. 点击"分析文本再解题"
2. 将题目文本粘贴到输入框
3. 点击"解答"获取结果

## 💡 配置修改说明

打开`config.js`，找到如下字段：
```js
extractionModel: 'gpt-4o-mini',
solvingModel: 'gpt-4o-2024-08-06',
maxTokens: 1000
```
其中`extractionModel`是文字识别模型，默认`gpt-4o-mini`，
`solvingModel`是解题模型，默认`gpt-4o-2024-08-06`


## 📞 获取帮助

- bug问题：请提交 Issue
- 如需获取**高级版本**或者**部署帮助**，请发送邮件至 [zylanjian@outlook.com](mailto:zylanjian@outlook.com) 

| 功能                | 基础版（此版本）                                    | 高级版                              |
|--------------------|------------------------------------------|--------------------------------------------|
| **技术支持**    | 自行部署，提供基本文档支持                                | 远程代部署，提供定制和 FAQ 支持           |
| **AI 模型**       | 基础 gpt-4o 模型                                    | 启用 Mathpix 进行文字OCR，Claude-3.7-thinking 进行题目解析      |
| **VPN代理**       | 不支持自定义代理，全端口vpn可用                                | 支持VPN代理，更适应国内网络环境           |
| **快捷键**    | 仅支持 `alt+ctrl+s` 快捷键                            | 解放键盘，全程手机端输入         |
| **模型配置**    | 电脑本地文件写入密钥和参数                            | 全程手机参数输入，灵活修改         |


## 🔧 常见问题

### 1. 截图功能无响应？

- **Windows**: 
  - 确保以管理员权限运行
  - 检查任务管理器中是否有 Python 进程

- **MacOS/Linux**: 
  - 检查是否授予了屏幕录制权限
  - 尝试重新运行

### 2. 服务无法访问？

1. 检查防火墙设置
2. 确认使用的端口（默认3000）未被占用
3. 验证其他设备是否在同一局域网内

### 3. API 调用失败？

1. 检查 API Key 是否正确设置
2. 确认 API Key 是否有足够的额度
3. 检查网络连接是否正常

## 🔐 安全建议

1. 避免将 API Key 分享给他人
2. 定期更新系统和依赖包
3. 建议只在可信任的局域网中使用

## 🤝 参与贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建你的功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交你的修改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 提交 Pull Request

## 📜 开源协议

本项目采用 [MIT](LICENSE) 协议。

---

💝 如果这个项目对你有帮助，请给个 Star！感谢支持！
