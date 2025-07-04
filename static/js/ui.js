class UIManager {
    constructor() {
        this.cacheDOMElements();
        this.initializeTheme();
        this.initEventListeners();
        this.initMarkdownRenderer();
        this.userThinkingExpanded = false;
    }

    cacheDOMElements() {
        this.elements = {
            connectionStatus: document.getElementById('connectionStatus'),
            captureBtn: document.getElementById('captureBtn'),
            emptyState: document.getElementById('emptyState'),
            imagePreview: document.getElementById('imagePreview'),
            screenshotImg: document.getElementById('screenshotImg'),
            analyzeImageBtn: document.getElementById('analyzeImageBtn'),
            extractTextBtn: document.getElementById('extractTextBtn'),
            extractedText: document.getElementById('extractedText'),
            analyzeTextBtn: document.getElementById('analyzeTextBtn'),
            analysisPanel: document.getElementById('analysisPanel'),
            closeAnalysisPanel: document.getElementById('closeAnalysisPanel'),
            analysisIndicator: document.querySelector('.analysis-indicator'),
            progressLine: document.querySelector('.progress-line'),
            statusText: document.querySelector('.status-text'),
            stopGenerationBtn: document.getElementById('stopGenerationBtn'),
            thinkingSection: document.getElementById('thinkingSection'),
            thinkingToggle: document.getElementById('thinkingToggle'),
            thinkingContent: document.getElementById('thinkingContent'),
            responseContent: document.getElementById('responseContent'),
            cropContainer: document.getElementById('cropContainer'),
            cropArea: document.querySelector('.crop-area'),
            cropConfirm: document.getElementById('cropConfirm'),
            cropCancel: document.getElementById('cropCancel'),
            toastContainer: document.getElementById('toastContainer'),
            themeToggle: document.getElementById('themeToggle'),
            settingsPanel: document.getElementById('settingsPanel'),
            settingsToggle: document.getElementById('settingsToggle'),
            promptDialog: document.getElementById('promptDialog'),
            promptDialogOverlay: document.getElementById('promptDialogOverlay'),
        };
        for (const key in this.elements) {
            this[key] = this.elements[key];
        }
    }

    initEventListeners() {
        this.settingsToggle.addEventListener('click', () => this.togglePanel(this.settingsPanel));
        this.themeToggle.addEventListener('click', () => this.toggleTheme());
        this.thinkingToggle.addEventListener('click', () => this.toggleThinkingContent());
        this.closeAnalysisPanel.addEventListener('click', () => this.hideAnalysisPanel());
    }

    initializeTheme() {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme) {
            this.setTheme(savedTheme);
        } else {
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            this.setTheme(prefersDark ? 'dark' : 'light');
        }
    }
    
    setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        if (this.themeToggle) {
            this.themeToggle.innerHTML = `<i class="fas fa-${theme === 'dark' ? 'sun' : 'moon'}"></i>`;
        }
        document.getElementById('highlight-theme-dark').disabled = theme === 'light';
        document.getElementById('highlight-theme-light').disabled = theme === 'dark';
    }

    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        this.setTheme(newTheme);
        localStorage.setItem('theme', newTheme);
    }

    togglePanel(panel) {
        panel.classList.toggle('active');
    }

    updateConnectionStatus(isConnected) {
        this.connectionStatus.textContent = isConnected ? t('status.connected') : t('status.disconnected');
        this.connectionStatus.className = `status ${isConnected ? 'connected' : 'disconnected'}`;
        this.captureBtn.disabled = !isConnected;
    }

    setLoading(button, isLoading, defaultHtml) {
        button.disabled = isLoading;
        button.innerHTML = isLoading ? '<i class="fas fa-spinner fa-spin"></i>' : defaultHtml;
    }

    showCropContainer(show) {
        this.cropContainer.classList.toggle('hidden', !show);
    }

    displayImagePreview(imageData) {
        this.emptyState.classList.add('hidden');
        this.imagePreview.classList.remove('hidden');
        this.screenshotImg.src = imageData;
        this.analyzeImageBtn.classList.remove('hidden');
        this.extractTextBtn.classList.remove('hidden');
    }


    showExtractedText(text) {
        this.extractedText.value = text;
        this.extractedText.classList.remove('hidden');
        this.analyzeTextBtn.classList.remove('hidden');
    }
    
    showAnalysisPanel() {
        this.analysisPanel.classList.remove('hidden');
    }

    hideAnalysisPanel() {
        this.analysisPanel.classList.add('hidden');
    }

    handleAIResponse(data) {
        this.updateAnalysisStatus(data.status);
        switch (data.status) {
            case 'started':
                this.responseContent.innerHTML = '';
                this.thinkingContent.innerHTML = '';
                this.thinkingSection.classList.add('hidden');
                this.stopGenerationBtn.classList.add('visible');
                break;
            case 'thinking':
            case 'reasoning':
                this.thinkingSection.classList.remove('hidden');
                this.setThinkingAnimation(true);
                this.renderMarkdown(this.thinkingContent, data.content);
                break;
            case 'thinking_complete':
            case 'reasoning_complete':
                this.setThinkingAnimation(false);
                this.renderMarkdown(this.thinkingContent, data.content);
                break;
            case 'streaming':
                this.renderMarkdown(this.responseContent, data.content);
                this.responseContent.scrollTop = this.responseContent.scrollHeight;
                break;
            case 'completed':
                this.renderMarkdown(this.responseContent, data.content);
                this.stopGenerationBtn.classList.remove('visible');
                if (!this.thinkingContent.textContent.trim()) {
                    this.thinkingSection.classList.add('hidden');
                }
                break;
            case 'stopped':
            case 'error':
                this.stopGenerationBtn.classList.remove('visible');
                if (data.error) this.showToast(data.error, 'error');
                break;
        }
    }
    
    updateAnalysisStatus(status) {
        const statusMap = {
            started: { textKey: 'status.generating', class: 'processing' },
            thinking: { textKey: 'status.generating', class: 'processing' },
            reasoning: { textKey: 'status.generating', class: 'processing' },
            streaming: { textKey: 'status.generating', class: 'processing' },
            completed: { textKey: 'status.complete', class: 'completed' },
            error: { textKey: 'status.error', class: 'error' },
            stopped: { textKey: 'status.stopped', class: 'error' }
        };
        const currentStatus = statusMap[status] || { textKey: 'status.preparing', class: '' };
        this.statusText.textContent = t(currentStatus.textKey);
        this.analysisIndicator.className = `analysis-indicator ${currentStatus.class}`;
        this.progressLine.className = `progress-line ${currentStatus.class}`;
    }

    setThinkingAnimation(show) {
        const dots = this.thinkingToggle.querySelector('.dots-animation');
        if (dots) dots.style.display = show ? 'inline-block' : 'none';
    }

    toggleThinkingContent() {
        this.userThinkingExpanded = !this.userThinkingExpanded;
        this.thinkingContent.classList.toggle('collapsed', !this.userThinkingExpanded);
        const icon = this.thinkingToggle.querySelector('i.fa-chevron-down, i.fa-chevron-up');
        if (icon) icon.className = `fas fa-chevron-${this.userThinkingExpanded ? 'up' : 'down'}`;
    }

    initMarkdownRenderer() {
        this.md = window.markdownit({
            html: true,
            linkify: true,
            typographer: true,
            highlight: (str, lang) => {
                if (lang && hljs.getLanguage(lang)) {
                    try {
                        return hljs.highlight(str, { language: lang, ignoreIllegals: true }).value;
                    } catch (__) {}
                }
                return '';
            }
        });
    }

    renderMarkdown(element, text) {
        const renderMath = (content) => {
            return content.replace(/\$\$([\s\S]*?)\$\$/g, (match, math) => {
                try {
                    return katex.renderToString(math, { displayMode: true, throwOnError: false });
                } catch (e) { return match; }
            }).replace(/\$([\s\S]*?)\$/g, (match, math) => {
                try {
                    return katex.renderToString(math, { displayMode: false, throwOnError: false });
                } catch (e) { return match; }
            });
        };
        const renderedHtml = this.md.render(text);
        element.innerHTML = renderMath(renderedHtml);
    }
    
    showToast(message, type = 'success', duration = 3000) {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        const iconClass = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            info: 'fa-info-circle'
        }[type] || 'fa-info-circle';
        
        toast.innerHTML = `<i class="fas ${iconClass}"></i> <span>${message}</span>`;
        this.toastContainer.appendChild(toast);
        
        setTimeout(() => toast.remove(), duration);
        return toast;
    }
}