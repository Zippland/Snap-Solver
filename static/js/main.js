/* ============================================================
   SnapSolver 主控制器（设计方案 1a/1d/1e/1f/1j 落地）
   状态机：body[data-view] = empty | workspace | answer
   核心流程：截屏解题(圆钮) → 框选工作台 → 发送解题 → 流式解答
   socket 契约：capture_screenshot / analyze_image / stop_generation
              screenshot_complete / ai_response（thinking 已在后端归一）
   入口：文件尾 DOMContentLoaded 顺序构造
        UIManager → SettingsManager(await ready) → ModelPage → SnapSolver
   ============================================================ */

class SnapSolver {
    constructor() {
        this.socket = null;
        this.cropper = null;
        this.originalImage = null;      // 回传的电脑全屏原图（data URL），重裁始终基于它
        this.lastCropBoxData = null;    // 上次裁剪框，连刷题预填
        this.lastImageData = null;      // 上次送出的裁剪图，重解/换模型重答用
        this.hasAnswer = false;         // 是否有一屏答案可返回（显式状态）
        this.autoFollow = true;         // 流式是否贴底跟随
        this.generating = false;
        this.thinkingText = '';
        this.thinkingStart = 0;
        this.solveStart = 0;
        this._sizeRaf = 0;

        // 同题追问（设计 4a/4b/4c）：历史由前端持有，随请求整体上送，后端无状态
        this.mainAnswerText = '';       // 主解答原始 markdown（复制/历史用）
        this.followupTurns = [];        // [{q, answerText, thinkingText, …DOM refs}]
        this.currentTurn = null;        // 生成中的追问轮，null = 事件路由到主解答
        this.followupGenerating = false;
    }

    /* ---------- 视图状态机 ---------- */
    setView(view) { document.body.setAttribute('data-view', view); }
    get view() { return document.body.getAttribute('data-view'); }

    el(id) { return document.getElementById(id); }

    /* ---------- 初始化 ---------- */
    initialize() {
        this.captureBtn = this.el('captureBtn');
        this.captureBtnLabel = this.el('captureBtnLabel');
        this.connectionStatus = this.el('connectionStatus');
        this.connectionText = this.el('connectionText');
        this.emptyDesc = this.el('emptyDesc');
        this.cropArea = document.querySelector('.crop-area');
        this.responseContent = this.el('responseContent');
        this.answerScroll = this.el('answerScroll');
        this.answerLabel = this.el('answerLabel');
        this.answerActions = this.el('answerActions');
        this.statusCluster = this.el('statusCluster');
        this.statusText = this.el('statusText');
        this.statusMeta = this.el('statusMeta');
        this.thinkingBlock = this.el('thinkingBlock');
        this.thinkingLabel = this.el('thinkingLabel');
        this.thinkingMeta = this.el('thinkingMeta');
        this.thinkingFull = this.el('thinkingFull');
        this.stopGenerationBtn = this.el('stopGenerationBtn');
        this.questionThumbImg = this.el('questionThumbImg');
        this.questionMeta = this.el('questionMeta');
        this.jumpLatest = this.el('jumpLatest');
        this.cropSizeReadout = this.el('cropSizeReadout');
        this.followupThread = this.el('followupThread');
        this.followupBar = this.el('followupBar');
        this.followupHint = this.el('followupHint');
        this.followupInput = this.el('followupInput');
        this.followupSend = this.el('followupSend');

        this.initializeMarkdownTools();
        this.setupEventListeners();
        this.connectToServer();

        // 模型入口卡随配置联动
        window.settingsManager.addEventListener('change', () => this.refreshModelEntry());
        this.refreshModelEntry();

        this.setView('empty');
    }

    /* ---------- 模型入口卡（空态底部，一等公民） ---------- */
    refreshModelEntry() {
        const s = window.settingsManager;
        const m = s.currentModel;
        const logo = this.el('modelEntryLogo');
        const name = this.el('modelEntryName');
        const sub = this.el('modelEntrySub');
        if (!m) {
            logo.textContent = '?';
            name.textContent = '选择模型';
            sub.textContent = '未选择模型';
            return;
        }
        const provider = m.provider || 'other';
        logo.textContent = (PROVIDER_TAB[provider] || provider).slice(0, 1);
        name.innerHTML = '';
        const nameText = document.createElement('span');
        nameText.textContent = m.display_name;
        name.appendChild(nameText);
        if (!s.hasKeyFor(m)) {
            const badge = document.createElement('span');
            badge.className = 'nokey-badge';
            badge.innerHTML = '<i class="fas fa-key"></i> 未配密钥';
            name.appendChild(badge);
        }
        sub.textContent = TIER_INFO[s.currentTier()]?.label || '';
    }

