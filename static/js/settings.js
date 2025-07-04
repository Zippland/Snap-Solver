class SearchableSelect {
    constructor(containerId, placeholder, onSelect) {
        this.container = document.getElementById(containerId);
        this.placeholder = placeholder;
        this.onSelect = onSelect;
        this.options = [];
        this.selected = null;
        this.isOpen = false;
        this.render();
        this.bindEvents();
    }

    render() {
        this.container.innerHTML = `
            <div class="searchable-select-display" tabindex="0">
                <span class="display-text">${this.placeholder}</span>
                <i class="fas fa-chevron-down"></i>
            </div>
        `;
        this.dropdown = document.createElement('div');
        this.dropdown.className = 'searchable-select-dropdown';
        this.dropdown.innerHTML = `
            <input type="text" class="searchable-select-search" placeholder="Search...">
            <div class="searchable-select-options"></div>
        `;

        this.display = this.container.querySelector('.searchable-select-display');
        this.displayText = this.container.querySelector('.display-text');
        this.searchInput = this.dropdown.querySelector('.searchable-select-search');
        this.optionsContainer = this.dropdown.querySelector('.searchable-select-options');
    }

    bindEvents() {
        this.display.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleDropdown();
        });
        this.searchInput.addEventListener('input', () => this.filterOptions());
        document.addEventListener('click', () => this.closeDropdown());
        this.dropdown.addEventListener('click', (e) => e.stopPropagation());
    }

    toggleDropdown() {
        if (this.isOpen) {
            this.closeDropdown();
        } else {
            this.openDropdown();
        }
    }

    openDropdown() {
        if (this.isOpen) return;
        this.isOpen = true;

        document.body.appendChild(this.dropdown);
        this.positionDropdown();
        
        this.dropdown.classList.add('active');
        this.searchInput.focus();
        this.searchInput.value = '';
        this.filterOptions();

        document.addEventListener('scroll', this.repositionOnScroll, true);
    }

    positionDropdown() {
        const rect = this.display.getBoundingClientRect();
        this.dropdown.style.left = `${rect.left}px`;
        this.dropdown.style.width = `${rect.width}px`;
        
        const spaceBelow = window.innerHeight - rect.bottom;
        const dropdownHeight = Math.min(this.dropdown.offsetHeight, 250);

        if (spaceBelow < dropdownHeight && rect.top > dropdownHeight) {
            this.dropdown.style.top = `${rect.top - dropdownHeight}px`;
        } else {
            this.dropdown.style.top = `${rect.bottom}px`;
        }
    }

    repositionOnScroll = () => {
        if (this.isOpen) {
            this.positionDropdown();
        }
    };

    closeDropdown() {
        if (!this.isOpen) return;
        this.isOpen = false;
        this.dropdown.classList.remove('active');
        if (this.dropdown.parentElement === document.body) {
            document.body.removeChild(this.dropdown);
        }
        document.removeEventListener('scroll', this.repositionOnScroll, true);
    }

    setOptions(options) {
        this.options = options;
        this.renderOptions();
    }

    renderOptions(filter = '') {
        this.optionsContainer.innerHTML = '';
        const filteredOptions = this.options.filter(opt => opt.name.toLowerCase().includes(filter.toLowerCase()));

        if (filteredOptions.length === 0) {
            this.optionsContainer.innerHTML = `<div class="select-option-none">No results found</div>`;
            return;
        }

        filteredOptions.forEach(option => {
            const optionEl = document.createElement('div');
            optionEl.className = 'searchable-select-option';
            optionEl.dataset.value = option.id;
            optionEl.textContent = option.name;
            if (this.selected && this.selected.id === option.id) {
                optionEl.classList.add('selected');
            }
            optionEl.addEventListener('click', () => {
                this.selectOption(option);
            });
            this.optionsContainer.appendChild(optionEl);
        });
    }

    filterOptions() {
        this.renderOptions(this.searchInput.value);
    }
    
    selectOption(option, triggerCallback = true) {
        this.selected = option;
        this.displayText.textContent = option.name;
        this.displayText.classList.remove('placeholder');
        this.closeDropdown();
        if (triggerCallback) {
            this.onSelect(option);
        }
    }

    setValue(optionId) {
        const option = this.options.find(o => o.id === optionId);
        if (option) {
            this.selectOption(option, false);
        }
    }

    reset() {
        this.selected = null;
        this.displayText.textContent = this.placeholder;
        this.displayText.classList.add('placeholder');
        this.setOptions([]);
    }
}

