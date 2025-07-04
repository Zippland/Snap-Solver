class SettingsManager {
    constructor(uiManager) {
        this.ui = uiManager;
        this.models = {};
        this.providers = {};
        this.prompts = {};
        this.apiKeys = {};
        this.languageMap = {
            en: 'English', zh: 'Chinese', es: 'Spanish', fr: 'French', de: 'German'
        };
    }

    async init() {
        await this.loadConfig();
        this.ui.settingsPanel.innerHTML = this.render();
        window.i18n.translatePage();
        this.cacheDOMElements();
        this.bindEventListeners();
        await this.loadSettings();
        console.log("SettingsManager Initialized");
    }

    async loadConfig() {
        try {
            const [modelsRes, configRes, promptsRes, keysRes] = await Promise.all([
                fetch('/api/models'),
                fetch('/config/models.json'),
                fetch('/api/prompts'),
                fetch('/api/keys'),
            ]);
            const modelsList = await modelsRes.json();
            const config = await configRes.json();
            this.prompts = await promptsRes.json();
            this.apiKeys = await keysRes.json();

            this.providers = config.providers;
            this.models = modelsList.reduce((acc, model) => {
                const modelConfig = config.models[model.id] || {};
                acc[model.id] = { ...model, provider: modelConfig.provider };
                return acc;
            }, {});
        } catch (error) {
            console.error("Failed to load configuration:", error);
            this.ui.showToast(t('error.configLoadFailed'), 'error');
        }
    }

    render() {
        const providerGroups = Object.keys(this.providers).map(pid => {
            const models = Object.values(this.models).filter(m => m.provider === pid);
            if (models.length === 0) return '';
            const modelOptions = models.map(m => `<option value="${m.id}">${m.display_name}</option>`).join('');
            return `<optgroup label="${this.providers[pid].name}">${modelOptions}</optgroup>`;
        }).join('');

        const apiKeyInputs = Object.keys(this.providers).map(pid => `
            <div class="api-key-item" data-provider="${pid}">
                <label for="${pid}-key">${this.providers[pid].name} API Key</label>
                <div class="input-group">
                    <input type="password" id="${pid}-key" data-i18n-placeholder="placeholder.apiKey">
                    <button class="btn-icon toggle-visibility"><i class="fas fa-eye"></i></button>
                </div>
            </div>
        `).join('') + `
            <div class="api-key-item" data-provider="mathpix">
                <label for="mathpix-key">Mathpix API Key (AppID:AppKey)</label>
                <div class="input-group">
                    <input type="password" id="mathpix-key" data-i18n-placeholder="placeholder.mathpixKey">
                    <button class="btn-icon toggle-visibility"><i class="fas fa-eye"></i></button>
                </div>
            </div>`;

        const promptOptions = Object.keys(this.prompts).map(pid => `<option value="${pid}">${this.prompts[pid].name}</option>`).join('');
        const langOptionsHTML = Object.entries(this.languageMap).map(([code, name]) => `<option value="${code}">${name}</option>`).join('');

        return `
            <div class="settings-header">
                <h2 data-i18n="settings.title">Settings</h2>
                <button id="closeSettings" class="btn-icon"><i class="fas fa-times"></i></button>
            </div>
            <div class="settings-content">
                <div class="settings-section">
                    <h3 data-i18n="settings.modelSettings">Model Settings</h3>
                    <div class="setting-item">
                        <label for="modelSelect" data-i18n="settings.aiModel">AI Model</label>
                        <select id="modelSelect">${providerGroups}</select>
                    </div>
                    <div class="setting-item">
                        <label for="languageSelect" data-i18n="settings.language">Language</label>
                        <select id="languageSelect">${langOptionsHTML}</select>
                    </div>
                </div>
                <div class="settings-section">
                    <h3 data-i18n="settings.apiKeys">API Keys</h3>
                    ${apiKeyInputs}
                </div>
                <div class="settings-section">
                    <h3 data-i18n="settings.systemPrompt">System Prompt</h3>
                    <div class="prompt-controls">
                        <select id="promptSelect">${promptOptions}</select>
                        <button id="editPromptBtn" class="btn-icon"><i class="fas fa-edit"></i></button>
                        <button id="newPromptBtn" class="btn-icon"><i class="fas fa-plus"></i></button>
                        <button id="deletePromptBtn" class="btn-icon"><i class="fas fa-trash"></i></button>
                    </div>
                    <textarea id="systemPrompt" rows="4"></textarea>
                </div>
            </div>`;
    }

    cacheDOMElements() {
        this.modelSelect = document.getElementById('modelSelect');
        this.languageSelect = document.getElementById('languageSelect');
        this.systemPrompt = document.getElementById('systemPrompt');
        this.promptSelect = document.getElementById('promptSelect');
        this.editPromptBtn = document.getElementById('editPromptBtn');
        this.newPromptBtn = document.getElementById('newPromptBtn');
        this.deletePromptBtn = document.getElementById('deletePromptBtn');
        this.apiKeyInputs = {};
        document.querySelectorAll('.api-key-item input').forEach(input => {
            const provider = input.closest('.api-key-item').dataset.provider;
            this.apiKeyInputs[provider] = input;
        });
        document.getElementById('closeSettings').addEventListener('click', () => this.ui.togglePanel(this.ui.settingsPanel));
    }

    bindEventListeners() {
        Object.values(this.apiKeyInputs).forEach(input => input.addEventListener('change', () => this.saveSettings()));
        this.modelSelect.addEventListener('change', () => this.saveSettings());
        this.languageSelect.addEventListener('change', () => {
            this.saveSettings();
            window.i18n.setLanguage(this.languageSelect.value);
        });
        this.systemPrompt.addEventListener('input', () => this.saveSettings());
        this.promptSelect.addEventListener('change', () => this.loadSelectedPrompt());

        document.querySelectorAll('.toggle-visibility').forEach(btn => {
            btn.addEventListener('click', () => {
                const input = btn.previousElementSibling;
                input.type = input.type === 'password' ? 'text' : 'password';
                btn.querySelector('i').className = `fas fa-eye${input.type === 'password' ? '' : '-slash'}`;
            });
        });
    }

    getLanguageCode(langName) {
        if (!langName) return 'en';
        const lowerLangName = langName.toLowerCase();
        for (const [code, name] of Object.entries(this.languageMap)) {
            if (name.toLowerCase() === lowerLangName) {
                return code;
            }
        }
        return langName.length === 2 ? langName : 'en';
    }

    async loadSettings() {
        const settings = JSON.parse(localStorage.getItem('snapSolverSettings')) || {};
        this.modelSelect.value = settings.model || Object.keys(this.models)[0];
        const languageCode = this.getLanguageCode(settings.language || 'en');
        this.languageSelect.value = languageCode;
        Object.keys(this.apiKeyInputs).forEach(provider => {
            if (settings.apiKeys && settings.apiKeys[provider]) {
                this.apiKeyInputs[provider].value = settings.apiKeys[provider];
            }
        });
        this.systemPrompt.value = settings.systemPrompt || this.prompts['default']?.content || '';
        this.promptSelect.value = settings.promptId || 'default';
    }

    saveSettings() {
        const apiKeys = {};
        Object.keys(this.apiKeyInputs).forEach(provider => {
            apiKeys[provider] = this.apiKeyInputs[provider].value;
        });

        const settings = {
            model: this.modelSelect.value,
            language: this.languageSelect.value,
            apiKeys: apiKeys,
            systemPrompt: this.systemPrompt.value,
            promptId: this.promptSelect.value,
        };
        localStorage.setItem('snapSolverSettings', JSON.stringify(settings));
        this.ui.showToast(t('success.settingsSaved'), 'success', 1500);
    }

    getSettings() {
        const settings = JSON.parse(localStorage.getItem('snapSolverSettings')) || {};
        const modelId = settings.model || this.modelSelect.value;
        const modelInfo = this.models[modelId];

        const langCode = settings.language || 'en';
        const languageName = this.languageMap[langCode] || 'English';

        const keyMap = {
            anthropic: "AnthropicApiKey",
            openai: "OpenaiApiKey",
            deepseek: "DeepseekApiKey",
            alibaba: "AlibabaApiKey",
            google: "GoogleApiKey",
        };
        const apiKeys = {};
        if (settings.apiKeys) {
            Object.keys(this.providers).forEach(pid => {
                 if (settings.apiKeys[pid]) {
                    apiKeys[keyMap[pid]] = settings.apiKeys[pid];
                }
            });
            if(settings.apiKeys['mathpix']){
                const [appId, appKey] = settings.apiKeys['mathpix'].split(':');
                apiKeys['MathpixAppId'] = appId;
                apiKeys['MathpixAppKey'] = appKey;
            }
        }

        return {
            model: modelId,
            modelInfo: modelInfo,
            language: languageName,
            systemPrompt: settings.systemPrompt || this.systemPrompt.value,
            apiKeys: apiKeys
        };
    }

    loadSelectedPrompt() {
        const promptId = this.promptSelect.value;
        if (this.prompts[promptId]) {
            this.systemPrompt.value = this.prompts[promptId].content;
            this.saveSettings();
        }
    }
}