    /* ---------- Socket 连接 ---------- */
    connectToServer() {
        // 强制轮询：threading 后端 + 大图上传场景下 websocket 推送偶发停摆，
        // 局域网内轮询开销可忽略且经验上零丢失
        this.socket = io({ transports: ['polling'], upgrade: false, reconnectionAttempts: 5, reconnectionDelay: 1000, timeout: 20000 });

        this.socket.on('connect', () => {
            this.updateConnectionStatus(true);
            window.settingsManager.maybeStartOnboarding();
        });
        this.socket.on('disconnect', () => this.updateConnectionStatus(false));
        this.socket.on('connect_error', () => this.updateConnectionStatus(false));
        this.socket.on('reconnect', () => this.updateConnectionStatus(true));
        this.socket.on('reconnect_failed', () => this.updateConnectionStatus(false));

        this.socket.on('screenshot_complete', data => {
            this.restoreCaptureBtn();
            if (data.success) {
                this.originalImage = 'data:image/png;base64,' + data.image;
                this.openWorkspace();
            } else {
                window.uiManager.showToast('截图失败: ' + (data.error || '未知错误'), 'error');
            }
        });

        this.socket.on('ai_response', data => this.handleAiResponse(data));
    }

    updateConnectionStatus(connected) {
        this.connectionText.textContent = connected ? '已连接 · 电脑端' : '未连接';
        this.connectionStatus.classList.toggle('ok', connected);
        this.connectionStatus.classList.toggle('warn', !connected);
        this.captureBtn.disabled = !connected;
        this.emptyDesc.textContent = connected
            ? '将截取电脑的整个屏幕\n回传后在手机上框选题目'
            : '请先在电脑上运行 Snap-Solver\n手机与电脑同一网络后自动连接';
    }

    isConnected() { return this.socket && this.socket.connected; }

    /* ---------- 截图触发 ---------- */
    triggerCapture() {
        if (!this.isConnected()) {
            window.uiManager.showToast('未连接到电脑，请确认电脑端程序已启动', 'error');
            return;
        }
        this.captureBtn.disabled = true;
        this.captureBtn.querySelector('i').className = 'fas fa-spinner fa-spin';
        if (this.captureBtnLabel) this.captureBtnLabel.textContent = '截取中…';
        this.socket.emit('capture_screenshot', {});
    }

    restoreCaptureBtn() {
        this.captureBtn.disabled = !this.isConnected();
        const icon = this.captureBtn.querySelector('i');
        if (icon) icon.className = 'fas fa-camera';
        if (this.captureBtnLabel) this.captureBtnLabel.textContent = '截屏解题';
    }

    /* ---------- 框选工作台 ---------- */
    openWorkspace() {
        this.setView('workspace');
        this.initializeCropper();
    }

    initializeCropper() {
        try {
            if (this.cropper) { this.cropper.destroy(); this.cropper = null; }
            this.cropArea.innerHTML = '';
            this.cropSizeReadout.classList.add('hidden');

            const img = document.createElement('img');
            img.src = this.originalImage;   // 始终用原图，避免重裁劣化
            img.style.maxWidth = '100%';
            this.cropArea.appendChild(img);

            const self = this;
            this.cropper = new Cropper(img, {
                viewMode: 1,
                dragMode: 'crop',        // 拖动即画新框
                autoCrop: true,
                autoCropArea: 0.6,
                zoomable: true,
                zoomOnTouch: true,
                zoomOnWheel: true,
                movable: true,
                background: false,
                responsive: true,
                crop() { self.scheduleSizeReadout(); },
                ready() {
                    // 连刷题：预填上次裁剪框
                    if (self.lastCropBoxData) {
                        try { self.cropper.setCropBoxData(self.lastCropBoxData); } catch (e) {}
                    }
                    self.scheduleSizeReadout();
                }
            });
        } catch (e) {
            console.error('cropper init failed', e);
            window.uiManager.showToast('图片加载失败，请重新截图', 'error');
        }
    }

