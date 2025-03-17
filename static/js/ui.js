class UIManager {
    constructor() {
        // UI elements
        this.settingsPanel = document.getElementById('settingsPanel');
        this.settingsToggle = document.getElementById('settingsToggle');
        this.closeSettings = document.getElementById('closeSettings');
        this.themeToggle = document.getElementById('themeToggle');
        this.toastContainer = document.getElementById('toastContainer');
        
        // Check for preferred color scheme
        this.checkPreferredColorScheme();
        
        // Initialize event listeners
        this.setupEventListeners();
    }
    
    checkPreferredColorScheme() {
        const savedTheme = localStorage.getItem('theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
        
        if (savedTheme) {
            this.setTheme(savedTheme === 'dark');
        } else {
            this.setTheme(prefersDark.matches);
        }
        
        prefersDark.addEventListener('change', (e) => this.setTheme(e.matches));
    }
    
    setTheme(isDark) {
        document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
        this.themeToggle.innerHTML = `<i class="fas fa-${isDark ? 'sun' : 'moon'}"></i>`;
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
    }
    
    showToast(message, type = 'success') {
        // 检查是否已经存在相同内容的提示
        const existingToasts = this.toastContainer.querySelectorAll('.toast');
        for (const existingToast of existingToasts) {
            const existingMessage = existingToast.querySelector('span').textContent;
            if (existingMessage === message) {
                // 已经存在相同的提示，不再创建新的
                return;
            }
        }
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i>
            <span>${message}</span>
        `;
        this.toastContainer.appendChild(toast);
        
        // 为不同类型的提示设置不同的显示时间
        const displayTime = message === '截图成功' ? 1500 : 3000;
        
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, displayTime);
    }
    
    closeAllPanels() {
        this.settingsPanel.classList.add('hidden');
    }
    
    setupEventListeners() {
        // Settings panel
        this.settingsToggle.addEventListener('click', () => {
            this.closeAllPanels();
            this.settingsPanel.classList.toggle('hidden');
        });
        
        this.closeSettings.addEventListener('click', () => {
            this.settingsPanel.classList.add('hidden');
        });
        
        // Theme toggle
        this.themeToggle.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            this.setTheme(currentTheme !== 'dark');
        });
        
        // Close panels when clicking outside
        document.addEventListener('click', (e) => {
            // Only close if click is outside the panel and not on the toggle button
            if (this.settingsPanel && 
                !this.settingsPanel.contains(e.target) && 
                !e.target.closest('#settingsToggle')) {
                this.settingsPanel.classList.add('hidden');
            }
        });
    }
}

// Export for use in other modules
window.UIManager = UIManager;
window.showToast = (message, type) => window.uiManager.showToast(message, type);
window.closeAllPanels = () => window.uiManager.closeAllPanels();
