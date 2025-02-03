class SettingsManager {
    constructor() {
        this.initializeElements();
        this.loadSettings();
        this.setupEventListeners();
    }

    initializeElements() {
        // Settings panel elements
        this.settingsPanel = document.getElementById('settingsPanel');
        this.apiKeyInput = document.getElementById('apiKey');
        this.modelSelect = document.getElementById('modelSelect');
        this.temperatureInput = document.getElementById('temperature');
        this.temperatureValue = document.getElementById('temperatureValue');
        this.systemPromptInput = document.getElementById('systemPrompt');
        this.proxyEnabledInput = document.getElementById('proxyEnabled');
        this.proxyHostInput = document.getElementById('proxyHost');
        this.proxyPortInput = document.getElementById('proxyPort');
        this.proxySettings = document.getElementById('proxySettings');
        
        // Settings toggle elements
        this.settingsToggle = document.getElementById('settingsToggle');
        this.closeSettings = document.getElementById('closeSettings');
        this.toggleApiKey = document.getElementById('toggleApiKey');
    }

    loadSettings() {
        const settings = JSON.parse(localStorage.getItem('aiSettings') || '{}');
        
        if (settings.apiKey) this.apiKeyInput.value = settings.apiKey;
        if (settings.model) this.modelSelect.value = settings.model;
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

    saveSettings() {
        const settings = {
            apiKey: this.apiKeyInput.value,
            model: this.modelSelect.value,
            temperature: this.temperatureInput.value,
            systemPrompt: this.systemPromptInput.value,
            proxyEnabled: this.proxyEnabledInput.checked,
            proxyHost: this.proxyHostInput.value,
            proxyPort: this.proxyPortInput.value
        };
        localStorage.setItem('aiSettings', JSON.stringify(settings));
        window.showToast('Settings saved successfully');
    }

    getSettings() {
        return JSON.parse(localStorage.getItem('aiSettings') || '{}');
    }

    setupEventListeners() {
        // Save settings on change
        this.apiKeyInput.addEventListener('change', () => this.saveSettings());
        this.modelSelect.addEventListener('change', () => this.saveSettings());
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

        // Toggle API key visibility
        this.toggleApiKey.addEventListener('click', () => {
            const type = this.apiKeyInput.type === 'password' ? 'text' : 'password';
            this.apiKeyInput.type = type;
            this.toggleApiKey.innerHTML = `<i class="fas fa-${type === 'password' ? 'eye' : 'eye-slash'}"></i>`;
        });

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
