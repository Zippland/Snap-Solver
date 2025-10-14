# Snap-Solver 零基础上手教程

这篇教程面向第一次接触编程或 Python 的朋友，手把手带你从安装环境开始，直到在电脑和手机上顺利使用 Snap-Solver 完成题目分析。如果你在任何步骤遇到困难，建议按章节逐步检查，或对照文末的常见问题排查。

---

## 1. Snap-Solver 是什么？

Snap-Solver 是一个本地运行的截屏解题工具，主要功能包括：
- 一键截取电脑屏幕的题目图片；
- 自动调用 OCR（文字识别）和多种大模型，给出详细解析；
- 支持在手机、平板等局域网设备上实时查看结果；
- 可以按需配置代理、中转 API、自定义提示词等高级选项。

整个应用基于 Python + Flask，只要能启动一个 Python 程序，就可以完全离线地掌握它的运行方式。

---

## 2. 准备清单

- 一台可以联网的 Windows、macOS 或 Linux 电脑；
- 至少一个可用的模型 API Key（推荐准备 2~3 个，方便切换）：
  - OpenAI、Anthropic、DeepSeek、阿里灵积（Qwen）、Google、Mathpix 等任一即可；
- 约 2 GB 可用硬盘空间；
- 基本的文本编辑器（Windows 自带记事本即可，推荐使用 VS Code / Notepad++ 等更易读的工具）。

> **提示**：Snap-Solver 不依赖显卡或 GPU，普通轻薄本即可顺利运行。

---

## 3. 第一次打开命令行

Snap-Solver 需要在命令行里执行几条简单的指令。命令行是一个黑色（或白色）窗口，通过输入文字来让电脑完成任务。不同系统打开方式略有区别：

### 3.1 Windows
1. 同时按下键盘 `Win` 键（左下角带 Windows 徽标的键）+ `S`，输入 `cmd` 或 `terminal`。
2. 选择 **命令提示符（Command Prompt）** 或 **Windows Terminal**，回车打开。
3. 复制命令时，可在窗口上点击右键 → 「粘贴」，或使用快捷键 `Ctrl + V`。
4. 想切换到某个文件夹（例如 `D:\Snap-Solver`），输入：
   ```powershell
   cd /d D:\Snap-Solver
   ```
5. 查看当前文件夹内的内容：
   ```powershell
   dir
   ```

### 3.2 macOS
1. 同时按下 `Command + Space` 呼出 Spotlight，输入 `Terminal` 并回车。
2. 在终端中，复制粘贴使用常规快捷键 `Command + C` / `Command + V`。
3. 切换到下载好的项目目录（例如在「下载」文件夹内）：
   ```bash
   cd ~/Downloads/Snap-Solver
   ```
4. 查看当前文件夹内容：
   ```bash
   ls
   ```

### 3.3 Linux（Ubuntu 示例）
1. 同时按 `Ctrl + Alt + T` 打开终端。
2. 切换到项目目录：
   ```bash
   cd ~/Snap-Solver
   ```
3. 查看内容：
   ```bash
   ls
   ```

> **常用命令速记**
> - `cd 路径`：进入某个文件夹（路径中有空格请用双引号包住，例如 `cd "C:\My Folder"`）。
> - `dir`（Windows）/`ls`（macOS、Linux）：查看当前文件夹下的文件。
> - 键盘方向键 ↑ 可以快速调出上一条命令，避免重复输入。

---

## 4. 安装 Python 3

Snap-Solver 基于 Python 3.9+，推荐使用 3.10 或 3.11 版本。

### 4.1 Windows
1. 打开浏览器访问：https://www.python.org/downloads/
2. 点击最新的稳定版（例如 `Python 3.11.x`）的 **Download Windows installer (64-bit)**。
3. 双击下载的安装包，记得在第一步勾选 **Add Python to PATH**。
4. 按提示完成安装。
5. 打开命令行窗口，输入：
   ```powershell
   python --version
   pip --version
   ```
   若能看到版本号（如 `Python 3.11.7`），说明安装成功。

### 4.2 macOS
1. 访问 https://www.python.org/downloads/mac-osx/ 下载 `macOS 64-bit universal2 installer`。
2. 双击 `.pkg` 文件按提示安装。
3. 打开终端输入：
   ```bash
   python3 --version
   pip3 --version
   ```
   如果输出版本号，表示安装完成。后续命令中的 `python`、`pip` 均可替换为 `python3`、`pip3`。

### 4.3 Linux（Ubuntu 示例）
```bash
sudo apt update
sudo apt install python3 python3-venv python3-pip -y
python3 --version
pip3 --version
```

---

## 5. （可选）安装 Git

Git 方便后续更新项目，也可以用来下载代码。
- Windows：https://git-scm.com/download/win
- macOS：在终端输入 `xcode-select --install` 或从 https://git-scm.com/download/mac 获取
- Linux：`sudo apt install git -y`

如果暂时不想安装 Git，也可以稍后直接下载压缩包。

