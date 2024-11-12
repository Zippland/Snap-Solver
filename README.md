# 📚 Snap-Solver

> 一键截题，快速解答 —— 你的智能解题助手

Snap-Solver 是一个智能题目解答工具，只需按下快捷键截图，即可自动识别题目内容并给出详细解答。支持部署在局域网中，让多个设备都能便捷使用。

## 📞 获取帮助

- 提交 Issue
- 联系作者以提供定制服务（如代部署、更多AI、国内访问等），请发送邮件至 [zylanjian@outlook.com](mailto:zylanjian@outlook.com)


## ✨ 特色功能

- 🎯 **一键截图**：使用快捷键（Alt+Ctrl+S）即可截取屏幕任意区域
- 🔍 **智能识别**：自动提取图片中的文字内容，支持各类题目格式
- 🤖 **AI 解答**：采用 GPT-4 模型，提供详细的解题思路和答案
- 🌐 **局域网共享**：一处部署，多处使用，支持家庭/教室场景
- 💻 **跨平台支持**：Windows、MacOS、Linux 全平台可用

## 📋 使用前准备

1. **OpenAI API Key**: 
   - 访问 [OpenAI 官网](https://openai.com) 注册账号
   - 在 API 设置页面获取 API Key

2. **运行环境**:
   - [Node.js](https://nodejs.org/) 14.0 或更高版本
   - [Python](https://www.python.org/downloads/) 3.x 版本

## 🚀 快速开始

### Windows 用户

1. 下载项目并在管理员权限下运行。
2. 使用命令提示符进入项目目录。
3. 安装 Node.js 和 Python3 的依赖，并确保将环境变量配置完整。
4. 在项目目录中手动`npm`启动服务，首次运行时请准备好 API Key。

### macOS/Linux 用户

1. 下载项目，打开终端进入项目目录。
2. 使用 `chmod +x` 赋予启动文件执行权限。
3. 安装所需的 Node.js 和 Python3 依赖，设置 `.env` 文件并配置 API Key。
4. 在终端中手动`npm`启动服务。

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

## ⚙️ 高级配置

### 修改配置文件 (.env)

```env
# 服务监听地址 (0.0.0.0 表示允许所有网络访问)
HOST=0.0.0.0

# 服务端口号
PORT=3000

# OpenAI API 密钥
OPENAI_API_KEY=your_api_key_here
```

### 自定义快捷键

修改 `snap.py` 中的快捷键设置：
```python
# 默认是 alt+ctrl+s
keyboard.add_hotkey('alt+ctrl+s', take_screenshot)
```

## 🔧 常见问题

### 1. 截图功能无响应？

- **Windows**: 
  - 确保以管理员权限运行
  - 检查任务管理器中是否有 Python 进程

- **MacOS/Linux**: 
  - 检查是否授予了屏幕录制权限
  - 尝试重新运行 `sudo ./start.sh`

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