/* ============================================================
   UIManager — 主题（浅/深/跟随系统）、Toast、设置抽屉开关的唯一实现
   Sheets    — 统一弹层管理器：所有底部弹出层（模型选择/引导/确认/表单）
               的唯一宿主，栈式叠层，Promise 化。
   本文件只定义，不自建实例；入口统一在 main.js。
   ============================================================ */

class UIManager {
    constructor() {
        // 'light' | 'dark' | 'system'（system = 不写 data-theme，交给媒体查询）
        this.themeChoice = localStorage.getItem('theme') || 'system';
        this.applyTheme();
        this.bindStatic();
        Sheets.bindGlobal();
    }

    /* ---------- 主题 ---------- */
    applyTheme() {
        const root = document.documentElement;
        if (this.themeChoice === 'system') root.removeAttribute('data-theme');
        else root.setAttribute('data-theme', this.themeChoice);
    }

    setTheme(choice) {
        this.themeChoice = choice;
        if (choice === 'system') localStorage.removeItem('theme');
        else localStorage.setItem('theme', choice);
        this.applyTheme();
    }

    /* ---------- 设置入口（页面实现见 settings-page.js） ---------- */
    openSettings(view) { window.settingsPage?.open(view); }
    closeSettings() { window.settingsPage?.close(); }

    bindStatic() {
        document.getElementById('settingsToggle')?.addEventListener('click', () => this.openSettings());
    }

    /* ---------- Toast（轻提示；重要错误走错误卡，不进 toast） ---------- */
    showToast(message, type = 'info', duration = 2600) {
        const container = document.getElementById('toastContainer');
        if (!container) return;
        const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', warning: 'fa-triangle-exclamation', info: 'fa-circle-info' };
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i><span></span>`;
        toast.querySelector('span').textContent = message;
        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 320);
        }, duration);
    }
}

/* ============================================================
   Sheets — 统一弹层管理器
   open({name, build(bodyEl, ctl), dismissible, onClose}) → Promise<result>
     build 收到 (bodyEl, ctl)，ctl.close(result) 关闭并 resolve
   close(name?, result?) — 关指定名字或最顶层
   confirm({title, message, actions:[{label, style}]}) → Promise<index|undefined>
   ============================================================ */
const Sheets = {
    stack: [],

    _root() { return document.getElementById('sheetRoot'); },

    open({ name, build, dismissible = true, onClose } = {}) {
        return new Promise(resolve => {
            const overlay = document.createElement('div');
            overlay.className = 'sheet-overlay';
            const sheet = document.createElement('div');
            sheet.className = 'sheet';
            const grabber = document.createElement('div');
            grabber.className = 'sheet-grabber';
            const body = document.createElement('div');
            body.className = 'sheet-body';
            sheet.append(grabber, body);
            overlay.appendChild(sheet);

            const entry = { name, overlay, resolve, onClose, closed: false };
            if (dismissible) {
                overlay.addEventListener('click', e => { if (e.target === overlay) this._close(entry); });
            }
            // 键盘弹起时让聚焦的输入框可见
            body.addEventListener('focusin', e => {
                if (e.target.matches('input, textarea')) {
                    setTimeout(() => e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300);
                }
            });

            this._root().appendChild(overlay);
            this.stack.push(entry);
            build(body, { close: result => this._close(entry, result) });
        });
    },

    _close(entry, result) {
        if (entry.closed) return;
        entry.closed = true;
        const i = this.stack.indexOf(entry);
        if (i !== -1) this.stack.splice(i, 1);

        let finished = false;
        const done = () => {
            if (finished) return;
            finished = true;
            entry.overlay.remove();
            try { entry.onClose?.(result); } catch (e) { console.error(e); }
            entry.resolve(result);
        };
        entry.overlay.classList.add('closing');
        entry.overlay.addEventListener('animationend', done, { once: true });
        setTimeout(done, 250); // 动画兜底
    },

    close(name, result) {
        const entry = name
            ? this.stack.find(s => s.name === name)
            : this.stack[this.stack.length - 1];
        if (entry) this._close(entry, result);
    },

    isOpen(name) { return this.stack.some(s => s.name === name); },

    /** 决策弹层：resolve 被点按钮的下标；点遮罩关闭 resolve undefined */
    confirm({ title, message, actions = [] }) {
        return this.open({
            name: 'confirm',
            build: (body, ctl) => {
                if (title) {
                    const h = document.createElement('h3');
                    h.className = 'confirm-title';
                    h.textContent = title;
                    body.appendChild(h);
                }
                if (message) {
                    const p = document.createElement('p');
                    p.className = 'confirm-message';
                    p.textContent = message;
                    body.appendChild(p);
                }
                const wrap = document.createElement('div');
                wrap.className = 'confirm-actions';
                actions.forEach((a, i) => {
                    const btn = document.createElement('button');
                    const style = a.style || 'default';
                    btn.className = 'btn ' + (
                        style === 'primary' ? 'btn-primary' :
                        style === 'danger' ? 'btn-danger' :
                        style === 'cancel' ? 'btn-ghost cancel' : 'btn-ghost');
                    btn.textContent = a.label;
                    btn.addEventListener('click', () => ctl.close(i));
                    wrap.appendChild(btn);
                });
                body.appendChild(wrap);
            }
        });
    },

    bindGlobal() {
        if (this._globalBound) return;
        this._globalBound = true;
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') this.close();
        });
    }
};

window.UIManager = UIManager;
window.Sheets = Sheets;
