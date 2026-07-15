# Snap-Solver 零基础上手教程

这篇教程面向第一次接触编程或 Python 的朋友，手把手带你从安装环境开始，直到在电脑和手机上顺利使用 Snap-Solver 完成题目分析。如果你在任何步骤遇到困难，建议按章节逐步检查，或对照文末的常见问题排查。

---

## 1. Snap-Solver 是什么？

Snap-Solver 是一个在你自己电脑上运行的截屏解题工具。它的工作方式是「**手机遥控电脑**」：

- 电脑上运行程序，手机浏览器打开页面；
- 手机上点一下 **截屏解题**，电脑自动截取它的整个屏幕并回传手机；
- 在手机上缩放、框选题目区域，交给你选择的 AI 模型；
- AI 流式给出解答——推理模型的思考过程实时可见，答案支持公式和代码渲染；
- 答案没看懂，还可以**就这道题继续追问**。

整个应用基于 Python + Flask，密钥和数据都只存在你的电脑上，不经过任何第三方服务器。

---

## 2. 准备清单

- 一台可以联网的 Windows、macOS 或 Linux 电脑，以及一部同一 Wi-Fi 下的手机；
- 至少一个可用的模型 API Key（推荐准备 2~3 个，方便切换），六选一即可：
  - Anthropic（Claude）、OpenAI（GPT）、Google（Gemini）、阿里通义（Qwen）、字节豆包、Moonshot（Kimi）；
  - 国内网络环境建议优先申请 **阿里通义 / 豆包 / Kimi**，无需代理即可直连；
- 约 2 GB 可用硬盘空间。

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
3. 终端中会看到 Flask/SocketIO 的日志，出现 `Running on http://...:5000` 表示启动成功（若 5000 端口被其他程序占用，会自动改用 5001，以终端打印的地址为准）。
4. 手机/平板访问：确保与电脑在**同一局域网（同一 Wi-Fi）**下，浏览器输入终端里打印的地址，例如 `http://192.168.1.8:5000`。电脑重连网络后 IP 可能变化，连不上时回终端重新确认。

> **暂停服务**：在终端按 `Ctrl + C` 即可停止运行。再次启动时，只需重新激活虚拟环境并执行 `python app.py`。

---

## 9. 配置 API 密钥与基础设置

### 9.1 首次打开：跟着引导走

第一次在手机上打开页面，会看到一段工作机制说明，点 **「知道了，去选模型」** 直接进入模型选择页：

1. 顶部横排是六家厂商的标签（带小圆点的表示还没配密钥）；
2. 选中你有密钥的厂商，页面顶部会出现**密钥填写卡**——粘贴密钥、点保存即可；
3. 卡片右上角有 **「如何获取」** 链接，直达该厂商的密钥申请页面；
4. 在「全部模型」列表里点选一个模型，**选择即生效**，无需确认按钮。

之后想换模型或换密钥：点首页底部的**模型卡片**随时进入这个页面；已配的密钥会沉底显示，点「修改」可以更换（**清空后保存 = 删除该密钥**）。

### 9.2 设置页一览

点右上角的齿轮进入设置，共三组：

- **解题**：提示词模式（内置多种，也可自建）、回复语言；
- **模型接入**：API 密钥（集中管理六家，就地展开编辑）、网络（代理与中转）；
- **通用**：外观（浅色/深色/跟随系统）、GitHub 仓库、关于与检查更新。

所有密钥只保存在你电脑的 `.snapsolver/api_keys.json` 里（该目录已被 git 忽略，不会被误提交）。

### 9.3 设置代理与中转（可选）

在 **设置 → 网络** 中：

- **HTTP 代理**：打开开关，填本地代理的主机和端口（如 `127.0.0.1` / `7890`），用于访问 Anthropic、OpenAI、Google 等国际 API；
- **中转 API 地址**：每家厂商单独一栏，填了即走中转，留空走官方地址；
- 修改立即生效，无需重启应用。

### 9.4 如何确认 VPN/代理端口

很多加速器或 VPN 客户端会在本地启动一个「系统代理」服务（常见端口如 `7890`、`1080` 等）。具体端口位置通常可以通过以下途径找到：
- 打开 VPN 客户端的设置页面，寻找「本地监听端口」「HTTP(S) 代理」「SOCKS 代理」等字样；
- Windows 用户也可以在「设置 → 网络和 Internet → 代理」里查看「使用代理服务器」的地址和端口；
- macOS 用户可在「系统设置 → 网络 → Wi-Fi（或以太网）→ 详情 → 代理」里查看勾选的服务和端口；
- 高级用户可以在命令行里运行 `netstat -ano | findstr 127.0.0.1`（Windows）或 `lsof -iTCP -sTCP:LISTEN | grep 127.0.0.1`（macOS/Linux）确认本地监听端口。

拿到端口后，在 Snap-Solver 的代理设置中填入对应的地址（通常是 `127.0.0.1:<端口>`），就能让模型请求走 VPN。不同工具的界面名称可能略有差异，重点是找出「本地监听地址 + 端口号」这一对信息。

---

## 10. 获取常用 API Key（详细教程）

API Key 相当于你在各大模型平台上的「门票」。不同平台的获取流程不同，以下列出了最常用的几个来源。申请过程中务必保护好个人隐私与账号安全，切勿向他人泄露密钥。

