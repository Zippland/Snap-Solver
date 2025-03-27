class UIManager {
    constructor() {
        // UI elements
        this.settingsPanel = document.getElementById('settingsPanel');
        this.settingsToggle = document.getElementById('settingsToggle');
        this.closeSettings = document.getElementById('closeSettings');
        this.themeToggle = document.getElementById('themeToggle');
        this.toastContainer = document.getElementById('toastContainer');
        this.visitorCountElement = document.getElementById('visitorCount');
        
        // Check for preferred color scheme
        this.checkPreferredColorScheme();
        
        // Initialize event listeners
        this.setupEventListeners();
        
        // Initialize visitor counter
        this.initVisitorCounter();
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
    
    initVisitorCounter() {
        try {
            // 获取本地存储的计数
            let localCount = parseInt(localStorage.getItem('visitorCount') || '0');
            
            // 检查是否是今天第一次访问
            const lastVisitDate = localStorage.getItem('lastVisitDate');
            const today = new Date().toDateString();
            
            if (lastVisitDate !== today) {
                // 今天第一次访问，增加计数
                localCount++;
                localStorage.setItem('visitorCount', localCount.toString());
                localStorage.setItem('lastVisitDate', today);
                
                // 尝试向CountAPI发送计数增加请求
                this.incrementCountAPI();
            }
            
            // 显示计数
            this.updateVisitorCountDisplay(localCount);
            
            // 从CountAPI获取全局计数
            this.fetchGlobalCount();
        } catch (error) {
            console.error('访问计数器初始化失败:', error);
            this.visitorCountElement.textContent = '0';
        }
    }
    
    incrementCountAPI() {
        // 使用免费的CountAPI服务来增加计数
        // 注意：这个免费API有使用限制，生产环境可能需要更可靠的服务
        fetch('https://api.countapi.xyz/hit/snap-solver-app/visits')
            .catch(error => console.error('无法更新全局计数:', error));
    }
    
    fetchGlobalCount() {
        // 获取全局计数
        fetch('https://api.countapi.xyz/get/snap-solver-app/visits')
            .then(response => response.json())
            .then(data => {
                // 将全局计数与本地计数取较大值显示
                const localCount = parseInt(localStorage.getItem('visitorCount') || '0');
                const globalCount = data.value || 0;
                const displayCount = Math.max(localCount, globalCount);
                
                this.updateVisitorCountDisplay(displayCount);
                
                // 如果全局计数更大，则更新本地存储
                if (globalCount > localCount) {
                    localStorage.setItem('visitorCount', globalCount.toString());
                }
            })
            .catch(error => {
                console.error('无法获取全局计数:', error);
                // 如果全局计数获取失败，至少显示本地计数
                const localCount = parseInt(localStorage.getItem('visitorCount') || '0');
                this.updateVisitorCountDisplay(localCount);
            });
    }
    
    updateVisitorCountDisplay(count) {
        if (this.visitorCountElement) {
            // 低调显示，超过1000显示为1k+，超过10000显示为10k+等
            if (count >= 10000) {
                const kCount = Math.floor(count / 1000);
                this.visitorCountElement.textContent = `${kCount}k+`;
            } else if (count >= 1000) {
                const kCount = Math.floor(count / 100) / 10;
                this.visitorCountElement.textContent = `${kCount}k+`;
            } else {
                this.visitorCountElement.textContent = count.toString();
            }
        }
    }
}

// Export for use in other modules
window.UIManager = UIManager;
window.showToast = (message, type) => window.uiManager.showToast(message, type);
window.closeAllPanels = () => window.uiManager.closeAllPanels();
