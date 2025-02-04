class SnapSolver {
    constructor() {
        // Initialize managers first
        window.uiManager = new UIManager();
        window.settingsManager = new SettingsManager();
        
        this.initializeElements();
        this.initializeState();
        this.initializeConnection();
        this.setupAutoScroll();
        this.setupEventListeners();
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

        // Verify all elements are found
        const elements = [
            this.captureBtn, this.cropBtn, this.connectionStatus, this.screenshotImg,
            this.cropContainer, this.imagePreview, this.sendToClaudeBtn, this.extractTextBtn,
            this.textEditor, this.extractedText, this.sendExtractedTextBtn, this.responseContent,
            this.claudePanel, this.statusLight
        ];

        elements.forEach((element, index) => {
            if (!element) {
                console.error(`Failed to initialize element at index ${index}`);
            }
        });
    }

    initializeState() {
        this.socket = null;
        this.cropper = null;
        this.croppedImage = null;
        this.history = JSON.parse(localStorage.getItem('snapHistory') || '[]');
        this.heartbeatInterval = null;
        this.connectionCheckInterval = null;
        this.isReconnecting = false;
        this.lastConnectionAttempt = 0;
    }

    resetConnection() {
        const now = Date.now();
        const timeSinceLastAttempt = now - this.lastConnectionAttempt;
        
        // Prevent multiple reset attempts within 2 seconds
        if (timeSinceLastAttempt < 2000) {
            console.log('Skipping reset - too soon since last attempt');
            return;
        }
        
        console.log('Resetting connection...');
        this.isReconnecting = true;
        this.lastConnectionAttempt = now;
        
        // Clear existing intervals
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        
        if (this.connectionCheckInterval) {
            clearInterval(this.connectionCheckInterval);
            this.connectionCheckInterval = null;
        }

        // Clean up existing socket
        if (this.socket) {
            this.socket.removeAllListeners();
            this.socket.disconnect();
            this.socket = null;
        }

        // Small delay before reconnecting
        setTimeout(() => {
            this.initializeConnection();
            this.isReconnecting = false;
        }, 100);
    }

    startConnectionCheck() {
        // Clear any existing interval
        if (this.connectionCheckInterval) {
            clearInterval(this.connectionCheckInterval);
        }

        // Check connection status every 5 seconds
        this.connectionCheckInterval = setInterval(() => {
            if (!this.isReconnecting && (!this.socket || !this.socket.connected)) {
                console.log('Connection check failed, attempting reset...');
                this.resetConnection();
            }
        }, 5000);
    }

    initializeCropper() {
        try {
            // Clean up existing cropper if any
            if (this.cropper) {
                this.cropper.destroy();
                this.cropper = null;
            }

            // Show crop container and prepare crop area
            this.cropContainer.classList.remove('hidden');
            const cropArea = document.querySelector('.crop-area');
            cropArea.innerHTML = '';
            
            // Create a new image element for cropping
            const cropImage = document.createElement('img');
            cropImage.src = this.screenshotImg.src;
            cropArea.appendChild(cropImage);

            // Initialize Cropper.js
            this.cropper = new Cropper(cropImage, {
                aspectRatio: NaN,
                viewMode: 1,
                dragMode: 'move',
                autoCropArea: 0.8,
                restore: false,
                modal: true,
                guides: true,
                highlight: true,
                cropBoxMovable: true,
                cropBoxResizable: true,
                toggleDragModeOnDblclick: false,
                ready: () => {
                    console.log('Cropper initialized successfully');
                },
                error: (error) => {
                    console.error('Cropper initialization error:', error);
                    window.showToast('Failed to initialize image cropper', 'error');
                }
            });
        } catch (error) {
            console.error('Error initializing cropper:', error);
            window.showToast('Failed to initialize image cropper', 'error');
        }
    }

    setupAutoScroll() {
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

        observer.observe(this.responseContent, {
            childList: true,
            characterData: true,
            subtree: true
        });
    }

    updateConnectionStatus(connected) {
        if (!this.connectionStatus || !this.captureBtn) {
            console.error('Required elements not initialized');
            return;
        }

        this.connectionStatus.textContent = connected ? 'Connected' : 'Disconnected';
        this.connectionStatus.className = `status ${connected ? 'connected' : 'disconnected'}`;
        
        // Enable/disable capture button
        if (this.captureBtn) {
            this.captureBtn.disabled = !connected;
        }
        
        if (!connected) {
            // Hide UI elements when disconnected
            const elements = [
                this.imagePreview,
                this.cropBtn,
                this.sendToClaudeBtn,
                this.extractTextBtn,
                this.textEditor
            ];
            
            elements.forEach(element => {
                if (element) {
                    element.classList.add('hidden');
                }
            });
        }
    }

    updateStatusLight(status) {
        if (!this.statusLight) return;
        
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
                break;
        }
    }

    initializeConnection() {
        // Clear any existing heartbeat interval
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }

        try {
            // Clean up existing socket if any
            if (this.socket) {
                this.socket.disconnect();
                this.socket = null;
            }

            console.log('Initializing socket connection...');
            this.socket = io(window.location.origin, {
                reconnection: true,
                reconnectionAttempts: Infinity,
                reconnectionDelay: 100,  // Very fast initial reconnection
                reconnectionDelayMax: 1000,  // Shorter max delay
                timeout: 120000,
                autoConnect: true,  // Enable auto-connect
                transports: ['websocket'],
                forceNew: true,  // Force a new connection on refresh
                closeOnBeforeunload: false,  // Prevent auto-close on page refresh
                reconnectionAttempts: Infinity,  // Never stop trying to reconnect
                extraHeaders: {
                    'X-Client-Version': '1.0'
                }
            });

            // Setup heartbeat with monitoring
            this.heartbeatInterval = setInterval(() => {
                if (this.socket && this.socket.connected) {
                    const heartbeatTimeout = setTimeout(() => {
                        console.log('Heartbeat timeout, resetting connection...');
                        if (!this.isReconnecting) {
                            this.resetConnection();
                        }
                    }, 5000); // Wait 5 seconds for heartbeat response

                    this.socket.emit('heartbeat');
                    
                    // Clear timeout when heartbeat is acknowledged
                    this.socket.once('heartbeat_response', () => {
                        clearTimeout(heartbeatTimeout);
                    });
                }
            }, 10000);

            this.socket.on('connect', () => {
                console.log('Connected to server');
                this.updateConnectionStatus(true);
                // Re-enable capture button on reconnection
                if (this.captureBtn) {
                    this.captureBtn.disabled = false;
                }
                // Start connection check after successful connection
                this.startConnectionCheck();
            });

            this.socket.on('disconnect', (reason) => {
                console.log('Disconnected from server:', reason);
                this.updateConnectionStatus(false);
                
                // Always attempt to reconnect regardless of reason
                console.log('Attempting reconnection...');
                if (!this.socket.connected && !this.isReconnecting) {
                    this.resetConnection();
                }
                
                // Clean up resources but maintain reconnection ability
                if (this.heartbeatInterval) {
                    clearInterval(this.heartbeatInterval);
                    this.heartbeatInterval = null;
                }
            });

            // Add reconnecting event handler
            this.socket.on('reconnecting', (attemptNumber) => {
                console.log(`Reconnection attempt ${attemptNumber}...`);
                if (!this.isReconnecting) {
                    this.resetConnection();
                }
            });

            // Add reconnect_failed event handler
            this.socket.on('reconnect_failed', () => {
                console.log('Reconnection failed, trying again...');
                if (!this.isReconnecting) {
                    this.resetConnection();
                }
            });

            this.socket.on('connect_error', (error) => {
                console.error('Connection error:', error);
                this.updateConnectionStatus(false);
                window.showToast('Connection error: ' + error.message, 'error');
                
                // Enhanced exponential backoff with jitter
                const attempts = this.socket.io.backoff?.attempts || 0;
                const baseDelay = 1000;
                const maxDelay = 10000;
                const jitter = Math.random() * 1000;
                const delay = Math.min(baseDelay * Math.pow(1.5, attempts) + jitter, maxDelay);
                
                console.log(`Scheduling reconnection attempt in ${Math.round(delay)}ms...`);
                setTimeout(() => {
                    if (!this.socket.connected) {
                        console.log(`Attempting to reconnect (attempt ${attempts + 1})...`);
                        this.socket.connect();
                    }
                }, delay);
            });

            this.socket.on('heartbeat_response', () => {
                console.debug('Heartbeat acknowledged');
                // Reset connection if we were in a disconnected state
                if (this.connectionStatus && this.connectionStatus.textContent === 'Disconnected' && !this.isReconnecting) {
                    this.resetConnection();
                }
            });

            this.socket.on('error', (error) => {
                console.error('Socket error:', error);
                window.showToast('Socket error occurred', 'error');
            });

            this.setupSocketEventHandlers();

        } catch (error) {
            console.error('Connection initialization error:', error);
            this.updateConnectionStatus(false);
        }
    }

    setupSocketEventHandlers() {
        if (!this.socket) {
            console.error('Socket not initialized');
            return;
        }

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

        // Mathpix text extraction response handler
        this.socket.on('mathpix_response', (data) => {
            console.log('Received mathpix_response:', data);
            this.updateStatusLight(data.status);
            
            switch (data.status) {
                case 'started':
                    console.log('Text extraction started');
                    this.extractedText.value = '';
                    this.extractTextBtn.disabled = true;
                    break;
                    
                case 'completed':
                    if (data.content) {
                        console.log('Received extracted text:', data.content);
                        const confidenceMatch = data.content.match(/Confidence: (\d+\.\d+)%/);
                        if (confidenceMatch) {
                            const confidence = confidenceMatch[1];
                            document.getElementById('confidenceDisplay').textContent = confidence + '%';
                            this.extractedText.value = data.content.replace(/Confidence: \d+\.\d+%\n\n/, '');
                        } else {
                            this.extractedText.value = data.content;
                            document.getElementById('confidenceDisplay').textContent = '';
                        }
                        this.textEditor.classList.remove('hidden');
                    }
                    this.extractTextBtn.disabled = false;
                    this.extractTextBtn.innerHTML = '<i class="fas fa-font"></i><span>Extract Text</span>';
                    window.showToast('Text extracted successfully');
                    break;
                    
                case 'error':
                    console.error('Text extraction error:', data.error);
                    const errorMessage = data.error || 'Unknown error occurred';
                    window.showToast('Failed to extract text: ' + errorMessage, 'error');
                    this.extractTextBtn.disabled = false;
                    this.extractTextBtn.innerHTML = '<i class="fas fa-font"></i><span>Extract Text</span>';
                    break;
                    
                default:
                    console.warn('Unknown mathpix response status:', data.status);
                    if (data.error) {
                        window.showToast('Text extraction failed: ' + data.error, 'error');
                        this.extractTextBtn.disabled = false;
                        this.extractTextBtn.innerHTML = '<i class="fas fa-font"></i><span>Extract Text</span>';
                    }
            }
        });

        // AI analysis response handler
        this.socket.on('claude_response', (data) => {
            console.log('Received claude_response:', data);
            this.updateStatusLight(data.status);
            
            switch (data.status) {
                case 'started':
                    console.log('AI analysis started');
                    this.responseContent.textContent = '';
                    this.sendToClaudeBtn.disabled = true;
                    this.sendExtractedTextBtn.disabled = true;
                    break;
                    
                case 'streaming':
                    if (data.content) {
                        console.log('Received AI content:', data.content);
                        this.responseContent.textContent += data.content;
                    }
                    break;
                    
                case 'completed':
                    if (data.content) {
                        console.log('Received final AI content:', data.content);
                        this.responseContent.textContent += data.content;
                    }
                    this.sendToClaudeBtn.disabled = false;
                    this.sendExtractedTextBtn.disabled = false;
                    this.addToHistory(this.croppedImage, this.responseContent.textContent);
                    window.showToast('Analysis completed successfully');
                    break;
                    
                case 'error':
                    console.error('AI analysis error:', data.error);
                    const errorMessage = data.error || 'Unknown error occurred';
                    this.responseContent.textContent += '\nError: ' + errorMessage;
                    this.sendToClaudeBtn.disabled = false;
                    this.sendExtractedTextBtn.disabled = false;
                    window.showToast('Analysis failed: ' + errorMessage, 'error');
                    break;
                    
                default:
                    console.warn('Unknown claude response status:', data.status);
                    if (data.error) {
                        this.responseContent.textContent += '\nError: ' + data.error;
                        this.sendToClaudeBtn.disabled = false;
                        this.sendExtractedTextBtn.disabled = false;
                        window.showToast('Unknown error occurred', 'error');
                    }
            }
        });
    }

    setupEventListeners() {
        // Add click handler for app title
        const appTitle = document.getElementById('appTitle');
        if (appTitle) {
            appTitle.addEventListener('click', () => {
                this.resetInterface();
            });
        }
        
        // Handle page visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                console.log('Page became visible, checking connection...');
                // Check connection status and reset if needed
                if (this.socket && !this.socket.connected && !this.isReconnecting) {
                    console.log('Connection lost while page was hidden, resetting...');
                    this.resetConnection();
                }
            }
        });

        // Handle before unload to clean up properly
        window.addEventListener('beforeunload', () => {
            if (this.socket) {
                console.log('Page unloading, cleaning up socket...');
                // Store connection state in sessionStorage
                sessionStorage.setItem('wasConnected', 'true');
                this.socket.disconnect();
            }
        });

        // Check if we need to reconnect after a page reload
        if (sessionStorage.getItem('wasConnected') === 'true') {
            console.log('Page reloaded, initiating immediate reconnection...');
            sessionStorage.removeItem('wasConnected');
            // Force an immediate connection attempt
            setTimeout(() => {
                if (!this.socket?.connected && !this.isReconnecting) {
                    this.resetConnection();
                }
            }, 500);
        }
        
        this.setupCaptureEvents();
        this.setupCropEvents();
        this.setupAnalysisEvents();
        this.setupKeyboardShortcuts();
    }

    resetInterface() {
        if (!this.captureBtn) return;

        // Clear all intervals
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        
        if (this.connectionCheckInterval) {
            clearInterval(this.connectionCheckInterval);
            this.connectionCheckInterval = null;
        }

        // Clean up cropper if it exists
        if (this.cropper) {
            this.cropper.destroy();
            this.cropper = null;
        }

        // Clean up socket if it exists
        if (this.socket) {
            this.socket.removeAllListeners();  // Remove all event listeners
            this.socket.disconnect();
            this.socket = null;
        }

        // Show capture button
        this.captureBtn.classList.remove('hidden');
        
        // Hide all panels
        const panels = ['historyPanel', 'settingsPanel'];
        panels.forEach(panelId => {
            const panel = document.getElementById(panelId);
            if (panel) panel.classList.add('hidden');
        });
        
        // Reset image preview and related buttons
        const elements = [
            this.imagePreview,
            this.cropBtn,
            this.sendToClaudeBtn,
            this.extractTextBtn,
            this.textEditor
        ];
        
        elements.forEach(element => {
            if (element) element.classList.add('hidden');
        });
        
        // Clear text areas
        if (this.extractedText) this.extractedText.value = '';
        if (this.responseContent) this.responseContent.textContent = '';
        
        const confidenceDisplay = document.getElementById('confidenceDisplay');
        if (confidenceDisplay) confidenceDisplay.textContent = '';
        
        // Hide Claude panel
        if (this.claudePanel) this.claudePanel.classList.add('hidden');
    }
}

// Initialize the application
window.addEventListener('DOMContentLoaded', () => {
    window.app = new SnapSolver();
});
