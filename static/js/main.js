class SnapSolver {
    constructor() {
        this.initializeElements();
        this.initializeState();
        this.setupEventListeners();
        this.initializeConnection();
        
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
        this.responseContent = document.getElementById('responseContent');
        this.claudePanel = document.getElementById('claudePanel');
    }

    initializeState() {
        this.socket = null;
        this.cropper = null;
        this.croppedImage = null;
        this.history = JSON.parse(localStorage.getItem('snapHistory') || '[]');
    }

    updateConnectionStatus(connected) {
        this.connectionStatus.textContent = connected ? 'Connected' : 'Disconnected';
        this.connectionStatus.className = `status ${connected ? 'connected' : 'disconnected'}`;
        this.captureBtn.disabled = !connected;
        
        if (!connected) {
            this.imagePreview.classList.add('hidden');
            this.cropBtn.classList.add('hidden');
            this.sendToClaudeBtn.classList.add('hidden');
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
        this.socket.on('screenshot_response', (data) => {
            if (data.success) {
                this.screenshotImg.src = `data:image/png;base64,${data.image}`;
                this.imagePreview.classList.remove('hidden');
                this.cropBtn.classList.remove('hidden');
                this.captureBtn.disabled = false;
                this.captureBtn.innerHTML = '<i class="fas fa-camera"></i><span>Capture</span>';
                this.sendToClaudeBtn.classList.add('hidden');
                window.showToast('Screenshot captured successfully');
            } else {
                window.showToast('Failed to capture screenshot: ' + data.error, 'error');
                this.captureBtn.disabled = false;
                this.captureBtn.innerHTML = '<i class="fas fa-camera"></i><span>Capture</span>';
            }
        });

        this.socket.on('claude_response', (data) => {
            console.log('Received claude_response:', data);
            
            switch (data.status) {
                case 'started':
                    console.log('Analysis started');
                    this.responseContent.textContent = 'Starting analysis...\n';
                    this.sendToClaudeBtn.disabled = true;
                    break;
                    
                case 'streaming':
                    if (data.content) {
                        console.log('Received content:', data.content);
                        if (this.responseContent.textContent === 'Starting analysis...\n') {
                            this.responseContent.textContent = data.content;
                        } else {
                            this.responseContent.textContent += data.content;
                        }
                        this.responseContent.scrollTo({
                            top: this.responseContent.scrollHeight,
                            behavior: 'smooth'
                        });
                    }
                    break;
                    
                case 'completed':
                    console.log('Analysis completed');
                    this.responseContent.textContent += '\n\nAnalysis complete.';
                    this.sendToClaudeBtn.disabled = false;
                    this.addToHistory(this.croppedImage, this.responseContent.textContent);
                    window.showToast('Analysis completed successfully');
                    this.responseContent.scrollTo({
                        top: this.responseContent.scrollHeight,
                        behavior: 'smooth'
                    });
                    break;
                    
                case 'error':
                    console.error('Claude analysis error:', data.error);
                    const errorMessage = data.error || 'Unknown error occurred';
                    this.responseContent.textContent += '\n\nError: ' + errorMessage;
                    this.sendToClaudeBtn.disabled = false;
                    this.responseContent.scrollTop = this.responseContent.scrollHeight;
                    window.showToast('Analysis failed: ' + errorMessage, 'error');
                    break;
                    
                default:
                    console.warn('Unknown response status:', data.status);
                    if (data.error) {
                        this.responseContent.textContent += '\n\nError: ' + data.error;
                        this.sendToClaudeBtn.disabled = false;
                        this.responseContent.scrollTop = this.responseContent.scrollHeight;
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
        
        this.cropper = new Cropper(clonedImage, {
            viewMode: 1,
            dragMode: 'move',
            autoCropArea: 1,
            restore: false,
            modal: true,
            guides: true,
            highlight: true,
            cropBoxMovable: true,
            cropBoxResizable: true,
            toggleDragModeOnDblclick: false,
            minContainerWidth: window.innerWidth,
            minContainerHeight: window.innerHeight - 100,
            minCropBoxWidth: 100,
            minCropBoxHeight: 100,
            background: true,
            responsive: true,
            checkOrientation: true,
            ready: function() {
                this.cropper.crop();
            }
        });
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
                    const canvas = this.cropper.getCroppedCanvas({
                        maxWidth: 4096,
                        maxHeight: 4096,
                        fillColor: '#fff',
                        imageSmoothingEnabled: true,
                        imageSmoothingQuality: 'high',
                    });

                    if (!canvas) {
                        throw new Error('Failed to create cropped canvas');
                    }

                    this.croppedImage = canvas.toDataURL('image/png');
                    
                    this.cropper.destroy();
                    this.cropper = null;
                    this.cropContainer.classList.add('hidden');
                    document.querySelector('.crop-area').innerHTML = '';
                    this.settingsPanel.classList.add('hidden');
                    
                    this.screenshotImg.src = this.croppedImage;
                    this.imagePreview.classList.remove('hidden');
                    this.cropBtn.classList.remove('hidden');
                    this.sendToClaudeBtn.classList.remove('hidden');
                    window.showToast('Image cropped successfully');
                } catch (error) {
                    console.error('Cropping error:', error);
                    window.showToast('Error while cropping image', 'error');
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
            document.querySelector('.crop-area').innerHTML = '';
        });

        // Send to Claude button
        this.sendToClaudeBtn.addEventListener('click', () => {
            if (!this.croppedImage) {
                window.showToast('Please crop the image first', 'error');
                return;
            }

            const settings = window.settingsManager.getSettings();
            if (!settings.apiKey) {
                window.showToast('Please enter your API key in settings', 'error');
                this.settingsPanel.classList.remove('hidden');
                return;
            }

            this.claudePanel.classList.remove('hidden');
            this.responseContent.textContent = 'Preparing to analyze image...\n';
            this.sendToClaudeBtn.disabled = true;

            try {
                this.socket.emit('analyze_image', {
                    image: this.croppedImage.split(',')[1],
                    settings: {
                        apiKey: settings.apiKey,
                        model: settings.model || 'claude-3-5-sonnet-20241022',
                        temperature: parseFloat(settings.temperature) || 0.7,
                        systemPrompt: settings.systemPrompt || 'You are an expert at analyzing questions and providing detailed solutions.',
                        proxyEnabled: settings.proxyEnabled || false,
                        proxyHost: settings.proxyHost || '127.0.0.1',
                        proxyPort: settings.proxyPort || '4780'
                    }
                });
            } catch (error) {
                this.responseContent.textContent += '\nError: Failed to send image for analysis - ' + error.message;
                this.sendToClaudeBtn.disabled = false;
                window.showToast('Failed to send image for analysis', 'error');
            }
        });

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
                if (historyItem.response) {
                    window.app.claudePanel.classList.remove('hidden');
                    window.app.responseContent.textContent = historyItem.response;
                }
            }
        });
    });
};