---

## 6. 获取 Snap-Solver 项目代码

任选其一：
1. **使用 Git 克隆（推荐）**
   ```bash
   git clone https://github.com/Zippland/Snap-Solver.git
   cd Snap-Solver
   ```
2. **下载压缩包**
   - 打开项目主页：https://github.com/Zippland/Snap-Solver
   - 点击右侧 `Release` → `Source code (zip)`
   - 解压缩后，将文件夹重命名为 `Snap-Solver` 并记住路径

后续步骤默认你已经位于项目根目录（包含 `app.py`、`requirements.txt` 的那个文件夹）。如果忘记位置，可再次查看文件夹并使用 `cd` 进入。

---

## 7. 创建虚拟环境并安装依赖

虚拟环境可以把项目依赖和系统环境隔离，避免冲突。

### 7.1 创建虚拟环境

- **Windows PowerShell**
  ```powershell
  python -m venv .venv
  .\.venv\Scripts\Activate
  ```
- **macOS / Linux**
  ```bash
  python3 -m venv .venv
  source .venv/bin/activate
  ```

激活成功后，命令行前面会出现 `(.venv)` 前缀。若你关闭了命令行窗口，需要重新进入项目目录并再次执行激活命令。

### 7.2 安装依赖

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

常见依赖（Flask、PyAutoGUI、Pillow 等）都会自动安装。首次安装可能用时 1~5 分钟，请耐心等待。

> **如果安装失败**：请检查网络、切换镜像源或参考文末常见问题。

---

## 8. 首次启动与访问

1. 保证虚拟环境处于激活状态。
2. 在项目根目录执行：
   ```bash
   python app.py
   ```
3. 终端中会看到 Flask/SocketIO 的日志，最后出现 `Running on http://127.0.0.1:5000` 表示启动成功。
4. 若需要在手机/平板访问，请在**同一局域网下**输入 `http://<电脑IP>:5000`。电脑 IP 可在终端日志中看到，例如 `http://192.168.1.8:5000`（可能是别的，每次打开都会刷新）。

> **暂停服务**：在终端按 `Ctrl + C` 即可停止运行。再次启动时，只需重新激活虚拟环境并执行 `python app.py`。

---

## 9. 配置 API 密钥与基础设置

启动网页后，点击右上角的齿轮图标进入「设置」面板，建议先完成以下几项：

### 9.1 填写模型 API Key

- 根据你手上的 Key，将对应值填入设置页面的输入框中；
- 常用字段：
  - `OpenaiApiKey`：OpenAI 模型（如 GPT-4o、o3-mini）
  - `AnthropicApiKey`：Claude 系列
  - `DeepseekApiKey`：DeepSeek
  - `AlibabaApiKey`：通义千问 / Qwen / QVQ
  - `GoogleApiKey`：Gemini 系列
  - `MathpixAppId` & `MathpixAppKey`：用于高精度公式识别
- 点击保存后，信息会写入 `config/api_keys.json` 方便下次启动直接读取。

### 9.2  设置代理与中转（可选）

- 若你需要走代理或企业中转通道，可在设置面板中开启代理选项；
- 对应的 JSON 文件是 `config/proxy_api.json`，可直接编辑来指定各模型的自定义 `base_url`；
- 修改后需重启应用才能生效。

### 9.3 如何确认 VPN/代理端口

很多加速器或 VPN 客户端会在本地启动一个「系统代理」服务（常见端口如 `7890`、`1080` 等）。具体端口位置通常可以通过以下途径找到：
- 打开 VPN 客户端的设置页面，寻找「本地监听端口」「HTTP(S) 代理」「SOCKS 代理」等字样；
- Windows 用户也可以在「设置 → 网络和 Internet → 代理」里查看「使用代理服务器」的地址和端口；
- macOS 用户可在「系统设置 → 网络 → Wi-Fi（或以太网）→ 详情 → 代理」里查看勾选的服务和端口；
- 高级用户可以在命令行里运行 `netstat -ano | findstr 127.0.0.1`（Windows）或 `lsof -iTCP -sTCP:LISTEN | grep 127.0.0.1`（macOS/Linux）确认本地监听端口。

拿到端口后，在 Snap-Solver 的代理设置中填入对应的地址（通常是 `127.0.0.1:<端口>`），就能让模型请求走 VPN。不同工具的界面名称可能略有差异，重点是找出「本地监听地址 + 端口号」这一对信息。

---

## 10. 获取常用 API Key（详细教程）

API Key 相当于你在各大模型平台上的「门票」。不同平台的获取流程不同，以下列出了最常用的几个来源。申请过程中务必保护好个人隐私与账号安全，切勿向他人泄露密钥。