### 10.1 Anthropic（Claude 系列）
1. 打开 https://console.anthropic.com/ 并注册账号。
2. 按提示完成手机号验证和支付方式绑定（部分国家需排队开通）。
3. 登录后进入 `API Keys` 页面，点击 `Create Key`。
4. 复制生成的密钥（形如 `sk-ant-...`），在 Snap-Solver 模型页选择 Anthropic 厂商后粘贴保存。

### 10.2 OpenAI（GPT 系列）
1. 打开 https://platform.openai.com/ 并使用邮箱或第三方账号注册 / 登录。
2. 首次使用需完成实名和支付方式绑定（可选择信用卡或预付费余额）。
3. 登录后进入 `API keys` 页面，点击 `Create new secret key`。
4. 复制生成的密钥（形如 `sk-...`），在模型页选择 OpenAI 厂商后粘贴保存。

### 10.3 Google Gemini
1. 前往 https://ai.google.dev/ 并登录 Google 账号。
2. 点击右上角 `Get API key`。
3. 选择或创建项目，生成新的 API Key（形如 `AIza...`）。
4. 在模型页选择 Google 厂商后粘贴保存。

### 10.4 阿里通义（Qwen / QVQ，国内直连）
1. 打开 https://dashscope.console.aliyun.com/ 并使用阿里云账号登录。
2. 进入「API Key 管理」页面，点击 `创建 API Key`。
3. 复制密钥（形如 `sk-...`），在模型页选择通义厂商后粘贴保存。
4. 如需开通收费模型，请在「计费与配额」中先完成实名认证并开通付费策略。

### 10.5 字节豆包（火山方舟，国内直连）
1. 打开 https://console.volcengine.com/ark 并注册 / 登录火山引擎账号。
2. 完成实名认证后，在左侧「API Key 管理」中创建 API Key。
3. 复制密钥，在模型页选择豆包厂商后粘贴保存。

### 10.6 Moonshot Kimi（国内直连）
1. 打开 https://platform.moonshot.cn/ 并注册 / 登录。
2. 进入「API Key 管理」，点击 `新建`。
3. 复制生成的密钥（形如 `sk-...`），在模型页选择 Kimi 厂商后粘贴保存。

> **安全小贴士**
> - API Key 和密码一样重要，泄露后他人可能代你调用接口、消耗额度。
> - 建议为不同用途创建多个密钥，定期检查和撤销不用的密钥。
> - 如果平台支持额度上限、IP 白名单等功能，可以酌情启用以降低风险。

---

## 11. 完成第一次题目解析

1. 电脑上把题目显示在屏幕上（网页、PDF、课件都可以）。
2. 手机页面左上角确认显示绿色的 **「已连接 · 电脑端」**。
3. 手机上点大圆按钮 **「截屏解题」**——电脑会自动截取整个屏幕并回传到手机。
4. 在手机上**双指缩放、拖动框选**题目区域（右上角实时显示所选区域的像素尺寸），点 **「发送解题」**。
5. 解答页会依次出现：
   - **思考过程**：推理模型的思考以淡色小字实时展开，结束后自动收起为一行，点击可重新展开回看；
   - **最终答案**：Markdown 渲染，公式清晰、代码块可一键复制；
   - 生成过程中可随时点右上角的停止按钮。
6. 答案出来之后：
   - 没看懂？在底部输入框**就这道题继续追问**，AI 会带着题目图片和之前的问答继续回答（换题或返回后自动清空）;
   - 想换个角度？答案下方有 **重解 / 换模型重解 / 复制** 三个快捷操作;
   - 继续刷题：返回首页再点「截屏解题」，上一次的框选位置会自动保留。

> **小技巧**：点击解答页顶部的题目缩略图可以全屏对照原题；终端会实时输出请求日志，方便排查问题。

---

## 12. 常见问题速查

- **`python` 命令找不到**：在 Windows 上打开新的终端后请重启电脑，或使用 `py` 命令；macOS/Linux 请尝试 `python3`。
- **`pip install` 超时**：可以临时使用清华源 `pip install -i https://pypi.tuna.tsinghua.edu.cn/simple -r requirements.txt`。
- **启动后网页打不开**：确认终端没有报错；检查防火墙、端口占用（5000 被占用时程序自动改用 5001，以终端打印的地址为准），或尝试 `http://127.0.0.1:5000`。
- **截图没反应 / 截出来是黑屏**：macOS 需在「系统设置 → 隐私与安全性 → 屏幕录制」中勾选终端（或运行 Python 的应用）并重启程序；Windows 一般无需额外授权。
- **模型报 401/403**：检查 API Key 是否正确、账号余额是否充足，必要时在设置里更换模型或填入自定义域名。
- **手机访问失败**：确保手机和电脑在同一个 Wi-Fi 下，且电脑未开启 VPN 导致局域网隔离。

---

## 13. 进一步探索

- **自建提示词**：设置 → 解题 → 提示词模式 → 新建，可为特定学科定制解题风格（存放在 `.snapsolver/prompts.json`）。
- **推理档位**：模型页当前模型卡上的 Fast / High / Max 三档，全局统一，复杂题目调高档位效果更好。
- `config/models.json`：模型列表的配置文件，进阶用户可按需增删模型。
- 更新项目：如果是 Git 克隆，执行 `git pull`；压缩包用户可重新下载覆盖。应用内「设置 → 关于 → 检查更新」也会提示新版本。

完成以上步骤后，你已经具备运行和日常使用 Snap-Solver 的全部基础。如果你有新的需求或遇到无法解决的问题，可以先查看 README 或在 Issues 中搜索 / 提问。祝你学习顺利，刷题提效！