    // 裁剪框右上角的尺寸读数（原图像素）
    scheduleSizeReadout() {
        if (this._sizeRaf) return;
        this._sizeRaf = requestAnimationFrame(() => {
            this._sizeRaf = 0;
            if (!this.cropper) return;
            try {
                const data = this.cropper.getData(true);
                const box = this.cropper.getCropBoxData();
                const label = this.cropSizeReadout;
                label.textContent = `${data.width} × ${data.height}`;
                label.classList.remove('hidden');
                const w = label.offsetWidth;
                label.style.left = Math.max(8, box.left + box.width - w) + 'px';
                label.style.top = Math.max(8, box.top - 24) + 'px';
            } catch (e) {}
        });
    }

    exitWorkspace() {
        if (this.cropper) { this.cropper.destroy(); this.cropper = null; }
        this.setView(this.hasAnswer ? 'answer' : 'empty');
    }

    /* ---------- 发送解题 ---------- */
    sendForSolve() {
        let imageData;
        try {
            if (this.cropper) {
                this.lastCropBoxData = this.cropper.getCropBoxData();
                const canvas = this.cropper.getCroppedCanvas({
                    maxWidth: 2560, maxHeight: 1440, fillColor: '#fff',
                    imageSmoothingEnabled: true, imageSmoothingQuality: 'high'
                });
                if (!canvas) throw new Error('无法生成裁剪图');
                imageData = canvas.toDataURL('image/png');
            } else {
                imageData = this.originalImage;
            }
        } catch (e) {
            window.uiManager.showToast('处理图片出错: ' + e.message, 'error');
            return;
        }
        this.solveImage(imageData);
    }

    // 统一发送入口：框选发送 / 重解 / 换模型重答 共用
    solveImage(imageData) {
        if (!this.isConnected()) {
            window.uiManager.showToast('连接已断开，等待重连后再试', 'error');
            return;
        }
        // 追问生成中点了重解/换模型：先停掉在跑的生成，避免两路流串写
        if (this.generating || this.followupGenerating) this.stopGeneration();
        const s = window.settingsManager;
        const settings = s.getSettings();

        // 发送前预检：未选模型 / 缺 Key → 直接进模型页闭环解决
        if (!settings.model) {
            window.modelPage.open();
            return;
        }
        if (s.missingKeyForCurrentModel()) {
            window.modelPage.open({ focusKey: true });
            return;
        }

        this.lastImageData = imageData;
        if (this.questionThumbImg) this.questionThumbImg.src = imageData;
        this.questionMeta.textContent = `${s.currentModel.display_name} · ${TIER_INFO[s.currentTier()]?.label || ''}`;

        this.enterAnswerView();

        const apiKeys = s.collectApiKeys();
        const processed = imageData.startsWith('data:') ? imageData.split(',')[1] : imageData;
        try {
            this.socket.emit('analyze_image', {
                image: processed,
                settings: { ...settings, apiKeys }
            });
        } catch (e) {
            this.renderErrorScreen('发送失败：' + e.message);
        }
    }

    // 换模型重答：进模型页，返回后模型有变则自动重发
    async switchModelAndRetry() {
        const s = window.settingsManager;
        const before = s.currentModelId;
        await window.modelPage.open();
        if (s.currentModelId !== before && this.lastImageData) {
            this.solveImage(this.lastImageData);
        }
    }

    /* ---------- 解答屏 ---------- */
    enterAnswerView() {
        this.setView('answer');
        this.hasAnswer = true;
        this.autoFollow = true;
        this.solveStart = Date.now();
        this.thinkingText = '';
        this.thinkingStart = 0;
        this.jumpLatest?.classList.add('hidden');
        this.answerLabel.classList.add('hidden');
        this.answerActions.classList.remove('visible');
        this.responseContent.innerHTML = '<div class="loading-message">正在分析，请稍候…</div>';
        this.thinkingBlock.dataset.state = 'hidden';
        this.thinkingLabel.textContent = '思考中';
        this.thinkingFull.textContent = '';
        this.thinkingMeta.textContent = '';
        this.resetFollowups();          // 换题/重解即清空追问链
        this.setStatus('processing', '生成中', '');
        this.setGenerating(true);
    }

