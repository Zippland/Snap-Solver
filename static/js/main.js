class SnapSolver {
    constructor() {
        this.socket = null;
        this.cropper = null;
        this.originalImage = null;
        this.croppedImage = null;
        document.addEventListener('DOMContentLoaded', this.init.bind(this));
    }

    async init() {
        this.ui = new UIManager();
        this.settings = new SettingsManager(this.ui);
        await this.settings.init();
        this.connect();
        this.bindEventListeners();
        this.bindUpdateListener();
        this.checkForUpdates();
        this.initPasteListener();
        console.log("SnapSolver Initialized");
    }

    connect() {
        this.socket = io(window.location.origin, {
            reconnection: true,
            reconnectionAttempts: 5,
            transports: ['websocket', 'polling']
        });
        this.ui.updateConnectionStatus(false);
        this.socket.on('connect', () => this.ui.updateConnectionStatus(true));
        this.socket.on('disconnect', () => this.ui.updateConnectionStatus(false));
        this.socket.on('connect_error', () => this.ui.updateConnectionStatus(false));
        this.bindSocketEvents();
    }

    bindEventListeners() {
        this.ui.captureBtn.addEventListener('click', () => this.captureScreenshot());
        this.ui.cropConfirm.addEventListener('click', () => this.confirmCrop());
        this.ui.cropCancel.addEventListener('click', () => this.cancelCrop());
        this.ui.analyzeImageBtn.addEventListener('click', () => this.analyzeImage());
        this.ui.extractTextBtn.addEventListener('click', () => this.extractText());
        this.ui.analyzeTextBtn.addEventListener('click', () => this.analyzeText());
        this.ui.stopGenerationBtn.addEventListener('click', () => this.stopGeneration());
    }

    bindUpdateListener() {
        const updateNowBtn = document.getElementById('updateNowBtn');
        if (updateNowBtn) {
            updateNowBtn.addEventListener('click', async () => {
                const toast = this.ui.showToast(t('update.updating'), 'info', 0);

                try {
                    const response = await fetch('/api/perform-update', { method: 'POST' });
                    const result = await response.json();

                    if (result.success) {
                        toast.innerHTML = `<i class="fas fa-spinner fa-spin"></i> <span>${t('update.restarting')}</span>`;
                    } else {
                        toast.remove();
                        this.ui.showToast(`${t('update.failed')}: ${result.message}`, 'error', 5000);
                    }
                } catch (error) {
                    toast.remove();
                    this.ui.showToast(`${t('update.failed')}: ${error.message}`, 'error', 5000);
                }
            });
        }
    }

    bindSocketEvents() {
        this.socket.on('screenshot_complete', (data) => {
            this.ui.setLoading(this.ui.captureBtn, false, '<i class="fas fa-camera"></i>');
            if (data.success) {
                this.originalImage = `data:image/png;base64,${data.image}`;
                this.initCropper(this.originalImage);
            } else {
                this.ui.showToast(t('error.captureFailed', { error: data.error }), 'error');
            }
        });
        
        this.socket.on('text_extracted', (data) => {
            this.ui.setLoading(this.ui.extractTextBtn, false, `<i class="fas fa-font"></i> ${t('button.extractText')}`);
            if (data.content) {
                this.ui.showExtractedText(data.content);
                this.ui.showToast(t('success.textExtracted'), 'success');
            } else {
                this.ui.showToast(t('error.textExtractionFailed', { error: data.error }), 'error');
            }
        });

        this.socket.on('ai_response', (data) => {
            this.ui.handleAIResponse(data);
        });
    }

    async checkForUpdates() {
        try {
            const response = await fetch('/api/check-update');
            const updateInfo = await response.json();
            if (updateInfo && updateInfo.has_update) {
                this.displayUpdateNotice(updateInfo);
            }
        } catch (error) {
            console.error("Failed to check for updates:", error);
        }
    }

    displayUpdateNotice(updateInfo) {
        const notice = document.getElementById('updateNotice');
        const versionSpan = document.getElementById('updateVersion');
        const link = document.getElementById('updateLink');
        const closeBtn = document.getElementById('closeUpdateNotice');

        if (versionSpan) versionSpan.textContent = updateInfo.latest_version;
        if (link) link.href = updateInfo.release_url;
        if (notice) notice.classList.remove('hidden');

        closeBtn.addEventListener('click', () => {
            notice.classList.add('hidden');
        });
    }

    bindUpdateListener() {
        const updateNowBtn = document.getElementById('updateNowBtn');
        if (updateNowBtn) {
            updateNowBtn.addEventListener('click', async () => {
                const toast = this.ui.showToast(t('update.updating'), 'info', 0); // Persistent toast

                try {
                    const response = await fetch('/api/perform-update', { method: 'POST' });
                    const result = await response.json();

                    if (result.success) {
                        toast.innerHTML = `<i class="fas fa-spinner fa-spin"></i> <span>${t('update.restarting')}</span>`;
                    } else {
                        toast.remove();
                        this.ui.showToast(`${t('update.failed')}: ${result.message}`, 'error', 5000);
                    }
                } catch (error) {
                    toast.remove();
                    this.ui.showToast(`${t('update.failed')}: ${error.message}`, 'error', 5000);
                }
            });
        }
    }

    initPasteListener() {
        document.addEventListener('paste', (event) => {
            const items = (event.clipboardData || event.originalEvent.clipboardData).items;
            let imageFile = null;
            for (const item of items) {
                if (item.kind === 'file' && item.type.startsWith('image/')) {
                    imageFile = item.getAsFile();
                    break;
                }
            }
            if (imageFile) {
                event.preventDefault();
                this.loadImageFromBlob(imageFile);
            }
        });
    }

    loadImageFromBlob(blob) {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64data = reader.result;
            this.croppedImage = base64data;
            this.ui.displayImagePreview(this.croppedImage);
            this.ui.showToast(t('success.imagePasted'), 'success');
        };
        reader.onerror = () => {
            this.ui.showToast(t('error.clipboardReadFailed'), 'error');
        };
        reader.readAsDataURL(blob);
    }

    captureScreenshot() {
        try {
            window.focus();
        } catch (e) {
            console.warn("Could not focus window:", e);
        }

        if (!this.socket.connected) {
            this.ui.showToast(t('error.notConnected'), 'error');
            return;
        }
        this.ui.setLoading(this.ui.captureBtn, true, '<i class="fas fa-spinner fa-spin"></i>');
        this.socket.emit('capture_screenshot', {});
    }

    initCropper(imageData) {
        this.ui.showCropContainer(true);
        const cropImage = new Image();
        cropImage.src = imageData;
        this.ui.cropArea.innerHTML = '';
        this.ui.cropArea.appendChild(cropImage);
        
        if (this.cropper) this.cropper.destroy();
        this.cropper = new Cropper(cropImage, {
            viewMode: 1,
            dragMode: 'crop',
            autoCropArea: 0.8,
            responsive: true,
            background: false,
        });
    }

    confirmCrop() {
        if (!this.cropper) return;
        const canvas = this.cropper.getCroppedCanvas({
            maxWidth: 4096,
            maxHeight: 4096,
            imageSmoothingQuality: 'high',
        });
        this.croppedImage = canvas.toDataURL('image/png');
        this.ui.displayImagePreview(this.croppedImage);
        this.ui.showToast(t('success.crop'), 'success');
        this.cancelCrop();
    }
    
    cancelCrop() {
        this.ui.showCropContainer(false);
        if (this.cropper) {
            this.cropper.destroy();
            this.cropper = null;
        }
    }

    analyzeImage() {
        if (!this.croppedImage) {
            this.ui.showToast(t('error.noCroppedImage'), 'error');
            return;
        }
        const settings = this.settings.getSettings();
        if (!settings.modelInfo.is_multimodal) {
             this.ui.showToast(t('error.notMultimodal', { model: settings.modelInfo.display_name }), 'error');
             return;
        }
        this.ui.showAnalysisPanel();
        this.socket.emit('analyze_image', {
            image: this.croppedImage.split(',')[1],
            settings,
        });
    }
    
    extractText() {
        if (!this.croppedImage) {
            this.ui.showToast(t('error.noCroppedImage'), 'error');
            return;
        }
        this.ui.setLoading(this.ui.extractTextBtn, true, `<i class="fas fa-spinner fa-spin"></i> ${t('status.extracting')}`);
        this.socket.emit('extract_text', {
            image: this.croppedImage.split(',')[1],
            settings: this.settings.getSettings(),
        });
    }

    analyzeText() {
        const text = this.ui.extractedText.value.trim();
        if (!text) {
            this.ui.showToast(t('error.noTextToAnalyze'), 'error');
            return;
        }
        this.ui.showAnalysisPanel();
        this.socket.emit('analyze_text', {
            text,
            settings: this.settings.getSettings(),
        });
    }
    
    stopGeneration() {
        if (this.socket.connected) {
            this.socket.emit('stop_generation');
            this.ui.showToast(t('status.stopping'), 'info');
        }
    }
}

new SnapSolver();