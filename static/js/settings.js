class SettingsManager {
    constructor() {
        // 初始化属性
        this.modelDefinitions = {};
        this.providerDefinitions = {};
        
        // 初始化界面元素
        this.initializeElements();
        
        // 加载模型配置
        this.loadModelConfig()
            .then(() => {
                // 成功加载配置后，执行后续初始化
                this.updateModelOptions();
                this.loadSettings();
                this.setupEventListeners();
                this.updateUIBasedOnModelType();
            })
            .catch(error => {
                console.error('加载模型配置失败:', error);
                window.uiManager?.showToast('加载模型配置失败，使用默认配置', 'error');
                
                // 使用默认配置作为备份
                this.setupDefaultModels();
                this.updateModelOptions();
                this.loadSettings();
                this.setupEventListeners();
                this.updateUIBasedOnModelType();
            });
        
        // 初始化可折叠内容逻辑
        this.initCollapsibleContent();
    }

    // 从配置文件加载模型定义
    async loadModelConfig() {
        try {
            // 使用API端点获取模型列表
            const response = await fetch('/api/models');
            if (!response.ok) {
                throw new Error(`加载模型列表失败: ${response.status} ${response.statusText}`);
            }
            
            // 获取模型列表
            const modelsList = await response.json();
            
            // 获取提供商配置
            const configResponse = await fetch('/config/models.json');
            if (!configResponse.ok) {
                throw new Error(`加载提供商配置失败: ${configResponse.status} ${configResponse.statusText}`);
            }
            
            const config = await configResponse.json();
            
            // 保存提供商定义
            this.providerDefinitions = config.providers || {};
            
            // 处理模型定义
            this.modelDefinitions = {};
            
            // 从API获取的模型列表创建模型定义
            modelsList.forEach(model => {
                this.modelDefinitions[model.id] = {
                    name: model.display_name,
                    provider: this.getProviderIdByModel(model.id, config),
                    supportsMultimodal: model.is_multimodal,
                    isReasoning: model.is_reasoning,
                    apiKeyId: this.getApiKeyIdByModel(model.id, config),
                    description: model.description,
                    version: this.getVersionByModel(model.id, config)
                };
            });
            
            console.log('模型配置加载成功:', this.modelDefinitions);
        } catch (error) {
            console.error('加载模型配置时出错:', error);
            throw error;
        }
    }
    
    // 从配置中根据模型ID获取提供商ID
    getProviderIdByModel(modelId, config) {
        const modelConfig = config.models[modelId];
        return modelConfig ? modelConfig.provider : 'unknown';
    }
    
    // 从配置中根据模型ID获取API密钥ID
    getApiKeyIdByModel(modelId, config) {
        const modelConfig = config.models[modelId];
        if (!modelConfig) return null;
        
        const providerId = modelConfig.provider;
        const provider = config.providers[providerId];
        return provider ? provider.api_key_id : null;
    }
    
    // 从配置中根据模型ID获取版本信息
    getVersionByModel(modelId, config) {
        const modelConfig = config.models[modelId];
        return modelConfig ? modelConfig.version : 'latest';
    }

    // 设置默认模型定义（当配置加载失败时使用）
    setupDefaultModels() {
        this.providerDefinitions = {
            'anthropic': {
                name: 'Anthropic',
                api_key_id: 'AnthropicApiKey'
            },
            'openai': {
                name: 'OpenAI',
                api_key_id: 'OpenaiApiKey'
            },
            'deepseek': {
                name: 'DeepSeek',
                api_key_id: 'DeepseekApiKey'
            }
        };
        
        this.modelDefinitions = {
            'claude-3-7-sonnet-20250219': {
                name: 'Claude 3.7 Sonnet',
                provider: 'anthropic',
                supportsMultimodal: true,
                isReasoning: true,
                apiKeyId: 'AnthropicApiKey',
                version: '20250219'
            },
            'gpt-4o-2024-11-20': {
                name: 'GPT-4o',
                provider: 'openai',
                supportsMultimodal: true,
                isReasoning: false,
                apiKeyId: 'OpenaiApiKey',
                version: '2024-11-20'
            },
            'deepseek-reasoner': {
                name: 'DeepSeek Reasoner',
                provider: 'deepseek',
                supportsMultimodal: false,
                isReasoning: true,
                apiKeyId: 'DeepseekApiKey',
                version: 'latest'
            }
        };
        
        console.log('使用默认模型配置');
    }

    initializeElements() {
        // Settings panel elements
        this.settingsPanel = document.getElementById('settingsPanel');
        this.modelSelect = document.getElementById('modelSelect');
        this.temperatureInput = document.getElementById('temperature');
        this.temperatureValue = document.getElementById('temperatureValue');
        this.temperatureGroup = document.querySelector('.setting-group:has(#temperature)') || 
                              document.querySelector('div.setting-group:has(input[id="temperature"])');
        this.systemPromptInput = document.getElementById('systemPrompt');
        this.languageInput = document.getElementById('language');
        this.proxyEnabledInput = document.getElementById('proxyEnabled');
        this.proxyHostInput = document.getElementById('proxyHost');
        this.proxyPortInput = document.getElementById('proxyPort');
        this.proxySettings = document.getElementById('proxySettings');
        
        // 最大Token设置元素 - 现在是输入框而不是滑块
        this.maxTokensInput = document.getElementById('maxTokens');
        
        // 理性推理相关元素
        this.reasoningDepthSelect = document.getElementById('reasoningDepth');
        this.reasoningSettingGroup = document.querySelector('.reasoning-setting-group');
        this.thinkBudgetPercentInput = document.getElementById('thinkBudgetPercent');
        this.thinkBudgetPercentValue = document.getElementById('thinkBudgetPercentValue');
        this.thinkBudgetGroup = document.querySelector('.think-budget-group');
        
        // Initialize Mathpix inputs
        this.mathpixAppIdInput = document.getElementById('mathpixAppId');
        this.mathpixAppKeyInput = document.getElementById('mathpixAppKey');
        
        // API Key elements - 所有的密钥输入框
        this.apiKeyInputs = {
            'AnthropicApiKey': document.getElementById('AnthropicApiKey'),
            'OpenaiApiKey': document.getElementById('OpenaiApiKey'),
            'DeepseekApiKey': document.getElementById('DeepseekApiKey'),
            'mathpixAppId': this.mathpixAppIdInput,
            'mathpixAppKey': this.mathpixAppKeyInput
        };
        
        // Settings toggle elements
        this.settingsToggle = document.getElementById('settingsToggle');
        this.closeSettings = document.getElementById('closeSettings');
        
        // 获取所有密钥输入组元素
        this.apiKeyGroups = document.querySelectorAll('.api-key-group');
        
        // Initialize API key toggle buttons
        document.querySelectorAll('.toggle-api-key').forEach(button => {
            button.addEventListener('click', (e) => {
                const input = e.currentTarget.closest('.input-group').querySelector('input');
                const type = input.type === 'password' ? 'text' : 'password';
                input.type = type;
                const icon = e.currentTarget.querySelector('i');
                if (icon) {
                    icon.className = `fas fa-${type === 'password' ? 'eye' : 'eye-slash'}`;
                }
            });
        });
    }

    // 更新模型选择下拉框
    updateModelOptions() {
        // 清空现有选项
        this.modelSelect.innerHTML = '';
        
        // 提取提供商信息
        const providers = {};
        Object.entries(this.providerDefinitions).forEach(([providerId, provider]) => {
            providers[providerId] = provider.name;
        });
        
        // 为每个提供商创建一个选项组
        for (const [providerId, providerName] of Object.entries(providers)) {
            const optgroup = document.createElement('optgroup');
            optgroup.label = providerName;
            
            // 过滤该提供商的模型
            const providerModels = Object.entries(this.modelDefinitions)
                .filter(([_, modelInfo]) => modelInfo.provider === providerId)
                .sort((a, b) => a[1].name.localeCompare(b[1].name));
            
            // 添加该提供商的模型选项
            for (const [modelId, modelInfo] of providerModels) {
                const option = document.createElement('option');
                option.value = modelId;
                
                // 显示模型名称和版本（如果不是latest）
                let displayName = modelInfo.name;
                if (modelInfo.version && modelInfo.version !== 'latest') {
                    displayName += ` (${modelInfo.version})`;
                }
                
                option.textContent = displayName;
                optgroup.appendChild(option);
            }
            
            // 只添加有模型的提供商
            if (optgroup.children.length > 0) {
                this.modelSelect.appendChild(optgroup);
            }
        }
    }

    loadSettings() {
        const settings = JSON.parse(localStorage.getItem('aiSettings') || '{}');
        
        // Load Mathpix credentials
        if (settings.mathpixAppId) {
            this.mathpixAppIdInput.value = settings.mathpixAppId;
        }
        if (settings.mathpixAppKey) {
            this.mathpixAppKeyInput.value = settings.mathpixAppKey;
        }
        
        // Load API keys
        if (settings.apiKeys) {
            Object.entries(settings.apiKeys).forEach(([keyId, value]) => {
                const input = this.apiKeyInputs[keyId];
                if (input) {
                    input.value = value;
                }
            });
        }
        
        // Load model selection
        if (settings.model && this.modelExists(settings.model)) {
            this.modelSelect.value = settings.model;
            this.updateVisibleApiKey(settings.model);
        }
        
        // Load max tokens setting - 现在直接设置输入框值
        const maxTokens = parseInt(settings.maxTokens || '8192');
        this.maxTokensInput.value = maxTokens;
        
        // Load reasoning depth & think budget settings
        if (settings.reasoningDepth) {
            this.reasoningDepthSelect.value = settings.reasoningDepth;
        }
        
        // 加载思考预算百分比
        const thinkBudgetPercent = parseInt(settings.thinkBudgetPercent || '50');
        if (this.thinkBudgetPercentInput) {
            this.thinkBudgetPercentInput.value = thinkBudgetPercent;
        }
        
        // 更新思考预算显示
        this.updateThinkBudgetDisplay();
        
        // 初始化思考预算滑块背景颜色
        this.updateRangeSliderBackground(this.thinkBudgetPercentInput);
        
        // Load other settings
        if (settings.temperature) {
            this.temperatureInput.value = settings.temperature;
            this.temperatureValue.textContent = settings.temperature;
            this.updateRangeSliderBackground(this.temperatureInput);
        }
        
        if (settings.systemPrompt) {
            this.systemPromptInput.value = settings.systemPrompt;
        }
        
        if (settings.language) {
            this.languageInput.value = settings.language;
        }
        
        // Load proxy settings
        if (settings.proxyEnabled !== undefined) {
            this.proxyEnabledInput.checked = settings.proxyEnabled;
            this.proxySettings.style.display = settings.proxyEnabled ? 'block' : 'none';
        }
        
        if (settings.proxyHost) {
            this.proxyHostInput.value = settings.proxyHost;
        }
        
        if (settings.proxyPort) {
            this.proxyPortInput.value = settings.proxyPort;
        }
        
        // Update UI based on model type
        this.updateUIBasedOnModelType();
    }

    modelExists(modelId) {
        return this.modelDefinitions.hasOwnProperty(modelId);
    }

    // 更新模型版本显示
    updateModelVersionDisplay(modelId) {
        const modelVersionText = document.getElementById('modelVersionText');
        if (!modelVersionText) return;
        
        const model = this.modelDefinitions[modelId];
        if (!model) {
            modelVersionText.textContent = '-';
            return;
        }
        
        // 显示版本信息（如果有）
        if (model.version && model.version !== 'latest') {
            modelVersionText.textContent = model.version;
        } else if (model.version === 'latest') {
            modelVersionText.textContent = '最新版';
        } else {
            modelVersionText.textContent = '-';
        }
    }

    updateVisibleApiKey(selectedModel) {
        const modelInfo = this.modelDefinitions[selectedModel];
        if (!modelInfo) return;
        
        // 仅更新模型版本显示
        this.updateModelVersionDisplay(selectedModel);
        
        // 不再需要高亮API密钥
        // 这里我们不再进行API密钥的高亮处理
    }

    updateUIBasedOnModelType() {
        const selectedModel = this.modelSelect.value;
        const modelInfo = this.modelDefinitions[selectedModel];
        
        if (!modelInfo) return;
        
        // 处理温度设置显示
        if (this.temperatureGroup) {
            this.temperatureGroup.style.display = modelInfo.isReasoning ? 'none' : 'block';
        }
        
        // 处理深度推理设置显示
        const isAnthropicReasoning = modelInfo.isReasoning && modelInfo.provider === 'anthropic';
        
        // 只有对Claude 3.7 Sonnet这样的Anthropic推理模型才显示深度推理设置
        if (this.reasoningSettingGroup) {
            this.reasoningSettingGroup.style.display = isAnthropicReasoning ? 'block' : 'none';
        }
        
        // 只有当启用深度推理且是Anthropic推理模型时才显示思考预算设置
        if (this.thinkBudgetGroup) {
            const showThinkBudget = isAnthropicReasoning && 
                                    this.reasoningDepthSelect && 
                                    this.reasoningDepthSelect.value === 'extended';
            this.thinkBudgetGroup.style.display = showThinkBudget ? 'block' : 'none';
        }
    }

    saveSettings() {
        const settings = {
            apiKeys: {},
            mathpixAppId: this.mathpixAppIdInput.value,
            mathpixAppKey: this.mathpixAppKeyInput.value,
            model: this.modelSelect.value,
            maxTokens: this.maxTokensInput.value,
            reasoningDepth: this.reasoningDepthSelect?.value || 'standard',
            thinkBudgetPercent: this.thinkBudgetPercentInput?.value || '50',
            temperature: this.temperatureInput.value,
            language: this.languageInput.value,
            systemPrompt: this.systemPromptInput.value,
            proxyEnabled: this.proxyEnabledInput.checked,
            proxyHost: this.proxyHostInput.value,
            proxyPort: this.proxyPortInput.value
        };

        // Save all API keys
        Object.entries(this.apiKeyInputs).forEach(([keyId, input]) => {
            if (input.value) {
                settings.apiKeys[keyId] = input.value;
            }
        });

        localStorage.setItem('aiSettings', JSON.stringify(settings));
        window.showToast('Settings saved successfully');
    }

    getApiKey() {
        const selectedModel = this.modelSelect.value;
        const modelInfo = this.modelDefinitions[selectedModel];
        
        if (!modelInfo) return '';
        
        const apiKeyId = modelInfo.apiKeyId;
        const apiKey = this.apiKeyInputs[apiKeyId]?.value;
        
        if (!apiKey) {
            window.showToast('Please enter API key for the selected model', 'error');
            return '';
        }
        
        return apiKey;
    }

    getSettings() {
        const language = this.languageInput.value || '中文';
        const basePrompt = this.systemPromptInput.value || '';
        
        let systemPrompt = basePrompt;
        if (!basePrompt.includes('Please respond in') && !basePrompt.includes('请用') && !basePrompt.includes('使用')) {
            systemPrompt = `${basePrompt}\n\n请务必使用${language}回答。`;
        }
        
        const selectedModel = this.modelSelect.value;
        const modelInfo = this.modelDefinitions[selectedModel] || {};
        
        // 获取最大Token数
        const maxTokens = parseInt(this.maxTokensInput?.value || '8192');
        
        // 获取推理深度设置
        const reasoningDepth = this.reasoningDepthSelect?.value || 'standard';
        const thinkBudgetPercent = parseInt(this.thinkBudgetPercentInput?.value || '50');
        
        // 计算思考预算的实际Token数
        const thinkBudget = Math.floor(maxTokens * (thinkBudgetPercent / 100));
        
        // 构建推理配置参数
        const reasoningConfig = {};
        if (modelInfo.provider === 'anthropic' && modelInfo.isReasoning) {
            if (reasoningDepth === 'extended') {
                reasoningConfig.reasoning_depth = 'extended';
                reasoningConfig.think_budget = thinkBudget;
            } else {
                reasoningConfig.speed_mode = 'instant';
            }
        }
        
        return {
            model: selectedModel,
            maxTokens: maxTokens,
            temperature: this.temperatureInput.value,
            language: language,
            systemPrompt: systemPrompt,
            proxyEnabled: this.proxyEnabledInput.checked,
            proxyHost: this.proxyHostInput.value,
            proxyPort: this.proxyPortInput.value,
            mathpixApiKey: `${this.mathpixAppIdInput.value}:${this.mathpixAppKeyInput.value}`,
            modelInfo: {
                supportsMultimodal: modelInfo.supportsMultimodal || false,
                isReasoning: modelInfo.isReasoning || false,
                provider: modelInfo.provider || 'unknown'
            },
            reasoningConfig: reasoningConfig
        };
    }

    getModelCapabilities(modelId) {
        const model = this.modelDefinitions[modelId];
        if (!model) return { supportsMultimodal: false, isReasoning: false };
        
        return {
            supportsMultimodal: model.supportsMultimodal,
            isReasoning: model.isReasoning
        };
    }

    setupEventListeners() {
        // Save settings on change
        Object.values(this.apiKeyInputs).forEach(input => {
            input.addEventListener('change', () => this.saveSettings());
        });

        // Save Mathpix settings on change
        this.mathpixAppIdInput.addEventListener('change', () => this.saveSettings());
        this.mathpixAppKeyInput.addEventListener('change', () => this.saveSettings());

        this.modelSelect.addEventListener('change', (e) => {
            this.updateVisibleApiKey(e.target.value);
            this.updateUIBasedOnModelType();
            this.updateModelVersionDisplay(e.target.value);
            this.saveSettings();
            
            // 通知应用更新图像操作按钮
            if (window.app && typeof window.app.updateImageActionButtons === 'function') {
                window.app.updateImageActionButtons();
            }
        });

        // 最大Token输入框事件处理
        if (this.maxTokensInput) {
            this.maxTokensInput.addEventListener('change', (e) => {
                // 验证输入值在有效范围内
                let value = parseInt(e.target.value);
                if (isNaN(value)) value = 8192;
                value = Math.max(1000, Math.min(128000, value));
                this.maxTokensInput.value = value;
                
                // 更新思考预算显示
                this.updateThinkBudgetDisplay();
                
                this.saveSettings();
            });
        }

        // 推理深度选择事件处理
        if (this.reasoningDepthSelect) {
            this.reasoningDepthSelect.addEventListener('change', () => {
                // 更新思考预算组的可见性
                if (this.thinkBudgetGroup) {
                    const showThinkBudget = this.reasoningDepthSelect.value === 'extended';
                    this.thinkBudgetGroup.style.display = showThinkBudget ? 'block' : 'none';
                }
                this.saveSettings();
            });
        }

        // 思考预算占比滑块事件处理
        if (this.thinkBudgetPercentInput && this.thinkBudgetPercentValue) {
            this.thinkBudgetPercentInput.addEventListener('input', (e) => {
                // 更新思考预算显示
                this.updateThinkBudgetDisplay();
                
                // 更新滑块背景
                this.updateRangeSliderBackground(e.target);
                
                this.saveSettings();
            });
        }

        this.temperatureInput.addEventListener('input', (e) => {
            this.temperatureValue.textContent = e.target.value;
            this.updateRangeSliderBackground(e.target);
            this.saveSettings();
        });
        
        this.systemPromptInput.addEventListener('change', () => this.saveSettings());
        this.languageInput.addEventListener('change', () => this.saveSettings());
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
    
    // 辅助方法：更新滑块的背景颜色
    updateRangeSliderBackground(slider) {
        if (!slider) return;
        
        const value = slider.value;
        const min = slider.min || 0;
        const max = slider.max || 100;
        const percentage = (value - min) / (max - min) * 100;
        slider.style.background = `linear-gradient(to right, var(--primary) 0%, var(--primary) ${percentage}%, var(--border-color) ${percentage}%, var(--border-color) 100%)`;
    }

    // 更新思考预算显示
    updateThinkBudgetDisplay() {
        if (this.thinkBudgetPercentInput && this.thinkBudgetPercentValue) {
            const percent = parseInt(this.thinkBudgetPercentInput.value);
            
            // 只显示百分比，不显示token数量
            this.thinkBudgetPercentValue.textContent = `${percent}%`;
            
            // 更新滑块背景
            this.updateRangeSliderBackground(this.thinkBudgetPercentInput);
        }
    }

    /**
     * 初始化可折叠内容的交互逻辑
     */
    initCollapsibleContent() {
        // 获取API密钥折叠切换按钮和内容
        const apiKeysToggle = document.getElementById('apiKeysCollapseToggle');
        const apiKeysContent = document.getElementById('apiKeysContent');
        
        // 添加点击事件以切换折叠状态
        if (apiKeysToggle && apiKeysContent) {
            apiKeysToggle.addEventListener('click', () => {
                // 切换折叠状态
                apiKeysContent.classList.toggle('collapsed');
                
                // 更新图标方向
                const icon = apiKeysToggle.querySelector('.fa-chevron-down, .fa-chevron-up');
                if (icon) {
                    if (apiKeysContent.classList.contains('collapsed')) {
                        icon.classList.replace('fa-chevron-up', 'fa-chevron-down');
                    } else {
                        icon.classList.replace('fa-chevron-down', 'fa-chevron-up');
                    }
                }
            });
        }
    }
}

// Export for use in other modules
window.SettingsManager = SettingsManager;
