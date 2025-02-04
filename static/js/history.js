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
                // Display the image
                window.app.screenshotImg.src = historyItem.image;
                window.app.imagePreview.classList.remove('hidden');
                document.getElementById('historyPanel').classList.add('hidden');
                
                // Hide all action buttons in history view
                window.app.cropBtn.classList.add('hidden');
                window.app.captureBtn.classList.add('hidden');
                window.app.sendToClaudeBtn.classList.add('hidden');
                window.app.extractTextBtn.classList.add('hidden');
                window.app.sendExtractedTextBtn.classList.add('hidden');
                
                // Reset confidence display
                document.getElementById('confidenceDisplay').textContent = '';
                
                // Always hide text editor and extracted text in history view
                window.app.textEditor.classList.add('hidden');
                window.app.extractedText.value = '';
                window.app.sendExtractedTextBtn.classList.add('hidden');
                
                // Show response if it exists
                if (historyItem.response) {
                    window.app.claudePanel.classList.remove('hidden');
                    window.app.responseContent.textContent = historyItem.response;
                }
            }
        });
    });
};
