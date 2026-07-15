/* ============================================================
   SettingsPage — 设置整页（设计定稿 t3：3a/3b/3c/3d）
   两级菜单：主页只做分组导航 + 当前值预览；
   二级页：API 密钥（就地展开编辑）/ 提示词模式（内置|自建 + 删除确认）/
          网络（代理 + 各厂商中转地址）；
   回复语言与外观用轻量 Sheets 内联完成，不设二级页。
   数据读写全部经 settingsManager；change 事件驱动重渲。
   ============================================================ */

class SettingsPage {
    constructor(settings) {
        this.s = settings;
        this.el = document.getElementById('settingsPage');
        this.titleEl = document.getElementById('settingsTitle');
        this.rightEl = document.getElementById('settingsRight');
        this.scrollEl = document.getElementById('settingsScroll');
        this.view = 'nav';        // nav | keys | prompts | network
        this.expandedKey = null;  // 密钥页当前展开编辑的 keyId

        document.getElementById('settingsBack').addEventListener('click', () => {
            if (this.view === 'nav') this.close();
            else this.show('nav');
        });
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && this.isOpen() && !Sheets.stack.length) {
                if (this.view === 'nav') this.close();
                else this.show('nav');
            }
        });
        settings.addEventListener('change', () => { if (this.isOpen()) this.render(); });
    }

    isOpen() { return this.el.classList.contains('active'); }

    open(view = 'nav') {
        this.show(view);
        this.el.classList.add('active');
    }

    close() { this.el.classList.remove('active'); }

    show(view) {
        this.view = view;
        this.expandedKey = null;
        this.render();
        this.scrollEl.scrollTop = 0;
    }

    render() {
        this.rightEl.innerHTML = '';
        this.scrollEl.innerHTML = '';
        switch (this.view) {
            case 'keys': this.titleEl.textContent = 'API 密钥'; this.renderKeys(); break;
            case 'prompts': this.titleEl.textContent = '提示词模式'; this.renderPrompts(); break;
            case 'network': this.titleEl.textContent = '网络'; this.renderNetwork(); break;
            default: this.titleEl.textContent = '设置'; this.renderNav();
        }
    }

    sectionLabel(text, note) {
        const d = document.createElement('div');
        d.className = 'mp-section-label';
        d.textContent = text;
        if (note) {
            const n = document.createElement('span');
            n.className = 'mp-section-note';
            n.textContent = ' — ' + note;
            d.appendChild(n);
        }
        return d;
    }

    group(...rows) {
        const g = document.createElement('div');
        g.className = 'list-group';
        rows.forEach(r => g.appendChild(r));
        return g;
    }

    /* ---------- 设置主页：分组导航 + 当前值预览（3a） ---------- */
    navRow({ icon, brand, label, value, warn, mono, external, onClick }) {
        const row = document.createElement('button');
        row.className = 'nav-row';
        row.innerHTML = `
            <i class="${brand ? 'fa-brands' : 'fas'} ${icon} nav-row-icon"></i>
            <span class="nav-row-label"></span>
            <span class="nav-row-value${warn ? ' warn' : ''}${mono ? ' mono' : ''}"></span>
            <i class="fas ${external ? 'fa-arrow-up-right-from-square nav-row-external' : 'fa-chevron-right'}"></i>`;
        row.querySelector('.nav-row-label').textContent = label;
        row.querySelector('.nav-row-value').textContent = value || '';
        row.addEventListener('click', onClick);
        return row;
    }

    renderNav() {
        const s = this.s;
        const wrap = this.scrollEl;
        const stats = s.keyStats();
        const prompt = s.prompts[s.currentPromptId];
        const themeText = { light: '浅色', dark: '深色', system: '跟随系统' }[window.uiManager?.themeChoice || 'system'];
        const netText = s._proxyEnabled ? '代理已开' : (s.relayCount() ? `中转 ${s.relayCount()} 家` : '代理已关');

        wrap.appendChild(this.sectionLabel('解题'));
        wrap.appendChild(this.group(
            this.navRow({
                icon: 'fa-file-lines', label: '提示词模式',
                value: prompt ? `${s.isBuiltinPrompt(s.currentPromptId) ? '内置 · ' : ''}${prompt.name}` : '未选择',
                onClick: () => this.show('prompts')
            }),
            this.navRow({ icon: 'fa-language', label: '回复语言', value: s._language, onClick: () => this.openLanguageSheet() }),
        ));

        wrap.appendChild(this.sectionLabel('模型接入'));
        wrap.appendChild(this.group(
            this.navRow({
                icon: 'fa-key', label: 'API 密钥',
                value: `${stats.set}/${stats.total} 已配`, warn: stats.set < stats.total,
                onClick: () => this.show('keys')
            }),
            this.navRow({ icon: 'fa-globe', label: '网络', value: netText, onClick: () => this.show('network') }),
        ));

        wrap.appendChild(this.sectionLabel('通用'));
        wrap.appendChild(this.group(
            this.navRow({ icon: 'fa-circle-half-stroke', label: '外观', value: themeText, onClick: () => this.openAppearanceSheet() }),
            this.navRow({
                icon: 'fa-github', brand: true, label: 'GitHub 仓库',
                value: REPO.name, mono: true, external: true,
                onClick: () => window.open(REPO.url, '_blank')
            }),
            this.navRow({
                icon: 'fa-circle-info', label: '关于',
                value: this.s.version ? 'v' + this.s.version : '', mono: true,
                onClick: () => this.openAboutSheet()
            }),
        ));
    }

    /* ---------- 二级页：API 密钥，就地展开编辑（3b） ---------- */
    renderKeys() {
        const s = this.s;
        this.rightEl.textContent = '仅存于你的电脑';

        const rows = this.s.providersOrdered().map(p => {
            const keyId = PROVIDER_KEY[p];
            const has = !!s.apiKeyValues[keyId];
            const expanded = this.expandedKey === keyId;

            if (!expanded) {
                const row = document.createElement('button');
                row.className = 'nav-row';
                if (has) {
                    row.innerHTML = `
                        <span class="nav-row-label"></span>
                        <span class="kp-mask"></span>
                        <span class="kp-edit">修改</span>`;
                    row.querySelector('.kp-mask').textContent = s.maskKey(s.apiKeyValues[keyId]);
                } else {
                    row.innerHTML = `
                        <span class="nav-row-label"></span>
                        <span class="nokey-badge">未配</span>
                        <i class="fas fa-chevron-down nav-row-chevron"></i>`;
                }
                row.querySelector('.nav-row-label').textContent = PROVIDER_LABEL[p];
                row.addEventListener('click', () => { this.expandedKey = keyId; this.render(); });
                return row;
            }

            // 展开态：就地编辑
            const box = document.createElement('div');
            box.className = 'kp-expand';
            box.innerHTML = `
                <button class="kp-expand-head">
                    <span class="nav-row-label"></span>
                    ${has ? '<span class="kp-mask"></span>' : '<span class="nokey-badge">未配</span>'}
                    <i class="fas fa-chevron-up nav-row-chevron"></i>
                </button>
                <div class="key-fill-row">
                    <input type="password" placeholder="sk-…" autocomplete="off" />
                    <button class="btn btn-primary">保存</button>
                </div>
                <div class="kp-hint">如何获取 ${PROVIDER_LABEL[p]}
                    <a href="${KEY_META[keyId].url}" target="_blank"><i class="fas fa-arrow-up-right-from-square"></i></a>
                </div>`;
            box.querySelector('.nav-row-label').textContent = PROVIDER_LABEL[p];
            if (has) box.querySelector('.kp-mask').textContent = s.maskKey(s.apiKeyValues[keyId]);
            const input = box.querySelector('input');
            input.value = s.apiKeyValues[keyId] || '';
            box.querySelector('.kp-expand-head').addEventListener('click', () => { this.expandedKey = null; this.render(); });
            box.querySelector('.btn-primary').addEventListener('click', async () => {
                const v = input.value.trim();
                // 空值保存 = 清除该密钥；本就未配且为空则直接收起
                if (!v && !has) { this.expandedKey = null; this.render(); return; }
                this.expandedKey = null;
                await s.saveApiKey(keyId, v); // change 事件触发重渲
            });
            setTimeout(() => input.focus(), 50);
            return box;
        });

        this.scrollEl.appendChild(this.group(...rows));
    }

    /* ---------- 二级页：提示词模式，内置|自建（3c） ---------- */
    renderPrompts() {
        const s = this.s;
        const add = document.createElement('button');
        add.className = 'btn btn-text';
        add.innerHTML = '<i class="fas fa-plus" style="font-size:12px"></i> 新建';
        add.addEventListener('click', () => this.openPromptEditor(null));
        this.rightEl.appendChild(add);

        const buildRow = id => {
            const p = s.prompts[id];
            const isCur = id === s.currentPromptId;
            const builtin = s.isBuiltinPrompt(id);
            const row = document.createElement('div');
            row.className = 'pp-row';
            row.innerHTML = `
                <button class="pp-info">
                    <span class="pp-name${isCur ? '' : ' dim'}"></span>
                    <span class="pp-desc"></span>
                </button>
                <button class="pp-act" data-act="preview">预览</button>
                ${builtin ? '' : '<button class="pp-act accent" data-act="edit">编辑</button><button class="pp-trash" data-act="del" aria-label="删除"><i class="fa-regular fa-trash-can"></i></button>'}
                ${isCur ? '<i class="fas fa-check"></i>' : ''}`;
            row.querySelector('.pp-name').textContent = p.name || id;
            row.querySelector('.pp-desc').textContent = p.description || (p.content || '').slice(0, 30);
            row.querySelector('.pp-info').addEventListener('click', () => s.selectPrompt(id));
            row.querySelector('[data-act="preview"]').addEventListener('click', () => this.openPromptPreview(id));
            row.querySelector('[data-act="edit"]')?.addEventListener('click', () => this.openPromptEditor(id));
            row.querySelector('[data-act="del"]')?.addEventListener('click', () => this.confirmDeletePrompt(id));
            return row;
        };

        const ids = Object.keys(s.prompts);
        const builtins = ids.filter(id => s.isBuiltinPrompt(id));
        const customs = ids.filter(id => !s.isBuiltinPrompt(id));

        if (builtins.length) {
            this.scrollEl.appendChild(this.sectionLabel('内置'));
            this.scrollEl.appendChild(this.group(...builtins.map(buildRow)));
        }
        if (customs.length) {
            this.scrollEl.appendChild(this.sectionLabel('自建'));
            this.scrollEl.appendChild(this.group(...customs.map(buildRow)));
        }
    }

    openPromptPreview(id) {
        const p = this.s.prompts[id];
        if (!p) return;
        Sheets.open({
            name: 'promptPreview',
            build: (body, ctl) => {
                const h = document.createElement('h3');
                h.className = 'confirm-title';
                h.textContent = p.name || id;
                const content = document.createElement('div');
                content.className = 'prompt-preview-body';
                content.textContent = p.content || '';
                const done = document.createElement('button');
                done.className = 'btn btn-ghost';
                done.textContent = '关闭';
                done.addEventListener('click', () => ctl.close());
                body.append(h, content, done);
            }
        });
    }

    openPromptEditor(id) {
        const s = this.s;
        const existing = id ? s.prompts[id] : null;
        const tpl = document.getElementById('tplPromptEditor');
        if (!tpl) return;
        Sheets.open({
            name: 'promptEditor',
            build: (body, ctl) => {
                body.appendChild(tpl.content.cloneNode(true));
                const q = role => body.querySelector(`[data-role="${role}"]`);
                q('title').textContent = existing ? '编辑提示词' : '新建提示词';
                q('id').value = id || '';
                q('id').disabled = !!existing;
                q('name').value = existing?.name || '';
                q('desc').value = existing?.description || '';
                q('content').value = existing?.content || '';
                q('cancel').addEventListener('click', () => ctl.close());
                q('save').addEventListener('click', async () => {
                    const newId = q('id').value.trim();
                    if (!newId) { window.uiManager?.showToast('请填写 ID', 'warning'); return; }
                    try {
                        await s.savePrompt({
                            id: newId,
                            name: q('name').value.trim() || newId,
                            description: q('desc').value.trim(),
                            content: q('content').value,
                        });
                        window.uiManager?.showToast('提示词已保存', 'success');
                        ctl.close();
                    } catch (e) {
                        window.uiManager?.showToast('提示词保存失败，请重试', 'error');
                    }
                });
            }
        });
    }

    async confirmDeletePrompt(id) {
        const s = this.s;
        const choice = await Sheets.confirm({
            title: `删除「${s.prompts[id]?.name || id}」？`,
            message: '删除后无法恢复。',
            actions: [
                { label: '取消', style: 'cancel' },
                { label: '删除', style: 'danger' },
            ]
        });
        if (choice !== 1) return;
        try {
            await s.deletePrompt(id);
            window.uiManager?.showToast('提示词已删除', 'success');
        } catch (e) {
            window.uiManager?.showToast('删除失败，请重试', 'error');
        }
    }

    /* ---------- 二级页：网络（3d） ---------- */
    renderNetwork() {
        const s = this.s;

        // HTTP 代理
        const switchRow = document.createElement('div');
        switchRow.className = 'nav-row static';
        switchRow.innerHTML = `
            <span class="nav-row-label">启用代理</span>
            <label class="switch"><input type="checkbox" /><span class="switch-slider"></span></label>`;
        const checkbox = switchRow.querySelector('input');
        checkbox.checked = s._proxyEnabled;
        checkbox.addEventListener('change', () => s.setProxy({ enabled: checkbox.checked }));

        const hostPort = document.createElement('div');
        hostPort.className = 'proxy-grid';
        hostPort.innerHTML = `
            <div style="flex:2">
                <div class="field-label">主机</div>
                <input class="mono-input" data-f="host" />
            </div>
            <div style="flex:1">
                <div class="field-label">端口</div>
                <input class="mono-input" data-f="port" type="number" />
            </div>`;
        hostPort.querySelector('[data-f="host"]').value = s._proxyHost;
        hostPort.querySelector('[data-f="port"]').value = s._proxyPort;
        hostPort.querySelector('[data-f="host"]').addEventListener('change', e => s.setProxy({ host: e.target.value }));
        hostPort.querySelector('[data-f="port"]').addEventListener('change', e => s.setProxy({ port: e.target.value }));

        this.scrollEl.appendChild(this.sectionLabel('HTTP 代理'));
        this.scrollEl.appendChild(this.group(switchRow, hostPort));

        // 中转 API 地址
        const relayRows = Object.keys(PROVIDER_KEY).map(p => {
            const row = document.createElement('div');
            row.className = 'relay-row';
            row.innerHTML = `<span class="relay-label"></span><input class="mono-input" placeholder="默认官方地址" />`;
            row.querySelector('.relay-label').textContent = PROVIDER_TAB[p];
            const input = row.querySelector('input');
            input.value = s.relayApis[p] || '';
            input.addEventListener('change', () => s.setRelay(p, input.value));
            return row;
        });
        this.scrollEl.appendChild(this.sectionLabel('中转 API 地址', '填了即走中转'));
        this.scrollEl.appendChild(this.group(...relayRows));
    }

    /* ---------- 轻量弹层：回复语言 / 外观 ---------- */
    openLanguageSheet() {
        const s = this.s;
        Sheets.open({
            name: 'language',
            build: (body, ctl) => {
                body.innerHTML = `
                    <h3 class="confirm-title">回复语言</h3>
                    <div class="form-field">
                        <label>AI 用什么语言作答</label>
                        <input type="text" placeholder="中文" />
                    </div>
                    <div class="form-actions">
                        <button class="btn btn-ghost" data-a="cancel">取消</button>
                        <button class="btn btn-primary" data-a="save">保存</button>
                    </div>`;
                const input = body.querySelector('input');
                input.value = s._language;
                body.querySelector('[data-a="cancel"]').addEventListener('click', () => ctl.close());
                body.querySelector('[data-a="save"]').addEventListener('click', () => {
                    s.setLanguage(input.value);
                    ctl.close();
                });
            }
        });
    }

    openAboutSheet() {
        const s = this.s;
        Sheets.open({
            name: 'about',
            build: (body, ctl) => {
                body.innerHTML = `
                    <div class="about-head">
                        <img src="/static/favicon.png" alt="" class="about-logo" />
                        <div class="about-name">Snap Solver</div>
                        <div class="about-version">${s.version ? 'v' + s.version : ''}</div>
                        <div class="about-desc">截屏解题 · 自托管 · 自带密钥</div>
                    </div>
                    <a class="repo-footer" href="${REPO.url}" target="_blank">
                        <i class="fa-brands fa-github"></i>
                        <span>开源项目 · <span class="repo-name">${REPO.name}</span></span>
                    </a>
                    <div class="form-actions">
                        <button class="btn btn-ghost" data-a="close">关闭</button>
                        <button class="btn btn-primary" data-a="update"><i class="fas fa-circle-up"></i> 检查更新</button>
                    </div>`;
                body.querySelector('[data-a="close"]').addEventListener('click', () => ctl.close());
                body.querySelector('[data-a="update"]').addEventListener('click', async e => {
                    const btn = e.currentTarget;
                    btn.disabled = true;
                    try {
                        const info = await (await fetch('/api/check-update')).json();
                        if (info.has_update) {
                            window.uiManager?.showToast(`新版本 v${info.latest_version} 可用`, 'info');
                            if (info.release_url) window.open(info.release_url, '_blank');
                        } else {
                            window.uiManager?.showToast('已是最新版本', 'success');
                        }
                    } catch (err) {
                        window.uiManager?.showToast('检查更新失败，请稍后再试', 'error');
                    }
                    btn.disabled = false;
                });
            }
        });
    }

    openAppearanceSheet() {
        Sheets.open({
            name: 'appearance',
            build: (body, ctl) => {
                const h = document.createElement('h3');
                h.className = 'confirm-title';
                h.textContent = '外观';
                const seg = document.createElement('div');
                seg.className = 'segmented';
                [['light', '浅色'], ['dark', '深色'], ['system', '跟随系统']].forEach(([v, label]) => {
                    const opt = document.createElement('button');
                    opt.className = 'segmented-option' + (window.uiManager.themeChoice === v ? ' active' : '');
                    opt.textContent = label;
                    opt.addEventListener('click', () => {
                        window.uiManager.setTheme(v);
                        seg.querySelectorAll('.segmented-option').forEach(o => o.classList.toggle('active', o === opt));
                        this.render(); // 刷新导航页预览值
                    });
                    seg.appendChild(opt);
                });
                const done = document.createElement('button');
                done.className = 'btn btn-ghost';
                done.textContent = '完成';
                done.addEventListener('click', () => ctl.close());
                body.append(h, seg, done);
            }
        });
    }
}

window.SettingsPage = SettingsPage;
