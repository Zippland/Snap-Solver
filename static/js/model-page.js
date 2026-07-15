/* ============================================================
   ModelPage — 模型选择整页（设计定稿 t2：2a/2b）
   结构：厂商 Tab 横排 → [缺密钥：置顶就地填写卡] → 当前模型卡
        （名称/描述/档位 segmented，档位全局统一）→ 全部模型 →
        [已配密钥：沉底密钥行，可点「修改」原地换成填写卡]
   数据读写全部经 settingsManager；settings 的 change 事件驱动重渲。
   open() 返回 Promise，关闭时 resolve —— main.js 借此实现
   「换模型后自动重解」。
   ============================================================ */

class ModelPage {
    constructor(settings) {
        this.s = settings;
        this.el = document.getElementById('modelPage');
        this.tabsEl = document.getElementById('providerTabs');
        this.scrollEl = document.getElementById('modelPageScroll');
        this.activeProvider = null;
        this.editingKey = false;      // 已配密钥点了「修改」
        this._resolve = null;
        this._focusKeyOnRender = false;

        document.getElementById('modelPageBack').addEventListener('click', () => this.close());
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && this.isOpen() && !Sheets.stack.length) this.close();
        });
        settings.addEventListener('change', () => { if (this.isOpen()) this.render(); });
    }

    isOpen() { return this.el.classList.contains('active'); }

    open({ focusKey = false } = {}) {
        if (this.isOpen()) return Promise.resolve();
        this.activeProvider = this.s.currentModel?.provider || this.providers()[0] || null;
        this.editingKey = false;
        this._focusKeyOnRender = focusKey;
        this.render();
        this.el.classList.add('active');
        return new Promise(res => { this._resolve = res; });
    }

    close() {
        this.el.classList.remove('active');
        const r = this._resolve;
        this._resolve = null;
        if (r) r();
    }

    providers() { return this.s.providersOrdered(); }

    render() {
        this.renderTabs();
        this.renderBody();
        if (this._focusKeyOnRender) {
            this._focusKeyOnRender = false;
            setTimeout(() => {
                const inp = this.scrollEl.querySelector('.key-fill-row input');
                if (inp) inp.focus();
            }, 380);
        }
    }

    /* ---------- 厂商 Tab（未配密钥带小圆点） ---------- */
    renderTabs() {
        this.tabsEl.innerHTML = '';
        this.providers().forEach(p => {
            const tab = document.createElement('button');
            tab.className = 'provider-tab' + (p === this.activeProvider ? ' active' : '');
            const hasKey = !!this.s.apiKeyValues[PROVIDER_KEY[p]];
            const label = document.createElement('span');
            label.textContent = PROVIDER_TAB[p] || p;
            tab.appendChild(label);
            if (!hasKey && p !== this.activeProvider) {
                const dot = document.createElement('span');
                dot.className = 'tab-dot';
                tab.appendChild(dot);
            }
            tab.addEventListener('click', () => {
                this.activeProvider = p;
                this.editingKey = false;
                this.render();
            });
            this.tabsEl.appendChild(tab);
        });
    }

    /* ---------- 页体：密钥位置随状态变化 ---------- */
    renderBody() {
        const s = this.s, p = this.activeProvider;
        const wrap = this.scrollEl;
        wrap.innerHTML = '';
        if (!p) return;

        const keyId = PROVIDER_KEY[p];
        const meta = keyId ? s.keyMeta(keyId) : null;
        const hasKey = !!(keyId && s.apiKeyValues[keyId]);

        const sectionLabel = text => {
            const d = document.createElement('div');
            d.className = 'mp-section-label';
            d.textContent = text;
            return d;
        };

        // 未配密钥：置顶就地填写
        if (keyId && !hasKey) {
            wrap.appendChild(this.buildKeyFillCard(keyId, meta, `先填 ${PROVIDER_TAB[p]} 密钥才能使用`));
        }

        // 当前模型卡（仅当当前模型属于该厂商）
        const current = (s.currentModel && (s.currentModel.provider || 'other') === p) ? s.currentModel : null;
        if (current) {
            wrap.appendChild(sectionLabel('当前模型'));
            wrap.appendChild(this.buildCurrentCard(current, hasKey));
        }

        // 全部模型
        wrap.appendChild(sectionLabel('全部模型'));
        wrap.appendChild(this.buildModelRows(p));

        // 已配密钥：沉底行（「修改」原地换成填写卡）
        if (keyId && hasKey) {
            if (this.editingKey) {
                const card = this.buildKeyFillCard(keyId, meta, `修改 ${PROVIDER_TAB[p]} 密钥`, s.apiKeyValues[keyId]);
                card.style.marginTop = 'auto';
                card.style.marginBottom = '0';
                wrap.appendChild(card);
            } else {
                wrap.appendChild(this.buildKeyBottomRow(keyId, p));
            }
        }

        const pad = document.createElement('div');
        pad.className = 'mp-bottom-pad';
        wrap.appendChild(pad);
    }

    buildKeyFillCard(keyId, meta, title, prefill = '') {
        const card = document.createElement('div');
        card.className = 'key-fill-card';
        card.innerHTML = `
            <div class="key-fill-head">
                <i class="fas fa-key"></i>
                <span class="key-fill-head-title"></span>
                <a href="${meta.url}" target="_blank">如何获取 <i class="fas fa-arrow-up-right-from-square" style="font-size:9px"></i></a>
            </div>
            <div class="key-fill-row">
                <input type="password" placeholder="sk-…" autocomplete="off" />
                <button class="btn btn-primary">保存</button>
            </div>`;
        card.querySelector('.key-fill-head-title').textContent = title;
        const input = card.querySelector('input');
        input.value = prefill;
        card.querySelector('.btn').addEventListener('click', async () => {
            const v = input.value.trim();
            const had = !!this.s.apiKeyValues[keyId];
            // 空值保存 = 清除该密钥（重置）；缺钥填写场景下空值无意义，仍给提示
            if (!v && !had) { window.uiManager?.showToast('先粘贴密钥再保存', 'warning'); return; }
            this.editingKey = false;
            await this.s.saveApiKey(keyId, v); // change 事件触发重渲
        });
        return card;
    }

    buildCurrentCard(m, hasKey) {
        const s = this.s;
        const card = document.createElement('div');
        card.className = 'current-model-card ' + (hasKey ? 'usable' : 'nokey');
        card.innerHTML = `
            <div class="cm-head">
                <div class="cm-info">
                    <div class="cm-name"></div>
                </div>
                <i class="fas ${hasKey ? 'fa-circle-check' : 'fa-key'}"></i>
            </div>`;
        card.querySelector('.cm-name').textContent = m.display_name;

        const tiers = s.tiersOf(m);
        if (tiers.length > 1) {
            const seg = document.createElement('div');
            seg.className = 'segmented';
            const cur = s.currentTier();
            tiers.forEach(t => {
                const opt = document.createElement('button');
                opt.className = 'segmented-option' + (t === cur ? ' active' : '');
                opt.textContent = TIER_INFO[t]?.label || t;
                opt.addEventListener('click', () => s.setTier(t));
                seg.appendChild(opt);
            });
            card.appendChild(seg);
        }
        return card;
    }

    buildModelRows(p) {
        const s = this.s;
        const list = document.createElement('div');
        list.className = 'mp-model-list';
        s.models.filter(m => (m.provider || 'other') === p).forEach(m => {
            const isCur = m.id === s.currentModelId;
            const row = document.createElement('button');
            row.className = 'mp-model-row' + (isCur ? ' current' : '');
            const name = document.createElement('span');
            name.className = 'mp-model-row-name';
            name.textContent = m.display_name;
            row.appendChild(name);
            if (isCur) {
                const check = document.createElement('i');
                check.className = 'fas fa-check';
                row.appendChild(check);
            } else {
                const meta = document.createElement('span');
                meta.className = 'mp-model-row-meta';
                meta.textContent = '支持 ' + s.tiersOf(m).map(t => TIER_INFO[t]?.label || t).join('/');
                row.appendChild(meta);
            }
            row.addEventListener('click', () => s.selectModel(m.id)); // 选择即生效
            list.appendChild(row);
        });
        return list;
    }

    buildKeyBottomRow(keyId, p) {
        const row = document.createElement('div');
        row.className = 'key-bottom-row';
        row.innerHTML = `
            <i class="fas fa-key"></i>
            <span class="key-bottom-text"><span class="kb-label"></span> <span class="key-mask"></span></span>
            <button class="key-bottom-edit">修改</button>`;
        row.querySelector('.kb-label').textContent = `${PROVIDER_TAB[p]} 密钥已配置`;
        row.querySelector('.key-mask').textContent = this.s.maskKey(this.s.apiKeyValues[keyId]);
        row.querySelector('.key-bottom-edit').addEventListener('click', () => {
            this.editingKey = true;
            this.render();
        });
        return row;
    }

    /* ---------- 首连引导：step0 机制说明 → 直接进模型页配置 ---------- */
    openOnboarding() {
        return Sheets.open({
            name: 'onboarding',
            dismissible: false,
            build: (body, ctl) => {
                const wrap = document.createElement('div');
                wrap.className = 'onboarding-step';
                wrap.innerHTML = `
                    <div class="step-icon"><i class="fas fa-arrows-left-right"></i></div>
                    <h2 class="sheet-title">它是这样工作的</h2>
                    <p>你在<b>手机</b>上点一下 → <b>电脑</b>自动截取它自己的整个屏幕 → 图片回传到手机，你框住题目交给 AI。<br><br>手机是你查看电脑屏幕的窗口。</p>`;
                const btn = document.createElement('button');
                btn.className = 'btn btn-primary';
                btn.textContent = '知道了，去选模型';
                btn.addEventListener('click', () => {
                    localStorage.setItem('onboarded', '1');
                    ctl.close();
                    this.open({ focusKey: true });
                });
                wrap.appendChild(btn);
                body.appendChild(wrap);
            }
        });
    }
}

window.ModelPage = ModelPage;
