// History management extension for SnapSolver class
Object.assign(SnapSolver.prototype, {
    addToHistory(imageData, response) {
        const historyItem = {
            id: Date.now(),
            timestamp: new Date().toISOString(),
            image: imageData,
            extractedText: this.extractedText.value || null,
            response: response
        };
        this.history.unshift(historyItem);
        if (this.history.length > 10) this.history.pop();
        localStorage.setItem('snapHistory', JSON.stringify(this.history));
        window.renderHistory();
    }
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
                // Store current state before entering history view
                const previousState = {
                    textEditorVisible: !window.app.textEditor.classList.contains('hidden'),
                    textFormatControlsVisible: !document.querySelector('.text-format-controls').classList.contains('hidden'),
                    extractedTextValue: window.app.extractedText.value
                };

                // Add history view class and display the image
                document.body.classList.add('history-view');
                window.app.screenshotImg.src = historyItem.image;
                window.app.imagePreview.classList.remove('hidden');
                document.getElementById('historyPanel').classList.add('hidden');

                // Force hide all unwanted elements
                const elementsToHide = [
                    window.app.cropBtn,
                    window.app.captureBtn,
                    window.app.sendToClaudeBtn,
                    window.app.extractTextBtn,
                    window.app.sendExtractedTextBtn,
                    window.app.textEditor,
                    document.querySelector('.text-format-controls'),
                    document.getElementById('confidenceIndicator'),
                    document.querySelector('.analysis-button .button-group')
                ];

                elementsToHide.forEach(element => {
                    if (element) {
                        element.classList.add('hidden');
                        element.style.display = 'none';
                    }
                });

                // Clear text and confidence display
                window.app.extractedText.value = '';
                document.getElementById('confidenceDisplay').textContent = '';
                
                // Show response if it exists
                if (historyItem.response) {
                    window.app.claudePanel.classList.remove('hidden');
                    window.app.responseContent.textContent = historyItem.response;
                }

                // Add click handler to close history view and restore previous state
                const closeHandler = () => {
                    // Remove history view class
                    document.body.classList.remove('history-view');
                    
                    // Hide preview panels
                    window.app.imagePreview.classList.add('hidden');
                    window.app.claudePanel.classList.add('hidden');
                    
                    // Restore previous state
                    if (previousState.textEditorVisible) {
                        window.app.textEditor.classList.remove('hidden');
                        window.app.textEditor.style.display = '';
                    }
                    if (previousState.textFormatControlsVisible) {
                        document.querySelector('.text-format-controls').classList.remove('hidden');
                        document.querySelector('.text-format-controls').style.display = '';
                    }
                    window.app.extractedText.value = previousState.extractedTextValue;
                    
                    // Remove event listener
                    document.removeEventListener('click', closeHandler);
                };
                
                // Close history view when clicking outside the image or response
                document.addEventListener('click', (e) => {
                    if (!window.app.imagePreview.contains(e.target) && 
                        !window.app.claudePanel.contains(e.target)) {
                        closeHandler();
                    }
                });
            }
        });
    });
};
