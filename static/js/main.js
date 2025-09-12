class SnapSolver {
    constructor() {
        console.log('Creating SnapSolver instance...');
        
        // 初始化属性
        this.socket = null;
        this.socketId = null;
        this.isProcessing = false;
        this.cropper = null;
        this.autoScrollInterval = null;
        this.capturedImage = null; // 存储截图的base64数据
        this.userThinkingExpanded = false; // 用户思考过程展开状态偏好
        this.originalImage = null;
        this.croppedImage = null;
        this.extractedContent = '';
        this.eventsSetup = false;
        
        // Cache DOM elements
        this.captureBtn = document.getElementById('captureBtn');
        // 移除裁剪按钮引用
        this.screenshotImg = document.getElementById('screenshotImg');
        this.imagePreview = document.getElementById('imagePreview');
        this.emptyState = document.getElementById('emptyState');
        this.extractedText = document.getElementById('extractedText');
        this.cropContainer = document.getElementById('cropContainer');
        this.sendToClaudeBtn = document.getElementById('sendToClaude');
        this.extractTextBtn = document.getElementById('extractText');
        this.sendExtractedTextBtn = document.getElementById('sendExtractedText');
        this.claudePanel = document.getElementById('claudePanel');
        this.responseContent = document.getElementById('responseContent');
        this.thinkingContent = document.getElementById('thinkingContent');
        this.thinkingSection = document.getElementById('thinkingSection');
        this.thinkingToggle = document.getElementById('thinkingToggle');
        this.connectionStatus = document.getElementById('connectionStatus');
        this.statusLight = document.querySelector('.status-light');
        this.progressLine = document.querySelector('.progress-line');
        this.statusText = document.querySelector('.status-text');
        this.analysisIndicator = document.querySelector('.analysis-indicator');
        
        // Crop elements
        this.cropCancel = document.getElementById('cropCancel');
        this.cropConfirm = document.getElementById('cropConfirm');
        this.cropSendToAI = document.getElementById('cropSendToAI');
        
        // 初始化应用
        this.initialize();
    }

    initializeElements() {
        // 查找主要UI元素
        this.connectionStatus = document.getElementById('connectionStatus');
        this.captureBtn = document.getElementById('captureBtn');
        this.emptyState = document.getElementById('emptyState');
        this.imagePreview = document.getElementById('imagePreview');
        this.screenshotImg = document.getElementById('screenshotImg');
        this.sendToClaudeBtn = document.getElementById('sendToClaude');
        this.extractTextBtn = document.getElementById('extractText');
        this.extractedText = document.getElementById('extractedText');
        this.sendExtractedTextBtn = document.getElementById('sendExtractedText');
        this.claudePanel = document.getElementById('claudePanel');
        this.closeClaudePanel = document.getElementById('closeClaudePanel');
        this.thinkingSection = document.getElementById('thinkingSection');
        this.thinkingToggle = document.getElementById('thinkingToggle');
        this.thinkingContent = document.getElementById('thinkingContent');
        this.responseContent = document.getElementById('responseContent');
        this.cropContainer = document.getElementById('cropContainer');
        this.cropCancel = document.getElementById('cropCancel');
        this.cropConfirm = document.getElementById('cropConfirm');
        this.cropSendToAI = document.getElementById('cropSendToAI');
        this.stopGenerationBtn = document.getElementById('stopGenerationBtn');
        
        // 处理按钮事件
        if (this.closeClaudePanel) {
            this.closeClaudePanel.addEventListener('click', () => {
                this.claudePanel.classList.add('hidden');
            });
        }
        
        // 处理停止生成按钮点击事件
        if (this.stopGenerationBtn) {
            this.stopGenerationBtn.addEventListener('click', () => {
                this.stopGeneration();
            });
        }
    }

    initializeState() {
        this.socket = null;
        this.cropper = null;
        this.croppedImage = null;
        this.extractedContent = '';
        
        // 确保裁剪容器和其他面板初始为隐藏状态
        if (this.cropContainer) {
            this.cropContainer.classList.add('hidden');
        }
        if (this.claudePanel) {
            this.claudePanel.classList.add('hidden');
        }
        if (this.thinkingSection) {
            this.thinkingSection.classList.add('hidden');
        }
    }

    setupAutoScroll() {
        // Create MutationObserver to watch for content changes
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'characterData' || mutation.type === 'childList') {
                    this.responseContent.scrollTo({
                        top: this.responseContent.scrollHeight,
                        behavior: 'smooth'
                    });
                }
            });
        });

        // Start observing the response content
        observer.observe(this.responseContent, {
            childList: true,
            characterData: true,
            subtree: true
        });
    }

    updateConnectionStatus(status, isConnected) {
        if (this.connectionStatus) {
            this.connectionStatus.textContent = status;
            
            if (isConnected) {
                this.connectionStatus.classList.remove('disconnected');
                this.connectionStatus.classList.add('connected');
            } else {
                this.connectionStatus.classList.remove('connected');
                this.connectionStatus.classList.add('disconnected');
            }
        }
    }

    updateStatusLight(status) {
        // 获取进度指示器元素
        const progressLine = document.querySelector('.progress-line');
        const statusText = document.querySelector('.status-text');
        const analysisIndicator = document.querySelector('.analysis-indicator');
        
        if (!progressLine || !statusText || !analysisIndicator) {
            console.error('状态指示器元素未找到:', {
                progressLine: !!progressLine,
                statusText: !!statusText,
                analysisIndicator: !!analysisIndicator
            });
            return;
        }
        
        // 确保指示器可见
        analysisIndicator.style.display = 'flex';
        
        // 先移除所有可能的状态类
        analysisIndicator.classList.remove('processing', 'completed', 'error');
        progressLine.classList.remove('processing', 'completed', 'error');
        
        switch (status) {
            case 'started':
            case 'thinking':
            case 'reasoning':
            case 'streaming':
                // 添加处理中状态类
                analysisIndicator.classList.add('processing');
                progressLine.classList.add('processing');
                statusText.textContent = '生成中';
                break;
                
            case 'completed':
                // 添加完成状态类
                analysisIndicator.classList.add('completed');
                progressLine.classList.add('completed');
                statusText.textContent = '完成';
                break;
                
            case 'error':
                // 添加错误状态类
                analysisIndicator.classList.add('error');
                progressLine.classList.add('error');
                statusText.textContent = '出错';
                break;
                
            case 'stopped':
                // 添加错误状态类（用于停止状态）
                analysisIndicator.classList.add('error');
                progressLine.classList.add('error');
                statusText.textContent = '已停止';
                break;
                
            default:
                // 对于未知状态，显示准备中
                statusText.textContent = '准备中';
                break;
        }
    }

    initializeConnection() {
        try {
            // 添加日志以便调试
            console.log('尝试连接WebSocket服务器...');
            
            // 确保在Safari上使用完整的URL
            const socketUrl = window.location.protocol === 'https:' 
                ? `${window.location.origin}` 
                : window.location.origin;
                
            console.log('WebSocket连接URL:', socketUrl);
            
            this.socket = io(socketUrl, {
                reconnection: true,
                reconnectionAttempts: 5,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000,
                timeout: 20000,
                autoConnect: true,
                transports: ['websocket', 'polling'] // 明确指定传输方式，增加兼容性
            });

            this.socket.on('connect', () => {
                console.log('Connected to server');
                this.updateConnectionStatus('已连接', true);
                this.captureBtn.disabled = false;
            });

            this.socket.on('disconnect', () => {
                console.log('Disconnected from server');
                this.updateConnectionStatus('已断开', false);
            });

            this.socket.on('connect_error', (error) => {
                console.error('Connection error:', error);
                this.updateConnectionStatus('连接错误', false);
            });

            this.socket.on('reconnect', (attemptNumber) => {
                console.log(`Reconnected after ${attemptNumber} attempts`);
                this.updateConnectionStatus('已重连', true);
            });

            this.socket.on('reconnect_attempt', (attemptNumber) => {
                console.log(`Reconnection attempt: ${attemptNumber}`);
            });

            this.socket.on('reconnect_error', (error) => {
                console.error('Reconnection error:', error);
            });

            this.socket.on('reconnect_failed', () => {
                console.error('Failed to reconnect');
                window.uiManager.showToast('Connection to server failed, please refresh the page and try again', 'error');
            });

            this.setupSocketEventHandlers();

        } catch (error) {
            console.error('Connection error:', error);
            this.updateConnectionStatus('重连失败', false);
            // 移除setTimeout，让用户手动刷新页面重连
            window.uiManager.showToast('连接服务器失败，请刷新页面重试', 'error');
        }
    }

    setupSocketEventHandlers() {
        // 如果已经设置过事件处理器，先移除它们
        if (this.hasOwnProperty('eventsSetup') && this.eventsSetup) {
            this.socket.off('screenshot_response');
            this.socket.off('screenshot_complete');
            this.socket.off('request_acknowledged');
            this.socket.off('text_extracted');
            this.socket.off('ai_response');
        }
        
        // 标记事件处理器已设置
        this.eventsSetup = true;
        
        // 添加响应计数器
        if (!window.responseCounter) {
            window.responseCounter = 0;
        }
        
        // 旧版截图响应处理器 (保留兼容性)
        this.socket.on('screenshot_response', (data) => {
            // 增加计数并记录
            window.responseCounter++;
            console.log(`DEBUG: 接收到screenshot_response响应，计数 = ${window.responseCounter}`);
            
            if (data.success) {
                this.screenshotImg.src = `data:image/png;base64,${data.image}`;
                this.originalImage = `data:image/png;base64,${data.image}`;
                this.imagePreview.classList.remove('hidden');
                this.emptyState.classList.add('hidden');
                
                // 根据模型类型显示适当的按钮
                this.updateImageActionButtons();
                
                // 恢复按钮状态
                this.captureBtn.disabled = false;
                this.captureBtn.innerHTML = '<i class="fas fa-camera"></i>';
                
                // 初始化裁剪器
                this.initializeCropper();
                
                window.uiManager.showToast('截图成功', 'success');
            } else {
                this.captureBtn.disabled = false;
                this.captureBtn.innerHTML = '<i class="fas fa-camera"></i>';
                console.error('截图失败:', data.error);
                window.uiManager.showToast('截图失败: ' + data.error, 'error');
            }
        });
        
        // 新版截图响应处理器
        this.socket.on('screenshot_complete', (data) => {
            // 增加计数并记录
            window.responseCounter++;
            console.log(`DEBUG: 接收到screenshot_complete响应，计数 = ${window.responseCounter}`);
            
            this.captureBtn.disabled = false;
            this.captureBtn.innerHTML = '<i class="fas fa-camera"></i>';
            
            if (data.success) {
                // 显示截图预览
                this.screenshotImg.src = 'data:image/png;base64,' + data.image;
                this.originalImage = 'data:image/png;base64,' + data.image;
                this.imagePreview.classList.remove('hidden');
                this.emptyState.classList.add('hidden');
                
                // 根据模型类型显示适当的按钮
                this.updateImageActionButtons();
                
                // 初始化裁剪工具
                this.initializeCropper();
                
                // 显示成功消息
                window.uiManager.showToast('截图成功', 'success');
            } else {
                // 显示错误消息
                window.uiManager.showToast('截图失败: ' + (data.error || '未知错误'), 'error');
            }
        });

        // 确认请求处理
        this.socket.on('request_acknowledged', (data) => {
            console.log('服务器确认收到请求:', data);
        });

        // Text extraction response
        this.socket.on('text_extracted', (data) => {
            // 重新启用按钮
            this.extractTextBtn.disabled = false;
            this.extractTextBtn.innerHTML = '<i class="fas fa-font"></i><span>提取文本</span>';
            
            if (this.extractedText) {
                this.extractedText.disabled = false;
            }
            
            // 检查是否有内容数据
            if (data.content) {
                this.extractedText.value = data.content;
                this.extractedContent = data.content;
                this.extractedText.classList.remove('hidden');
                this.sendExtractedTextBtn.classList.remove('hidden');
                this.sendExtractedTextBtn.disabled = false;
                
                window.uiManager.showToast('文本提取成功', 'success');
            } else if (data.error) {
                console.error('文本提取失败:', data.error);
                window.uiManager.showToast('文本提取失败: ' + data.error, 'error');
                
                // 启用发送按钮以便用户可以手动输入文本
                this.sendExtractedTextBtn.disabled = false;
            } else {
                // 未知响应格式
                console.error('未知的文本提取响应格式:', data);
                window.uiManager.showToast('文本提取返回未知格式', 'error');
                this.sendExtractedTextBtn.disabled = false;
            }
        });

        this.socket.on('ai_response', (data) => {
            console.log('Received ai_response:', data);
            this.updateStatusLight(data.status);
            
            // 确保Claude面板可见
            if (this.claudePanel && this.claudePanel.classList.contains('hidden')) {
                this.claudePanel.classList.remove('hidden');
            }
            
            switch (data.status) {
                case 'started':
                    console.log('Analysis started');
                    // 清空显示内容
                    if (this.responseContent) this.responseContent.innerHTML = '';
                    if (this.thinkingContent) this.thinkingContent.innerHTML = '';
                    if (this.thinkingSection) this.thinkingSection.classList.add('hidden');
                    
                    // 禁用按钮防止重复点击
                    if (this.sendToClaudeBtn) this.sendToClaudeBtn.disabled = true;
                    if (this.sendExtractedTextBtn) this.sendExtractedTextBtn.disabled = true;
                    
                    // 显示进行中状态
                    if (this.responseContent) {
                        this.responseContent.innerHTML = '<div class="loading-message">分析进行中，请稍候...</div>';
                        this.responseContent.style.display = 'block';
                    }
                    
                    // 显示停止生成按钮
                    this.showStopGenerationButton();
                    break;
                    
                case 'thinking':
                    // 处理思考内容
                    if (data.content && this.thinkingContent && this.thinkingSection) {
                        console.log('Received thinking content');
                        this.thinkingSection.classList.remove('hidden');
                        
                        // 显示动态省略号
                        this.showThinkingAnimation(true);
                        
                        // 直接设置完整内容
                        this.setElementContent(this.thinkingContent, data.content);
                        
                        // 添加打字动画效果
                        this.thinkingContent.classList.add('thinking-typing');
                        
                        // 根据用户偏好设置展开/折叠状态
                        this.thinkingContent.classList.remove('expanded');
                        this.thinkingContent.classList.remove('collapsed');
                        
                        if (this.userThinkingExpanded) {
                            this.thinkingContent.classList.add('expanded');
                        } else {
                            this.thinkingContent.classList.add('collapsed');
                        }
                        
                        // 更新切换按钮图标
                        const toggleIcon = document.querySelector('#thinkingToggle .toggle-btn i');
                        if (toggleIcon) {
                            toggleIcon.className = this.userThinkingExpanded ? 
                                'fas fa-chevron-up' : 'fas fa-chevron-down';
                        }
                    }
                    
                    // 确保停止按钮可见
                    this.showStopGenerationButton();
                    break;
                
                case 'reasoning':
                    // 处理推理内容 (QVQ-Max模型使用)
                    if (data.content && this.thinkingContent && this.thinkingSection) {
                        console.log('Received reasoning content');
                        this.thinkingSection.classList.remove('hidden');
                        
                        // 显示动态省略号
                        this.showThinkingAnimation(true);
                        
                        // 直接设置完整内容
                        this.setElementContent(this.thinkingContent, data.content);
                        
                        // 添加打字动画效果
                        this.thinkingContent.classList.add('thinking-typing');
                        
                        // 根据用户偏好设置展开/折叠状态
                        this.thinkingContent.classList.remove('expanded');
                        this.thinkingContent.classList.remove('collapsed');
                        
                        if (this.userThinkingExpanded) {
                            this.thinkingContent.classList.add('expanded');
                        } else {
                            this.thinkingContent.classList.add('collapsed');
                        }
                        
                        // 更新切换按钮图标
                        const toggleIcon = document.querySelector('#thinkingToggle .toggle-btn i');
                        if (toggleIcon) {
                            toggleIcon.className = this.userThinkingExpanded ? 
                                'fas fa-chevron-up' : 'fas fa-chevron-down';
                        }
                    }
                    
                    // 确保停止按钮可见
                    this.showStopGenerationButton();
                    break;
                
                case 'thinking_complete':
                    // 完整的思考内容
                    if (data.content && this.thinkingContent && this.thinkingSection) {
                        console.log('思考过程完成');
                        this.thinkingSection.classList.remove('hidden');
                        
                        // 停止动态省略号
                        this.showThinkingAnimation(false);
                        
                        // 设置完整内容
                        this.setElementContent(this.thinkingContent, data.content);
                        
                        // 移除打字动画
                        this.thinkingContent.classList.remove('thinking-typing');
                        
                        // 根据用户偏好设置展开/折叠状态
                        this.thinkingContent.classList.remove('expanded');
                        this.thinkingContent.classList.remove('collapsed');
                        
                        if (this.userThinkingExpanded) {
                            this.thinkingContent.classList.add('expanded');
                        } else {
                            this.thinkingContent.classList.add('collapsed');
                        }
                        
                        // 确保图标正确显示
                        const toggleIcon = this.thinkingToggle.querySelector('.toggle-btn i');
                        if (toggleIcon) {
                            toggleIcon.className = this.userThinkingExpanded ? 
                                'fas fa-chevron-up' : 'fas fa-chevron-down';
                        }
                    }
                    break;
                    
                case 'reasoning_complete':
                    // 完整的推理内容 (QVQ-Max模型使用)
                    if (data.content && this.thinkingContent && this.thinkingSection) {
                        console.log('Reasoning complete');
                        this.thinkingSection.classList.remove('hidden');
                        
                        // 停止动态省略号
                        this.showThinkingAnimation(false);
                        
                        // 设置完整内容
                        this.setElementContent(this.thinkingContent, data.content);
                        
                        // 移除打字动画
                        this.thinkingContent.classList.remove('thinking-typing');
                        
                        // 根据用户偏好设置展开/折叠状态
                        this.thinkingContent.classList.remove('expanded');
                        this.thinkingContent.classList.remove('collapsed');
                        
                        if (this.userThinkingExpanded) {
                            this.thinkingContent.classList.add('expanded');
                        } else {
                            this.thinkingContent.classList.add('collapsed');
                        }
                        
                        // 确保图标正确显示
                        const toggleIcon = this.thinkingToggle.querySelector('.toggle-btn i');
                        if (toggleIcon) {
                            toggleIcon.className = this.userThinkingExpanded ? 
                                'fas fa-chevron-up' : 'fas fa-chevron-down';
                        }
                    }
                    break;
                    
                case 'streaming':
                    if (data.content && this.responseContent) {
                        console.log('Received content chunk');
                        
                        // 使用更安全的方式设置内容，避免HTML解析问题
                        this.setElementContent(this.responseContent, data.content);
                        this.responseContent.style.display = 'block';
                        
                        // 停止省略号动画
                        this.showThinkingAnimation(false);
                        
                        // 移除思考部分的打字动画
                        if (this.thinkingContent) {
                            this.thinkingContent.classList.remove('thinking-typing');
                        }
                        
                        // 平滑滚动到最新内容
                        this.scrollToBottom();
                    }
                    
                    // 确保停止按钮可见
                    this.showStopGenerationButton();
                    break;
                    
                case 'completed':
                    console.log('Analysis completed');
                    
                    // 重新启用按钮
                    if (this.sendToClaudeBtn) this.sendToClaudeBtn.disabled = false;
                    if (this.sendExtractedTextBtn) this.sendExtractedTextBtn.disabled = false;
                    
                    // 恢复界面
                    this.updateStatusLight('completed');
                    
                    // 只有在有思考内容时才显示思考组件
                    if (this.thinkingSection && this.thinkingContent) {
                        // 检查思考内容是否为空
                        const hasThinkingContent = this.thinkingContent.textContent && this.thinkingContent.textContent.trim() !== '';
                        
                        if (hasThinkingContent) {
                            // 有思考内容，显示思考组件
                            this.thinkingSection.classList.remove('hidden');
                            
                            // 根据用户偏好设置展开/折叠状态
                            this.thinkingContent.classList.remove('expanded');
                            this.thinkingContent.classList.remove('collapsed');
                            
                            if (this.userThinkingExpanded) {
                                this.thinkingContent.classList.add('expanded');
                            } else {
                                this.thinkingContent.classList.add('collapsed');
                            }
                            
                            const toggleBtn = document.querySelector('#thinkingToggle .toggle-btn i');
                            if (toggleBtn) {
                                toggleBtn.className = this.userThinkingExpanded ? 
                                    'fas fa-chevron-up' : 'fas fa-chevron-down';
                            }
                            
                            // 简化提示信息
                            window.uiManager.showToast('分析完成', 'success');
                        } else {
                            // 没有思考内容，隐藏思考组件
                            this.thinkingSection.classList.add('hidden');
                            window.uiManager.showToast('分析完成', 'success');
                        }
                    }
                    
                    // 确保响应内容完整显示
                    if (data.content && data.content.trim() !== '' && this.responseContent) {
                        this.setElementContent(this.responseContent, data.content);
                    }
                    
                    // 确保结果内容可见
                    if (this.responseContent) {
                        this.responseContent.style.display = 'block';
                        
                        // 滚动到结果内容底部
                        this.scrollToBottom();
                    }
                    
                    // 隐藏停止生成按钮
                    this.hideStopGenerationButton();
                    break;
                    
                case 'stopped':
                    // 处理停止生成的响应
                    console.log('Generation stopped');
                    
                    // 重新启用按钮
                    if (this.sendToClaudeBtn) this.sendToClaudeBtn.disabled = false;
                    if (this.sendExtractedTextBtn) this.sendExtractedTextBtn.disabled = false;
                    
                    // 恢复界面
                    this.updateStatusLight('stopped');
                    
                    // 隐藏停止生成按钮
                    this.hideStopGenerationButton();
                    
                    // 显示提示信息
                    window.uiManager.showToast('已停止生成', 'info');
                    break;
                    
                case 'error':
                    console.error('Analysis error:', data.error);
                    
                    // 安全处理错误消息，确保它是字符串
                    let errorMessage = 'Unknown error occurred';
                    if (data.error) {
                        if (typeof data.error === 'string') {
                            errorMessage = data.error;
                        } else if (typeof data.error === 'object') {
                            // 如果是对象，尝试获取消息字段或转换为JSON
                            errorMessage = data.error.message || data.error.error || JSON.stringify(data.error);
                        } else {
                            errorMessage = String(data.error);
                        }
                    }
                    
                    // 显示错误信息
                    if (this.responseContent) {
                        // 不要尝试获取现有内容，直接显示错误信息
                        this.setElementContent(this.responseContent, 'Error: ' + errorMessage);
                    }
                    
                    // 重新启用按钮
                    if (this.sendToClaudeBtn) this.sendToClaudeBtn.disabled = false;
                    if (this.sendExtractedTextBtn) this.sendExtractedTextBtn.disabled = false;
                    
                    window.uiManager.showToast('Analysis failed: ' + errorMessage, 'error');
                    
                    // 隐藏停止生成按钮
                    this.hideStopGenerationButton();
                    break;
                    
                default:
                    console.warn('Unknown response status:', data.status);
                    
                    // 对于未知状态，尝试显示内容（如果有）
                    if (data.content && this.responseContent) {
                        this.setElementContent(this.responseContent, data.content);
                        this.responseContent.style.display = 'block';
                    }
                    
                    // 确保按钮可用
                    if (this.sendToClaudeBtn) this.sendToClaudeBtn.disabled = false;
                    if (this.sendExtractedTextBtn) this.sendExtractedTextBtn.disabled = false;
                    
                    window.uiManager.showToast('Unknown error occurred', 'error');
                    
                    // 隐藏停止生成按钮
                    this.hideStopGenerationButton();
                    break;
            }
        });
        
        // 接收到thinking数据时
        this.socket.on('thinking', (data) => {
            console.log('收到思考过程数据');

            // 显示思考区域
            this.thinkingSection.classList.remove('hidden');
            
            // 显示动态省略号
            this.showThinkingAnimation(true);
            
            // 使用setElementContent方法处理Markdown
            this.setElementContent(this.thinkingContent, data.thinking);
            
            // 根据用户偏好设置展开/折叠状态
            this.thinkingContent.classList.remove('expanded');
            this.thinkingContent.classList.remove('collapsed');
            
            if (this.userThinkingExpanded) {
                this.thinkingContent.classList.add('expanded');
            } else {
                this.thinkingContent.classList.add('collapsed');
            }
            
            const toggleIcon = this.thinkingToggle.querySelector('.toggle-btn i');
            if (toggleIcon) {
                toggleIcon.className = this.userThinkingExpanded ? 
                    'fas fa-chevron-up' : 'fas fa-chevron-down';
            }
        });

        // 思考过程完成 - Socket事件处理
        this.socket.on('thinking_complete', (data) => {
            console.log('Socket接收到思考过程完成');
            this.thinkingSection.classList.remove('hidden');
            
            // 停止动态省略号动画
            this.showThinkingAnimation(false);
            
            // 使用setElementContent方法处理Markdown
            this.setElementContent(this.thinkingContent, data.thinking);
            
            // 根据用户偏好设置展开/折叠状态
            this.thinkingContent.classList.remove('expanded');
            this.thinkingContent.classList.remove('collapsed');
            
            if (this.userThinkingExpanded) {
                this.thinkingContent.classList.add('expanded');
            } else {
                this.thinkingContent.classList.add('collapsed');
            }
            
            // 确保图标正确显示
            const toggleIcon = this.thinkingToggle.querySelector('.toggle-btn i');
            if (toggleIcon) {
                toggleIcon.className = this.userThinkingExpanded ? 
                    'fas fa-chevron-up' : 'fas fa-chevron-down';
            }
        });

        // 分析完成
        this.socket.on('analysis_complete', (data) => {
            console.log('分析完成，接收到结果');
            this.updateStatusLight('completed');
            this.enableInterface();
            
            // 显示分析结果
            if (this.responseContent) {
                // 使用setElementContent方法处理Markdown
                this.setElementContent(this.responseContent, data.response);
                this.responseContent.style.display = 'block';
                
                // 直接滚动到结果区域，不使用setTimeout
                this.responseContent.scrollIntoView({ behavior: 'smooth' });
            }
            
            // 确保思考部分完全显示（如果有的话）
            if (data.thinking && this.thinkingSection && this.thinkingContent) {
                this.thinkingSection.classList.remove('hidden');
                // 使用setElementContent方法处理Markdown
                this.setElementContent(this.thinkingContent, data.thinking);
                
                // 根据用户偏好设置展开/折叠状态
                this.thinkingContent.classList.remove('expanded');
                this.thinkingContent.classList.remove('collapsed');
                
                if (this.userThinkingExpanded) {
                    this.thinkingContent.classList.add('expanded');
                } else {
                    this.thinkingContent.classList.add('collapsed');
                }
                
                const toggleIcon = this.thinkingToggle.querySelector('.toggle-btn i');
                if (toggleIcon) {
                    toggleIcon.className = this.userThinkingExpanded ? 
                        'fas fa-chevron-up' : 'fas fa-chevron-down';
                }
                
                // 弹出提示
                window.uiManager.showToast('分析完成', 'success');
            }
        });
    }

    // 新方法：安全设置DOM内容的方法（替代updateElementContent）
    setElementContent(element, content) {
        if (!element) return;
        
        // 首先确保content是字符串
        if (typeof content !== 'string') {
            if (content === null || content === undefined) {
                content = '';
            } else if (typeof content === 'object') {
                // 对于对象，尝试获取有意义的字符串表示
                if (content.error || content.message) {
                    content = content.error || content.message;
                } else if (content.toString && typeof content.toString === 'function' && content.toString() !== '[object Object]') {
                    content = content.toString();
                } else {
                    // 作为最后手段，使用JSON.stringify
                    try {
                        content = JSON.stringify(content, null, 2);
                    } catch (e) {
                        content = '[Complex Object]';
                    }
                }
            } else {
                content = String(content);
            }
        }
        
        try {
            // 检查marked是否已配置
            if (typeof marked === 'undefined') {
                console.warn('Marked库未加载，回退到纯文本显示');
                // 即使回退到纯文本，也要保留换行和基本格式
                element.innerHTML = content.replace(/\n/g, '<br>');
                return;
            }
            
            // 使用marked库解析Markdown内容
            const renderedHtml = marked.parse(content);
            
            // 设置解析后的HTML内容
            element.innerHTML = renderedHtml;
            
            // 为未高亮的代码块应用语法高亮
            if (window.hljs) {
                element.querySelectorAll('pre code:not(.hljs)').forEach((block) => {
                    hljs.highlightElement(block);
                });
            }
        } catch (error) {
            console.error('Markdown解析错误:', error);
            // 发生错误时也保留换行格式
            element.innerHTML = content.replace(/\n/g, '<br>');
        }
        
        // 自动滚动到底部
        element.scrollTop = element.scrollHeight;
    }

    initializeCropper() {
        try {
            // 如果当前没有截图，不要初始化裁剪器
            if (!this.screenshotImg || !this.screenshotImg.src || this.screenshotImg.src === '') {
                console.log('No screenshot to crop');
                return;
            }
            
            // Clean up existing cropper instance
            if (this.cropper) {
                this.cropper.destroy();
                this.cropper = null;
            }

            const cropArea = document.querySelector('.crop-area');
            if (!cropArea) {
                console.error('Crop area element not found');
                return;
            }
            
            cropArea.innerHTML = '';
            const clonedImage = this.screenshotImg.cloneNode(true);
            clonedImage.style.display = 'block';
            cropArea.appendChild(clonedImage);
            
            this.cropContainer.classList.remove('hidden');
            
            // Store reference to this for use in ready callback
            const self = this;
            
            this.cropper = new Cropper(clonedImage, {
                viewMode: 1,
                dragMode: 'move',
                aspectRatio: NaN,
                modal: true,
                background: true,
                ready: function() {
                    // 如果有上次保存的裁剪框数据，应用它
                    if (self.lastCropBoxData) {
                        self.cropper.setCropBoxData(self.lastCropBoxData);
                        console.log('Applied saved crop box data');
                    }
                }
            });
        } catch (error) {
            console.error('Failed to initialize cropper', error);
            window.uiManager.showToast('裁剪器初始化失败', 'error');
            
            // 确保在出错时关闭裁剪界面
            if (this.cropContainer) {
                this.cropContainer.classList.add('hidden');
            }
        }
    }

    setupEventListeners() {
        console.log('DEBUG: 设置所有事件监听器（这应该只执行一次）');
        
        this.setupCaptureEvents();
        this.setupCropEvents();
        this.setupAnalysisEvents();
        this.setupKeyboardShortcuts();
        this.setupThinkingToggle();
        
        // 监听模型选择变化，更新界面
        if (window.settingsManager && window.settingsManager.modelSelect) {
            window.settingsManager.modelSelect.addEventListener('change', () => {
                this.updateImageActionButtons();
            });
        }
    }

    setupCaptureEvents() {
        // 添加计数器
        if (!window.captureCounter) {
            window.captureCounter = 0;
        }
        
        // 移除现有的事件监听器，防止重复绑定
        if (this.captureBtn) {
            // 克隆按钮并替换原按钮，这样可以移除所有事件监听器
            const newBtn = this.captureBtn.cloneNode(true);
            this.captureBtn.parentNode.replaceChild(newBtn, this.captureBtn);
            this.captureBtn = newBtn;
            
            console.log('DEBUG: 已清除截图按钮上的事件监听器');
        }
        
        // 截图按钮
        this.captureBtn.addEventListener('click', () => {
            if (!this.checkConnectionBeforeAction()) return;
            
            try {
                // 增加计数并记录
                window.captureCounter++;
                console.log(`DEBUG: 截图按钮点击计数 = ${window.captureCounter}`);
                
                this.captureBtn.disabled = true;  // 禁用按钮防止重复点击
                this.captureBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                
                console.log('DEBUG: 发送capture_screenshot事件到服务器');
                this.socket.emit('capture_screenshot', {});
            } catch (error) {
                console.error('Error starting capture:', error);
                window.uiManager.showToast('启动截图失败', 'error');
                this.captureBtn.disabled = false;
                this.captureBtn.innerHTML = '<i class="fas fa-camera"></i>';
            }
        });
    }

    setupCropEvents() {
        // 防止重复绑定事件监听器
        if (this.cropConfirm) {
            const newCropConfirm = this.cropConfirm.cloneNode(true);
            this.cropConfirm.parentNode.replaceChild(newCropConfirm, this.cropConfirm);
            this.cropConfirm = newCropConfirm;
        }
        
        if (this.cropCancel) {
            const newCropCancel = this.cropCancel.cloneNode(true);
            this.cropCancel.parentNode.replaceChild(newCropCancel, this.cropCancel);
            this.cropCancel = newCropCancel;
        }
        
        const cropResetElement = document.getElementById('cropReset');
        if (cropResetElement) {
            const newCropReset = cropResetElement.cloneNode(true);
            cropResetElement.parentNode.replaceChild(newCropReset, cropResetElement);
        }
        
        if (this.cropSendToAI) {
            const newCropSendToAI = this.cropSendToAI.cloneNode(true);
            this.cropSendToAI.parentNode.replaceChild(newCropSendToAI, this.cropSendToAI);
            this.cropSendToAI = newCropSendToAI;
        }
        
        console.log('DEBUG: 已清除裁剪按钮上的事件监听器，防止重复绑定');

        // 存储裁剪框数据
        this.lastCropBoxData = null;

        // Crop confirm button
        this.cropConfirm.addEventListener('click', () => {
            if (!this.checkConnectionBeforeAction()) return;
            
            if (this.cropper) {
                try {
                    console.log('Starting crop operation...');
                    
                    // Validate cropper instance
                    if (!this.cropper) {
                        throw new Error('Cropper not initialized');
                    }

                    // Get and validate crop box data
                    const cropBoxData = this.cropper.getCropBoxData();
                    console.log('Crop box data:', cropBoxData);
                    
                    // 保存裁剪框数据以便下次使用
                    this.lastCropBoxData = cropBoxData;
                    
                    if (!cropBoxData || typeof cropBoxData.width !== 'number' || typeof cropBoxData.height !== 'number') {
                        throw new Error('Invalid crop box data');
                    }

                    if (cropBoxData.width < 10 || cropBoxData.height < 10) {
                        throw new Error('Crop area is too small. Please select a larger area (minimum 10x10 pixels).');
                    }

                    // Get cropped canvas with more conservative size limits
                    console.log('Getting cropped canvas...');
                    const canvas = this.cropper.getCroppedCanvas({
                        maxWidth: 2560,
                        maxHeight: 1440,
                        fillColor: '#fff',
                        imageSmoothingEnabled: true,
                        imageSmoothingQuality: 'high',
                    });

                    if (!canvas) {
                        throw new Error('Failed to create cropped canvas');
                    }

                    console.log('Canvas created successfully');

                    // Convert to data URL with error handling and compression
                    console.log('Converting to data URL...');
                    try {
                        // Use PNG for better quality
                        this.croppedImage = canvas.toDataURL('image/png');
                        console.log('Data URL conversion successful');
                    } catch (dataUrlError) {
                        console.error('Data URL conversion error:', dataUrlError);
                        throw new Error('Failed to process cropped image. The image might be too large or memory insufficient.');
                    }

                    // Properly destroy the cropper instance
                    this.cropper.destroy();
                    this.cropper = null;

                    // Clean up cropper and update UI
                    this.cropContainer.classList.add('hidden');
                    document.querySelector('.crop-area').innerHTML = '';
                    
                    // Update the screenshot image with the cropped version
                    this.screenshotImg.src = this.croppedImage;
                    this.imagePreview.classList.remove('hidden');
                    
                    // 根据当前选择的模型类型决定显示哪些按钮
                    this.updateImageActionButtons();
                    
                    window.uiManager.showToast('裁剪成功');
                    
                    // 不再自动发送至AI，由用户手动选择
                } catch (error) {
                    console.error('Cropping error details:', {
                        message: error.message,
                        stack: error.stack,
                        cropperState: this.cropper ? 'initialized' : 'not initialized'
                    });
                    window.uiManager.showToast(error.message || '裁剪图像时出错', 'error');
                } finally {
                    // Always clean up the cropper instance
                    if (this.cropper) {
                        this.cropper.destroy();
                        this.cropper = null;
                    }
                }
            }
        });

        // Crop cancel button
        this.cropCancel.addEventListener('click', () => {
            if (this.cropper) {
                this.cropper.destroy();
                this.cropper = null;
            }
            this.cropContainer.classList.add('hidden');
            // 取消裁剪时隐藏图像预览和相关按钮
            this.imagePreview.classList.add('hidden');
            document.querySelector('.crop-area').innerHTML = '';
        });
        
        // Crop reset button
        const cropResetBtn = document.getElementById('cropReset');
        if (cropResetBtn) {
            cropResetBtn.addEventListener('click', () => {
                if (this.cropper) {
                    // 重置裁剪区域到默认状态
                    this.cropper.reset();
                    window.uiManager.showToast('已重置裁剪区域');
                }
            });
        }
        
        // Crop send to AI button
        this.cropSendToAI.addEventListener('click', () => {
            if (!this.checkConnectionBeforeAction()) return;
            
            // 如果有裁剪器，尝试获取裁剪结果；否则使用原始图片
            if (this.cropper) {
                try {
                    console.log('Starting crop and send operation...');
                    
                    // Validate cropper instance
                    if (!this.cropper) {
                        throw new Error('Cropper not initialized');
                    }

                    // Get and validate crop box data
                    const cropBoxData = this.cropper.getCropBoxData();
                    console.log('Crop box data:', cropBoxData);
                    
                    if (!cropBoxData || typeof cropBoxData.width !== 'number' || typeof cropBoxData.height !== 'number') {
                        throw new Error('Invalid crop box data');
                    }

                    if (cropBoxData.width < 10 || cropBoxData.height < 10) {
                        throw new Error('Crop area is too small. Please select a larger area (minimum 10x10 pixels).');
                    }

                    // Get cropped canvas
                    console.log('Getting cropped canvas...');
                    const canvas = this.cropper.getCroppedCanvas({
                        maxWidth: 2560,
                        maxHeight: 1440,
                        fillColor: '#fff',
                        imageSmoothingEnabled: true,
                        imageSmoothingQuality: 'high',
                    });

                    if (!canvas) {
                        throw new Error('Failed to create cropped canvas');
                    }

                    console.log('Canvas created successfully');

                    // Convert to data URL
                    console.log('Converting to data URL...');
                    try {
                        this.croppedImage = canvas.toDataURL('image/png');
                        console.log('Data URL conversion successful');
                    } catch (dataUrlError) {
                        console.error('Data URL conversion error:', dataUrlError);
                        throw new Error('Failed to process cropped image. The image might be too large or memory insufficient.');
                    }

                    // Clean up cropper and update UI
                    this.cropper.destroy();
                    this.cropper = null;
                    this.cropContainer.classList.add('hidden');
                    document.querySelector('.crop-area').innerHTML = '';
                    
                    // Update the screenshot image with the cropped version
                    this.screenshotImg.src = this.croppedImage;
                    this.imagePreview.classList.remove('hidden');
                    
                    // 根据当前选择的模型类型决定显示哪些按钮
                    this.updateImageActionButtons();
                    
                    // 显示Claude分析面板
                    this.claudePanel.classList.remove('hidden');
                    this.emptyState.classList.add('hidden');
                    
                    // 发送图像到Claude进行分析
                    this.sendImageToClaude(this.croppedImage);
                    
                    window.uiManager.showToast('正在发送至AI分析...');
                    
                } catch (error) {
                    console.error('Crop and send error details:', {
                        message: error.message,
                        stack: error.stack,
                        cropperState: this.cropper ? 'initialized' : 'not initialized'
                    });
                    window.uiManager.showToast(error.message || '处理图像时出错', 'error');
                    
                    // Clean up on error
                    if (this.cropper) {
                        this.cropper.destroy();
                        this.cropper = null;
                    }
                    this.cropContainer.classList.add('hidden');
                    document.querySelector('.crop-area').innerHTML = '';
                }
            } else if (this.originalImage) {
                // 如果没有裁剪器但有原始图片，直接发送原始图片
                try {
                    // 隐藏裁剪容器
                    this.cropContainer.classList.add('hidden');
                    
                    // 显示Claude分析面板
                    this.claudePanel.classList.remove('hidden');
                    this.emptyState.classList.add('hidden');
                    
                    // 发送原始图像到Claude进行分析
                    this.sendImageToClaude(this.originalImage);
                    
                    window.uiManager.showToast('正在发送至AI分析...');
                    
                } catch (error) {
                    console.error('Send original image error:', error);
                    window.uiManager.showToast('发送图片失败: ' + error.message, 'error');
                }
            } else {
                window.uiManager.showToast('请先截图', 'error');
            }
        });
    }

    setupAnalysisEvents() {
        // 防止重复绑定事件监听器
        if (this.extractTextBtn) {
            const newExtractBtn = this.extractTextBtn.cloneNode(true);
            this.extractTextBtn.parentNode.replaceChild(newExtractBtn, this.extractTextBtn);
            this.extractTextBtn = newExtractBtn;
        }
        
        if (this.sendExtractedTextBtn) {
            const newSendBtn = this.sendExtractedTextBtn.cloneNode(true);
            this.sendExtractedTextBtn.parentNode.replaceChild(newSendBtn, this.sendExtractedTextBtn);
            this.sendExtractedTextBtn = newSendBtn;
        }
        
        if (this.sendToClaudeBtn) {
            const newClaudeBtn = this.sendToClaudeBtn.cloneNode(true);
            this.sendToClaudeBtn.parentNode.replaceChild(newClaudeBtn, this.sendToClaudeBtn);
            this.sendToClaudeBtn = newClaudeBtn;
        }
        
        console.log('DEBUG: 已清除分析按钮上的事件监听器，防止重复绑定');
        
        // Extract Text button
        this.extractTextBtn.addEventListener('click', () => {
            if (!this.checkConnectionBeforeAction()) return;
            
            // 优先使用裁剪后的图片，如果没有则使用原始截图
            const imageToExtract = this.croppedImage || this.originalImage;
            
            if (!imageToExtract) {
                window.uiManager.showToast('请先截图', 'error');
                return;
            }

            this.extractTextBtn.disabled = true;
            this.sendExtractedTextBtn.disabled = true;  // Disable the send button while extracting
            this.extractTextBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>提取中...</span>';

            const settings = window.settingsManager.getSettings();
            
            // 根据用户设置的OCR源进行选择
            const ocrSource = settings.ocrSource || 'auto';
            const baiduApiKey = window.settingsManager.apiKeyValues.BaiduApiKey;
            const baiduSecretKey = window.settingsManager.apiKeyValues.BaiduSecretKey;
            const mathpixApiKey = settings.mathpixApiKey;
            
            const hasBaiduOCR = baiduApiKey && baiduSecretKey;
            const hasMathpix = mathpixApiKey && mathpixApiKey !== ':';
            
            // 根据OCR源配置检查可用性
            let canProceed = false;
            let missingOCRMessage = '';
            
            if (ocrSource === 'baidu') {
                canProceed = hasBaiduOCR;
                missingOCRMessage = '请在设置中配置百度OCR API密钥';
            } else if (ocrSource === 'mathpix') {
                canProceed = hasMathpix;
                missingOCRMessage = '请在设置中配置Mathpix API密钥';
            } else { // auto
                canProceed = hasBaiduOCR || hasMathpix;
                missingOCRMessage = '请在设置中配置OCR API密钥：百度OCR（推荐）或Mathpix';
            }
            
            if (!canProceed) {
                window.uiManager.showToast(missingOCRMessage, 'error');
                document.getElementById('settingsPanel').classList.add('active');
                this.extractTextBtn.disabled = false;
                this.extractTextBtn.innerHTML = '<i class="fas fa-font"></i><span>提取文本</span>';
                return;
            }

            // 显示文本框和按钮
            this.extractedText.classList.remove('hidden');
            this.sendExtractedTextBtn.classList.remove('hidden');
            
            if (this.extractedText) {
                this.extractedText.value = '正在提取文本...';
                this.extractedText.disabled = true;
            }

            try {
                this.socket.emit('extract_text', {
                    image: imageToExtract.split(',')[1],
                    settings: {
                        ocrSource: settings.ocrSource || 'auto'
                    }
                });

                // 监听服务器确认请求的响应
                this.socket.once('request_acknowledged', (ackResponse) => {
                    console.log('服务器确认收到文本提取请求', ackResponse);
                });
            } catch (error) {
                window.uiManager.showToast('提取文本失败: ' + error.message, 'error');
                this.extractTextBtn.disabled = false;
                this.sendExtractedTextBtn.disabled = false;
                this.extractTextBtn.innerHTML = '<i class="fas fa-font"></i><span>提取文本</span>';
                if (this.extractedText) {
                    this.extractedText.disabled = false;
                }
            }
        });

        // Send Extracted Text button
        this.sendExtractedTextBtn.addEventListener('click', () => {
            if (!this.checkConnectionBeforeAction()) return;
            
            // 防止重复点击
            if (this.sendExtractedTextBtn.disabled) return;
            
            const text = this.extractedText.value.trim();
            if (!text) {
                window.uiManager.showToast('请输入一些文本', 'error');
                return;
            }

            const settings = window.settingsManager.getSettings();
            const apiKeys = {};
            Object.keys(window.settingsManager.apiKeyInputs).forEach(keyId => {
                const input = window.settingsManager.apiKeyInputs[keyId];
                if (input && input.value) {
                    apiKeys[keyId] = input.value;
                }
            });
            
            console.log("Debug - 发送文本分析API密钥:", apiKeys);
            
            // 禁用按钮防止重复点击
            this.sendExtractedTextBtn.disabled = true;

            try {
                this.socket.emit('analyze_text', {
                    text: text,
                    settings: {
                        ...settings,
                        apiKeys: apiKeys,
                        model: settings.model || 'claude-3-7-sonnet-20250219',
                        modelInfo: settings.modelInfo || {},
                        modelCapabilities: {
                            supportsMultimodal: settings.modelInfo?.supportsMultimodal || false,
                            isReasoning: settings.modelInfo?.isReasoning || false
                        }
                    }
                });
            } catch (error) {
                this.setElementContent(this.responseContent, 'Error: Failed to send text for analysis - ' + error.message);
                this.sendExtractedTextBtn.disabled = false;
                window.uiManager.showToast('发送文本进行分析失败', 'error');
            }
        });

        // Send to Claude button
        this.sendToClaudeBtn.addEventListener('click', () => {
            if (!this.checkConnectionBeforeAction()) return;
            
            // 防止重复点击
            if (this.sendToClaudeBtn.disabled) return;
            this.sendToClaudeBtn.disabled = true;
            
            // 获取当前模型设置
            const settings = window.settingsManager.getSettings();
            const isMultimodalModel = settings.modelInfo?.supportsMultimodal || false;
            const modelName = settings.model || '未知';
            
            if (!isMultimodalModel) {
                window.uiManager.showToast(`当前选择的模型 ${modelName} 不支持图像分析。请先提取文本或切换到支持多模态的模型。`, 'error');
                this.sendToClaudeBtn.disabled = false;
                return;
            }
            
            // 只发送裁剪后的图片，如果没有裁剪过则提示用户先裁剪
            if (this.croppedImage) {
                try {
                    // 清空之前的结果
                    this.responseContent.innerHTML = '';
                    this.thinkingContent.innerHTML = '';
                    
                    // 显示Claude分析面板
                    this.claudePanel.classList.remove('hidden');
                    
                    // 发送图片进行分析
                    this.sendImageToClaude(this.croppedImage);
                } catch (error) {
                    console.error('Error:', error);
                    window.uiManager.showToast('发送图片失败: ' + error.message, 'error');
                    this.sendToClaudeBtn.disabled = false;
                }
            } else {
                window.uiManager.showToast('请先裁剪图片', 'error');
                this.sendToClaudeBtn.disabled = false;
            }
        });

        // Handle Claude panel close button
        const closeClaudePanel = document.getElementById('closeClaudePanel');
        if (closeClaudePanel) {
            closeClaudePanel.addEventListener('click', () => {
                this.claudePanel.classList.add('hidden');
                
                // 如果图像预览也被隐藏，显示空状态
                if (this.imagePreview.classList.contains('hidden')) {
                    this.emptyState.classList.remove('hidden');
                }
                
                // 重置状态指示灯
                this.updateStatusLight('');
                
                // 清空响应内容，准备下一次分析
                this.responseContent.innerHTML = '';
                
                // 隐藏思考部分
                this.thinkingSection.classList.add('hidden');
                this.thinkingContent.innerHTML = '';
                this.thinkingContent.className = 'thinking-content collapsed';
            });
        }
    }

    setupThinkingToggle() {
        // 确保正确获取DOM元素
        const thinkingSection = document.getElementById('thinkingSection');
        const thinkingToggle = document.getElementById('thinkingToggle');
        const thinkingContent = document.getElementById('thinkingContent');
        
        if (!thinkingToggle || !thinkingContent) {
            console.error('思考切换组件未找到必要的DOM元素');
            return;
        }
        
        // 初始化时隐藏动态省略号
        this.showThinkingAnimation(false);
        
        // 存储DOM引用
        this.thinkingSection = thinkingSection;
        this.thinkingToggle = thinkingToggle;
        this.thinkingContent = thinkingContent;
        
        // 直接使用函数，确保作用域正确
        thinkingToggle.onclick = () => {
            console.log('点击了思考标题');
            
            // 先移除两个类，然后添加正确的类
            const isExpanded = thinkingContent.classList.contains('expanded');
            const toggleIcon = thinkingToggle.querySelector('.toggle-btn i');
            
            // 从样式上清除当前状态
            thinkingContent.classList.remove('expanded');
            thinkingContent.classList.remove('collapsed');
            
            if (isExpanded) {
                console.log('折叠思考内容');
                // 添加折叠状态
                thinkingContent.classList.add('collapsed');
                if (toggleIcon) {
                    toggleIcon.className = 'fas fa-chevron-down';
                }
                // 更新用户偏好
                this.userThinkingExpanded = false;
            } else {
                console.log('展开思考内容');
                // 添加展开状态
                thinkingContent.classList.add('expanded');
                if (toggleIcon) {
                    toggleIcon.className = 'fas fa-chevron-up';
                }
                // 更新用户偏好
                this.userThinkingExpanded = true;
                
                // 当展开思考内容时，确保代码高亮生效
                if (window.hljs) {
                    setTimeout(() => {
                        thinkingContent.querySelectorAll('pre code').forEach((block) => {
                            hljs.highlightElement(block);
                        });
                    }, 100); // 添加一点延迟，确保DOM已完全更新
                }
            }
        };
        
        console.log('思考切换组件初始化完成');
    }

    // 获取用于显示的图像URL，如果原始URL无效则返回占位符
    getImageForDisplay(imageUrl) {
        return this.isValidImageDataUrl(imageUrl) ? imageUrl : this.getPlaceholderImageUrl();
    }

    sendImageToClaude(imageData) {
        const settings = window.settingsManager.getSettings();
        
        // 获取API密钥
        const apiKeys = {};
        Object.keys(window.settingsManager.apiKeyInputs).forEach(keyId => {
            const input = window.settingsManager.apiKeyInputs[keyId];
            if (input && input.value) {
                apiKeys[keyId] = input.value;
            }
        });
        
        console.log("Debug - 发送API密钥:", apiKeys);
        
        try {
            // 处理图像数据，去除base64前缀
            let processedImageData = imageData;
            if (imageData.startsWith('data:')) {
                // 分割数据URL，只保留base64部分
                processedImageData = imageData.split(',')[1];
            }
            
            this.socket.emit('analyze_image', { 
                image: processedImageData, 
                settings: {
                    ...settings,
                    apiKeys: apiKeys,
                    model: settings.model || 'claude-3-7-sonnet-20250219',
                    modelInfo: settings.modelInfo || {},
                    modelCapabilities: {
                        supportsMultimodal: settings.modelInfo?.supportsMultimodal || false,
                        isReasoning: settings.modelInfo?.isReasoning || false
                    }
                }
            });
            
            // 注意：Claude面板的显示已经在点击事件中处理，这里不再重复
        } catch (error) {
            this.setElementContent(this.responseContent, 'Error: ' + error.message);
            window.uiManager.showToast('发送图片分析失败', 'error');
            this.sendToClaudeBtn.disabled = false;
        }
    }

    async initialize() {
        console.log('Initializing SnapSolver...');
        
        // 重置调试计数器
        window.captureCounter = 0;
        window.responseCounter = 0;
        console.log('DEBUG: 重置截图计数器');
        
        // 初始化managers
        // 确保UIManager已经初始化，如果没有，等待它初始化
        if (!window.uiManager) {
            console.log('等待UI管理器初始化...');
            window.uiManager = new UIManager();
            // 给UIManager一些时间初始化
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        window.settingsManager = new SettingsManager();
        window.app = this; // 便于从其他地方访问
        
        // 等待SettingsManager初始化完成
        if (window.settingsManager) {
            // 如果settingsManager还没初始化完成，等待它
            if (!window.settingsManager.isInitialized) {
                console.log('等待设置管理器初始化完成...');
                // 最多等待5秒
                for (let i = 0; i < 50; i++) {
                    if (window.settingsManager.isInitialized) break;
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
        }
        
        // 初始化Markdown工具
        this.initializeMarkdownTools();
        
        // 建立与服务器的连接
        this.connectToServer();
        
        // 初始化UI元素和事件处理
        this.initializeElements();
        
        // 设置所有事件监听器（注意：setupEventListeners内部已经调用了setupCaptureEvents，不需要重复调用）
        this.setupEventListeners();
        this.setupAutoScroll();
        
        // 监听窗口大小变化，调整界面
        window.addEventListener('resize', this.handleResize.bind(this));
        
        // 监听document点击事件，处理面板关闭
        document.addEventListener('click', (e) => {
            // 关闭裁剪器
            if (this.cropContainer &&
                !this.cropContainer.contains(e.target) &&
                !e.target.matches('#cropBtn') &&
                !this.cropContainer.classList.contains('hidden')) {
                this.cropContainer.classList.add('hidden');
            }
        });
        
        // 监听页面卸载事件，清除所有计时器
        window.addEventListener('beforeunload', this.cleanup.bind(this));
        
        // 设置默认UI状态
        this.enableInterface();
        
        // 更新图像操作按钮
        this.updateImageActionButtons();
        
        console.log('SnapSolver initialization complete');
    }
    
    // 初始化Markdown工具
    initializeMarkdownTools() {
        // 检查marked是否可用
        if (typeof marked === 'undefined') {
            console.warn('Marked.js 未加载，Markdown渲染将不可用');
            return;
        }
        
        // 创建一个备用的hljs对象，以防CDN加载失败
        if (typeof hljs === 'undefined') {
            console.warn('Highlight.js未加载，创建备用对象');
            window.hljs = {
                highlight: (code, opts) => ({ value: code }),
                highlightAuto: (code) => ({ value: code }),
                getLanguage: () => null,
                configure: () => {}
            };
        }
        
        // 初始化marked设置
        marked.setOptions({
            gfm: true, // 启用GitHub风格的Markdown
            breaks: true, // 将换行符转换为<br>
            pedantic: false, // 不使用原始markdown规范
            sanitize: false, // 不要过滤HTML标签，允许一些HTML
            smartLists: true, // 使用比原生markdown更智能的列表行为
            smartypants: false, // 不要使用更智能的标点符号
            xhtml: false, // 不使用自闭合标签
            mangle: false, // 不混淆邮箱地址
            headerIds: false, // 不生成header ID
            highlight: function(code, lang) {
                // 如果highlight.js不可用，直接返回代码
                if (typeof hljs === 'undefined') {
                    return code;
                }
                
                // 如果指定了语言且hljs支持
                if (lang && hljs.getLanguage(lang)) {
                    try {
                        return hljs.highlight(code, { language: lang }).value;
                    } catch (err) {
                        console.error('代码高亮错误:', err);
                    }
                }
                
                // 尝试自动检测语言
                try {
                    return hljs.highlightAuto(code).value;
                } catch (err) {
                    console.error('自动语言检测错误:', err);
                }
                
                return code; // 使用默认编码效果
            }
        });

        // 配置hljs以支持自动语言检测
        try {
            hljs.configure({
                languages: ['javascript', 'python', 'java', 'cpp', 'csharp', 'html', 'css', 'json', 'xml', 'markdown', 'bash']
            });
            console.log('Markdown工具初始化完成');
        } catch (err) {
            console.error('配置hljs时出错:', err);
        }
    }

    handleResize() {
        // 如果裁剪器存在，需要调整其大小和位置
        if (this.cropper) {
            this.cropper.resize();
        }
        
        // 可以在这里添加其他响应式UI调整
    }

    enableInterface() {
        // 启用主要界面元素
        if (this.captureBtn) {
            this.captureBtn.disabled = false;
            this.captureBtn.innerHTML = '<i class="fas fa-camera"></i>';
        }
        
        // 显示默认的空白状态
        if (this.emptyState && this.imagePreview) {
            if (!this.originalImage) {
                this.emptyState.classList.remove('hidden');
                this.imagePreview.classList.add('hidden');
            } else {
                this.emptyState.classList.add('hidden');
                this.imagePreview.classList.remove('hidden');
            }
        }
        
        console.log('Interface enabled');
    }

    connectToServer() {
        console.log('Connecting to server...');
        
        // 创建Socket.IO连接
        this.socket = io({
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            timeout: 20000
        });
        
        // 连接事件处理
        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.updateConnectionStatus('已连接', true);
            
            // 连接后启用界面
            this.enableInterface();
        });
        
        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.updateConnectionStatus('已断开', false);
            
            // 断开连接时禁用界面
            if (this.captureBtn) {
                this.captureBtn.disabled = true;
            }
        });
        
        this.socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            this.updateConnectionStatus('连接错误', false);
        });
        
        this.socket.on('reconnect_attempt', (attemptNumber) => {
            console.log(`Reconnection attempt ${attemptNumber}`);
            this.updateConnectionStatus('正在重连...', false);
        });
        
        this.socket.on('reconnect', () => {
            console.log('Reconnected to server');
            this.updateConnectionStatus('已重连', true);
            
            // 重连后启用界面
            this.enableInterface();
        });
        
        this.socket.on('reconnect_failed', () => {
            console.error('Failed to reconnect');
            this.updateConnectionStatus('重连失败', false);
            window.uiManager.showToast('连接服务器失败，请刷新页面重试', 'error');
        });
        
        // 设置socket事件处理器
        this.setupSocketEventHandlers();
    }

    isConnected() {
        return this.socket && this.socket.connected;
    }

    checkConnectionBeforeAction(action) {
        if (!this.isConnected()) {
            window.uiManager.showToast('未连接到服务器，请等待连接建立后再试', 'error');
            return false;
        }
        return true;
    }

    scrollToBottom() {
        if (this.responseContent) {
            // 使用平滑滚动效果
            this.responseContent.scrollTo({
                top: this.responseContent.scrollHeight,
                behavior: 'smooth'
            });
            
            // 确保Claude面板也滚动到可见区域
            if (this.claudePanel) {
                this.claudePanel.scrollIntoView({ 
                    behavior: 'smooth',
                    block: 'end'
                });
            }
        }
    }

    // 新增方法：根据所选模型更新图像操作按钮
    updateImageActionButtons() {
        if (!window.settingsManager) {
            console.error('Settings manager not available');
            return;
        }
        
        const settings = window.settingsManager.getSettings();
        const isMultimodalModel = settings.modelInfo?.supportsMultimodal || false;
        const modelName = settings.model || '未知';
        
        console.log(`更新图像操作按钮 - 当前模型: ${modelName}, 是否支持多模态: ${isMultimodalModel}`);
        
        // 对于截图后的操作按钮显示逻辑
        if (this.sendToClaudeBtn && this.extractTextBtn) {
            if (!isMultimodalModel) {
                // 非多模态模型：只显示提取文本按钮，隐藏发送到AI按钮
                console.log('非多模态模型：隐藏"发送图片至AI"按钮');
                this.sendToClaudeBtn.classList.add('hidden');
                this.extractTextBtn.classList.remove('hidden');
            } else {
                // 多模态模型：显示两个按钮
                if (!this.imagePreview.classList.contains('hidden')) {
                    // 只有在有图像时才显示按钮
                    console.log('多模态模型：显示全部按钮');
                    this.sendToClaudeBtn.classList.remove('hidden');
                    this.extractTextBtn.classList.remove('hidden');
                } else {
                    // 无图像时隐藏所有按钮
                    console.log('无图像：隐藏所有按钮');
                    this.sendToClaudeBtn.classList.add('hidden');
                    this.extractTextBtn.classList.add('hidden');
                }
            }
        } else {
            console.warn('按钮元素不可用');
        }
    }

    checkClickOutside() {
        // 点击其他区域时自动关闭悬浮窗
        document.addEventListener('click', (e) => {
            // 检查是否点击在设置面板、设置按钮或其子元素之外
            if (
                !e.target.closest('#settingsPanel') && 
                !e.target.matches('#settingsToggle') && 
                !e.target.closest('#settingsToggle') &&
                document.getElementById('settingsPanel').classList.contains('active')
            ) {
                document.getElementById('settingsPanel').classList.remove('active');
            }
            
            // 检查是否点击在Claude面板、分析按钮或其子元素之外
            if (
                !e.target.closest('#claudePanel') && 
                !e.target.matches('#sendToClaude') && 
                !e.target.closest('#sendToClaude') &&
                !e.target.matches('#extractText') && 
                !e.target.closest('#extractText') &&
                !e.target.matches('#sendExtractedText') && 
                !e.target.closest('#sendExtractedText') &&
                !this.claudePanel.classList.contains('hidden')
            ) {
                // 因为分析可能正在进行，不自动关闭Claude面板
                // 但是可以考虑增加一个最小化功能
            }
        });
    }

    // 新增清理方法，移除计时器相关代码
    cleanup() {
        console.log('执行清理操作...');
        
        // 清除所有Socket监听器
        if (this.socket) {
            this.socket.off('text_extracted');
            this.socket.off('screenshot_response');
            this.socket.off('screenshot_complete');
            this.socket.off('request_acknowledged');
            this.socket.off('ai_response');
            this.socket.off('thinking');
            this.socket.off('thinking_complete');
            this.socket.off('analysis_complete');
        }
        
        // 销毁裁剪器实例
        if (this.cropper) {
            this.cropper.destroy();
            this.cropper = null;
        }
        
        console.log('清理完成');
    }

    // 空方法替代键盘快捷键实现
    setupKeyboardShortcuts() {
        // 移动端应用不需要键盘快捷键
        console.log('键盘快捷键已禁用（移动端应用）');
    }

    // 控制思考动态省略号显示
    showThinkingAnimation(show) {
        const dotsElement = document.querySelector('.thinking-title .dots-animation');
        if (dotsElement) {
            if (show) {
                dotsElement.style.display = 'inline-block';
            } else {
                dotsElement.style.display = 'none';
            }
        }
    }

    // 添加停止生成方法
    stopGeneration() {
        console.log('停止生成请求');
        
        // 向服务器发送停止生成信号
        if (this.socket && this.socket.connected) {
            this.socket.emit('stop_generation');
            
            // 显示提示
            window.uiManager.showToast('正在停止生成...', 'info');
            
            // 隐藏停止按钮
            this.hideStopGenerationButton();
        } else {
            console.error('无法停止生成: Socket未连接');
            window.uiManager.showToast('无法停止生成: 连接已断开', 'error');
        }
    }
    
    // 显示停止生成按钮
    showStopGenerationButton() {
        if (this.stopGenerationBtn) {
            this.stopGenerationBtn.classList.add('visible');
        }
    }
    
    // 隐藏停止生成按钮
    hideStopGenerationButton() {
        if (this.stopGenerationBtn) {
            this.stopGenerationBtn.classList.remove('visible');
        }
    }
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    try {
        console.log('Initializing application...');
        window.app = new SnapSolver();
        await window.app.initialize();
        console.log('Application initialized successfully');
    } catch (error) {
        console.error('Failed to initialize application:', error);
        // 在页面上显示错误信息
        const errorDiv = document.createElement('div');
        errorDiv.className = 'init-error';
        errorDiv.innerHTML = `
            <h2>Initialization Error</h2>
            <p>${error.message}</p>
            <pre>${error.stack}</pre>
        `;
        document.body.appendChild(errorDiv);
    }
});
