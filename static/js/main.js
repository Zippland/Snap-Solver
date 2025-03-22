class SnapSolver {
    constructor() {
        console.log('Creating SnapSolver instance...');
        
        // 初始化属性
        this.socket = null;
        this.cropper = null;
        this.originalImage = null;
        this.croppedImage = null;
        this.extractedContent = '';
        this.emitTimeout = null;
        this.eventsSetup = false;
        
        // 初始化应用
        this.initialize();
    }

    initializeElements() {
        // Main elements
        this.screenshotImg = document.getElementById('screenshotImg');
        this.imagePreview = document.getElementById('imagePreview');
        this.emptyState = document.getElementById('emptyState');
        this.cropBtn = document.getElementById('cropBtn');
        this.captureBtn = document.getElementById('captureBtn');
        this.sendToClaudeBtn = document.getElementById('sendToClaude');
        this.extractTextBtn = document.getElementById('extractText');
        this.textEditor = document.getElementById('textEditor');
        this.extractedText = document.getElementById('extractedText');
        this.sendExtractedTextBtn = document.getElementById('sendExtractedText');
        this.cropContainer = document.getElementById('cropContainer');
        this.manualTextInput = document.getElementById('manualTextInput');
        this.claudePanel = document.getElementById('claudePanel');
        this.responseContent = document.getElementById('responseContent');
        this.thinkingSection = document.getElementById('thinkingSection');
        this.thinkingContent = document.getElementById('thinkingContent');
        this.thinkingToggle = document.getElementById('thinkingToggle');
        this.connectionStatus = document.getElementById('connectionStatus');
        this.statusLight = document.querySelector('.status-light');
        
        // Crop elements
        this.cropCancel = document.getElementById('cropCancel');
        this.cropConfirm = document.getElementById('cropConfirm');
    }

    initializeState() {
        this.socket = null;
        this.cropper = null;
        this.croppedImage = null;
        this.extractedContent = '';
        this.emitTimeout = null;
        
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
        this.statusLight.className = 'status-light';
        switch (status) {
            case 'started':
            case 'streaming':
                this.statusLight.classList.add('processing');
                break;
            case 'completed':
                this.statusLight.classList.add('completed');
                break;
            case 'error':
                this.statusLight.classList.add('error');
                break;
            default:
                // Reset to default state
                break;
        }
    }

    initializeConnection() {
        try {
            this.socket = io(window.location.origin, {
                reconnection: true,
                reconnectionAttempts: 5,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000,
                timeout: 20000,
                autoConnect: true
            });

            this.socket.on('connect', () => {
                console.log('Connected to server');
                this.updateConnectionStatus('已连接', true);
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
            setTimeout(() => this.initializeConnection(), 5000);
        }
    }

    setupSocketEventHandlers() {
        // 如果已经设置过事件处理器，先移除它们
        if (this.hasOwnProperty('eventsSetup') && this.eventsSetup) {
            this.socket.off('screenshot_response');
            this.socket.off('screenshot_complete');
            this.socket.off('request_acknowledged');
            this.socket.off('text_extracted');
            this.socket.off('claude_response');
        }
        
        // 标记事件处理器已设置
        this.eventsSetup = true;
        
        // 旧版截图响应处理器 (保留兼容性)
        this.socket.on('screenshot_response', (data) => {
            if (data.success) {
                this.screenshotImg.src = `data:image/png;base64,${data.image}`;
                this.originalImage = `data:image/png;base64,${data.image}`;
                this.imagePreview.classList.remove('hidden');
                this.emptyState.classList.add('hidden');
                
                // 根据模型类型显示适当的按钮
                this.updateImageActionButtons();
                
                // 恢复按钮状态
                this.captureBtn.disabled = false;
                this.captureBtn.innerHTML = '<i class="fas fa-camera"></i><span>截图</span>';
                
                // 初始化裁剪器
                this.initializeCropper();
                
                window.uiManager.showToast('截图成功', 'success');
            } else {
                this.captureBtn.disabled = false;
                this.captureBtn.innerHTML = '<i class="fas fa-camera"></i><span>截图</span>';
                console.error('截图失败:', data.error);
                window.uiManager.showToast('截图失败: ' + data.error, 'error');
            }
        });
        
        // 新版截图响应处理器
        this.socket.on('screenshot_complete', (data) => {
            this.captureBtn.disabled = false;
            this.captureBtn.innerHTML = '<i class="fas fa-camera"></i><span>截图</span>';
            
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
            
            if (this.emitTimeout) {
                clearTimeout(this.emitTimeout);
                this.emitTimeout = null;
            }
            
            // 检查是否有内容数据
            if (data.content) {
                    this.extractedText.value = data.content;
                this.extractedContent = data.content;
                this.textEditor.classList.remove('hidden');
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

        this.socket.on('claude_response', (data) => {
            console.log('Received claude_response:', data);
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
                    break;
                    
                case 'thinking':
                    // 处理思考内容
                    if (data.content && this.thinkingContent && this.thinkingSection) {
                        console.log('Received thinking content');
                        this.thinkingSection.classList.remove('hidden');
                        
                        // 记住用户的展开/折叠状态
                        const wasExpanded = this.thinkingContent.classList.contains('expanded');
                        
                        // 直接设置完整内容而不是追加
                        this.setElementContent(this.thinkingContent, data.content);
                        
                        // 添加打字动画效果
                        this.thinkingContent.classList.add('thinking-typing');
                        
                        // 根据之前的状态决定是否展开
                        if (wasExpanded) {
                            this.thinkingContent.classList.add('expanded');
                            this.thinkingContent.classList.remove('collapsed');
                            
                            // 更新切换按钮图标
                            const toggleIcon = document.querySelector('#thinkingToggle .toggle-btn i');
                            if (toggleIcon) {
                                toggleIcon.className = 'fas fa-chevron-up';
                            }
                        } else {
                            // 初始状态为折叠
                            this.thinkingContent.classList.add('collapsed');
                            this.thinkingContent.classList.remove('expanded');
                            
                            // 更新切换按钮图标
                            const toggleIcon = document.querySelector('#thinkingToggle .toggle-btn i');
                            if (toggleIcon) {
                                toggleIcon.className = 'fas fa-chevron-down';
                            }
                        }
                    }
                    break;
                
                case 'thinking_complete':
                    // 完整的思考内容
                    if (data.content && this.thinkingContent && this.thinkingSection) {
                        console.log('Thinking complete');
                        this.thinkingSection.classList.remove('hidden');
                        
                        // 设置完整内容
                        this.setElementContent(this.thinkingContent, data.content);
                        
                        // 移除打字动画
                        this.thinkingContent.classList.remove('thinking-typing');
                    }
                    break;
                    
                case 'streaming':
                    if (data.content && this.responseContent) {
                        console.log('Received content chunk');
                        
                        // 使用更安全的方式设置内容，避免HTML解析问题
                        this.setElementContent(this.responseContent, data.content);
                        this.responseContent.style.display = 'block';
                        
                        // 移除思考部分的打字动画
                        if (this.thinkingContent) {
                            this.thinkingContent.classList.remove('thinking-typing');
                        }
                        
                        // 平滑滚动到最新内容
                        this.scrollToBottom();
                    }
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
                            this.thinkingContent.classList.remove('expanded');
                            this.thinkingContent.classList.add('collapsed');
                            const toggleBtn = document.querySelector('#thinkingToggle .toggle-btn i');
                            if (toggleBtn) {
                                toggleBtn.className = 'fas fa-chevron-down';
                            }
                            
                            // 添加明确的提示
                            window.uiManager.showToast('分析完成，可点击"AI思考过程"查看详细思考内容', 'success');
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
                    break;
                    
                case 'error':
                    console.error('Analysis error:', data.error);
                    const errorMessage = data.error || 'Unknown error occurred';
                    
                    // 显示错误信息
                    if (errorMessage && this.responseContent) {
                        const currentText = this.responseContent.textContent || '';
                        this.setElementContent(this.responseContent, currentText + '\nError: ' + errorMessage);
                    }
                    
                    // 重新启用按钮
                    if (this.sendToClaudeBtn) this.sendToClaudeBtn.disabled = false;
                    if (this.sendExtractedTextBtn) this.sendExtractedTextBtn.disabled = false;
                    
                    window.uiManager.showToast('Analysis failed: ' + errorMessage, 'error');
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
                    break;
            }
        });
        
        // 接收到thinking数据时
        this.socket.on('thinking', (data) => {
            console.log('收到思考过程数据');

            // 显示思考区域
            this.thinkingSection.classList.remove('hidden');
            this.thinkingContent.textContent = data.thinking;
            
            // 记住用户的展开/折叠状态
            const wasExpanded = this.thinkingContent.classList.contains('expanded');
            
            // 如果之前没有设置状态，默认为折叠
            if (!wasExpanded && !this.thinkingContent.classList.contains('collapsed')) {
                this.thinkingContent.classList.add('collapsed');
                const toggleIcon = this.thinkingToggle.querySelector('.toggle-btn i');
                if (toggleIcon) {
                    toggleIcon.className = 'fas fa-chevron-down';
                }
            }
        });

        // 思考过程完成
        this.socket.on('thinking_complete', (data) => {
            console.log('思考过程完成');
            this.thinkingSection.classList.remove('hidden');
            this.thinkingContent.textContent = data.thinking;
            
            // 确保图标正确显示
            const toggleIcon = this.thinkingToggle.querySelector('.toggle-btn i');
            if (toggleIcon) {
                toggleIcon.className = 'fas fa-chevron-down';
            }
            
            // 添加提示信息
            const toast = window.uiManager.showToast('思考过程已完成，点击标题可查看详细思考过程', 'success');
            toast.style.zIndex = '1000';
        });

        // 分析完成
        this.socket.on('analysis_complete', (data) => {
            console.log('分析完成，接收到结果');
            this.updateStatusLight('completed');
            this.enableInterface();
            
            // 显示分析结果
            if (this.responseContent) {
                this.responseContent.innerHTML = data.response;
                this.responseContent.style.display = 'block';
                
                // 滚动到结果区域
                setTimeout(() => {
                    this.responseContent.scrollIntoView({ behavior: 'smooth' });
                }, 200);
            }
            
            // 确保思考部分完全显示（如果有的话）
            if (data.thinking && this.thinkingSection && this.thinkingContent) {
                this.thinkingSection.classList.remove('hidden');
                this.thinkingContent.textContent = data.thinking;
                
                // 确保初始状态为折叠
                this.thinkingContent.classList.remove('expanded');
                this.thinkingContent.classList.add('collapsed');
                const toggleIcon = this.thinkingToggle.querySelector('.toggle-btn i');
                if (toggleIcon) {
                    toggleIcon.className = 'fas fa-chevron-down';
                }
                
                // 弹出提示
                window.uiManager.showToast('分析完成，可点击"AI思考过程"查看详细思考内容', 'success');
            }
        });
    }

    // 新方法：安全设置DOM内容的方法（替代updateElementContent）
    setElementContent(element, content) {
        if (!element) return;
        
        // 直接设置内容
        element.textContent = content;
        
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
                background: true
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
        // 截图按钮
        this.captureBtn.addEventListener('click', () => {
            if (!this.checkConnectionBeforeAction()) return;
            
            try {
                this.captureBtn.disabled = true;  // 禁用按钮防止重复点击
                this.captureBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>正在截图...</span>';
                this.socket.emit('capture_screenshot', {});
            } catch (error) {
                console.error('Error starting capture:', error);
                window.uiManager.showToast('启动截图失败', 'error');
                this.captureBtn.disabled = false;
                this.captureBtn.innerHTML = '<i class="fas fa-camera"></i><span>截取屏幕</span>';
            }
        });
    }

    setupCropEvents() {
        // Crop button
        this.cropBtn.addEventListener('click', () => {
            if (!this.checkConnectionBeforeAction()) return;
            
            if (this.screenshotImg.src) {
                this.initializeCropper();
            }
        });

        // Crop confirm button
        document.getElementById('cropConfirm').addEventListener('click', () => {
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
                    this.cropBtn.classList.remove('hidden');
                    this.sendToClaudeBtn.classList.remove('hidden');
                    this.extractTextBtn.classList.remove('hidden');
                    window.uiManager.showToast('Cropping successful');
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
        document.getElementById('cropCancel').addEventListener('click', () => {
            if (this.cropper) {
                this.cropper.destroy();
                this.cropper = null;
            }
            this.cropContainer.classList.add('hidden');
            this.sendToClaudeBtn.classList.add('hidden');
            this.extractTextBtn.classList.add('hidden');
            document.querySelector('.crop-area').innerHTML = '';
        });
    }

    setupAnalysisEvents() {
        // Extract Text button
        this.extractTextBtn.addEventListener('click', () => {
            if (!this.checkConnectionBeforeAction()) return;
            
            if (!this.croppedImage) {
                window.uiManager.showToast('请先裁剪图片', 'error');
                return;
            }

            this.extractTextBtn.disabled = true;
            this.sendExtractedTextBtn.disabled = true;  // Disable the send button while extracting
            this.extractTextBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>提取中...</span>';

            const settings = window.settingsManager.getSettings();
            const mathpixApiKey = settings.mathpixApiKey;
            
            if (!mathpixApiKey || mathpixApiKey === ':') {
                window.uiManager.showToast('请在设置中输入Mathpix API凭据', 'error');
                document.getElementById('settingsPanel').classList.remove('hidden');
                this.extractTextBtn.disabled = false;
                this.extractTextBtn.innerHTML = '<i class="fas fa-font"></i><span>提取文本</span>';
                return;
            }

            // Show text editor and prepare UI
            this.textEditor.classList.remove('hidden');
            if (this.extractedText) {
                this.extractedText.value = '正在提取文本...';
                this.extractedText.disabled = true;
            }

            try {
                // 设置超时时间（15秒）以避免长时间无响应
                this.emitTimeout = setTimeout(() => {
                    window.uiManager.showToast('文本提取超时，请重试或手动输入文本', 'error');
                    this.extractTextBtn.disabled = false;
                    this.extractTextBtn.innerHTML = '<i class="fas fa-font"></i><span>提取文本</span>';
                    this.extractedText.disabled = false;
                    this.sendExtractedTextBtn.disabled = false;
                }, 15000);
                
                this.socket.emit('extract_text', {
                    image: this.croppedImage.split(',')[1],
                    settings: {
                        mathpixApiKey: mathpixApiKey
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
            
            // 清空之前的结果
            this.responseContent.innerHTML = '';
            this.thinkingContent.innerHTML = '';
            
            // 显示Claude分析面板
            this.claudePanel.classList.remove('hidden');
            
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
                this.responseContent.textContent = 'Error: Failed to send text for analysis - ' + error.message;
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

    setupKeyboardShortcuts() {
        // Keyboard shortcuts for capture and crop
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch(e.key) {
                    case 'c':
                        if (!this.captureBtn.disabled) this.captureBtn.click();
                        break;
                    case 'x':
                        if (!this.cropBtn.disabled) this.cropBtn.click();
                        break;
                }
            }
        });
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
                window.uiManager.showToast('思考内容已折叠', 'info');
            } else {
                console.log('展开思考内容');
                // 添加展开状态
                thinkingContent.classList.add('expanded');
                if (toggleIcon) {
                    toggleIcon.className = 'fas fa-chevron-up';
                }
                
                // 移除自动滚动到底部的代码，让用户自行控制滚动位置
                
                window.uiManager.showToast('思考内容已展开', 'info');
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
            this.responseContent.textContent = 'Error: ' + error.message;
            window.uiManager.showToast('发送图片分析失败', 'error');
            this.sendToClaudeBtn.disabled = false;
        }
    }

    initialize() {
        console.log('Initializing SnapSolver...');
        
        // 初始化managers
        window.uiManager = new UIManager();
        window.settingsManager = new SettingsManager();
        window.app = this; // 便于从其他地方访问
        
        // 建立与服务器的连接
        this.connectToServer();
        
        // 初始化UI元素和事件处理
        this.initializeElements();
        this.setupSocketEventHandlers();
        this.setupCaptureEvents();
        this.setupCropEvents();
        this.setupAnalysisEvents();
        this.setupKeyboardShortcuts();
        
        // 确保思考切换功能正确初始化
        this.setupThinkingToggle();
        
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
        
        // 设置默认UI状态
        this.enableInterface();
        
        // 更新图像操作按钮
        this.updateImageActionButtons();
        
        console.log('SnapSolver initialization complete');
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
            this.captureBtn.innerHTML = '<i class="fas fa-camera"></i><span>截图</span>';
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
    }

    isConnected() {
        return this.connectionStatus && this.connectionStatus.classList.contains('connected');
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
        if (!window.settingsManager) return;
        
        const settings = window.settingsManager.getSettings();
        const isMultimodalModel = settings.modelInfo?.supportsMultimodal || false;
        
        // 对于截图后的操作按钮显示逻辑
        if (this.sendToClaudeBtn && this.extractTextBtn) {
            if (!isMultimodalModel) {
                // 非多模态模型：只显示提取文本按钮，隐藏发送到AI按钮
                this.sendToClaudeBtn.classList.add('hidden');
                this.extractTextBtn.classList.remove('hidden');
            } else {
                // 多模态模型：显示两个按钮
                if (!this.imagePreview.classList.contains('hidden')) {
                    // 只有在有图像时才显示按钮
                    this.sendToClaudeBtn.classList.remove('hidden');
                    this.extractTextBtn.classList.remove('hidden');
                }
            }
        }
    }
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    try {
        console.log('Initializing application...');
        window.app = new SnapSolver();
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