    handleAiResponse(data) {
        // 追问生成中：事件路由到当前追问轮，不动主解答
        if (this.currentTurn) { this.handleFollowupResponse(data); return; }
        switch (data.status) {
            case 'started':
                this.setStatus('processing', '生成中', '');
                this.setGenerating(true);
                break;
            case 'thinking':
                if (data.content) {
                    if (!this.thinkingStart) this.thinkingStart = Date.now();
                    this.thinkingText = data.content;
                    this.thinkingBlock.dataset.state = 'streaming';
                    this.thinkingLabel.textContent = '思考中';
                    this.thinkingFull.textContent = data.content;
                    this.thinkingMeta.textContent = Math.round((Date.now() - this.thinkingStart) / 1000) + 's';
                    this.followBottom();
                }
                this.setGenerating(true);
                break;
            case 'thinking_complete':
                if (data.content) this.thinkingText = data.content;
                this.collapseThinking();
                break;
            case 'streaming':
                if (data.content) {
                    this.collapseThinking();
                    this.answerLabel.classList.remove('hidden');
                    this.mainAnswerText = data.content;
                    this.setElementContent(this.responseContent, data.content);
                    this.followBottom();
                }
                this.setGenerating(true);
                break;
            case 'completed': {
                if (data.content && data.content.trim()) {
                    this.answerLabel.classList.remove('hidden');
                    this.mainAnswerText = data.content;
                    this.setElementContent(this.responseContent, data.content);
                }
                this.collapseThinking();
                const secs = Math.round((Date.now() - this.solveStart) / 1000);
                this.setStatus('completed', '解答完成', secs + 's');
                this.setGenerating(false);
                this.answerActions.classList.add('visible');
                // 追问框只在完成态出现（设计 4a）
                if (this.mainAnswerText) this.followupBar.classList.remove('hidden');
                this.followBottom();
                break;
            }
            case 'stopped':
                this.setStatus('stopped', '已停止', '');
                this.setGenerating(false);
                this.answerActions.classList.add('visible');
                break;
            case 'error': {
                let msg = '未知错误';
                if (typeof data.error === 'string') msg = data.error;
                else if (data.error) msg = data.error.message || data.error.error || JSON.stringify(data.error);
                this.setGenerating(false);
                this.renderErrorScreen(msg);
                break;
            }
        }
    }

    // 思考流结束 → 自动收起为一行（思考过程 · Ns），点头部可展开回看
    collapseThinking() {
        if (!this.thinkingText) return;
        if (this.thinkingBlock.dataset.state === 'streaming') {
            this.thinkingBlock.dataset.state = 'collapsed';
            this.thinkingLabel.textContent = '思考过程';
            this.thinkingMeta.textContent = Math.round((Date.now() - this.thinkingStart) / 1000) + 's';
            this.thinkingFull.textContent = this.thinkingText;
        }
    }

    /* ---------- 同题追问（设计 4a/4b/4c） ----------
       上下文 = 题图 + 原解答 + 问答链，共用当前模型与档位；
       历史由前端持有随请求上送，后端保持无状态。 */
    sendFollowup() {
        const q = this.followupInput.value.trim();
        if (!q || this.generating || this.followupGenerating) return;
        if (!this.isConnected()) {
            window.uiManager.showToast('连接已断开，等待重连后再试', 'error');
            return;
        }
        if (!this.lastImageData || !this.mainAnswerText) return;
        const s = window.settingsManager;
        if (s.missingKeyForCurrentModel()) {
            window.modelPage.open({ focusKey: true });
            return;
        }

        // 历史 = 主解答 + 已完成的追问轮（出错/无回答的轮次不进历史）+ 新问题
        const history = [{ role: 'assistant', content: this.mainAnswerText }];
        this.followupTurns.forEach(t => {
            if (t.answerText) {
                history.push({ role: 'user', content: t.q });
                history.push({ role: 'assistant', content: t.answerText });
            }
        });
        history.push({ role: 'user', content: q });

        const turn = this.appendFollowupTurn(q);
        this.followupTurns.push(turn);
        this.currentTurn = turn;
        this.followupInput.value = '';
        this.followupSend.classList.remove('ready');
        this.followupHint.classList.add('hidden');
        this.setFollowupGenerating(true);
        this.autoFollow = true;
        this.followBottom();

        const settings = s.getSettings();
        const apiKeys = s.collectApiKeys();
        const processed = this.lastImageData.startsWith('data:') ? this.lastImageData.split(',')[1] : this.lastImageData;
        try {
            this.socket.emit('analyze_image', {
                image: processed,
                settings: { ...settings, apiKeys },
                history
            });
        } catch (e) {
            this.failFollowupTurn(turn, '发送失败：' + e.message);
        }
    }

