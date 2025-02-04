// Events handling extension for SnapSolver class
Object.assign(SnapSolver.prototype, {
    setupCaptureEvents() {
        if (!this.captureBtn) {
            console.error('Capture button not initialized');
            return;
        }

        // Capture button
        this.captureBtn.addEventListener('click', async () => {
            if (!this.socket) {
                console.error('Socket not initialized');
                window.showToast('Connection not initialized. Please refresh the page.', 'error');
                return;
            }
            
            if (!this.socket.connected) {
                console.error('Socket not connected');
                window.showToast('Server connection lost. Attempting to reconnect...', 'error');
                this.socket.connect();
                return;
            }

            try {
                this.captureBtn.disabled = true;
                this.captureBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Capturing...</span>';
                
                // Set a timeout to re-enable the button if no response is received
                const timeout = setTimeout(() => {
                    if (this.captureBtn.disabled) {
                        this.captureBtn.disabled = false;
                        this.captureBtn.innerHTML = '<i class="fas fa-camera"></i><span>Capture</span>';
                        window.showToast('Screenshot capture timed out. Please try again.', 'error');
                    }
                }, 10000);

                this.socket.emit('request_screenshot', null, (error) => {
                    if (error) {
                        clearTimeout(timeout);
                        console.error('Screenshot error:', error);
                        window.showToast('Error capturing screenshot: ' + error, 'error');
                        this.captureBtn.disabled = false;
                        this.captureBtn.innerHTML = '<i class="fas fa-camera"></i><span>Capture</span>';
                    }
                });
            } catch (error) {
                console.error('Capture error:', error);
                window.showToast('Error requesting screenshot: ' + error.message, 'error');
                this.captureBtn.disabled = false;
                this.captureBtn.innerHTML = '<i class="fas fa-camera"></i><span>Capture</span>';
            }
        });
    },

    setupCropEvents() {
        if (!this.cropBtn || !this.screenshotImg) {
            console.error('Required elements not initialized');
            return;
        }

        // Crop button
        this.cropBtn.addEventListener('click', () => {
            if (this.screenshotImg.src) {
                this.initializeCropper();
            }
        });

        // Crop confirm button
        const cropConfirm = document.getElementById('cropConfirm');
        if (cropConfirm) {
            cropConfirm.addEventListener('click', () => {
                if (this.cropper) {
                    try {
                        console.log('Starting crop operation...');
                        
                        if (!this.cropper) {
                            throw new Error('Cropper not initialized');
                        }

                        const cropBoxData = this.cropper.getCropBoxData();
                        console.log('Crop box data:', cropBoxData);
                        
                        if (!cropBoxData || typeof cropBoxData.width !== 'number' || typeof cropBoxData.height !== 'number') {
                            throw new Error('Invalid crop box data');
                        }

                        if (cropBoxData.width < 10 || cropBoxData.height < 10) {
                            throw new Error('Crop area is too small. Please select a larger area (minimum 10x10 pixels).');
                        }

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

                        console.log('Converting to data URL...');
                        try {
                            this.croppedImage = canvas.toDataURL('image/png');
                            console.log('Data URL conversion successful');
                        } catch (dataUrlError) {
                            console.error('Data URL conversion error:', dataUrlError);
                            throw new Error('Failed to process cropped image. The image might be too large or memory insufficient.');
                        }

                        if (this.cropper) {
                            this.cropper.destroy();
                            this.cropper = null;
                        }

                        this.cropContainer.classList.add('hidden');
                        const cropArea = document.querySelector('.crop-area');
                        if (cropArea) cropArea.innerHTML = '';
                        
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
                        if (this.cropper) {
                            this.cropper.destroy();
                            this.cropper = null;
                        }
                    }
                }
            });
        }

        // Crop cancel button
        const cropCancel = document.getElementById('cropCancel');
        if (cropCancel) {
            cropCancel.addEventListener('click', () => {
                if (this.cropper) {
                    this.cropper.destroy();
                    this.cropper = null;
                }
                this.cropContainer.classList.add('hidden');
                this.sendToClaudeBtn.classList.add('hidden');
                this.extractTextBtn.classList.add('hidden');
                const cropArea = document.querySelector('.crop-area');
                if (cropArea) cropArea.innerHTML = '';
            });
        }
    },

    setupAnalysisEvents() {
        // Set up text extraction socket event listener once
        this.socket.on('text_extracted', (data) => {
            if (data.error) {
                console.error('Text extraction error:', data.error);
                window.showToast('Failed to extract text: ' + data.error, 'error');
                if (this.extractedText) {
                    this.extractedText.value = '';
                    this.extractedText.disabled = false;
                }
            } else if (data.content) {
                if (this.extractedText) {
                    this.extractedText.value = data.content;
                    this.extractedText.disabled = false;
                    // Scroll to make text editor visible
                    this.extractedText.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
                window.showToast('Text extracted successfully');
            }
            
            if (this.extractTextBtn) {
                this.extractTextBtn.disabled = false;
                this.extractTextBtn.innerHTML = '<i class="fas fa-font"></i><span>Extract Text</span>';
            }
        });

        // Extract Text button
        if (this.extractTextBtn) {
            this.extractTextBtn.addEventListener('click', () => {
                if (!this.croppedImage) {
                    window.showToast('Please crop the image first', 'error');
                    return;
                }

                const settings = window.settingsManager.getSettings();
                const mathpixAppId = settings.mathpixAppId;
                const mathpixAppKey = settings.mathpixAppKey;
                
                if (!mathpixAppId || !mathpixAppKey) {
                    window.showToast('Please enter Mathpix credentials in settings', 'error');
                    const settingsPanel = document.getElementById('settingsPanel');
                    if (settingsPanel) settingsPanel.classList.remove('hidden');
                    return;
                }

                this.extractTextBtn.disabled = true;
                this.extractTextBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Extracting...</span>';

                try {
                    // Show text editor and prepare UI
                    const textEditor = document.getElementById('textEditor');
                    if (textEditor) {
                        textEditor.classList.remove('hidden');
                        // Scroll to make text editor visible
                        textEditor.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }
                    
                    // Clear any previous text and show loading indicator
                    if (this.extractedText) {
                        this.extractedText.value = 'Extracting text...';
                        this.extractedText.disabled = true;
                    }
                    
                    // Set up timeout to re-enable button if no response
                    const timeout = setTimeout(() => {
                        if (this.extractTextBtn && this.extractTextBtn.disabled) {
                            this.extractTextBtn.disabled = false;
                            this.extractTextBtn.innerHTML = '<i class="fas fa-font"></i><span>Extract Text</span>';
                            if (this.extractedText) {
                                this.extractedText.value = '';
                                this.extractedText.disabled = false;
                            }
                            window.showToast('Text extraction timed out. Please try again.', 'error');
                        }
                    }, 30000); // 30 second timeout

                    this.socket.emit('extract_text', {
                        image: this.croppedImage.split(',')[1],
                        settings: {
                            mathpixApiKey: `${mathpixAppId}:${mathpixAppKey}`
                        }
                    }, (error) => {
                        // Clear timeout on acknowledgement
                        clearTimeout(timeout);
                        if (error) {
                            console.error('Text extraction error:', error);
                            window.showToast('Failed to start text extraction: ' + error, 'error');
                            this.extractTextBtn.disabled = false;
                            this.extractTextBtn.innerHTML = '<i class="fas fa-font"></i><span>Extract Text</span>';
                            if (this.extractedText) {
                                this.extractedText.value = '';
                                this.extractedText.disabled = false;
                            }
                        }
                    });
                } catch (error) {
                    console.error('Text extraction error:', error);
                    window.showToast('Failed to extract text: ' + error.message, 'error');
                    this.extractTextBtn.disabled = false;
                    this.extractTextBtn.innerHTML = '<i class="fas fa-font"></i><span>Extract Text</span>';
                    if (this.extractedText) {
                        this.extractedText.value = '';
                        this.extractedText.disabled = false;
                    }
                }
            });
        }

        // Send Extracted Text button
        if (this.sendExtractedTextBtn && this.extractedText) {
            this.sendExtractedTextBtn.addEventListener('click', () => {
                const text = this.extractedText.value.trim();
                if (!text) {
                    window.showToast('Please enter some text', 'error');
                    return;
                }

                const settings = window.settingsManager.getSettings();
                const apiKey = window.settingsManager.getApiKey();
                
                if (!apiKey) {
                    const settingsPanel = document.getElementById('settingsPanel');
                    if (settingsPanel) settingsPanel.classList.remove('hidden');
                    window.showToast('Please configure API key in settings', 'error');
                    return;
                }

                if (this.claudePanel) this.claudePanel.classList.remove('hidden');
                if (this.responseContent) this.responseContent.textContent = '';
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
                    console.error('Text analysis error:', error);
                    if (this.responseContent) {
                        this.responseContent.textContent = 'Error: Failed to send text for analysis - ' + error.message;
                    }
                    this.sendExtractedTextBtn.disabled = false;
                    window.showToast('Failed to send text for analysis', 'error');
                }
            });
        }

        // Send to Claude button
        if (this.sendToClaudeBtn) {
            this.sendToClaudeBtn.addEventListener('click', () => {
                if (!this.croppedImage) {
                    window.showToast('Please crop the image first', 'error');
                    return;
                }

                const settings = window.settingsManager.getSettings();
                const apiKey = window.settingsManager.getApiKey();
                
                if (!apiKey) {
                    const settingsPanel = document.getElementById('settingsPanel');
                    if (settingsPanel) settingsPanel.classList.remove('hidden');
                    window.showToast('Please configure API key in settings', 'error');
                    return;
                }

                if (this.claudePanel) this.claudePanel.classList.remove('hidden');
                if (this.responseContent) this.responseContent.textContent = '';
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
                    console.error('Image analysis error:', error);
                    if (this.responseContent) {
                        this.responseContent.textContent = 'Error: Failed to send image for analysis - ' + error.message;
                    }
                    this.sendToClaudeBtn.disabled = false;
                    window.showToast('Failed to send image for analysis', 'error');
                }
            });
        }
    },

    setupKeyboardShortcuts() {
        // Keyboard shortcuts for capture and crop
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch(e.key) {
                    case 'c':
                        if (this.captureBtn && !this.captureBtn.disabled) {
                            this.captureBtn.click();
                        }
                        break;
                    case 'x':
                        if (this.cropBtn && !this.cropBtn.disabled) {
                            this.cropBtn.click();
                        }
                        break;
                }
            }
        });
    }
});
