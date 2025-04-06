/**
 * 模型选择器类 - 处理模型选择下拉列表的所有交互
 */
class ModelSelector {
    /**
     * 构造函数
     * @param {Object} options 配置选项
     * @param {Function} options.onChange 选择变更回调
     * @param {Object} options.models 模型定义对象
     * @param {Object} options.providers 提供商定义对象
     */
    constructor(options) {
        this.options = options || {};
        this.models = this.options.models || {};
        this.providers = this.options.providers || {};
        this.onChange = this.options.onChange || (() => {});
        
        // 元素引用
        this.container = document.getElementById('modelSelector');
        this.display = this.container?.querySelector('.model-display');
        this.currentNameEl = document.getElementById('currentModelName');
        this.currentProviderEl = document.getElementById('currentModelProvider');
        this.badgesContainer = document.getElementById('modelBadges');
        this.originalSelect = document.getElementById('modelSelect');
        
        // 创建下拉面板和遮罩
        this.createDropdownElements();
        
        // 当前选中的模型ID
        this.selectedModelId = null;
        
        // 初始化
        this.initEvents();
    }
    
    /**
     * 创建下拉面板和遮罩元素
     */
    createDropdownElements() {
        // 创建遮罩层
        this.overlay = document.createElement('div');
        this.overlay.className = 'model-dropdown-overlay';
        document.body.appendChild(this.overlay);
        
        // 创建下拉面板
        this.dropdown = document.createElement('div');
        this.dropdown.className = 'model-dropdown-panel';
        document.body.appendChild(this.dropdown);
    }
    