    // 构建一轮追问的 DOM：右侧气泡 + 独立思考折叠行 + 回答区
    appendFollowupTurn(q) {
        const bubble = document.createElement('div');
        bubble.className = 'fu-question';
        bubble.textContent = q;

        const think = document.createElement('div');
        think.className = 'fu-thinking';
        think.dataset.state = 'hidden';
        think.innerHTML = `
            <div class="fu-thinking-head">
                <i class="fas fa-wand-magic-sparkles"></i>
                <span class="fu-think-label">思考中</span>
                <span class="fu-think-meta"></span>
                <i class="fas fa-chevron-down fu-think-toggle"></i>
            </div>
            <div class="fu-thinking-full"></div>`;

        const answer = document.createElement('div');
        answer.className = 'response-content fu-answer';
        answer.innerHTML = '<div class="loading-message">正在思考…</div>';

        this.followupThread.append(bubble, think, answer);

        const turn = {
            q, answerText: '', thinkingText: '', thinkStart: 0,
            thinkEl: think,
            thinkLabel: think.querySelector('.fu-think-label'),
            thinkMeta: think.querySelector('.fu-think-meta'),
            thinkFull: think.querySelector('.fu-thinking-full'),
            answerEl: answer,
        };
        think.querySelector('.fu-thinking-head').addEventListener('click', () => {
            const st = think.dataset.state;
            if (st === 'collapsed') think.dataset.state = 'expanded';
            else if (st === 'expanded') think.dataset.state = 'collapsed';
        });
        return turn;
    }

    handleFollowupResponse(data) {
        const t = this.currentTurn;
        switch (data.status) {
            case 'started':
                break;
            case 'thinking':
                if (data.content) {
                    if (!t.thinkStart) t.thinkStart = Date.now();
                    t.thinkingText = data.content;
                    t.thinkEl.dataset.state = 'streaming';
                    t.thinkLabel.textContent = '思考中';
                    t.thinkFull.textContent = data.content;
                    t.thinkMeta.textContent = Math.round((Date.now() - t.thinkStart) / 1000) + 's';
                    this.followBottom();
                }
                break;
            case 'thinking_complete':
                if (data.content) t.thinkingText = data.content;
                this.collapseFollowupThinking(t);
                break;
            case 'streaming':
                if (data.content) {
                    this.collapseFollowupThinking(t);
                    t.answerText = data.content;
                    this.setElementContent(t.answerEl, data.content);
                    this.followBottom();
                }
                break;
            case 'completed':
                if (data.content && data.content.trim()) {
                    t.answerText = data.content;
                    this.setElementContent(t.answerEl, data.content);
                }
                this.collapseFollowupThinking(t);
                this.finishFollowup();
                this.followBottom();
                break;
            case 'stopped':
                this.collapseFollowupThinking(t);
                if (!t.answerText) t.answerEl.innerHTML = '<div class="fu-note">已停止，这轮没有生成回答</div>';
                this.finishFollowup();
                break;
            case 'error': {
                let msg = '未知错误';
                if (typeof data.error === 'string') msg = data.error;
                else if (data.error) msg = data.error.message || data.error.error || JSON.stringify(data.error);
                this.failFollowupTurn(t, msg);
                break;
            }
        }
    }

    // 追问出错：轮内联报错（不打断整页），该轮不进历史
    failFollowupTurn(turn, msg) {
        turn.answerText = '';
        turn.answerEl.innerHTML = '';
        const err = document.createElement('div');
        err.className = 'fu-error';
        err.textContent = '追问失败：' + msg;
        turn.answerEl.appendChild(err);
        this.finishFollowup();
    }

    collapseFollowupThinking(t) {
        if (!t.thinkingText) return;
        if (t.thinkEl.dataset.state === 'streaming') {
            t.thinkEl.dataset.state = 'collapsed';
            t.thinkLabel.textContent = '思考过程';
            t.thinkMeta.textContent = Math.round((Date.now() - t.thinkStart) / 1000) + 's';
            t.thinkFull.textContent = t.thinkingText;
        }
    }

    finishFollowup() {
        this.currentTurn = null;
        this.setFollowupGenerating(false);
        this.followupInput.placeholder = '继续追问这道题…';
    }

