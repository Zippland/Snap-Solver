class SettingsManager {
    constructor() {
        // 初始化属性
        this.modelDefinitions = {};
        this.providerDefinitions = {};
        
        // 初始化界面元素
        this.initializeElements();
        
        // 提示词配置
        this.prompts = {};
        this.currentPromptId = 'default';
        
        // 加载模型配置
        this.isInitialized = false;
        this.initialize();
    }
    
    async initialize() {
        try {
            // 加载模型配置
            await this.loadModelConfig();
            
                // 成功加载配置后，执行后续初始化
                this.updateModelOptions();
            await this.loadSettings();
            await this.loadPrompts(); // 加载提示词配置
                this.setupEventListeners();
                this.updateUIBasedOnModelType();
            
            // 初始化可折叠内容逻辑
            this.initCollapsibleContent();
            
            this.isInitialized = true;
            console.log('设置管理器初始化完成');
        } catch (error) {
            console.error('初始化设置管理器失败:', error);
                window.uiManager?.showToast('加载模型配置失败，使用默认配置', 'error');
                
                // 使用默认配置作为备份
                this.setupDefaultModels();
                this.updateModelOptions();
            await this.loadSettings();
            await this.loadPrompts(); // 加载提示词配置
                this.setupEventListeners();
                this.updateUIBasedOnModelType();
        
        // 初始化可折叠内容逻辑
        this.initCollapsibleContent();
            
            this.isInitialized = true;
        }
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
        
        // 提示词管理相关元素
        this.promptSelect = document.getElementById('promptSelect');
        this.savePromptBtn = document.getElementById('savePromptBtn');
        this.newPromptBtn = document.getElementById('newPromptBtn');
        this.deletePromptBtn = document.getElementById('deletePromptBtn');
        
        // 提示词对话框元素
        this.promptDialog = document.getElementById('promptDialog');
        this.promptDialogOverlay = document.getElementById('promptDialogOverlay');
        this.promptIdInput = document.getElementById('promptId');
        this.promptNameInput = document.getElementById('promptName');
        this.promptContentInput = document.getElementById('promptContent');
        this.promptDescriptionInput = document.getElementById('promptDescription');
        this.cancelPromptBtn = document.getElementById('cancelPromptBtn');
        this.confirmPromptBtn = document.getElementById('confirmPromptBtn');
        
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
            'AlibabaApiKey': document.getElementById('AlibabaApiKey'),
            'mathpixAppId': this.mathpixAppIdInput,
            'mathpixAppKey': this.mathpixAppKeyInput
        };
        
        // API密钥状态显示相关元素
        this.apiKeysList = document.getElementById('apiKeysList');
        
        // 防止API密钥区域的点击事件冒泡
        if (this.apiKeysList) {
            this.apiKeysList.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        }
        
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
        
        // 存储API密钥的对象
        this.apiKeyValues = {
            'AnthropicApiKey': '',
            'OpenaiApiKey': '',
            'DeepseekApiKey': '',
            'AlibabaApiKey': '',
            'MathpixAppId': '',
            'MathpixAppKey': ''
        };
        
        // 初始化密钥编辑功能
        this.initApiKeyEditFunctions();
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

    async loadSettings() {
        try {
            // 先从localStorage加载大部分设置
        const settings = JSON.parse(localStorage.getItem('aiSettings') || '{}');
        
            // 刷新API密钥状态（自动从服务器获取最新状态）
            await this.refreshApiKeyStatus();
            console.log('已自动刷新API密钥状态');
            
            // 加载其他设置
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
        
        // 加载当前选中的提示词ID
        if (settings.currentPromptId) {
            this.currentPromptId = settings.currentPromptId;
        }
        
        // Update UI based on model type
        this.updateUIBasedOnModelType();
            
        } catch (error) {
            console.error('加载设置出错:', error);
            window.uiManager?.showToast('加载设置出错', 'error');
        }
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

    /**
     * 根据选择的模型类型更新UI显示
     */
    updateUIBasedOnModelType() {
        // 更新UI元素显示，根据所选模型类型
        const selectedModel = this.modelSelect.value;
        const modelInfo = this.modelDefinitions[selectedModel];
        
        // 更新当前可见的API密钥
        this.updateVisibleApiKey(selectedModel);
        
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
        
        // 控制最大Token设置的显示
        // 阿里巴巴模型不支持自定义Token设置
        const maxTokensGroup = this.maxTokensInput ? this.maxTokensInput.closest('.setting-group') : null;
        if (maxTokensGroup) {
            // 如果是阿里巴巴模型，隐藏Token设置
            const isAlibabaModel = modelInfo.provider === 'alibaba';
            maxTokensGroup.style.display = isAlibabaModel ? 'none' : 'block';
        }
        
        // 更新模型版本显示
        this.updateModelVersionDisplay(selectedModel);
    }

    /**
     * 根据选择的模型更新显示的API密钥
     * @param {string} modelType 模型类型
     */
    updateVisibleApiKey(modelType) {
        // 获取所有API密钥状态元素
        const allApiKeys = document.querySelectorAll('.api-key-status');
        
        // 首先隐藏所有API密钥
        allApiKeys.forEach(key => {
            key.classList.remove('highlight');
        });
        
        // 根据当前选择的模型类型，突出显示对应的API密钥
        let apiKeyToHighlight = null;
        
        if (modelType.startsWith('claude')) {
            apiKeyToHighlight = document.querySelector('.api-key-status:nth-child(1)'); // Anthropic
        } else if (modelType.startsWith('gpt')) {
            apiKeyToHighlight = document.querySelector('.api-key-status:nth-child(2)'); // OpenAI
        } else if (modelType.startsWith('deepseek')) {
            apiKeyToHighlight = document.querySelector('.api-key-status:nth-child(3)'); // DeepSeek
        } else if (modelType.startsWith('qwen')) {
            apiKeyToHighlight = document.querySelector('.api-key-status:nth-child(4)'); // Alibaba
        }
        
        // 高亮显示对应的API密钥
        if (apiKeyToHighlight) {
            apiKeyToHighlight.classList.add('highlight');
        }
    }

    async saveSettings() {
        try {
            // 保存UI设置到localStorage（不包含API密钥）
        const settings = {
                apiKeys: this.apiKeyValues, // 保存到localStorage（向后兼容）
            model: this.modelSelect.value,
            maxTokens: this.maxTokensInput.value,
            reasoningDepth: this.reasoningDepthSelect?.value || 'standard',
            thinkBudgetPercent: this.thinkBudgetPercentInput?.value || '50',
            temperature: this.temperatureInput.value,
            language: this.languageInput.value,
            systemPrompt: this.systemPromptInput.value,
            currentPromptId: this.currentPromptId,
            proxyEnabled: this.proxyEnabledInput.checked,
            proxyHost: this.proxyHostInput.value,
            proxyPort: this.proxyPortInput.value
        };

            // 保存设置到localStorage
        localStorage.setItem('aiSettings', JSON.stringify(settings));
            
            window.uiManager?.showToast('设置已保存', 'success');
        } catch (error) {
            console.error('保存设置出错:', error);
            window.uiManager?.showToast('保存设置出错: ' + error.message, 'error');
        }
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
        
        // 从apiKeyValues获取Mathpix信息，而不是直接从DOM读取
        const mathpixAppId = this.apiKeyValues['MathpixAppId'] || '';
        const mathpixAppKey = this.apiKeyValues['MathpixAppKey'] || '';
        const mathpixApiKey = mathpixAppId && mathpixAppKey ? `${mathpixAppId}:${mathpixAppKey}` : '';
        
        return {
            model: selectedModel,
            maxTokens: maxTokens,
            temperature: this.temperatureInput.value,
            language: language,
            systemPrompt: systemPrompt,
            proxyEnabled: this.proxyEnabledInput.checked,
            proxyHost: this.proxyHostInput.value,
            proxyPort: this.proxyPortInput.value,
            mathpixApiKey: mathpixApiKey,
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

        // 提示词相关事件监听
        if (this.promptSelect) {
            this.promptSelect.addEventListener('change', (e) => {
                // 阻止事件冒泡
                e.stopPropagation();
                
                // 加载选中的提示词
                this.loadPrompt(e.target.value);
            });
        }
        
        // 保存提示词按钮
        if (this.savePromptBtn) {
            this.savePromptBtn.addEventListener('click', (e) => {
                // 阻止事件冒泡
                e.stopPropagation();
                
                // 打开编辑对话框
                this.openEditPromptDialog();
            });
        }
        
        // 新建提示词按钮
        if (this.newPromptBtn) {
            this.newPromptBtn.addEventListener('click', (e) => {
                // 阻止事件冒泡
                e.stopPropagation();
                
                // 打开新建对话框
                this.openNewPromptDialog();
            });
        }
        
        // 删除提示词按钮
        if (this.deletePromptBtn) {
            this.deletePromptBtn.addEventListener('click', (e) => {
                // 阻止事件冒泡
                e.stopPropagation();
                
                // 删除当前提示词
                this.deletePrompt();
            });
        }
        
        // 提示词对话框相关事件
        if (this.cancelPromptBtn) {
            this.cancelPromptBtn.addEventListener('click', (e) => {
                // 阻止事件冒泡
                e.stopPropagation();
                
                // 关闭对话框
                this.closePromptDialog();
            });
        }
        
        if (this.confirmPromptBtn) {
            this.confirmPromptBtn.addEventListener('click', (e) => {
                // 阻止事件冒泡
                e.stopPropagation();
                
                // 保存提示词
                this.savePrompt();
            });
        }
        
        if (this.promptDialogOverlay) {
            this.promptDialogOverlay.addEventListener('click', (e) => {
                // 点击遮罩关闭对话框
                this.closePromptDialog();
            });
        }
        
        // 系统提示词输入框的变更保存设置
        this.systemPromptInput.addEventListener('change', (e) => {
            // 阻止事件冒泡
            e.stopPropagation();
            this.saveSettings();
        });

        // 最大Token输入框事件处理
        if (this.maxTokensInput) {
            this.maxTokensInput.addEventListener('change', (e) => {
                // 阻止事件冒泡
                e.stopPropagation();
                
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
            this.reasoningDepthSelect.addEventListener('change', (e) => {
                // 阻止事件冒泡
                e.stopPropagation();
                
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
                // 阻止事件冒泡
                e.stopPropagation();
                
                // 更新思考预算显示
                this.updateThinkBudgetDisplay();
                
                // 更新滑块背景
                this.updateRangeSliderBackground(e.target);
                
                this.saveSettings();
            });
        }

        this.temperatureInput.addEventListener('input', (e) => {
            // 阻止事件冒泡
            e.stopPropagation();
            
            this.temperatureValue.textContent = e.target.value;
            this.updateRangeSliderBackground(e.target);
            this.saveSettings();
        });
        
        this.languageInput.addEventListener('change', (e) => {
            // 阻止事件冒泡
            e.stopPropagation();
            this.saveSettings();
        });
        
        this.proxyEnabledInput.addEventListener('change', (e) => {
            // 阻止事件冒泡
            e.stopPropagation();
            
            this.proxySettings.style.display = e.target.checked ? 'block' : 'none';
            this.saveSettings();
        });
        
        this.proxyHostInput.addEventListener('change', (e) => {
            // 阻止事件冒泡
            e.stopPropagation();
            this.saveSettings();
        });
        
        this.proxyPortInput.addEventListener('change', (e) => {
            // 阻止事件冒泡
            e.stopPropagation();
            this.saveSettings();
        });

        // Panel visibility
        this.settingsToggle.addEventListener('click', () => {
            this.toggleSettingsPanel();
        });

        this.closeSettings.addEventListener('click', () => {
            this.closeSettingsPanel();
        });
        
        // 确保设置面板自身的点击不会干扰内部操作
        if (this.settingsPanel) {
            const settingsSections = this.settingsPanel.querySelectorAll('.settings-section');
            settingsSections.forEach(section => {
                section.addEventListener('click', (e) => {
                    // 只阻止直接点击设置部分的事件
                    if (e.target === section) {
                        e.stopPropagation();
                    }
                });
            });
            
            // 设置内容区域防止冒泡
            const settingsContent = this.settingsPanel.querySelector('.settings-content');
            if (settingsContent) {
                settingsContent.addEventListener('click', (e) => {
                    // 只阻止直接点击设置内容区域的事件
                    if (e.target === settingsContent) {
                        e.stopPropagation();
                    }
                });
            }
        }
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
        // 在新的实现中，我们不再需要折叠API密钥区域，因为所有功能都在同一区域完成
        console.log('初始化API密钥编辑功能完成');
    }

    /**
     * 初始化API密钥编辑相关功能
     */
    initApiKeyEditFunctions() {
        // 1. 编辑按钮点击事件
        document.querySelectorAll('.edit-api-key').forEach(button => {
            button.addEventListener('click', (e) => {
                // 阻止事件冒泡
                e.stopPropagation();
                
                const keyType = e.currentTarget.getAttribute('data-key-type');
                const keyStatus = e.currentTarget.closest('.key-status-wrapper');
                
                if (keyStatus) {
                    // 隐藏显示区域
                    const displayArea = keyStatus.querySelector('.key-display');
                    if (displayArea) displayArea.classList.add('hidden');
                    
                    // 显示编辑区域
                    const editArea = keyStatus.querySelector('.key-edit');
                    if (editArea) {
                        editArea.classList.remove('hidden');
                        
                        // 获取当前密钥值并填入输入框
                        const keyInput = editArea.querySelector('.key-input');
                        if (keyInput) {
                            // 从状态文本中获取当前值(如果不是"未设置")
                            const statusElement = keyStatus.querySelector('.key-status');
                            if (statusElement && statusElement.textContent !== '未设置') {
                                keyInput.value = this.apiKeyValues[keyType] || '';
                            } else {
                                keyInput.value = '';
                            }
                            
                            // 聚焦输入框
                            setTimeout(() => {
                                keyInput.focus();
                            }, 100);
                        }
                    }
                }
            });
        });
        
        // 2. 保存按钮点击事件
        document.querySelectorAll('.save-api-key').forEach(button => {
            button.addEventListener('click', (e) => {
                // 阻止事件冒泡
                e.stopPropagation();
                
                const keyType = e.currentTarget.getAttribute('data-key-type');
                const keyStatus = e.currentTarget.closest('.key-status-wrapper');
                
                if (keyStatus) {
                    // 获取输入的新密钥值
                    const keyInput = keyStatus.querySelector('.key-input');
                    if (keyInput) {
                        const newValue = keyInput.value.trim();
                        
                        // 保存到内存中
                        this.apiKeyValues[keyType] = newValue;
                        
                        // 创建要保存的API密钥对象
                        const apiKeysToSave = {};
                        apiKeysToSave[keyType] = newValue;
                        
                        // 保存到服务器
                        this.saveApiKey(keyType, newValue, keyStatus);
                        
                        // 隐藏编辑区域
                        const editArea = keyStatus.querySelector('.key-edit');
                        if (editArea) editArea.classList.add('hidden');
                        
                        // 显示状态区域
                        const displayArea = keyStatus.querySelector('.key-display');
                        if (displayArea) displayArea.classList.remove('hidden');
                    }
                }
            });
        });
        
        // 3. 切换密码可见性按钮
        document.querySelectorAll('.toggle-visibility').forEach(button => {
            button.addEventListener('click', (e) => {
                // 阻止事件冒泡
                e.stopPropagation();
                
                const keyInput = e.currentTarget.closest('.key-edit').querySelector('.key-input');
                if (keyInput) {
                    const type = keyInput.type === 'password' ? 'text' : 'password';
                    keyInput.type = type;
                    
                    // 更新图标
                    const icon = e.currentTarget.querySelector('i');
                if (icon) {
                        icon.className = `fas fa-${type === 'password' ? 'eye' : 'eye-slash'}`;
                    }
                }
            });
        });
        
        // 4. 输入框按下Enter保存
        document.querySelectorAll('.key-input').forEach(input => {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    // 阻止事件冒泡
                    e.stopPropagation();
                    
                    const saveButton = e.currentTarget.closest('.key-edit').querySelector('.save-api-key');
                    if (saveButton) {
                        saveButton.click();
                    }
                } else if (e.key === 'Escape') {
                    // 阻止事件冒泡
                    e.stopPropagation();
                    
                    // 取消编辑
                    const keyStatus = e.currentTarget.closest('.key-status-wrapper');
                    if (keyStatus) {
                        const editArea = keyStatus.querySelector('.key-edit');
                        if (editArea) editArea.classList.add('hidden');
                        
                        const displayArea = keyStatus.querySelector('.key-display');
                        if (displayArea) displayArea.classList.remove('hidden');
                    }
                }
            });
        });
    }
    
    /**
     * 更新API密钥状态显示
     * @param {Object} apiKeys 密钥对象
     */
    updateApiKeyStatus(apiKeys) {
        if (!this.apiKeysList) return;
        
        // 保存API密钥值到内存中
        for (const [key, value] of Object.entries(apiKeys)) {
            this.apiKeyValues[key] = value;
        }
        
        // 找到所有密钥状态元素
        Object.keys(apiKeys).forEach(keyId => {
            const statusElement = document.getElementById(`${keyId}Status`);
            if (!statusElement) return;
            
            const value = apiKeys[keyId];
            
            if (value && value.trim() !== '') {
                // 显示密钥状态 - 已设置
                statusElement.className = 'key-status set';
                statusElement.innerHTML = `<i class="fas fa-check-circle"></i> 已设置`;
                    } else {
                // 显示密钥状态 - 未设置
                statusElement.className = 'key-status not-set';
                statusElement.innerHTML = `<i class="fas fa-times-circle"></i> 未设置`;
            }
        });
    }
    
    /**
     * 保存单个API密钥
     * @param {string} keyType 密钥类型
     * @param {string} value 密钥值
     * @param {HTMLElement} keyStatus 密钥状态容器
     */
    async saveApiKey(keyType, value, keyStatus) {
        try {
            // 显示保存中状态
            const saveToast = this.createToast('正在保存密钥...', 'info', true);
            
            // 创建要保存的数据对象
            const apiKeysData = {};
            apiKeysData[keyType] = value;
            
            // 发送到服务器
            const response = await fetch('/api/keys', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(apiKeysData)
            });
            
            // 移除保存中提示
            if (saveToast) {
                saveToast.remove();
            }
            
            if (response.ok) {
                const result = await response.json();
                if (result.success) {
                    // 更新密钥状态显示
                    const statusElem = document.getElementById(`${keyType}Status`);
                    if (statusElem) {
                        if (value && value.trim() !== '') {
                            statusElem.className = 'key-status set';
                            statusElem.innerHTML = `<i class="fas fa-check-circle"></i> 已设置`;
                        } else {
                            statusElem.className = 'key-status not-set';
                            statusElem.innerHTML = `<i class="fas fa-times-circle"></i> 未设置`;
                        }
                    }
                    
                    this.createToast('密钥已保存', 'success');
                } else {
                    this.createToast('保存密钥失败: ' + result.message, 'error');
                }
            } else {
                this.createToast('无法连接到服务器', 'error');
            }
        } catch (error) {
            console.error('保存密钥出错:', error);
            this.createToast('保存密钥出错: ' + error.message, 'error');
        }
    }

    /**
     * 创建一个Toast提示消息
     * @param {string} message 提示消息内容
     * @param {string} type 提示类型：'success', 'error', 'warning', 'info'
     * @param {boolean} persistent 是否为持久性提示（需要手动关闭）
     */
    createToast(message, type = 'success', persistent = false) {
        const toastContainer = document.querySelector('.toast-container') || this.createToastContainer();
        
        // 创建Toast元素
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        if (persistent) {
            toast.classList.add('persistent');
        }
        
        // 设置消息内容
        toast.textContent = message;
        
        // 如果是持久性提示，添加关闭按钮
        if (persistent) {
            const closeBtn = document.createElement('button');
            closeBtn.className = 'toast-close';
            closeBtn.innerHTML = '&times;';
            closeBtn.addEventListener('click', () => {
                toast.remove();
            });
            toast.appendChild(closeBtn);
        }
        
        // 添加到容器
        toastContainer.appendChild(toast);
        
        // 非持久性提示自动消失
        if (!persistent) {
            setTimeout(() => {
                toast.remove();
            }, 3000);
        }
        
        return toast;
    }
    
    /**
     * 创建Toast容器
     * @returns {HTMLElement} Toast容器元素
     */
    createToastContainer() {
        const container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
        return container;
    }

    /**
     * 刷新API密钥状态
     * 每次加载设置时自动调用，无需用户手动点击按钮
     */
    async refreshApiKeyStatus() {
        try {
            // 先将所有状态显示为"检查中"
            Object.keys(this.apiKeyValues).forEach(keyId => {
                const statusElement = document.getElementById(`${keyId}Status`);
                if (statusElement) {
                    statusElement.className = 'key-status checking';
                    statusElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 检查中...';
                }
            });
            
            // 发送请求获取API密钥状态
            const response = await fetch('/api/keys', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                }
            });
            
            if (response.ok) {
                const apiKeys = await response.json();
                this.updateApiKeyStatus(apiKeys);
                console.log('API密钥状态已刷新');
            } else {
                console.error('刷新API密钥状态失败');
            }
        } catch (error) {
            console.error('刷新API密钥状态出错:', error);
        }
    }

    toggleSettingsPanel() {
        if (this.settingsPanel) {
            this.settingsPanel.classList.toggle('active');
        }
    }

    closeSettingsPanel() {
        if (this.settingsPanel) {
            this.settingsPanel.classList.remove('active');
        }
    }

    /**
     * 加载系统提示词配置
     */
    async loadPrompts() {
        try {
            // 从服务器获取提示词列表
            const response = await fetch('/api/prompts');
            if (response.ok) {
                this.prompts = await response.json();
                
                // 更新提示词选择下拉框
                this.updatePromptSelect();
                
                // 如果有当前选中的提示词，加载它
                if (this.currentPromptId && this.prompts[this.currentPromptId]) {
                    this.loadPrompt(this.currentPromptId);
                } else if (Object.keys(this.prompts).length > 0) {
                    // 否则加载第一个提示词
                    this.loadPrompt(Object.keys(this.prompts)[0]);
                }
                
                console.log('提示词配置加载成功');
            } else {
                console.error('加载提示词配置失败');
                window.uiManager?.showToast('加载提示词配置失败', 'error');
            }
        } catch (error) {
            console.error('加载提示词配置出错:', error);
            window.uiManager?.showToast('加载提示词配置出错', 'error');
        }
    }
    
    /**
     * 更新提示词选择下拉框
     */
    updatePromptSelect() {
        if (!this.promptSelect) return;
        
        // 清空现有选项
        this.promptSelect.innerHTML = '';
        
        // 添加选项
        for (const [id, prompt] of Object.entries(this.prompts)) {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = prompt.name;
            this.promptSelect.appendChild(option);
        }
        
        // 选中当前提示词
        if (this.currentPromptId && this.prompts[this.currentPromptId]) {
            this.promptSelect.value = this.currentPromptId;
        }
    }
    
    /**
     * 加载指定的提示词
     * @param {string} promptId 提示词ID
     */
    loadPrompt(promptId) {
        if (!this.prompts[promptId]) return;
        
        // 更新当前提示词ID
        this.currentPromptId = promptId;
        
        // 更新提示词输入框
        this.systemPromptInput.value = this.prompts[promptId].content;
        
        // 更新提示词选择下拉框
        if (this.promptSelect) {
            this.promptSelect.value = promptId;
        }
        
        // 保存设置
        this.saveSettings();
    }
    
    /**
     * 保存当前提示词到服务器
     * @param {boolean} isNew 是否是新建提示词
     */
    async savePrompt(isNew = false) {
        try {
            // 获取输入的提示词信息
            const promptId = this.promptIdInput.value.trim();
            const promptName = this.promptNameInput.value.trim();
            const promptContent = this.promptContentInput.value.trim();
            const promptDescription = this.promptDescriptionInput.value.trim();
            
            // 验证必填字段
            if (!promptId) {
                window.uiManager?.showToast('提示词ID不能为空', 'error');
                return;
            }
            
            if (!promptName) {
                window.uiManager?.showToast('提示词名称不能为空', 'error');
                return;
            }
            
            if (!promptContent) {
                window.uiManager?.showToast('提示词内容不能为空', 'error');
                return;
            }
            
            // 构建提示词数据
            const promptData = {
                id: promptId,
                name: promptName,
                content: promptContent,
                description: promptDescription
            };
            
            // 发送到服务器
            const response = await fetch('/api/prompts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(promptData)
            });
            
            if (response.ok) {
                const result = await response.json();
                if (result.success) {
                    // 更新本地提示词列表
                    this.prompts[promptId] = {
                        name: promptName,
                        content: promptContent,
                        description: promptDescription
                    };
                    
                    // 更新提示词选择下拉框
                    this.updatePromptSelect();
                    
                    // 加载新保存的提示词
                    this.loadPrompt(promptId);
                    
                    // 关闭对话框
                    this.closePromptDialog();
                    
                    window.uiManager?.showToast('提示词已保存', 'success');
                } else {
                    window.uiManager?.showToast('保存提示词失败: ' + result.error, 'error');
                }
            } else {
                window.uiManager?.showToast('无法连接到服务器', 'error');
            }
        } catch (error) {
            console.error('保存提示词出错:', error);
            window.uiManager?.showToast('保存提示词出错: ' + error.message, 'error');
        }
    }
    
    /**
     * 删除当前提示词
     */
    async deletePrompt() {
        try {
            // 获取当前提示词ID
            const promptId = this.currentPromptId;
            
            if (!promptId || !this.prompts[promptId]) {
                window.uiManager?.showToast('未选择提示词', 'error');
                return;
            }
            
            // 弹窗确认删除
            if (!confirm(`确定要删除提示词 "${this.prompts[promptId].name}" 吗？`)) {
                return;
            }
            
            // 发送到服务器
            const response = await fetch(`/api/prompts/${promptId}`, {
                method: 'DELETE'
            });
            
            if (response.ok) {
                const result = await response.json();
                if (result.success) {
                    // 删除本地提示词
                    delete this.prompts[promptId];
                    
                    // 更新提示词选择下拉框
                    this.updatePromptSelect();
                    
                    // 如果还有其他提示词，加载第一个
                    const promptIds = Object.keys(this.prompts);
                    if (promptIds.length > 0) {
                        this.loadPrompt(promptIds[0]);
                    } else {
                        // 如果没有提示词了，清空输入框
                        this.systemPromptInput.value = '';
                        this.currentPromptId = '';
                    }
                    
                    window.uiManager?.showToast('提示词已删除', 'success');
                } else {
                    window.uiManager?.showToast('删除提示词失败: ' + result.error, 'error');
                }
            } else {
                window.uiManager?.showToast('无法连接到服务器', 'error');
            }
        } catch (error) {
            console.error('删除提示词出错:', error);
            window.uiManager?.showToast('删除提示词出错: ' + error.message, 'error');
        }
    }
    
    /**
     * 打开新建提示词对话框
     */
    openNewPromptDialog() {
        // 清空输入框
        this.promptIdInput.value = '';
        this.promptNameInput.value = '';
        this.promptContentInput.value = this.systemPromptInput.value || '';
        this.promptDescriptionInput.value = '';
        
        // 启用ID输入框
        this.promptIdInput.disabled = false;
        
        // 显示对话框
        this.promptDialog.classList.add('active');
        this.promptDialogOverlay.classList.add('active');
    }
    
    /**
     * 打开编辑提示词对话框
     */
    openEditPromptDialog() {
        // 获取当前提示词ID
        const promptId = this.currentPromptId;
        
        if (!promptId || !this.prompts[promptId]) {
            window.uiManager?.showToast('未选择提示词', 'error');
            return;
        }
        
        // 填充输入框
        this.promptIdInput.value = promptId;
        this.promptNameInput.value = this.prompts[promptId].name;
        this.promptContentInput.value = this.prompts[promptId].content;
        this.promptDescriptionInput.value = this.prompts[promptId].description || '';
        
        // 禁用ID输入框（不允许修改ID）
        this.promptIdInput.disabled = true;
        
        // 显示对话框
        this.promptDialog.classList.add('active');
        this.promptDialogOverlay.classList.add('active');
    }
    
    /**
     * 关闭提示词对话框
     */
    closePromptDialog() {
        this.promptDialog.classList.remove('active');
        this.promptDialogOverlay.classList.remove('active');
    }
}

// Export for use in other modules
window.SettingsManager = SettingsManager;
