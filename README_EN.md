[中文 README](README.md)

# 📚 Snap-Solver

> Quick solutions at your fingertips — your smart question-solving assistant

Snap-Solver is a smart tool that solves questions for you. Simply **press a hotkey**, and it will automatically recognize the question and provide detailed answers **on another device**.

## ✨ Key Features

- 🎯 **One-click Screenshot**: Capture your screen remotely with a hotkey (customizable)
- 🌐 **LAN Sharing**: Deploy once, use anywhere on all devices under the same network
- 🔍 **Smart Image Recognition**: Use LLM interfaces to recognize text from images and edit results
- 🤖 **AI-Powered Solutions**: Deep question analysis using GPT-4o and Claude-3.5 models
- 🔐 **VPN Proxy Support**: Customizable VPN settings for users in restricted regions
- 💻 **Cross-platform Compatibility**: Works on Windows, macOS, Linux, iOS, and Android

## 📞 Support

- **Bug Reports**: Please submit an Issue
- For access to the **Pro Version**, email us at [zylanjian@outlook.com](mailto:zylanjian@outlook.com)

| Feature           | Basic Version                                | Pro Version                            |
|-------------------|----------------------------------------------|----------------------------------------|
| **Technical Support** | Self-setup, basic documentation         | Remote setup, custom support & FAQs    |
| **AI Models**     | Basic GPT-4o model                           | Enhanced with Claude-3.5-sonnet (new)  |
| **Convenience**   | Manual setup, requires CLI to stay open     | One-click start, auto-configured       |
| **VPN Proxy**     | Limited, no custom VPN support              | Full VPN proxy support                 |
| **Hotkeys**       | Fixed to `Alt + Ctrl + S`                   | Customizable hotkeys                   |

## 📋 Prerequisites

1. **OpenAI API Key**:
   - Visit [OpenAI](https://openai.com) and register
   - Obtain an API Key in your account settings

2. **Runtime Environment**:
   - [Node.js](https://nodejs.org/) version 14.0 or higher
   - [Python](https://www.python.org/downloads/) version 3.x

## 🚀 Quick Start

1. **Set Up Environment**: Make sure Node.js and Python3 are installed and accessible in your system path.

2. **Install Dependencies**:
   - Open a terminal and navigate to the project's root directory.
   - Install Node.js dependencies:
     ```bash
     npm install
     ```
   - Install Python dependencies:
     ```bash
     python3 -m pip install keyboard Pillow requests
     ```
     *(Windows users can use `python -m pip install`)*

3. **Configure API Key**: Create a `.env` file in the root directory with the following content:
   ```plaintext
   HOST=0.0.0.0
   PORT=3000
   OPENAI_API_KEY=your_api_key_here
   ```
   Replace `your_api_key_here` with your OpenAI API Key.

4. **Start the Service**: Run the following command in the terminal to start the service:
   ```bash
   npm start
   ```

## 💡 Usage Instructions

### 1. Accessing the Service

- **Local Access**: Open your browser and go to http://localhost:3000
- **LAN Access**: Use http://[Server IP]:3000 on other devices in the same network  
  > 💡 The server IP will be shown in the console at startup.

### 2. Solving Questions via Screenshot

1. Press `Alt + Ctrl + S`  
2. Drag to select the question area  
3. Release the mouse to complete the screenshot  
4. Wait for the system to process and answer

### 3. Manual Question Input

For blurry screenshots or manual input:
1. Click "Analyze Text First"
2. Paste your question text into the input box
3. Click "Solve" to get an answer

## 🔧 Troubleshooting

### 1. Screenshot Not Working?

- **Windows**: 
  - Run with administrator privileges
  - Check if Python processes are active in Task Manager

- **MacOS/Linux**: 
  - Ensure screen recording permissions are granted
  - Restart the app if needed

### 2. Service Not Accessible?

1. Check firewall settings
2. Ensure the port (default 3000) is not in use
3. Verify devices are on the same LAN

### 3. API Call Failed?

1. Verify API Key setup
2. Check if API Key has sufficient usage limits
3. Ensure network connection is stable

## 🔐 Security Recommendations

1. Do not share your API Key
2. Regularly update your system and dependencies
3. Use only in a trusted network environment

## 🤝 Contributing

Contributions are welcome!  

1. Fork the repository  
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📜 License

This project is licensed under the [MIT](LICENSE) License.

---

💝 If you found this project helpful, please give it a Star! Thank you!