    // 追问生成中：输入禁用，发送钮变停止（设计 4b）
    setFollowupGenerating(on) {
        this.followupGenerating = on;
        this.generating = on;                       // 复用贴底跟随/浮标的守卫
        this.followupInput.disabled = on;
        this.followupSend.classList.toggle('stop', on);
        this.followupSend.innerHTML = on ? '<i class="fas fa-stop"></i>' : '<i class="fas fa-arrow-up"></i>';
        if (!on) this.jumpLatest?.classList.add('hidden');
    }

    resetFollowups() {
        this.followupTurns = [];
        this.currentTurn = null;
        this.followupGenerating = false;
        this.mainAnswerText = '';
        this.followupThread.innerHTML = '';
        this.followupBar.classList.add('hidden');
        this.followupHint.classList.remove('hidden');
        this.followupInput.value = '';
        this.followupInput.disabled = false;
        this.followupInput.placeholder = '答案没看懂？就这道题继续问…';
        this.followupSend.classList.remove('stop', 'ready');
        this.followupSend.innerHTML = '<i class="fas fa-arrow-up"></i>';
    }

    setStatus(kind, text, meta) {
        this.statusCluster.className = 'status-cluster ' + kind;
        this.statusText.textContent = text;
        this.statusMeta.textContent = meta || '';
    }

    setGenerating(on) {
        this.generating = on;
        this.stopGenerationBtn?.classList.toggle('visible', on);
        if (on) this.answerActions.classList.remove('visible');
    }

    /* ---------- 出错态：全屏错误页 ---------- */
    classifyError(msg) {
        const s = (msg || '').toLowerCase();
        if (/401|unauthorized|invalid[ _-]?(api[ _-]?)?key|api[ _-]?key|authentication|forbidden|权限|密钥/.test(s)) return 'key';
        if (/timeout|timed?[ _-]?out|econn|enotfound|network|proxy|connect|unreachable|ssl|超时|代理|网络/.test(s)) return 'network';
        return 'other';
    }

    renderErrorScreen(msg) {
        const s = window.settingsManager;
        const kind = this.classifyError(msg);
        const providerLabel = PROVIDER_LABEL[s.currentModel?.provider] || '所选模型';
        const spec = {
            key: {
                icon: 'fa-key',
                title: '密钥没有通过验证',
                hint: `${providerLabel} 的 API 密钥无效或已过期。检查一下密钥是否填写完整、有没有多余空格。`,
                primary: { label: '检查密钥', icon: 'fa-key', fn: () => window.modelPage.open({ focusKey: true }) },
            },
            network: {
                icon: 'fa-wifi',
                title: '连不上模型服务',
                hint: '网络或代理不通。检查设置里的代理与中转地址，或换个网络后重试。',
                primary: { label: '检查网络设置', icon: 'fa-sliders', fn: () => window.settingsPage.open('network') },
            },
            other: {
                icon: 'fa-triangle-exclamation',
                title: '解答失败',
                hint: '模型服务返回了错误。可以直接重试一次，或换个模型再答。',
                primary: { label: '重试', icon: 'fa-rotate-right', fn: () => this.lastImageData && this.solveImage(this.lastImageData) },
            },
        }[kind];

        this.setStatus('error', '解答出错', s.currentModel?.display_name || '');
        this.answerLabel.classList.add('hidden');
        this.answerActions.classList.remove('visible');

        const screen = document.createElement('div');
        screen.className = 'error-screen';
        screen.innerHTML = `
            <div class="error-icon-tile"><i class="fas ${spec.icon}"></i></div>
            <div class="error-title"></div>
            <div class="error-hint"></div>
            <div class="error-raw"></div>
            <div class="error-actions">
                <button class="btn btn-primary" id="errPrimary"><i class="fas ${spec.primary.icon}"></i> ${spec.primary.label}</button>
                <div class="error-actions-row"></div>
            </div>`;
        screen.querySelector('.error-title').textContent = spec.title;
        screen.querySelector('.error-hint').textContent = spec.hint;
        screen.querySelector('.error-raw').textContent = msg;
        screen.querySelector('#errPrimary').addEventListener('click', spec.primary.fn);

        const row = screen.querySelector('.error-actions-row');
        const addBtn = (label, icon, fn) => {
            const b = document.createElement('button');
            b.className = 'btn btn-ghost';
            b.innerHTML = `<i class="fas ${icon}"></i> ${label}`;
            b.addEventListener('click', fn);
            row.appendChild(b);
        };
        if (kind !== 'other') addBtn('重试', 'fa-rotate-right', () => this.lastImageData && this.solveImage(this.lastImageData));
        addBtn('换个模型', 'fa-shuffle', () => this.switchModelAndRetry());

        this.responseContent.innerHTML = '';
        this.responseContent.appendChild(screen);
        this.answerScroll.scrollTo({ top: 0 });
    }