class SettingsManager {
    constructor(uiManager) {
        this.ui = uiManager;
        this.models = {};
        this.providers = {};
        this.prompts = {};
        this.apiKeys = {};
        this.openRouterModels = [];
        this.languageMap = {
            en: 'English', zh: 'Chinese', es: 'Spanish', fr: 'French', de: 'German'
        };
    }

    async init() {
        await this.loadConfig();
        this.ui.settingsPanel.innerHTML = this.render();

        this.providerSelect = new SearchableSelect('providerSelectContainer', 'Select a Provider', (provider) => {
            this.handleProviderChange(provider.id);
        });
        
        this.modelSelect = new SearchableSelect('modelSelectContainer', 'Select a Model', (model) => {
            this.saveSettings();
        });
        
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
                acc[model.id] = { ...model, provider: modelConfig.provider, display_name: model.display_name };
                return acc;
            }, {});
        } catch (error) {
            console.error("Failed to load configuration:", error);
            this.ui.showToast(t('error.configLoadFailed'), 'error');
        }
    }

    render() {
        const apiKeyInputs = Object.keys(this.providers).map(pid => `
            <div class="api-key-item" data-provider="${pid}">
                <label for="${this.providers[pid].api_key_id}">${this.providers[pid].name} API Key</label>
                <div class="input-group">
                    <input type="password" id="${this.providers[pid].api_key_id}" data-i18n-placeholder="placeholder.apiKey">
                    <button class="btn-icon toggle-visibility"><i class="fas fa-eye"></i></button>
                </div>
            </div>
        `).join('') + `
            <div class="api-key-item" data-provider="mathpix">
                <label for="MathpixAppKey">Mathpix API Key (AppID:AppKey)</label>
                <div class="input-group">
                    <input type="password" id="MathpixAppKey" data-i18n-placeholder="placeholder.mathpixKey">
                    <button class="btn-icon toggle-visibility"><i class="fas fa-eye"></i></button>
                </div>
            </div>`;

        const promptOptions = Object.keys(this.prompts).map(pid => 
            `<option value="${pid}">${t('prompts.' + pid + '.name')}</option>`
        ).join('');
        
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
                        <label>Provider</label>
                        <div id="providerSelectContainer" class="searchable-select"></div>
                    </div>
                    <div class="setting-item">
                        <label>Model</label>
                        <div id="modelSelectContainer" class="searchable-select"></div>
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
                    <div id="promptDescription" class="prompt-description"></div>
                </div>
            </div>`;
    }

    cacheDOMElements() {
        this.languageSelect = document.getElementById('languageSelect');
        this.systemPrompt = document.getElementById('systemPrompt');
        this.promptSelect = document.getElementById('promptSelect');
        this.editPromptBtn = document.getElementById('editPromptBtn');
        this.newPromptBtn = document.getElementById('newPromptBtn');
        this.deletePromptBtn = document.getElementById('deletePromptBtn');
        this.promptDescription = document.getElementById('promptDescription');
        this.apiKeyInputs = {};
        document.querySelectorAll('.api-key-item input').forEach(input => {
            this.apiKeyInputs[input.id] = input;
        });
        document.getElementById('closeSettings').addEventListener('click', () => this.ui.togglePanel(this.ui.settingsPanel));
    }
    
    async handleProviderChange(providerId) {
        this.modelSelect.reset();
        
        if (providerId === 'openrouter') {
            await this.fetchOpenRouterModels();
            const options = this.openRouterModels.map(m => ({ id: m.id, name: m.display_name }));
            this.modelSelect.setOptions(options);
        } else {
            const providerModels = Object.values(this.models).filter(m => m.provider === providerId);
            const options = providerModels.map(m => ({ id: m.id, name: m.display_name }));
            this.modelSelect.setOptions(options);
        }
        this.saveSettings();
    }


    async fetchOpenRouterModels() {
        this.ui.showToast('Fetching models from OpenRouter...', 'info', 2000);
        try {
            const response = await fetch('/api/openrouter/models');
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Failed to fetch');
            }
            this.openRouterModels = await response.json();
            this.ui.showToast('OpenRouter models loaded!', 'success');
        } catch (error) {
            this.ui.showToast(`Error: ${error.message}`, 'error');
            this.openRouterModels = [];
        }
    }

    bindEventListeners() {
        Object.values(this.apiKeyInputs).forEach(input => {
            input.addEventListener('change', () => this.saveSettings());
        });

        this.languageSelect.addEventListener('change', () => {
            this.saveSettings();
            window.i18n.setLanguage(this.languageSelect.value).then(() => {
                const promptOptions = Object.keys(this.prompts).map(pid => 
                    `<option value="${pid}">${t('prompts.' + pid + '.name')}</option>`
                ).join('');
                this.promptSelect.innerHTML = promptOptions;
                this.loadSelectedPrompt();
            });
        });
        this.systemPrompt.addEventListener('input', () => this.saveSettings());
        this.promptSelect.addEventListener('change', () => this.loadSelectedPrompt());

        document.querySelectorAll('.toggle-visibility').forEach(btn => {
            btn.addEventListener('click', () => {
                const input = btn.closest('.input-group').querySelector('input');
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
        
        Object.keys(this.apiKeyInputs).forEach(keyId => {
            if (settings.apiKeys && settings.apiKeys[keyId]) {
                this.apiKeyInputs[keyId].value = settings.apiKeys[keyId];
            }
        });

        const providerOptions = Object.keys(this.providers).map(id => ({ id, name: this.providers[id].name }));
        this.providerSelect.setOptions(providerOptions);
        
        const savedProvider = settings.provider || 'openai';
        this.providerSelect.setValue(savedProvider);
        
        await this.handleProviderChange(savedProvider);
        
        if(settings.model) {
            this.modelSelect.setValue(settings.model);
        }

        const languageCode = this.getLanguageCode(settings.language || 'en');
        this.languageSelect.value = languageCode;
        
        const promptId = settings.promptId || 'a_default';
        this.promptSelect.value = promptId;
        this.systemPrompt.value = (this.prompts[promptId] && this.prompts[promptId].content) || '';
        this.loadSelectedPrompt();
    }

    saveSettings() {
        const apiKeys = {};
        Object.keys(this.apiKeyInputs).forEach(keyId => {
            apiKeys[keyId] = this.apiKeyInputs[keyId].value;
        });

        const settings = {
            provider: this.providerSelect.selected?.id,
            model: this.modelSelect.selected?.id,
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
        const providerId = settings.provider;
        const modelId = settings.model;
        
        let modelInfo = { ...this.models[modelId] };
        if (providerId === 'openrouter' && this.openRouterModels.length > 0) {
            const openRouterModelInfo = this.openRouterModels.find(m => m.id === modelId);
            if (openRouterModelInfo) {
                modelInfo = { ...openRouterModelInfo };
            }
        }

        const langCode = settings.language || 'en';
        const languageName = this.languageMap[langCode] || 'English';

        const apiKeysBackend = {};
        if (settings.apiKeys) {
            Object.entries(settings.apiKeys).forEach(([key, value]) => {
                if (key === 'MathpixAppKey') {
                    const [appId, appKey] = value.split(':');
                    apiKeysBackend['MathpixAppId'] = appId;
                    apiKeysBackend['MathpixAppKey'] = appKey;
                } else {
                    apiKeysBackend[key] = value;
                }
            });
        }

        return {
            provider: providerId,
            model: modelId,
            modelInfo: modelInfo,
            language: languageName,
            systemPrompt: settings.systemPrompt,
            apiKeys: apiKeysBackend
        };
    }

    loadSelectedPrompt() {
        const promptId = this.promptSelect.value;
        if (this.prompts[promptId]) {
            this.systemPrompt.value = this.prompts[promptId].content;
            this.promptDescription.textContent = t('prompts.' + promptId + '.description');
            this.saveSettings();
        }
    }
}