    /**
     * 初始化事件监听
     */
    initEvents() {
        if (!this.display) return;
        
        // 点击选择器显示下拉框
        this.display.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleDropdown();
        });
        
        // 点击遮罩层关闭下拉框
        this.overlay.addEventListener('click', () => {
            this.closeDropdown();
        });
        
        // 监听原始select变化，保持同步
        if (this.originalSelect) {
            this.originalSelect.addEventListener('change', () => {
                const modelId = this.originalSelect.value;
                if (modelId && modelId !== this.selectedModelId) {
                    this.selectModel(modelId, false); // 不触发onChange避免循环
                }
            });
        }
        
        // 防止面板内部点击冒泡到遮罩
        this.dropdown.addEventListener('click', (e) => {
            e.stopPropagation();
        });
        
        console.log('模型选择器事件初始化完成');
    }
    
    /**
     * 加载模型选项到下拉面板
     */
    loadModelOptions() {
        if (!this.dropdown) return;
        
        // 清空下拉面板
        this.dropdown.innerHTML = '';
        
        // 按提供商分组模型
        const groupedModels = {};
        Object.entries(this.models).forEach(([modelId, model]) => {
            const providerId = model.provider;
            if (!groupedModels[providerId]) {
                groupedModels[providerId] = [];
            }
            groupedModels[providerId].push({ id: modelId, ...model });
        });
        
        // 创建分组选项
        Object.entries(groupedModels).forEach(([providerId, models]) => {
            const provider = this.providers[providerId] || { name: providerId };
            
            // 创建分组容器
            const group = document.createElement('div');
            group.className = 'model-group';
            
            // 创建分组标题
            const title = document.createElement('div');
            title.className = 'model-group-title';
            title.textContent = provider.name;
            group.appendChild(title);
            
            // 添加该分组的模型选项
            models.sort((a, b) => a.name.localeCompare(b.name))
                .forEach(model => {
                    const option = document.createElement('div');
                    option.className = 'model-option';
                    option.dataset.modelId = model.id;
                    if (model.id === this.selectedModelId) {
                        option.classList.add('selected');
                    }
                    
                    // 模型名称 - 移除版本显示
                    const nameEl = document.createElement('div');
                    nameEl.className = 'model-option-name';
                    nameEl.textContent = model.name;
                    option.appendChild(nameEl);
                    
                    // 能力徽章
                    if (model.supportsMultimodal || model.isReasoning) {
                        const badges = document.createElement('div');
                        badges.className = 'model-option-badges';
                        
                        if (model.supportsMultimodal) {
                            const badge = document.createElement('div');
                            badge.className = 'model-option-badge';
                            badge.title = '支持图像';
                            badge.innerHTML = '<i class="fas fa-image"></i>';
                            badges.appendChild(badge);
                        }
                        
                        if (model.isReasoning) {
                            const badge = document.createElement('div');
                            badge.className = 'model-option-badge';
                            badge.title = '支持深度推理';
                            badge.innerHTML = '<i class="fas fa-brain"></i>';
                            badges.appendChild(badge);
                        }
                        
                        option.appendChild(badges);
                    }
                    
                    // 点击选项选择模型
                    option.addEventListener('click', () => {
                        this.selectModel(model.id);
                        this.closeDropdown();
                    });
                    
                    group.appendChild(option);
                });
            
            // 只添加有模型的分组
            if (group.childElementCount > 1) { // > 1 因为包含标题
                this.dropdown.appendChild(group);
            }
        });
        
        console.log('模型选项加载完成');
    }
    
    /**
     * 打开下拉面板
     */
    openDropdown() {
        if (!this.container || !this.dropdown || !this.overlay) return;
        
        // 加载模型选项
        this.loadModelOptions();
        
        // 显示遮罩和下拉面板
        this.overlay.style.display = 'block';
        this.dropdown.style.display = 'block';
        
        // 设置面板位置 - 相对于视口
        this.adjustDropdownPosition();
        
        // 添加窗口调整大小和滚动事件监听器
        window.addEventListener('resize', this.adjustDropdownPosition.bind(this));
        window.addEventListener('scroll', this.adjustDropdownPosition.bind(this));
        
        // 延迟添加可见类以启用过渡效果
        setTimeout(() => {
            this.dropdown.classList.add('visible');
        }, 10);
        
        // 添加打开状态类
        this.container.classList.add('open');
        
        // 确保当前选中的选项可见
        setTimeout(() => {
            const selectedOption = this.dropdown.querySelector('.model-option.selected');
            if (selectedOption) {
                selectedOption.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }, 100);
    }
    
    /**
     * 调整下拉面板位置
     */
    adjustDropdownPosition() {
        if (!this.display || !this.dropdown) return;
        
        // 获取模型选择器的位置
        const rect = this.display.getBoundingClientRect();
        
        // 设置下拉面板宽度
        this.dropdown.style.width = `${rect.width}px`;
        
        // 计算最佳位置
        const viewportHeight = window.innerHeight;
        const spaceBelow = viewportHeight - rect.bottom;
        const spaceAbove = rect.top;
        const dropdownHeight = Math.min(300, Math.max(this.dropdown.scrollHeight, 100));
        
        // 检查下方空间是否足够
        if (spaceBelow >= dropdownHeight || spaceBelow >= spaceAbove) {
            // 显示在下方
            this.dropdown.style.top = `${rect.bottom + 5}px`;
            this.dropdown.style.bottom = 'auto';
        } else {
            // 显示在上方
            this.dropdown.style.bottom = `${viewportHeight - rect.top + 5}px`;
            this.dropdown.style.top = 'auto';
        }
        
        // 水平定位
        this.dropdown.style.left = `${rect.left}px`;
        
        // 检查是否超出右侧边界
        const rightEdge = rect.left + rect.width;
        const viewportWidth = window.innerWidth;
        if (rightEdge > viewportWidth) {
            this.dropdown.style.left = 'auto';
            this.dropdown.style.right = '10px';
        }
    }
    
    /**
     * 关闭下拉面板
     */
    closeDropdown() {
        if (!this.container || !this.dropdown || !this.overlay) return;
        
        // 移除可见类
        this.dropdown.classList.remove('visible');
        
        // 移除打开状态类
        this.container.classList.remove('open');
        
        // 移除事件监听器
        window.removeEventListener('resize', this.adjustDropdownPosition.bind(this));
        window.removeEventListener('scroll', this.adjustDropdownPosition.bind(this));
        
        // 延迟隐藏元素，以便完成过渡动画
        setTimeout(() => {
            this.overlay.style.display = 'none';
            this.dropdown.style.display = 'none';
        }, 200);
    }
    
    /**
     * 切换下拉面板显示状态
     */
    toggleDropdown() {
        if (this.container.classList.contains('open')) {
            this.closeDropdown();
        } else {
            this.openDropdown();
        }
    }
    
    /**
     * 选择模型
     * @param {string} modelId 模型ID
     * @param {boolean} triggerChange 是否触发onChange回调，默认true
     */
    selectModel(modelId, triggerChange = true) {
        const model = this.models[modelId];
        if (!model) return;
        
        // 更新选中的模型ID
        this.selectedModelId = modelId;
        
        // 更新显示信息
        this.updateDisplayInfo(model);
        
        // 更新原始select
        if (this.originalSelect && this.originalSelect.value !== modelId) {
            this.originalSelect.value = modelId;
        }
        
        // 触发变更回调
        if (triggerChange) {
            this.onChange(modelId, model);
        }
        
        console.log('已选择模型:', modelId);
    }
    
    /**
     * 更新显示信息
     * @param {Object} model 模型信息
     */
    updateDisplayInfo(model) {
        if (!this.currentNameEl || !this.currentProviderEl || !this.badgesContainer) return;
        
        // 更新模型名称 - 不在这里显示版本号
        this.currentNameEl.textContent = model.name;
        
        // 更新提供商
        const provider = this.providers[model.provider] || { name: model.provider };
        this.currentProviderEl.textContent = provider.name;
        
        // 更新能力徽章
        this.badgesContainer.innerHTML = '';
        if (model.supportsMultimodal) {
            const badge = document.createElement('div');
            badge.className = 'model-badge';
            badge.title = '支持图像';
            badge.innerHTML = '<i class="fas fa-image"></i>';
            this.badgesContainer.appendChild(badge);
        }
        
        if (model.isReasoning) {
            const badge = document.createElement('div');
            badge.className = 'model-badge';
            badge.title = '支持深度推理';
            badge.innerHTML = '<i class="fas fa-brain"></i>';
            this.badgesContainer.appendChild(badge);
        }
    }
    
    /**
     * 设置模型数据
     * @param {Object} models 模型定义对象
     * @param {Object} providers 提供商定义对象
     */
    setModelData(models, providers) {
        this.models = models || {};
        this.providers = providers || {};
    }
}

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
        
        // 模型选择器对象
        this.modelSelector = null;
        
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
            
            // 初始化Token显示
            if (this.maxTokens && this.maxTokensValue) {
                this.updateTokenValueDisplay();
                this.highlightActivePreset();
            }
            
            // 初始化模型选择器
            this.initModelSelector();
            
            // 添加到window对象，方便在控制台调试
            window.debugModelSelector = {
                open: () => this.modelSelector?.openDropdown(),
                close: () => this.modelSelector?.closeDropdown(),
                toggle: () => this.modelSelector?.toggleDropdown(),
                instance: this.modelSelector
            };
            
            // 绑定提示词预览区域点击事件
            this.initPromptPreviewEvents();
            
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
            
            // 初始化模型选择器
            this.initModelSelector();
            
            this.isInitialized = true;
        }
    }

    // 初始化新的模型选择器
    initModelSelector() {
        if (this.modelSelector) {
            // 如果已存在，更新数据
            this.modelSelector.setModelData(this.modelDefinitions, this.providerDefinitions);
        } else {
            // 创建新实例
            this.modelSelector = new ModelSelector({
                models: this.modelDefinitions,
                providers: this.providerDefinitions,
                onChange: (modelId) => {
                    // 处理模型变更
                    console.log('模型已变更:', modelId);
                    this.updateVisibleApiKey(modelId);
                    this.updateUIBasedOnModelType();
                    this.updateModelVersionDisplay(modelId);
                    this.saveSettings();
                }
            });
        }
        
        // 设置当前选择的模型
        if (this.modelSelect && this.modelSelect.value) {
            this.modelSelector.selectModel(this.modelSelect.value, false);
        }
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
                // 添加到原始select元素
                const option = document.createElement('option');
                option.value = modelId;
                
                // 只显示模型名称，不再显示版本号
                option.textContent = modelInfo.name;
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
                
                // 使用新的模型选择器更新UI
                if (this.modelSelector) {
                    this.modelSelector.selectModel(settings.model, false);
                }
        }
        
        // Load max tokens setting - 现在直接设置输入框值
            if (settings.maxTokens) {
                this.maxTokens.value = settings.maxTokens;
                this.updateTokenValueDisplay();
                this.highlightActivePreset();
            }
        
        // Load reasoning depth & think budget settings
        if (settings.reasoningDepth) {
            this.reasoningDepthSelect.value = settings.reasoningDepth;
                // 更新推理深度选项UI
                this.updateReasoningOptionUI(settings.reasoningDepth);
        }
        
        // 加载思考预算百分比
        const thinkBudgetPercent = parseInt(settings.thinkBudgetPercent || '50');
        if (this.thinkBudgetPercentInput) {
            this.thinkBudgetPercentInput.value = thinkBudgetPercent;
        }
        
            // 更新思考预算显示和滑块背景
        this.updateThinkBudgetDisplay();
            this.updateThinkBudgetSliderBackground();
            this.highlightActiveThinkPreset();
        
            // Load temperature setting
        if (settings.temperature) {
            this.temperatureInput.value = settings.temperature;
            }
            
            // 先记录用户设置的提示词ID（如果有）
            if (settings.currentPromptId) {
                this.currentPromptId = settings.currentPromptId;
            }
            
            // 如果系统提示词内容已保存在设置中，先恢复它
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
        const modelVersionInfo = document.getElementById('modelVersionInfo');
        const modelVersionText = document.getElementById('modelVersionText');
        if (!modelVersionText || !modelVersionInfo) return;
        
        const model = this.modelDefinitions[modelId];
        if (!model) {
            modelVersionText.textContent = '-';
            modelVersionInfo.classList.remove('has-version');
            return;
        }
        
        // 显示版本信息（如果有）
        if (model.version && model.version !== 'latest') {
            // 设置版本文本
            modelVersionText.textContent = model.version;
            // 添加具有版本的类
            modelVersionInfo.classList.add('has-version');
            
            // 统一使用分支图标和紫色
            const icon = modelVersionInfo.querySelector('i');
            if (icon) {
                icon.className = 'fas fa-code-branch';
                icon.title = `版本 ${model.version}`;
            }
            
            // 移除所有特定版本类型的类
            modelVersionInfo.classList.remove('date-version', 'semantic-version');
        } else if (model.version === 'latest') {
            // 使用英文"latest"而不是中文
            modelVersionText.textContent = 'latest';
            modelVersionInfo.classList.add('has-version');
            
            // 对latest版本也使用相同的分支图标
            const icon = modelVersionInfo.querySelector('i');
            if (icon) {
                icon.className = 'fas fa-code-branch';
                icon.title = '最新版本';
            }
            
            // 移除所有特定版本类型的类
            modelVersionInfo.classList.remove('date-version', 'semantic-version');
        } else {
            modelVersionText.textContent = '-';
            modelVersionInfo.classList.remove('has-version', 'date-version', 'semantic-version');
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
        const maxTokensGroup = this.maxTokens ? this.maxTokens.closest('.setting-group') : null;
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
                maxTokens: this.maxTokens.value,
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
        
        // 直接使用带语言提示的系统提示词
        // 注意：systemPromptInput.value 可能已经在 loadPrompt 中设置了语言提示
        // 为避免重复添加，我们先提取提示词的主体部分（不含语言提示）
        const promptMainPart = basePrompt.split("\n\n请务必使用")[0];
        const systemPrompt = `${promptMainPart}\n\n请务必使用${language}回答。`;
        
        const selectedModel = this.modelSelect.value;
        const modelInfo = this.modelDefinitions[selectedModel] || {};
        
        // 获取最大Token数
        const maxTokens = parseInt(this.maxTokens?.value || '8192');
        
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
        
        // 最大Token输入框事件处理
        if (this.maxTokens) {
            this.maxTokens.addEventListener('input', () => {
                this.updateTokenValueDisplay();
                this.updateTokenSliderBackground();
                this.highlightActivePreset();
            this.saveSettings();
        });

            this.maxTokens.addEventListener('change', () => {
                this.saveSettings();
            });
        }

        // 推理深度选择事件处理 - 新增标签式UI
        if (this.reasoningOptions && this.reasoningOptions.length > 0) {
            this.reasoningOptions.forEach(option => {
                option.addEventListener('click', (e) => {
                // 阻止事件冒泡
                e.stopPropagation();
                
                    // 获取选择的值
                    const value = option.getAttribute('data-value');
                    
                    // 更新隐藏的select元素值
                    if (this.reasoningDepthSelect) {
                        this.reasoningDepthSelect.value = value;
                    }
                    
                    // 更新视觉效果
                    this.reasoningOptions.forEach(opt => {
                        opt.classList.remove('active');
                    });
                    option.classList.add('active');
                    
                    // 更新思考预算组的可见性
                    if (this.thinkBudgetGroup) {
                        const showThinkBudget = value === 'extended';
                        this.thinkBudgetGroup.style.display = showThinkBudget ? 'block' : 'none';
                    }
                
                this.saveSettings();
                });
            });
        }

        // 思考预算预设按钮事件
        if (this.thinkPresets && this.thinkPresets.length > 0) {
            this.thinkPresets.forEach(preset => {
                preset.addEventListener('click', (e) => {
                // 阻止事件冒泡
                e.stopPropagation();
                
                    // 获取预设值
                    const value = parseInt(preset.getAttribute('data-value'));
                    
                    // 更新滑块值
                    if (this.thinkBudgetPercentInput) {
                        this.thinkBudgetPercentInput.value = value;
                        
                        // 更新显示和滑块背景
                        this.updateThinkBudgetDisplay();
                        this.updateThinkBudgetSliderBackground();
                    }
                    
                    // 更新预设按钮样式
                    this.highlightActiveThinkPreset();
                    
                this.saveSettings();
                });
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
                this.updateThinkBudgetSliderBackground();
                
                // 更新预设按钮高亮状态
                this.highlightActiveThinkPreset();
            });
            
            this.thinkBudgetPercentInput.addEventListener('change', () => {
                this.saveSettings();
            });
        }

        this.temperatureInput.addEventListener('input', (e) => {
            // 阻止事件冒泡
            e.stopPropagation();
            
            this.saveSettings();
        });
        
        this.languageInput.addEventListener('change', (e) => {
            // 阻止事件冒泡
            e.stopPropagation();
            
            // 如果当前有加载提示词，重新加载它以更新语言
            if (this.currentPromptId && this.prompts[this.currentPromptId]) {
                this.loadPrompt(this.currentPromptId);
            } else {
                // 没有当前提示词，只保存设置
            this.saveSettings();
            }
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
        if (this.settingsToggle) {
        this.settingsToggle.addEventListener('click', () => {
            this.toggleSettingsPanel();
        });
        }

        if (this.closeSettings) {
        this.closeSettings.addEventListener('click', () => {
            this.closeSettingsPanel();
        });
        }
        
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

        if (this.tokenPresets) {
            this.tokenPresets.forEach(preset => {
                preset.addEventListener('click', e => {
                    const value = parseInt(e.currentTarget.dataset.value);
                    this.maxTokens.value = value;
                    this.updateTokenValueDisplay();
                    this.highlightActivePreset();
                    this.saveSettings();
                });
            });
        }

        // 主题切换监听
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => {
                const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
                const newTheme = currentTheme === 'light' ? 'dark' : 'light';
                document.documentElement.setAttribute('data-theme', newTheme);
                localStorage.setItem('theme', newTheme);
                
                // 更新滑块背景
                this.updateTokenSliderBackground();
                this.updateThinkBudgetSliderBackground();
            });
        }

        // 确保自定义模型选择器事件监听器被初始化
        if (this.modelSelectorDisplay && this.modelDropdown) {
            this.initCustomSelectorEvents();
        }
    }

    // 更新思考预算显示
    updateThinkBudgetDisplay() {
        if (this.thinkBudgetPercentInput && this.thinkBudgetPercentValue) {
            const percent = parseInt(this.thinkBudgetPercentInput.value);
            this.thinkBudgetPercentValue.textContent = `${percent}%`;
        }
    }
    
    // 更新思考预算滑块背景
    updateThinkBudgetSliderBackground() {
        if (!this.thinkBudgetPercentInput) return;
        
        const min = parseInt(this.thinkBudgetPercentInput.min);
        const max = parseInt(this.thinkBudgetPercentInput.max);
        const value = parseInt(this.thinkBudgetPercentInput.value);
        const percentage = ((value - min) / (max - min)) * 100;
        
        // 获取当前主题
        const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
        const primaryColor = isDarkMode ? 'rgba(72, 149, 239, 0.8)' : 'rgba(58, 134, 255, 0.8)';
        const secondaryColor = isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
        
        this.thinkBudgetPercentInput.style.background = `linear-gradient(to right, 
            ${primaryColor} 0%, 
            ${primaryColor} ${percentage}%, 
            ${secondaryColor} ${percentage}%, 
            ${secondaryColor} 100%)`;
    }
    
    // 更新推理深度选项UI
    updateReasoningOptionUI(value) {
        if (!this.reasoningOptions) return;
        
        this.reasoningOptions.forEach(option => {
            const optionValue = option.getAttribute('data-value');
            if (optionValue === value) {
                option.classList.add('active');
            } else {
                option.classList.remove('active');
            }
        });
        
        // 更新思考预算组的可见性
        if (this.thinkBudgetGroup) {
            const showThinkBudget = value === 'extended';
            this.thinkBudgetGroup.style.display = showThinkBudget ? 'block' : 'none';
        }
    }
    
    // 高亮当前激活的思考预算预设按钮
    highlightActiveThinkPreset() {
        if (!this.thinkPresets || !this.thinkBudgetPercentInput) return;
        
        const value = parseInt(this.thinkBudgetPercentInput.value);
        
        this.thinkPresets.forEach(preset => {
            const presetValue = parseInt(preset.getAttribute('data-value'));
            if (presetValue === value) {
                preset.classList.add('active');
            } else {
                preset.classList.remove('active');
            }
        });
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
                    
                    // 改用全局UIManager的showToast方法来显示成功消息
                    if (window.uiManager) {
                        window.uiManager.showToast('密钥已保存', 'success');
                    } else {
                        // 如果UIManager不可用，使用自己的方法作为备选
                    this.createToast('密钥已保存', 'success');
                    }
                } else {
                    if (window.uiManager) {
                        window.uiManager.showToast('保存密钥失败: ' + result.message, 'error');
                } else {
                    this.createToast('保存密钥失败: ' + result.message, 'error');
                    }
                }
            } else {
                if (window.uiManager) {
                    window.uiManager.showToast('无法连接到服务器', 'error');
            } else {
                this.createToast('无法连接到服务器', 'error');
                }
            }
        } catch (error) {
            console.error('保存密钥出错:', error);
            if (window.uiManager) {
                window.uiManager.showToast('保存密钥出错: ' + error.message, 'error');
            } else {
            this.createToast('保存密钥出错: ' + error.message, 'error');
            }
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
     * 从服务器加载提示词列表
     */
    async loadPrompts() {
        try {
            // 从服务器获取提示词列表
            const response = await fetch('/api/prompts');
            
            if (response.ok) {
                // 解析提示词列表
                const prompts = await response.json();
                
                // 保存到本地
                this.prompts = prompts;
                
                // 更新提示词选择下拉框
                if (this.promptSelect) {
                this.updatePromptSelect();
                }
                
                // 确定要加载的提示词ID
                let promptIdToLoad = null;
                
                // 优先使用之前保存的currentPromptId
                if (this.currentPromptId && this.prompts[this.currentPromptId]) {
                    promptIdToLoad = this.currentPromptId;
                } 
                // 其次使用default提示词
                else if (this.prompts.default) {
                    promptIdToLoad = 'default';
                } 
                // 最后使用第一个可用的提示词
                else if (Object.keys(this.prompts).length > 0) {
                    promptIdToLoad = Object.keys(this.prompts)[0];
                }
                
                // 如果找到了要加载的提示词，加载它
                if (promptIdToLoad) {
                    this.loadPrompt(promptIdToLoad);
                    console.log('加载提示词:', promptIdToLoad);
            } else {
                    // 如果没有提示词，显示默认描述
                    if (this.promptDescriptionElement) {
                        this.promptDescriptionElement.innerHTML = '<p>暂无提示词，请点击"+"创建新提示词</p>';
                    }
                }
                
                console.log('提示词加载成功:', this.prompts);
            } else {
                console.error('加载提示词失败:', response.status, response.statusText);
                window.uiManager?.showToast('加载提示词失败', 'error');
                
                // 显示默认描述
                if (this.promptDescriptionElement) {
                    this.promptDescriptionElement.innerHTML = '<p>加载提示词失败，请检查网络连接</p>';
                }
            }
        } catch (error) {
            console.error('加载提示词错误:', error);
            window.uiManager?.showToast('加载提示词错误: ' + error.message, 'error');
            
            // 显示错误描述
            if (this.promptDescriptionElement) {
                this.promptDescriptionElement.innerHTML = '<p>加载提示词错误，请检查网络连接</p>';
            }
        }
    }
    
    /**
     * 更新提示词选择下拉框
     */
    updatePromptSelect() {
        if (!this.promptSelect) return;
        
        // 暂存当前选中的提示词ID
        const currentPromptId = this.promptSelect.value;
        
        // 清空下拉框
        this.promptSelect.innerHTML = '';
        
        // 添加所有提示词选项
        for (const promptId in this.prompts) {
            const prompt = this.prompts[promptId];
            const option = document.createElement('option');
            option.value = promptId;
            option.textContent = prompt.name;
            this.promptSelect.appendChild(option);
        }
        
        // 恢复之前选中的提示词或选择第一个提示词
        if (currentPromptId && this.prompts[currentPromptId]) {
            this.promptSelect.value = currentPromptId;
        } else if (Object.keys(this.prompts).length > 0) {
            // 如果之前选中的提示词不存在，选择第一个
            this.promptSelect.value = Object.keys(this.prompts)[0];
            // 更新当前提示词ID和描述显示
            this.loadPrompt(this.promptSelect.value);
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
        
        // 获取当前选择的语言
        const language = this.languageInput.value || '中文';
        
        // 获取原始提示词内容
        const basePrompt = this.prompts[promptId].content;
        
        // 添加语言指令（如果原始提示词中不包含语言指令）
        let systemPrompt = basePrompt;
        if (!basePrompt.includes('Please respond in') && !basePrompt.includes('请用') && !basePrompt.includes('使用')) {
            systemPrompt = `${basePrompt}\n\n请务必使用${language}回答。`;
        }
        
        // 更新提示词输入框 (隐藏，但仍需保存正确的内容)
        this.systemPromptInput.value = systemPrompt;
        
        // 更新提示词描述显示 - 使用完整的系统提示词，包括语言指令
        if (this.promptDescriptionElement) {
            const description = this.prompts[promptId].description || systemPrompt;
            this.promptDescriptionElement.innerHTML = `<p>${description}</p>`;
        }
        
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
                        // 如果没有提示词了，清空输入框和描述显示
                        this.systemPromptInput.value = '';
                        if (this.promptDescriptionElement) {
                            this.promptDescriptionElement.innerHTML = '<p>暂无提示词，请点击"+"创建新提示词</p>';
                        }
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
        this.promptContentInput.value = '';
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
            // 如果没有选择提示词，但有系统提示词内容，将其作为新提示词
            if (this.systemPromptInput.value.trim()) {
                this.openNewPromptDialog();
                return;
            }
            
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
        if (this.promptDialog) {
        this.promptDialog.classList.remove('active');
        }
        
        if (this.promptDialogOverlay) {
        this.promptDialogOverlay.classList.remove('active');
        }
    }

    // 更新token值显示
    updateTokenValueDisplay() {
        const value = parseInt(this.maxTokens.value);
        let displayValue = value.toString();
        
        // 格式化大数字显示
        if (value >= 1000) {
            if (value % 1000 === 0) {
                displayValue = (value / 1000) + 'K';
            } else {
                displayValue = (value / 1000).toFixed(1) + 'K';
            }
        }
        
        this.maxTokensValue.textContent = displayValue;
        this.updateTokenSliderBackground();
    }
    
    // 更新滑块背景
    updateTokenSliderBackground() {
        const min = parseInt(this.maxTokens.min);
        const max = parseInt(this.maxTokens.max);
        const value = parseInt(this.maxTokens.value);
        const percentage = ((value - min) / (max - min)) * 100;
        
        // 获取当前主题
        const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
        const primaryColor = isDarkMode ? 'rgba(72, 149, 239, 0.8)' : 'rgba(58, 134, 255, 0.8)';
        const secondaryColor = isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
        
        this.maxTokens.style.background = `linear-gradient(to right, 
            ${primaryColor} 0%, 
            ${primaryColor} ${percentage}%, 
            ${secondaryColor} ${percentage}%, 
            ${secondaryColor} 100%)`;
    }
    
    // 高亮当前激活的预设按钮
    highlightActivePreset() {
        const value = parseInt(this.maxTokens.value);
        
        this.tokenPresets.forEach(preset => {
            const presetValue = parseInt(preset.dataset.value);
            if (presetValue === value) {
                preset.classList.add('active');
            } else {
                preset.classList.remove('active');
            }
        });
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
        this.temperatureGroup = document.querySelector('.setting-group:has(#temperature)') || 
                              document.querySelector('div.setting-group:has(input[id="temperature"])');
        this.systemPromptInput = document.getElementById('systemPrompt');
        this.promptDescriptionElement = document.getElementById('promptDescription');
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
        this.promptDescriptionInput = document.getElementById('promptDescriptionEdit');
        this.cancelPromptBtn = document.getElementById('cancelPromptBtn');
        this.confirmPromptBtn = document.getElementById('confirmPromptBtn');
        
        // 最大Token设置元素 - 现在是输入框而不是滑块
        this.maxTokens = document.getElementById('maxTokens');
        this.maxTokensValue = document.getElementById('maxTokensValue');
        this.tokenPresets = document.querySelectorAll('.token-preset');
        
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

        this.reasoningOptions = document.querySelectorAll('.reasoning-option');
        this.thinkPresets = document.querySelectorAll('.think-preset');
    }

    // 绑定提示词预览区域点击事件
    initPromptPreviewEvents() {
        const promptPreview = document.querySelector('.prompt-preview');
        if (promptPreview) {
            promptPreview.addEventListener('click', () => {
                // 触发保存按钮点击事件，打开编辑对话框
                document.getElementById('savePromptBtn').click();
            });
        }
    }
}

// Export for use in other modules
window.SettingsManager = SettingsManager;
