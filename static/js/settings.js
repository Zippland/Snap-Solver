class SettingsManager {
    constructor() {
        this.initializeElements();
        this.loadSettings();
        this.setupEventListeners();
    }

    initializeElements() {
        // Settings panel elements
        this.settingsPanel = document.getElementById('settingsPanel');
        this.modelSelect = document.getElementById('modelSelect');
        this.temperatureInput = document.getElementById('temperature');
        this.temperatureValue = document.getElementById('temperatureValue');
        this.systemPromptInput = document.getElementById('systemPrompt');
        this.proxyEnabledInput = document.getElementById('proxyEnabled');
        this.proxyHostInput = document.getElementById('proxyHost');
        this.proxyPortInput = document.getElementById('proxyPort');
        this.proxySettings = document.getElementById('proxySettings');
        
        // API Key elements
        this.apiKeyInputs = {
            'claude-3-5-sonnet-20241022': document.getElementById('claudeApiKey'),
            'gpt-4o-2024-11-20': document.getElementById('gpt4oApiKey'),
            'deepseek-reasoner': document.getElementById('deepseekApiKey')
        };
        
        // Settings toggle elements
        this.settingsToggle = document.getElementById('settingsToggle');
        this.closeSettings = document.getElementById('closeSettings');
        this.apiKeyGroups = document.querySelectorAll('.api-key-group');
        
        // Initialize API key toggle buttons
        document.querySelectorAll('.toggle-api-key').forEach(button => {
            button.addEventListener('click', (e) => {
                const input = e.target.closest('.input-group').querySelector('input');
                const type = input.type === 'password' ? 'text' : 'password';
                input.type = type;
                const icon = e.target.querySelector('i');
                if (icon) {
                    icon.className = `fas fa-${type === 'password' ? 'eye' : 'eye-slash'}`;
                }
            });
        });
    }

    loadSettings() {
        const settings = JSON.parse(localStorage.getItem('aiSettings') || '{}');
        
        // Load API keys
        if (settings.apiKeys) {
            Object.entries(this.apiKeyInputs).forEach(([model, input]) => {
                if (settings.apiKeys[model]) {
                    input.value = settings.apiKeys[model];
                }
            });
        }
        
        if (settings.model) {
            this.modelSelect.value = settings.model;
            this.updateVisibleApiKey(settings.model);
        } else {
            // Default to first model if none selected
            this.updateVisibleApiKey(this.modelSelect.value);
        }
        
        if (settings.temperature) {
            this.temperatureInput.value = settings.temperature;
            this.temperatureValue.textContent = settings.temperature;
        }
        if (settings.systemPrompt) this.systemPromptInput.value = settings.systemPrompt;
        if (settings.proxyEnabled !== undefined) {
            this.proxyEnabledInput.checked = settings.proxyEnabled;
        }
        if (settings.proxyHost) this.proxyHostInput.value = settings.proxyHost;
        if (settings.proxyPort) this.proxyPortInput.value = settings.proxyPort;
        
        this.proxySettings.style.display = this.proxyEnabledInput.checked ? 'block' : 'none';
    }

    updateVisibleApiKey(selectedModel) {
        this.apiKeyGroups.forEach(group => {
            const modelValue = group.dataset.model;
            group.style.display = modelValue === selectedModel ? 'block' : 'none';
        });
    }

    saveSettings() {
        const settings = {
            apiKeys: {},
            model: this.modelSelect.value,
            temperature: this.temperatureInput.value,
            systemPrompt: this.systemPromptInput.value,
            proxyEnabled: this.proxyEnabledInput.checked,
            proxyHost: this.proxyHostInput.value,
            proxyPort: this.proxyPortInput.value
        };

        // Save all API keys
        Object.entries(this.apiKeyInputs).forEach(([model, input]) => {
            if (input.value) {
                settings.apiKeys[model] = input.value;
            }
        });

        localStorage.setItem('aiSettings', JSON.stringify(settings));
        window.showToast('Settings saved successfully');
    }

    getApiKey() {
        const selectedModel = this.modelSelect.value;
        const apiKey = this.apiKeyInputs[selectedModel]?.value;
        
        if (!apiKey) {
            window.showToast('Please enter API key for the selected model', 'error');
            return '';
        }
        
        return apiKey;
    }

    setupEventListeners() {
        // Save settings on change
        Object.values(this.apiKeyInputs).forEach(input => {
            input.addEventListener('change', () => this.saveSettings());
        });

        this.modelSelect.addEventListener('change', (e) => {
            this.updateVisibleApiKey(e.target.value);
            this.saveSettings();
        });

        this.temperatureInput.addEventListener('input', (e) => {
            this.temperatureValue.textContent = e.target.value;
            this.saveSettings();
        });
        
        this.systemPromptInput.addEventListener('change', () => this.saveSettings());
        this.proxyEnabledInput.addEventListener('change', (e) => {
            this.proxySettings.style.display = e.target.checked ? 'block' : 'none';
            this.saveSettings();
        });
        this.proxyHostInput.addEventListener('change', () => this.saveSettings());
        this.proxyPortInput.addEventListener('change', () => this.saveSettings());

        // Panel visibility
        this.settingsToggle.addEventListener('click', () => {
            window.closeAllPanels();
            this.settingsPanel.classList.toggle('hidden');
        });

        this.closeSettings.addEventListener('click', () => {
            this.settingsPanel.classList.add('hidden');
        });
    }
}

// Export for use in other modules
window.SettingsManager = SettingsManager;
