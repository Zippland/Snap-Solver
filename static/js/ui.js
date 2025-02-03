class UIManager {
    constructor() {
        this.initializeElements();
        this.setupTheme();
        this.setupEventListeners();
    }

    initializeElements() {
        // Theme elements
        this.themeToggle = document.getElementById('themeToggle');
        
        // Panel elements
        this.settingsPanel = document.getElementById('settingsPanel');
        this.historyPanel = document.getElementById('historyPanel');
        this.claudePanel = document.getElementById('claudePanel');
        
        // History elements
        this.historyToggle = document.getElementById('historyToggle');
        this.closeHistory = document.getElementById('closeHistory');
        
        // Claude panel elements
        this.closeClaudePanel = document.getElementById('closeClaudePanel');
        
        // Toast container
        this.toastContainer = document.getElementById('toastContainer');
    }

    setupTheme() {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
        
        // Initialize theme
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme) {
            this.setTheme(savedTheme === 'dark');
        } else {
            this.setTheme(prefersDark.matches);
        }

        // Listen for system theme changes
        prefersDark.addEventListener('change', (e) => this.setTheme(e.matches));
    }

    setTheme(isDark) {
        document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
        this.themeToggle.innerHTML = `<i class="fas fa-${isDark ? 'sun' : 'moon'}"></i>`;
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
    }

    showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i>
            <span>${message}</span>
        `;
        this.toastContainer.appendChild(toast);
        
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    closeAllPanels() {
        this.settingsPanel.classList.add('hidden');
        this.historyPanel.classList.add('hidden');
    }

    setupEventListeners() {
        // Theme toggle
        this.themeToggle.addEventListener('click', () => {
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            this.setTheme(!isDark);
        });

        // History panel
        this.historyToggle.addEventListener('click', () => {
            this.closeAllPanels();
            this.historyPanel.classList.toggle('hidden');
            window.renderHistory(); // Call global renderHistory function
        });

        this.closeHistory.addEventListener('click', () => {
            this.historyPanel.classList.add('hidden');
        });

        // Claude panel
        this.closeClaudePanel.addEventListener('click', () => {
            this.claudePanel.classList.add('hidden');
        });

        // Mobile touch events
        let touchStartX = 0;
        let touchEndX = 0;

        document.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
        });

        document.addEventListener('touchend', (e) => {
            touchEndX = e.changedTouches[0].screenX;
            this.handleSwipe(touchStartX, touchEndX);
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch(e.key) {
                    case ',':
                        this.settingsPanel.classList.toggle('hidden');
                        break;
                    case 'h':
                        this.historyPanel.classList.toggle('hidden');
                        window.renderHistory();
                        break;
                }
            } else if (e.key === 'Escape') {
                this.closeAllPanels();
            }
        });
    }

    handleSwipe(startX, endX) {
        const swipeThreshold = 50;
        const diff = endX - startX;

        if (Math.abs(diff) > swipeThreshold) {
            if (diff > 0) {
                this.closeAllPanels();
            } else {
                this.settingsPanel.classList.remove('hidden');
            }
        }
    }
}

// Export for use in other modules
window.UIManager = UIManager;
window.showToast = (message, type) => window.uiManager.showToast(message, type);
window.closeAllPanels = () => window.uiManager.closeAllPanels();
