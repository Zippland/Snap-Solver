class SnapSolver {
    constructor() {
        // 初始化managers
        window.uiManager = new UIManager();
        window.settingsManager = new SettingsManager();
        
        // 初始化应用组件
        this.initializeElements();
        this.initializeState();
        this.initializeConnection();
        this.setupSocketEventHandlers();
        this.setupAutoScroll();
        this.setupEventListeners();
        
        // 初始化历史
        window.app = this; // 便于从其他地方访问
        this.updateHistoryPanel();
    }

    initializeElements() {
        // Main elements
        this.screenshotImg = document.getElementById('screenshotImg');
        this.imagePreview = document.getElementById('imagePreview');
        this.cropBtn = document.getElementById('cropBtn');
        this.captureBtn = document.getElementById('captureBtn');
        this.sendToClaudeBtn = document.getElementById('sendToClaude');
        this.extractTextBtn = document.getElementById('extractText');
        this.textEditor = document.getElementById('textEditor');
        this.extractedText = document.getElementById('extractedText');
        this.sendExtractedTextBtn = document.getElementById('sendExtractedText');
        this.manualTextInput = document.getElementById('manualTextInput');
        this.claudePanel = document.getElementById('claudePanel');
        this.responseContent = document.getElementById('responseContent');
        this.thinkingSection = document.getElementById('thinkingSection');
        this.thinkingContent = document.getElementById('thinkingContent');
        this.thinkingToggle = document.getElementById('thinkingToggle');
        this.connectionStatus = document.getElementById('connectionStatus');
        this.statusLight = document.querySelector('.status-light');
        
        // Crop elements
        this.cropContainer = document.getElementById('cropContainer');
        this.cropCancel = document.getElementById('cropCancel');
        this.cropConfirm = document.getElementById('cropConfirm');
        
        // Format toggle elements
        this.textFormatBtn = document.getElementById('textFormatBtn');
        this.latexFormatBtn = document.getElementById('latexFormatBtn');
        this.confidenceIndicator = document.getElementById('confidenceIndicator');
        this.confidenceValue = document.querySelector('.confidence-value');
        
        // History elements
        this.historyPanel = document.getElementById('historyPanel');
        this.historyContent = document.querySelector('.history-content');
        this.closeHistory = document.getElementById('closeHistory');
        this.historyToggle = document.getElementById('historyToggle');
    }

    initializeState() {
        this.socket = null;
        this.cropper = null;
        this.croppedImage = null;
        this.history = JSON.parse(localStorage.getItem('snapHistory') || '[]');
        this.currentFormat = 'text';
        this.extractedFormats = {
            text: '',
            latex: ''
        };
        
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

    updateConnectionStatus(connected) {
        this.connectionStatus.textContent = connected ? 'Connected' : 'Disconnected';
        this.connectionStatus.className = `status ${connected ? 'connected' : 'disconnected'}`;
        this.captureBtn.disabled = !connected;
        
        if (!connected) {
            this.imagePreview.classList.add('hidden');
            this.cropBtn.classList.add('hidden');
            this.sendToClaudeBtn.classList.add('hidden');
            this.extractTextBtn.classList.add('hidden');
            this.textEditor.classList.add('hidden');
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
            this.socket = io(window.location.origin);

            this.socket.on('connect', () => {
                console.log('Connected to server');
                this.updateConnectionStatus(true);
            });

            this.socket.on('disconnect', () => {
                console.log('Disconnected from server');
                this.updateConnectionStatus(false);
                this.socket = null;
                setTimeout(() => this.initializeConnection(), 5000);
            });

            this.setupSocketEventHandlers();

        } catch (error) {
            console.error('Connection error:', error);
            this.updateConnectionStatus(false);
            setTimeout(() => this.initializeConnection(), 5000);
        }
    }

    setupSocketEventHandlers() {
        // Screenshot response handler
        this.socket.on('screenshot_response', (data) => {
            if (data.success) {
                this.screenshotImg.src = `data:image/png;base64,${data.image}`;
                this.imagePreview.classList.remove('hidden');
                this.cropBtn.classList.remove('hidden');
                this.captureBtn.disabled = false;
                this.captureBtn.innerHTML = '<i class="fas fa-camera"></i><span>Capture</span>';
                this.sendToClaudeBtn.classList.add('hidden');
                this.extractTextBtn.classList.add('hidden');
                this.textEditor.classList.add('hidden');
                window.showToast('Screenshot captured successfully');
            } else {
                window.showToast('Failed to capture screenshot: ' + data.error, 'error');
                this.captureBtn.disabled = false;
                this.captureBtn.innerHTML = '<i class="fas fa-camera"></i><span>Capture</span>';
            }
        });

        // Text extraction response handler
        this.socket.on('text_extracted', (data) => {
            if (data.error) {
                console.error('Text extraction error:', data.error);
                window.showToast('Failed to extract text: ' + data.error, 'error');
                if (this.extractedText) {
                    this.extractedText.value = '';
                    this.extractedText.disabled = false;
                }
                this.sendExtractedTextBtn.disabled = false;  // Re-enable send button on server error
            } else if (data.content) {
                // Parse the content to extract text and LaTeX
                const lines = data.content.split('\n');
                let confidence = null;
                
                // Process the content
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    if (line.startsWith('Confidence:')) {
                        confidence = parseFloat(line.match(/[\d.]+/)[0]) / 100;
                    } else if (line === 'Text Content:' && i + 1 < lines.length) {
                        this.extractedFormats.text = lines[i + 1];
                    } else if (line === 'LaTeX (Styled):' && i + 1 < lines.length) {
                        this.extractedFormats.latex = lines[i + 1];
                    }
                }
                
                // Update confidence indicator
                if (confidence !== null) {
                    this.confidenceValue.textContent = `${(confidence * 100).toFixed(0)}%`;
                    this.confidenceIndicator.style.display = 'flex';
                }
                
                // Update text editor with current format
                if (this.extractedText) {
                    this.extractedText.value = this.extractedFormats[this.currentFormat];
                    this.extractedText.disabled = false;
                    this.extractedText.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    this.sendExtractedTextBtn.disabled = false;
                }
                
                window.showToast('Text extracted successfully');
            }
            
            this.extractTextBtn.disabled = false;
            this.extractTextBtn.innerHTML = '<i class="fas fa-font"></i><span>Extract Text</span>';
        });

        this.socket.on('claude_response', (data) => {
            console.log('Received claude_response:', data);
            this.updateStatusLight(data.status);
            
            switch (data.status) {
                case 'started':
                    console.log('Analysis started');
                    // 清空显示内容
                    this.responseContent.innerHTML = '';
                    this.thinkingContent.innerHTML = '';
                    this.thinkingSection.classList.add('hidden');
                    this.sendToClaudeBtn.disabled = true;
                    this.sendExtractedTextBtn.disabled = true;
                    break;
                    
                case 'thinking':
                    // 处理思考内容
                    if (data.content) {
                        console.log('Received thinking content');
                        this.thinkingSection.classList.remove('hidden');
                        
                        // 直接设置完整内容而不是追加
                        this.setElementContent(this.thinkingContent, data.content);
                        
                        // 添加打字动画效果
                        this.thinkingContent.classList.add('thinking-typing');
                    }
                    break;
                
                case 'thinking_complete':
                    // 完整的思考内容
                    if (data.content) {
                        console.log('Thinking complete');
                        this.thinkingSection.classList.remove('hidden');
                        
                        // 设置完整内容
                        this.setElementContent(this.thinkingContent, data.content);
                        
                        // 移除打字动画
                        this.thinkingContent.classList.remove('thinking-typing');
                    }
                    break;
                    
                case 'streaming':
                    if (data.content) {
                        console.log('Received content');
                        
                        // 直接设置完整内容
                        this.setElementContent(this.responseContent, data.content);
                        
                        // 移除思考部分的打字动画
                        this.thinkingContent.classList.remove('thinking-typing');
                    }
                    break;
                    
                case 'completed':
                    console.log('Analysis completed');
                    this.sendToClaudeBtn.disabled = false;
                    this.sendExtractedTextBtn.disabled = false;
                    
                    // 保存到历史记录
                    const responseText = this.responseContent.textContent || '';
                    const thinkingText = this.thinkingContent.textContent || '';
                    this.addToHistory(this.croppedImage, responseText, thinkingText);
                    
                    window.showToast('Analysis completed successfully');
                    break;
                    
                case 'error':
                    console.error('Analysis error:', data.error);
                    const errorMessage = data.error || 'Unknown error occurred';
                    
                    // 显示错误信息
                    if (errorMessage) {
                        const currentText = this.responseContent.textContent || '';
                        this.setElementContent(this.responseContent, currentText + '\nError: ' + errorMessage);
                    }
                    
                    this.sendToClaudeBtn.disabled = false;
                    this.sendExtractedTextBtn.disabled = false;
                    window.showToast('Analysis failed: ' + errorMessage, 'error');
                    break;
                    
                default:
                    console.warn('Unknown response status:', data.status);
                    if (data.error) {
                        const currentText = this.responseContent.textContent || '';
                        this.setElementContent(this.responseContent, currentText + '\nError: ' + data.error);
                        this.sendToClaudeBtn.disabled = false;
                        this.sendExtractedTextBtn.disabled = false;
                        window.showToast('Unknown error occurred', 'error');
                    }
            }
        });

        this.socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            this.updateConnectionStatus(false);
            this.socket = null;
            setTimeout(() => this.initializeConnection(), 5000);
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
                dragMode: 'crop',
                autoCropArea: 0,
                restore: false,
                modal: true,
                guides: true,
                highlight: true,
                cropBoxMovable: true,
                cropBoxResizable: true,
                toggleDragModeOnDblclick: false,
                minCropBoxWidth: 50,
                minCropBoxHeight: 50,
                background: true,
                responsive: true,
                checkOrientation: true,
                ready: function() {
                    // Use the stored reference to this
                    if (self.cropper) {
                        self.cropper.crop();
                    }
                }
            });
        } catch (error) {
            console.error('Error initializing cropper:', error);
            window.showToast('Failed to initialize cropper', 'error');
            
            // 确保在出错时关闭裁剪界面
            if (this.cropContainer) {
                this.cropContainer.classList.add('hidden');
            }
        }
    }

    addToHistory(imageData, response, thinking) {
        try {
            // 读取现有历史记录
            const historyJson = localStorage.getItem('snapHistory') || '[]';
            const history = JSON.parse(historyJson);
            
            // 限制图像数据大小 - 缩小图像或者移除图像数据
            let optimizedImageData = null;
            
            if (this.isValidImageDataUrl(imageData)) {
                // 检查图像字符串长度，如果过大则不存储完整图像
                if (imageData.length > 50000) { // 约50KB的限制
                    // 使用安全的占位符
                    optimizedImageData = null;
                } else {
                    optimizedImageData = imageData;
                }
            }
            
            // 创建新的历史记录项
            const timestamp = new Date().toISOString();
            const id = Date.now();
            const item = {
                id,
                timestamp,
                image: optimizedImageData,
                response: response ? response.substring(0, 5000) : "", // 限制响应长度
                thinking: thinking ? thinking.substring(0, 2000) : "" // 限制思考过程长度
            };
            
            // 添加到历史记录并保存
            history.unshift(item);
            
            // 限制历史记录数量，更激进地清理以防止存储空间不足
            const maxHistoryItems = 10; // 减少最大历史记录数量
            if (history.length > maxHistoryItems) {
                history.length = maxHistoryItems; // 直接截断数组
            }
            
            try {
                localStorage.setItem('snapHistory', JSON.stringify(history));
            } catch (storageError) {
                console.warn('Storage quota exceeded, clearing older history items');
                
                // 如果仍然失败，则更激进地清理
                if (history.length > 3) {
                    history.length = 3; // 只保留最新的3条记录
                    try {
                        localStorage.setItem('snapHistory', JSON.stringify(history));
                    } catch (severeError) {
                        // 如果还是失败，则清空历史记录
                        localStorage.removeItem('snapHistory');
                        localStorage.setItem('snapHistory', JSON.stringify([item])); // 只保留当前项
                    }
                }
            }
            
            // 更新历史面板
            this.updateHistoryPanel();
            
        } catch (error) {
            console.error('Failed to save to history:', error);
        }
    }

    // 新增一个工具函数来判断图像URL是否有效
    isValidImageDataUrl(url) {
        return url && typeof url === 'string' && url.startsWith('data:image/') && url.includes(',');
    }

    // 获取一个安全的占位符图像URL
    getPlaceholderImageUrl() {
        return 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMDAiIGhlaWdodD0iMTUwIiB2aWV3Qm94PSIwIDAgMjAwIDE1MCI+PHJlY3Qgd2lkdGg9IjIwMCIgaGVpZ2h0PSIxNTAiIGZpbGw9IiNmMGYwZjAiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjE0IiBmaWxsPSIjOTk5Ij7lm77niYflj5HpgIHlt7LkvJjljJY8L3RleHQ+PC9zdmc+';
    }

    updateHistoryPanel() {
        const historyContent = document.querySelector('.history-content');
        if (!historyContent) return;
        
        const historyJson = localStorage.getItem('snapHistory') || '[]';
        const history = JSON.parse(historyJson);
        
        if (history.length === 0) {
            historyContent.innerHTML = `
                <div class="history-empty">
                    <i class="fas fa-history"></i>
                    <p>无历史记录</p>
                </div>
            `;
            return;
        }
        
        const historyItems = history.map(item => {
            const date = new Date(item.timestamp);
            const formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
            const hasResponse = item.response ? 'true' : 'false';
            
            // 检查图像是否为有效的数据URL
            let imageHtml = '';
            if (this.isValidImageDataUrl(item.image)) {
                // 有效的图像数据URL
                imageHtml = `<img src="${item.image}" alt="历史记录图片" class="history-thumbnail">`;
            } else {
                // 图像已被优化或不存在，显示占位符
                imageHtml = `<div class="history-thumbnail-placeholder">
                    <i class="fas fa-image"></i>
                    <span>图片已优化</span>
                </div>`;
            }
            
            return `
                <div class="history-item" data-id="${item.id}" data-has-response="${hasResponse}">
                    <div class="history-item-header">
                        <span class="history-date">${formattedDate}</span>
                    </div>
                    <div class="history-preview">
                        ${imageHtml}
                    </div>
                </div>
            `;
        }).join('');
        
        historyContent.innerHTML = historyItems;
        
        // Add click event listeners for history items
        document.querySelectorAll('.history-item').forEach(item => {
            item.addEventListener('click', () => {
                const historyItem = history.find(h => h.id === parseInt(item.dataset.id));
                if (historyItem) {
                    // 检查图像是否为有效的数据URL
                    if (this.isValidImageDataUrl(historyItem.image)) {
                        // 有效的图像数据
                        window.app.screenshotImg.src = historyItem.image;
                        window.app.imagePreview.classList.remove('hidden');
                    } else {
                        // 图像已优化或不存在，显示占位符图像
                        window.app.screenshotImg.src = this.getPlaceholderImageUrl();
                        window.app.imagePreview.classList.remove('hidden');
                    }
                    
                    document.getElementById('historyPanel').classList.add('hidden');
                    window.app.cropBtn.classList.add('hidden');
                    window.app.captureBtn.classList.add('hidden');
                    window.app.sendToClaudeBtn.classList.add('hidden');
                    window.app.extractTextBtn.classList.add('hidden');
                    
                    // Set response content
                    if (historyItem.response) {
                        window.app.claudePanel.classList.remove('hidden');
                        window.app.responseContent.textContent = historyItem.response;
                    }
                    
                    // Set thinking content if available
                    if (historyItem.thinking) {
                        window.app.thinkingSection.classList.remove('hidden');
                        window.app.thinkingContent.textContent = historyItem.thinking;
                    } else {
                        window.app.thinkingSection.classList.add('hidden');
                    }
                }
            });
        });
    }

    setupEventListeners() {
        this.setupFormatToggle();
        this.setupCaptureEvents();
        this.setupCropEvents();
        this.setupAnalysisEvents();
        this.setupKeyboardShortcuts();
        this.setupThinkingToggle();
    }

    setupFormatToggle() {
        this.textFormatBtn.addEventListener('click', () => {
            if (this.currentFormat !== 'text') {
                this.currentFormat = 'text';
                this.textFormatBtn.classList.add('active');
                this.latexFormatBtn.classList.remove('active');
                this.extractedText.value = this.extractedFormats.text;
            }
        });

        this.latexFormatBtn.addEventListener('click', () => {
            if (this.currentFormat !== 'latex') {
                this.currentFormat = 'latex';
                this.latexFormatBtn.classList.add('active');
                this.textFormatBtn.classList.remove('active');
                this.extractedText.value = this.extractedFormats.latex;
            }
        });
    }

    setupCaptureEvents() {
        // Capture button
        this.captureBtn.addEventListener('click', async () => {
            if (!this.socket || !this.socket.connected) {
                window.showToast('Not connected to server', 'error');
                return;
            }

            try {
                this.captureBtn.disabled = true;
                this.captureBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Capturing...</span>';
                this.socket.emit('request_screenshot');
            } catch (error) {
                window.showToast('Error requesting screenshot: ' + error.message, 'error');
                this.captureBtn.disabled = false;
                this.captureBtn.innerHTML = '<i class="fas fa-camera"></i><span>Capture</span>';
            }
        });
    }

    setupCropEvents() {
        // Crop button
        this.cropBtn.addEventListener('click', () => {
            if (this.screenshotImg.src) {
                this.initializeCropper();
            }
        });

        // Crop confirm button
        document.getElementById('cropConfirm').addEventListener('click', () => {
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
                    window.showToast('Image cropped successfully');
                } catch (error) {
                    console.error('Cropping error details:', {
                        message: error.message,
                        stack: error.stack,
                        cropperState: this.cropper ? 'initialized' : 'not initialized'
                    });
                    window.showToast(error.message || 'Error while cropping image', 'error');
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
            if (!this.croppedImage) {
                window.showToast('Please crop the image first', 'error');
                return;
            }

            this.extractTextBtn.disabled = true;
            this.sendExtractedTextBtn.disabled = true;  // Disable the send button while extracting
            this.extractTextBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Extracting...</span>';

            const settings = window.settingsManager.getSettings();
            const mathpixAppId = settings.mathpixAppId;
            const mathpixAppKey = settings.mathpixAppKey;
            
            if (!mathpixAppId || !mathpixAppKey) {
                window.showToast('Please enter Mathpix credentials in settings', 'error');
                document.getElementById('settingsPanel').classList.remove('hidden');
                this.extractTextBtn.disabled = false;
                this.extractTextBtn.innerHTML = '<i class="fas fa-font"></i><span>Extract Text</span>';
                return;
            }

            // Show text editor and prepare UI
            this.textEditor.classList.remove('hidden');
            if (this.extractedText) {
                this.extractedText.value = 'Extracting text...';
                this.extractedText.disabled = true;
            }

            try {
                this.socket.emit('extract_text', {
                    image: this.croppedImage.split(',')[1],
                    settings: {
                        mathpixApiKey: `${mathpixAppId}:${mathpixAppKey}`
                    }
                });
            } catch (error) {
                window.showToast('Failed to extract text: ' + error.message, 'error');
                this.extractTextBtn.disabled = false;
                this.sendExtractedTextBtn.disabled = false;  // Re-enable send button on error
                this.extractTextBtn.innerHTML = '<i class="fas fa-font"></i><span>Extract Text</span>';
            }
        });

        // Send Extracted Text button
        this.sendExtractedTextBtn.addEventListener('click', () => {
            const text = this.extractedText.value.trim();
            if (!text) {
                window.showToast('Please enter some text', 'error');
                return;
            }

            const settings = window.settingsManager.getSettings();
            const apiKeys = {};
            Object.entries(window.settingsManager.apiKeyInputs).forEach(([model, input]) => {
                if (input.value) {
                    apiKeys[model] = input.value;
                }
            });
            
            this.claudePanel.classList.remove('hidden');
            this.responseContent.textContent = '';
            this.sendExtractedTextBtn.disabled = true;

            try {
                this.socket.emit('analyze_text', {
                    text: text,
                    settings: {
                        ...settings,
                        api_keys: apiKeys,
                        model: settings.model || 'claude-3-7-sonnet-20250219',
                    }
                });
            } catch (error) {
                this.responseContent.textContent = 'Error: Failed to send text for analysis - ' + error.message;
                this.sendExtractedTextBtn.disabled = false;
                window.showToast('Failed to send text for analysis', 'error');
            }
        });

        // Send to Claude button
        this.sendToClaudeBtn.addEventListener('click', () => {
            if (!this.croppedImage) {
                window.showToast('Please crop the image first', 'error');
                return;
            }

            const settings = window.settingsManager.getSettings();
            const apiKeys = {};
            Object.entries(window.settingsManager.apiKeyInputs).forEach(([model, input]) => {
                if (input.value) {
                    apiKeys[model] = input.value;
                }
            });
            
            this.claudePanel.classList.remove('hidden');
            this.responseContent.textContent = '';
            this.sendToClaudeBtn.disabled = true;

            try {
                this.socket.emit('analyze_image', {
                    image: this.croppedImage.split(',')[1],
                    settings: {
                        ...settings,
                        api_keys: apiKeys,
                        model: settings.model || 'claude-3-7-sonnet-20250219',
                    }
                });
            } catch (error) {
                this.responseContent.textContent = 'Error: Failed to send image for analysis - ' + error.message;
                this.sendToClaudeBtn.disabled = false;
                window.showToast('Failed to send image for analysis', 'error');
            }
        });
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
        // Toggle thinking content visibility
        if (this.thinkingToggle) {
            this.thinkingToggle.addEventListener('click', () => {
                const isCollapsed = this.thinkingContent.classList.contains('collapsed');
                
                if (isCollapsed) {
                    this.thinkingContent.classList.remove('collapsed');
                    this.thinkingContent.classList.add('expanded');
                    this.thinkingToggle.classList.add('thinking-toggle-active');
                    const icon = this.thinkingToggle.querySelector('.toggle-btn i');
                    if (icon) {
                        icon.classList.remove('fa-chevron-down');
                        icon.classList.add('fa-chevron-up');
                    }
                } else {
                    this.thinkingContent.classList.add('collapsed');
                    this.thinkingContent.classList.remove('expanded');
                    this.thinkingToggle.classList.remove('thinking-toggle-active');
                    const icon = this.thinkingToggle.querySelector('.toggle-btn i');
                    if (icon) {
                        icon.classList.remove('fa-chevron-up');
                        icon.classList.add('fa-chevron-down');
                    }
                }
            });
        }
    }

    // 获取用于显示的图像URL，如果原始URL无效则返回占位符
    getImageForDisplay(imageUrl) {
        return this.isValidImageDataUrl(imageUrl) ? imageUrl : this.getPlaceholderImageUrl();
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