### 10.1 OpenAI（GPT-4o / o3-mini 等）
1. 打开 https://platform.openai.com/ 并使用邮箱或第三方账号注册 / 登录。
2. 首次使用需完成实名和支付方式绑定（可选择信用卡或预付费余额）。
3. 登录后点击右上角头像 → `View API keys`。
4. 点击 `Create new secret key`，复制生成的密钥（形如 `sk-...`）。
5. 将该密钥粘贴到 Snap-Solver 的 `OpenaiApiKey` 输入框，并妥善保存。

### 10.2 Anthropic（Claude 系列）
1. 打开 https://console.anthropic.com/ 并注册账号。
2. 按提示完成手机号验证和支付方式绑定（部分国家需排队开通）。
3. 登录后进入 `API Keys` 页面，点击 `Create Key`。
4. 复制生成的密钥（形如 `sk-ant-...`），粘贴到 Snap-Solver 的 `AnthropicApiKey`。

### 10.3 DeepSeek
1. 访问 https://platform.deepseek.com/ 并注册登录。
2. 如果需要人民币支付，可在「账号设置」绑定支付宝；海外用户可使用信用卡。
3. 进入 `API Keys`，点击 `新建密钥`。
4. 复制生成的密钥（形如 `sk-xxx`），填入 `DeepseekApiKey`。

### 10.4 阿里云通义千问 / Qwen / QVQ
1. 打开 https://dashscope.console.aliyun.com/ 并使用阿里云账号登录。
2. 进入「API Key 管理」页面，点击 `创建 API Key`。
3. 复制密钥（形如 `sk-yourkey`）填入 `AlibabaApiKey`。
4. 如需开通收费模型，请在「计费与配额」中先完成实名认证并开通付费策略。

### 10.5 Google Gemini
1. 前往 https://ai.google.dev/ 并登录 Google 账号。
2. 点击右上角 `Get API key`。
3. 选择或创建项目，生成新的 API Key。
4. 将密钥填入 `GoogleApiKey`。

### 10.6 Mathpix（高精度公式识别）
1. 访问 https://dashboard.mathpix.com/ 注册账号。
2. 完成邮箱验证后，在侧边栏找到 `API Keys`。
3. 创建新的 App，复制 `App ID` 和 `App Key`。
4. 分别填入 Snap-Solver 的 `MathpixAppId` 与 `MathpixAppKey` 字段。

> **安全小贴士**
> - API Key 和密码一样重要，泄露后他人可能代你调用接口、消耗额度。
> - 建议为不同用途创建多个密钥，定期检查和撤销不用的密钥。
> - 如果平台支持额度上限、IP 白名单等功能，可以酌情启用以降低风险。

---

## 11. 完成第一次题目解析

1. 确认右上角的「连接状态」显示为绿色的「已连接」。
2. 点击顶部的「开始截图」，按提示框拖拽需要识别的题目区域。
3. 截图完成后，预览区会显示图片，并出现「发送至 AI」或「提取文本」按钮：
   - **发送至 AI**：直接让所选模型解析图像；
   - **提取文本**：先做 OCR，把文字复制出来，再发送给模型。
4. 在右侧的「分析结果」面板可以查看：
   - AI 的思考过程（可折叠）；
   - 最终解答、代码或步骤；
   - 中间日志与计时。
5. 若需要改用其他模型，重新打开设置面板即可实时切换。

> **小技巧**：长按或双击分析结果中的文本，可快速复制粘贴；终端会实时输出请求日志，方便排查问题。

---

## 12. 常见问题速查

- **`python` 命令找不到**：在 Windows 上打开新的终端后请重启电脑，或使用 `py` 命令；macOS/Linux 请尝试 `python3`。
- **`pip install` 超时**：可以临时使用清华源 `pip install -i https://pypi.tuna.tsinghua.edu.cn/simple -r requirements.txt`。
- **启动后网页打不开**：确认终端没有报错；检查防火墙、端口占用，或尝试 `http://127.0.0.1:5000`。
- **截图没反应**：Windows/macOS 需要授权「辅助功能 / 截屏」权限给 Python；macOS 在「系统设置 - 隐私与安全」中勾选 `python` 或终端应用。
- **模型报 401/403**：检查 API Key 是否正确、账号余额是否充足，必要时在设置里更换模型或填入自定义域名。
- **手机访问失败**：确保手机和电脑在同一个 Wi-Fi 下，且电脑未开启 VPN 导致局域网隔离。

---

## 13. 进一步探索

- `config/models.json`：自定义展示在下拉框的模型列表，包含模型名称、供应商、能力标签等。
- `config/prompts.json`：定义默认 prompt，可根据学科优化。
- `config/api_base_urls.json`：为不同模型指定默认 `base_url`。
- `static/` 与 `templates/`：自定义网页 UI 样式、增加功能按钮。
- 更新项目：如果是 Git 克隆，执行 `git pull`；压缩包用户可重新下载覆盖。

完成以上步骤后，你已经具备运行和日常使用 Snap-Solver 的全部基础。如果你有新的需求或遇到无法解决的问题，可以先查看 README 或在 Issues 中搜索 / 提问。祝你学习顺利，刷题提效！
