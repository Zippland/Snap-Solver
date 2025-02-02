document.addEventListener('DOMContentLoaded', () => {
    const captureBtn = document.getElementById('captureBtn');
    const cropBtn = document.getElementById('cropBtn');
    const connectBtn = document.getElementById('connectBtn');
    const ipInput = document.getElementById('ipInput');
    const connectionStatus = document.getElementById('connectionStatus');
    const screenshotImg = document.getElementById('screenshotImg');
    const cropContainer = document.getElementById('cropContainer');
    const claudeActions = document.getElementById('claudeActions');
    const claudeResponse = document.getElementById('claudeResponse');
    const responseContent = document.getElementById('responseContent');
    const aiSettingsToggle = document.getElementById('aiSettingsToggle');
    const aiSettings = document.getElementById('aiSettings');
    const temperatureInput = document.getElementById('temperature');
    const temperatureValue = document.getElementById('temperatureValue');
    
    let socket = null;
    let cropper = null;
    let croppedImage = null;

    // Load saved AI settings
    function loadAISettings() {
        const settings = JSON.parse(localStorage.getItem('aiSettings') || '{}');
        if (settings.apiKey) document.getElementById('apiKey').value = settings.apiKey;
        if (settings.model) document.getElementById('modelSelect').value = settings.model;
        if (settings.temperature) {
            temperatureInput.value = settings.temperature;
            temperatureValue.textContent = settings.temperature;
        }
        if (settings.systemPrompt) document.getElementById('systemPrompt').value = settings.systemPrompt;
    }

    // Save AI settings
    function saveAISettings() {
        const settings = {
            apiKey: document.getElementById('apiKey').value,
            model: document.getElementById('modelSelect').value,
            temperature: temperatureInput.value,
            systemPrompt: document.getElementById('systemPrompt').value
        };
        localStorage.setItem('aiSettings', JSON.stringify(settings));
    }

    // Initialize settings
    loadAISettings();

    // AI Settings panel toggle
    aiSettingsToggle.addEventListener('click', () => {
        aiSettings.classList.toggle('hidden');
    });

    // Save settings when changed
    document.getElementById('apiKey').addEventListener('change', saveAISettings);
    document.getElementById('modelSelect').addEventListener('change', saveAISettings);
    temperatureInput.addEventListener('input', (e) => {
        temperatureValue.textContent = e.target.value;
        saveAISettings();
    });
    document.getElementById('systemPrompt').addEventListener('change', saveAISettings);

    function updateConnectionStatus(connected) {
        connectionStatus.textContent = connected ? 'Connected' : 'Disconnected';
        connectionStatus.className = `status ${connected ? 'connected' : 'disconnected'}`;
        captureBtn.disabled = !connected;
        cropBtn.disabled = !screenshotImg.src;
        connectBtn.textContent = connected ? 'Disconnect' : 'Connect';
    }

    function connectToServer(serverUrl) {
        if (socket) {
            socket.disconnect();
            socket = null;
            updateConnectionStatus(false);
            return;
        }

        try {
            socket = io(serverUrl);

            socket.on('connect', () => {
                console.log('Connected to server');
                updateConnectionStatus(true);
            });

            socket.on('disconnect', () => {
                console.log('Disconnected from server');
                updateConnectionStatus(false);
                socket = null;
            });

            socket.on('screenshot_response', (data) => {
                if (data.success) {
                    screenshotImg.src = `data:image/png;base64,${data.image}`;
                    cropBtn.disabled = false;
                    captureBtn.disabled = false;
                    captureBtn.textContent = 'Capture Screenshot';
                    claudeActions.classList.add('hidden');
                } else {
                    alert('Failed to capture screenshot: ' + data.error);
                    captureBtn.disabled = false;
                    captureBtn.textContent = 'Capture Screenshot';
                }
            });

            socket.on('claude_response', (data) => {
                if (data.error) {
                    responseContent.textContent += '\nError: ' + data.error;
                } else {
                    responseContent.textContent += data.content;
                }
                responseContent.scrollTop = responseContent.scrollHeight;
            });

            socket.on('connect_error', (error) => {
                console.error('Connection error:', error);
                alert('Failed to connect to server. Please check the IP address and ensure the server is running.');
                updateConnectionStatus(false);
                socket = null;
            });

        } catch (error) {
            console.error('Connection error:', error);
            alert('Failed to connect to server: ' + error.message);
            updateConnectionStatus(false);
        }
    }

    function initializeCropper() {
        if (cropper) {
            cropper.destroy();
            cropper = null;
        }

        // Reset the image container and move it to crop area
        const cropArea = document.querySelector('.crop-area');
        cropArea.innerHTML = '';
        const clonedImage = screenshotImg.cloneNode(true);
        clonedImage.style.maxWidth = '100%';
        clonedImage.style.maxHeight = '100%';
        cropArea.appendChild(clonedImage);
        
        // Show crop container
        cropContainer.classList.remove('hidden');
        
        // Initialize cropper with mobile-friendly settings
        cropper = new Cropper(clonedImage, {
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
            minContainerWidth: 100,
            minContainerHeight: 100,
            minCropBoxWidth: 50,
            minCropBoxHeight: 50,
            background: true,
            responsive: true,
            checkOrientation: true,
            ready: function() {
                // Ensure the cropper is properly sized
                this.cropper.crop();
            }
        });
    }

    // Capture and Crop Event Listeners
    connectBtn.addEventListener('click', () => {
        const serverUrl = ipInput.value.trim();
        if (!serverUrl) {
            alert('Please enter the server IP address');
            return;
        }
        if (!serverUrl.startsWith('http://')) {
            connectToServer('http://' + serverUrl);
        } else {
            connectToServer(serverUrl);
        }
    });
    
    cropBtn.addEventListener('click', () => {
        if (screenshotImg.src) {
            initializeCropper();
        }
    });

    captureBtn.addEventListener('click', async () => {
        if (!socket || !socket.connected) {
            alert('Not connected to server');
            return;
        }

        try {
            captureBtn.disabled = true;
            captureBtn.textContent = 'Capturing...';
            socket.emit('request_screenshot');
        } catch (error) {
            alert('Error requesting screenshot: ' + error.message);
            captureBtn.disabled = false;
            captureBtn.textContent = 'Capture Screenshot';
        }
    });

    // Crop confirmation
    document.getElementById('cropConfirm').addEventListener('click', () => {
        if (cropper) {
            try {
                const canvas = cropper.getCroppedCanvas({
                    maxWidth: 4096,
                    maxHeight: 4096,
                    fillColor: '#fff',
                    imageSmoothingEnabled: true,
                    imageSmoothingQuality: 'high',
                });

                if (!canvas) {
                    throw new Error('Failed to create cropped canvas');
                }

                croppedImage = canvas.toDataURL('image/png');
                
                // Clean up
                cropper.destroy();
                cropper = null;
                cropContainer.classList.add('hidden');
                document.querySelector('.crop-area').innerHTML = '';
                
                // Show the cropped image and Claude actions
                screenshotImg.src = croppedImage;
                cropBtn.disabled = false;
                claudeActions.classList.remove('hidden');
            } catch (error) {
                console.error('Cropping error:', error);
                alert('Error while cropping image. Please try again.');
            }
        }
    });

    // Crop cancellation
    document.getElementById('cropCancel').addEventListener('click', () => {
        if (cropper) {
            cropper.destroy();
            cropper = null;
        }
        cropContainer.classList.add('hidden');
        claudeActions.classList.add('hidden');
        document.querySelector('.crop-area').innerHTML = '';
    });

    // Send to Claude
    document.getElementById('sendToClaude').addEventListener('click', () => {
        if (!croppedImage) {
            alert('Please crop the image first');
            return;
        }

        const settings = JSON.parse(localStorage.getItem('aiSettings') || '{}');
        if (!settings.apiKey) {
            alert('Please enter your Claude API key in the settings');
            aiSettings.classList.remove('hidden');
            return;
        }

        claudeResponse.classList.remove('hidden');
        responseContent.textContent = 'Analyzing image...';

        socket.emit('analyze_image', {
            image: croppedImage.split(',')[1],
            settings: {
                apiKey: settings.apiKey,
                model: settings.model || 'claude-3-opus',
                temperature: parseFloat(settings.temperature) || 0.7,
                systemPrompt: settings.systemPrompt || 'You are a helpful AI assistant. Analyze the image and provide detailed explanations.'
            }
        });
    });

    // Close Claude response
    document.getElementById('closeResponse').addEventListener('click', () => {
        claudeResponse.classList.add('hidden');
        responseContent.textContent = '';
    });

    // Handle touch events for mobile
    let touchStartX = 0;
    let touchEndX = 0;

    document.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
    });

    document.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
    });

    function handleSwipe() {
        const swipeThreshold = 50;
        const diff = touchEndX - touchStartX;

        if (Math.abs(diff) > swipeThreshold) {
            if (diff > 0) {
                // Swipe right - hide panels
                aiSettings.classList.add('hidden');
                claudeResponse.classList.add('hidden');
            } else {
                // Swipe left - show AI settings
                aiSettings.classList.remove('hidden');
            }
        }
    }
});
