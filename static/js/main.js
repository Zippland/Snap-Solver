class SnapSolver {
    constructor() {
        this.initializeElements();
        this.initializeState();
        this.setupEventListeners();
        this.initializeConnection();
        this.setupAutoScroll();
        
        // Initialize managers
        window.uiManager = new UIManager();
        window.settingsManager = new SettingsManager();
    }

    initializeElements() {
        // Capture elements
        this.captureBtn = document.getElementById('captureBtn');
        this.cropBtn = document.getElementById('cropBtn');
        this.connectionStatus = document.getElementById('connectionStatus');
        this.screenshotImg = document.getElementById('screenshotImg');
        this.cropContainer = document.getElementById('cropContainer');
        this.imagePreview = document.getElementById('imagePreview');
        this.sendToClaudeBtn = document.getElementById('sendToClaude');
        this.extractTextBtn = document.getElementById('extractText');
        this.textEditor = document.getElementById('textEditor');
        this.extractedText = document.getElementById('extractedText');
        this.sendExtractedTextBtn = document.getElementById('sendExtractedText');
        this.responseContent = document.getElementById('responseContent');
        this.claudePanel = document.getElementById('claudePanel');
        this.statusLight = document.querySelector('.status-light');
        
        // Format toggle elements
        this.textFormatBtn = document.getElementById('textFormatBtn');
        this.latexFormatBtn = document.getElementById('latexFormatBtn');
        this.confidenceIndicator = document.getElementById('confidenceIndicator');
        this.confidenceValue = document.querySelector('.confidence-value');
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
                    this.responseContent.textContent = '';
                    this.sendToClaudeBtn.disabled = true;
                    this.sendExtractedTextBtn.disabled = true;
                    break;
                    
                case 'streaming':
                    if (data.content) {
                        console.log('Received content:', data.content);
                        this.responseContent.textContent += data.content;
                    }
                    break;
                    
                case 'completed':
                    console.log('Analysis completed');
                    this.sendToClaudeBtn.disabled = false;
                    this.sendExtractedTextBtn.disabled = false;
                    this.addToHistory(this.croppedImage, this.responseContent.textContent);
                    window.showToast('Analysis completed successfully');
                    break;
                    
                case 'error':
                    console.error('Analysis error:', data.error);
                    const errorMessage = data.error || 'Unknown error occurred';
                    this.responseContent.textContent += '\nError: ' + errorMessage;
                    this.sendToClaudeBtn.disabled = false;
                    this.sendExtractedTextBtn.disabled = false;
                    window.showToast('Analysis failed: ' + errorMessage, 'error');
                    break;
                    
                default:
                    console.warn('Unknown response status:', data.status);
                    if (data.error) {
                        this.responseContent.textContent += '\nError: ' + data.error;
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

    initializeCropper() {
        try {
            // Clean up existing cropper instance
            if (this.cropper) {
                this.cropper.destroy();
                this.cropper = null;
            }

            const cropArea = document.querySelector('.crop-area');
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
        }
    }

    addToHistory(imageData, response) {
        const historyItem = {
            id: Date.now(),
            timestamp: new Date().toISOString(),
            image: imageData,
            response: response
        };
        this.history.unshift(historyItem);
        if (this.history.length > 10) this.history.pop();
        localStorage.setItem('snapHistory', JSON.stringify(this.history));
        window.renderHistory();
    }

    setupEventListeners() {
        this.setupCaptureEvents();
        this.setupCropEvents();
        this.setupAnalysisEvents();
        this.setupKeyboardShortcuts();
        this.setupFormatToggle();
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
            const apiKey = window.settingsManager.getApiKey();
            
            if (!apiKey) {
                this.settingsPanel.classList.remove('hidden');
                return;
            }

            this.claudePanel.classList.remove('hidden');
            this.responseContent.textContent = '';
            this.sendExtractedTextBtn.disabled = true;

            try {
                this.socket.emit('analyze_text', {
                    text: text,
                    settings: {
                        apiKey: apiKey,
                        model: settings.model || 'claude-3-5-sonnet-20241022',
                        temperature: parseFloat(settings.temperature) || 0.7,
                        systemPrompt: settings.systemPrompt || 'You are an expert at analyzing questions and providing detailed solutions.',
                        proxyEnabled: settings.proxyEnabled || false,
                        proxyHost: settings.proxyHost || '127.0.0.1',
                        proxyPort: settings.proxyPort || '4780'
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
            const apiKey = window.settingsManager.getApiKey();
            
            if (!apiKey) {
                this.settingsPanel.classList.remove('hidden');
                return;
            }

            this.claudePanel.classList.remove('hidden');
            this.responseContent.textContent = '';
            this.sendToClaudeBtn.disabled = true;

            try {
                this.socket.emit('analyze_image', {
                    image: this.croppedImage.split(',')[1],
                    settings: {
                        apiKey: apiKey,
                        model: settings.model || 'claude-3-5-sonnet-20241022',
                        temperature: parseFloat(settings.temperature) || 0.7,
                        systemPrompt: settings.systemPrompt || 'You are an expert at analyzing questions and providing detailed solutions.',
                        proxyEnabled: settings.proxyEnabled || false,
                        proxyHost: settings.proxyHost || '127.0.0.1',
                        proxyPort: settings.proxyPort || '4780'
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
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new SnapSolver();
});

// Global function for history rendering
window.renderHistory = function() {
    const content = document.querySelector('.history-content');
    const history = JSON.parse(localStorage.getItem('snapHistory') || '[]');
    
    if (history.length === 0) {
        content.innerHTML = `
            <div class="history-empty">
                <i class="fas fa-history"></i>
                <p>No history yet</p>
            </div>
        `;
        return;
    }

    content.innerHTML = history.map(item => `
        <div class="history-item" data-id="${item.id}">
            <div class="history-item-header">
                <span>${new Date(item.timestamp).toLocaleString()}</span>
                <button class="btn-icon delete-history" data-id="${item.id}">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
            <img src="${item.image}" alt="Historical screenshot" class="history-image">
        </div>
    `).join('');

    // Add click handlers for history items
    content.querySelectorAll('.delete-history').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = parseInt(btn.dataset.id);
            const updatedHistory = history.filter(item => item.id !== id);
            localStorage.setItem('snapHistory', JSON.stringify(updatedHistory));
            window.renderHistory();
            window.showToast('History item deleted');
        });
    });

    content.querySelectorAll('.history-item').forEach(item => {
        item.addEventListener('click', () => {
            const historyItem = history.find(h => h.id === parseInt(item.dataset.id));
            if (historyItem) {
                window.app.screenshotImg.src = historyItem.image;
                window.app.imagePreview.classList.remove('hidden');
                document.getElementById('historyPanel').classList.add('hidden');
                window.app.cropBtn.classList.add('hidden');
                window.app.captureBtn.classList.add('hidden');
                window.app.sendToClaudeBtn.classList.add('hidden');
                window.app.extractTextBtn.classList.add('hidden');
                if (historyItem.response) {
                    window.app.claudePanel.classList.remove('hidden');
                    window.app.responseContent.textContent = historyItem.response;
                }
            }
        });
    });
};
