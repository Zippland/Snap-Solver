class UIManager {
    constructor() {
        // 延迟初始化，确保DOM已加载
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            // 如果DOM已经加载完成，则立即初始化
            this.init();
        }
    }
    
    init() {
        console.log('初始化UI管理器...');
        // UI elements
        this.settingsPanel = document.getElementById('settingsPanel');
        this.settingsToggle = document.getElementById('settingsToggle');
        this.closeSettings = document.getElementById('closeSettings');
        this.themeToggle = document.getElementById('themeToggle');
        this.toastContainer = document.getElementById('toastContainer');
        
        // 验证关键元素是否存在
        if (!this.themeToggle) {
            console.error('主题切换按钮未找到！');
            return;
        }
        
        if (!this.toastContainer) {
            console.error('Toast容器未找到！');
            // 尝试创建Toast容器
            this.toastContainer = this.createToastContainer();
        }
        
        // Check for preferred color scheme
        this.checkPreferredColorScheme();
        
        // Initialize event listeners
        this.setupEventListeners();
        
        console.log('UI管理器初始化完成');
    }
    
    createToastContainer() {
        console.log('创建Toast容器');
        const container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container';
        document.body.appendChild(container);
        return container;
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
        try {
            document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
            if (this.themeToggle) {
                this.themeToggle.innerHTML = `<i class="fas fa-${isDark ? 'sun' : 'moon'}"></i>`;
            }
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
            console.log(`主题已切换为: ${isDark ? '深色' : '浅色'}`);
        } catch (error) {
            console.error('设置主题时出错:', error);
        }
    }
    
    /**
     * 显示一个Toast消息
     * @param {string} message 显示的消息内容
     * @param {string} type 消息类型，可以是'success', 'error', 'info', 'warning'
     * @param {number} displayTime 显示的时间(毫秒)，如果为-1则持续显示直到手动关闭
     * @returns {HTMLElement} 返回创建的Toast元素，可用于后续移除
     */
    showToast(message, type = 'success', displayTime) {
        if (!this.toastContainer) {
            console.error('Toast容器不存在，无法显示消息');
            return null;
        }
        
        // 检查是否已经存在相同内容的提示
        const existingToasts = this.toastContainer.querySelectorAll('.toast');
        for (const existingToast of existingToasts) {
            const existingMessage = existingToast.querySelector('span').textContent;
            if (existingMessage === message) {
                // 已经存在相同的提示，不再创建新的
                return existingToast;
            }
        }
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        // 根据类型设置图标
        let icon = 'check-circle';
        if (type === 'error') icon = 'exclamation-circle';
        else if (type === 'warning') icon = 'exclamation-triangle';
        else if (type === 'info') icon = 'info-circle';
        
        toast.innerHTML = `
            <i class="fas fa-${icon}"></i>
            <span>${message}</span>
        `;
        
        // 如果是持续显示的Toast，添加关闭按钮
        if (displayTime === -1) {
            const closeButton = document.createElement('button');
            closeButton.className = 'toast-close';
            closeButton.innerHTML = '<i class="fas fa-times"></i>';
            closeButton.addEventListener('click', (e) => {
                this.hideToast(toast);
            });
            toast.appendChild(closeButton);
            toast.classList.add('persistent');
        }
        
        this.toastContainer.appendChild(toast);
        
        // 为不同类型的提示设置不同的显示时间
        if (displayTime !== -1) {
            // 如果没有指定时间，则根据消息类型和内容长度设置默认时间
            if (displayTime === undefined) {
                displayTime = message === '截图成功' ? 1500 : 
                             type === 'error' ? 5000 : 
                             message.length > 50 ? 4000 : 3000;
            }
            
            setTimeout(() => {
                this.hideToast(toast);
            }, displayTime);
        }
        
        return toast;
    }
    
    /**
     * 隐藏一个Toast消息
     * @param {HTMLElement} toast 要隐藏的Toast元素
     */
    hideToast(toast) {
        if (!toast || !toast.parentNode) return;
        
        toast.style.opacity = '0';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.remove();
            }
        }, 300);
    }
    
    closeAllPanels() {
        if (this.settingsPanel) {
            this.settingsPanel.classList.remove('active');
        }
    }
    
    hideSettingsPanel() {
        if (this.settingsPanel) {
            this.settingsPanel.classList.remove('active');
        }
    }
    
    toggleSettingsPanel() {
        if (this.settingsPanel) {
            this.settingsPanel.classList.toggle('active');
        }
    }
    
    closeSettingsPanel() {
        if (this.settingsPanel) {
            this.settingsPanel.classList.remove('active');
        }
    }
    
    // 检查点击事件，如果点击了设置面板外部，则关闭设置面板
    checkClickOutsideSettings(e) {
        if (this.settingsPanel &&
            !this.settingsPanel.contains(e.target) &&
            !e.target.closest('#settingsToggle')) {
            this.settingsPanel.classList.remove('active');
        }
    }
    
    setupEventListeners() {
        // 确保所有元素都存在
        if (!this.settingsToggle || !this.closeSettings || !this.themeToggle) {
            console.error('无法设置事件监听器：一些UI元素未找到');
            return;
        }
        
        // Settings panel
        this.settingsToggle.addEventListener('click', () => {
            this.closeAllPanels();
            this.settingsPanel.classList.toggle('active');
        });
        
        this.closeSettings.addEventListener('click', () => {
            this.settingsPanel.classList.remove('active');
        });
        
        // Theme toggle
        this.themeToggle.addEventListener('click', () => {
            try {
                const currentTheme = document.documentElement.getAttribute('data-theme');
                console.log('当前主题:', currentTheme);
                this.setTheme(currentTheme !== 'dark');
            } catch (error) {
                console.error('切换主题时出错:', error);
            }
        });
        
        // Close panels when clicking outside
        document.addEventListener('click', (e) => {
            this.checkClickOutsideSettings(e);
        });
    }
}

// 创建全局实例
window.UIManager = UIManager;

// 确保在DOM加载完毕后才创建UIManager实例
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.uiManager = new UIManager();
    });
} else {
    window.uiManager = new UIManager();
}

// 导出全局辅助函数
window.showToast = (message, type) => {
    if (window.uiManager) {
        return window.uiManager.showToast(message, type);
    } else {
        console.error('UI管理器未初始化，无法显示Toast');
        return null;
    }
};

window.closeAllPanels = () => {
    if (window.uiManager) {
        window.uiManager.closeAllPanels();
    } else {
        console.error('UI管理器未初始化，无法关闭面板');
    }
};