    /* ---------- 流式滚动：贴底才跟随，上滑释放 ---------- */
    followBottom() {
        if (this.autoFollow && this.answerScroll) {
            this.answerScroll.scrollTo({ top: this.answerScroll.scrollHeight, behavior: 'smooth' });
        }
    }

    setupScrollGuard() {
        if (!this.answerScroll) return;
        this.answerScroll.addEventListener('scroll', () => {
            const nearBottom = this.answerScroll.scrollHeight - this.answerScroll.scrollTop - this.answerScroll.clientHeight < 40;
            this.autoFollow = nearBottom;
            this.jumpLatest?.classList.toggle('hidden', nearBottom || !this.generating);
        }, { passive: true });
        this.jumpLatest?.addEventListener('click', () => {
            this.autoFollow = true;
            this.followBottom();
            this.jumpLatest.classList.add('hidden');
        });
    }

    stopGeneration() {
        if (this.socket?.connected) {
            this.socket.emit('stop_generation');
            this.stopGenerationBtn?.classList.remove('visible');
        }
    }

    /* ---------- 事件绑定 ---------- */
    setupEventListeners() {
        this.captureBtn.addEventListener('click', () => this.triggerCapture());
        this.el('modelEntry').addEventListener('click', () => window.modelPage.open());
        this.el('cropSendToAI').addEventListener('click', () => this.sendForSolve());
        this.el('cropReset').addEventListener('click', () => this.cropper?.reset());
        this.el('reshootBtn').addEventListener('click', () => this.triggerCapture());
        this.el('workspaceExit').addEventListener('click', () => this.exitWorkspace());
        this.stopGenerationBtn.addEventListener('click', () => this.stopGeneration());
        this.el('answerBack').addEventListener('click', async () => {
            // 清空守卫：有追问记录时轻确认一次（设计 4c）
            if (this.followupTurns.length) {
                const idx = await Sheets.confirm({
                    title: '离开后这页问答会清空',
                    message: '返回首页或截新题后不会保留。',
                    actions: [{ label: '继续看', style: 'cancel' }, { label: '离开', style: 'primary' }]
                });
                if (idx !== 1) return;
            }
            if (this.followupGenerating) this.stopGeneration();
            if (this.cropper) { this.cropper.destroy(); this.cropper = null; }
            this.hasAnswer = false;
            this.resetFollowups();
            this.setView('empty');
        });

        // 完成后的动作行（设计 4a：重解 / 换模型重解 / 复制）
        this.el('resolveBtn').addEventListener('click', () => this.lastImageData && this.solveImage(this.lastImageData));
        this.el('switchModelBtn').addEventListener('click', () => this.switchModelAndRetry());
        this.el('copyAnswerBtn').addEventListener('click', () => this.copyText(this.mainAnswerText));

        // 同题追问输入条
        this.followupSend.addEventListener('click', () => {
            if (this.followupGenerating) this.stopGeneration();
            else this.sendFollowup();
        });
        this.followupInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); this.sendFollowup(); }
        });
        this.followupInput.addEventListener('input', () => {
            this.followupSend.classList.toggle('ready', !!this.followupInput.value.trim());
        });

        // 思考过程收起/展开（流式中不响应）
        this.el('thinkingHead').addEventListener('click', () => {
            const st = this.thinkingBlock.dataset.state;
            if (st === 'collapsed') this.thinkingBlock.dataset.state = 'expanded';
            else if (st === 'expanded') this.thinkingBlock.dataset.state = 'collapsed';
        });

        // 题目缩略条 → 全屏对照
        this.el('questionThumb')?.addEventListener('click', () => {
            const lb = this.el('lightbox'), img = this.el('lightboxImg');
            if (this.lastImageData && lb && img) { img.src = this.lastImageData; lb.classList.remove('hidden'); }
        });
        this.el('lightboxClose')?.addEventListener('click', () => this.el('lightbox').classList.add('hidden'));

        this.setupScrollGuard();
    }

    /* ---------- Markdown 渲染 ---------- */
    setElementContent(element, content) {
        if (!element) return;
        if (typeof content !== 'string') content = content == null ? '' : String(content);
        try {
            if (typeof marked === 'undefined') { element.innerHTML = content.replace(/\n/g, '<br>'); return; }
            element.innerHTML = marked.parse(content);
            if (window.hljs) element.querySelectorAll('pre code:not(.hljs)').forEach(b => hljs.highlightElement(b));
            this.decorateCodeBlocks(element);
        } catch (e) {
            element.innerHTML = content.replace(/\n/g, '<br>');
        }
    }

    // 代码块加语言头 + 复制按钮（设计 1f）
    decorateCodeBlocks(element) {
        element.querySelectorAll('pre code').forEach(codeBlock => {
            const pre = codeBlock.parentElement;
            if (pre.parentElement?.classList.contains('code-block-wrapper')) return;
            const wrapper = document.createElement('div');
            wrapper.className = 'code-block-wrapper';
            const head = document.createElement('div');
            head.className = 'code-block-head';
            const lang = (codeBlock.className.match(/language-([\w+-]+)/) || [])[1] || 'code';
            head.innerHTML = '<span class="code-block-lang"></span><button class="code-copy-btn"><i class="fa-regular fa-copy"></i>复制</button>';
            head.querySelector('.code-block-lang').textContent = lang;

            pre.parentNode.insertBefore(wrapper, pre);
            wrapper.appendChild(head);
            wrapper.appendChild(pre);

            const btn = head.querySelector('.code-copy-btn');
            btn.addEventListener('click', async () => {
                try {
                    if (navigator.clipboard && window.isSecureContext) {
                        await navigator.clipboard.writeText(codeBlock.textContent);
                    } else {
                        const ta = document.createElement('textarea');
                        ta.value = codeBlock.textContent;
                        ta.style.position = 'fixed';
                        ta.style.left = '-9999px';
                        document.body.appendChild(ta);
                        ta.select();
                        document.execCommand('copy');
                        document.body.removeChild(ta);
                    }
                    btn.innerHTML = '<i class="fas fa-check"></i>已复制';
                    btn.classList.add('copied');
                    setTimeout(() => { btn.innerHTML = '<i class="fa-regular fa-copy"></i>复制'; btn.classList.remove('copied'); }, 2000);
                } catch (e) {
                    window.uiManager?.showToast('复制失败', 'error');
                }
            });
        });
    }

    // 复制纯文本（局域网 http 无 clipboard API，走 textarea 兜底）
    async copyText(text) {
        if (!text) return;
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
            } else {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.left = '-9999px';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            }
            window.uiManager.showToast('已复制', 'success');
        } catch (e) {
            window.uiManager.showToast('复制失败', 'error');
        }
    }

    initializeMarkdownTools() {
        if (typeof marked === 'undefined') return;
        if (typeof hljs === 'undefined') {
            window.hljs = { highlight: c => ({ value: c }), highlightAuto: c => ({ value: c }), getLanguage: () => null, configure: () => {}, highlightElement: () => {} };
        }
        marked.setOptions({
            gfm: true, breaks: true, pedantic: false, sanitize: false, smartLists: true,
            headerIds: false, mangle: false,
            highlight: function (code, lang) {
                if (typeof hljs === 'undefined') return code;
                if (lang && hljs.getLanguage(lang)) { try { return hljs.highlight(code, { language: lang }).value; } catch (e) {} }
                try { return hljs.highlightAuto(code).value; } catch (e) { return code; }
            }
        });
    }
}

/* ---------- 启动：唯一入口，顺序构造消除竞态 ---------- */
document.addEventListener('DOMContentLoaded', async () => {
    try {
        window.uiManager = new UIManager();
        window.settingsManager = new SettingsManager();
        await window.settingsManager.ready;
        window.modelPage = new ModelPage(window.settingsManager);
        window.settingsPage = new SettingsPage(window.settingsManager);
        window.app = new SnapSolver();
        window.app.initialize();
    } catch (error) {
        console.error('Failed to initialize application:', error);
        const div = document.createElement('div');
        div.className = 'init-error';
        div.innerHTML = `<h2>Initialization Error</h2><p>${error.message}</p><pre>${error.stack}</pre>`;
        document.body.appendChild(div);
    }
});
