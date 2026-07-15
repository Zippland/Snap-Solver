/* ============================================================
   SettingsManager — 纯数据层（单一真源）
   models / api keys / prompts / 中转 / 代理 / 语言 / 本地偏好
   全部驻内存，变更即持久化（localStorage 或后端 REST），并通过
   CustomEvent('change', {detail:{type}}) 广播；
   UI 渲染在 model-page.js（模型）与 settings-page.js（设置）。
   对外契约：ready(Promise) / getSettings() / collectApiKeys() /
            missingKeyForCurrentModel() / selectModel() / setTier() /
            currentTier() / saveApiKey() / maybeStartOnboarding()
   ============================================================ */

const KEY_META = {
    AnthropicApiKey: { label: 'Anthropic API Key', url: 'https://console.anthropic.com/' },
    OpenaiApiKey:    { label: 'OpenAI API Key', url: 'https://platform.openai.com/api-keys' },
    AlibabaApiKey:   { label: '阿里 DashScope API Key', url: 'https://bailian.console.aliyun.com/' },
    GoogleApiKey:    { label: 'Google Gemini API Key', url: 'https://aistudio.google.com/apikey' },
    DoubaoApiKey:    { label: '豆包（火山方舟）API Key', url: 'https://console.volcengine.com/ark' },
    MoonshotApiKey:  { label: 'Moonshot (Kimi) API Key', url: 'https://platform.moonshot.cn/console/api-keys' },
};

const PROVIDER_KEY = {
    anthropic: 'AnthropicApiKey',
    openai: 'OpenaiApiKey',
    alibaba: 'AlibabaApiKey',
    google: 'GoogleApiKey',
    doubao: 'DoubaoApiKey',
    moonshot: 'MoonshotApiKey',
};

const PROVIDER_LABEL = { anthropic: 'Anthropic', openai: 'OpenAI', google: 'Google', alibaba: '阿里通义', doubao: '字节豆包', moonshot: 'Kimi (Moonshot)' };
// 厂商 Tab / 行短名
const PROVIDER_TAB = { anthropic: 'Anthropic', openai: 'OpenAI', google: 'Google', alibaba: '通义', doubao: '豆包', moonshot: 'Kimi' };

// 三档展示名（英文短名，内部值仍为 fast/deep/max）
const TIER_INFO = {
    fast: { label: 'Fast' },
    deep: { label: 'High' },
    max:  { label: 'Max' },
};

// 随仓库分发的内置提示词 id（用于设置页 内置/自建 分组，内置不可删）
const BUILTIN_PROMPT_IDS = ['a_default', 'default', 'single_choice', 'multiple_choice', 'programming', 'ACM_hard', 'pattern_reasoning', 'chart_calculation'];

// 开源仓库（主页页脚与设置页共用的单一出处）
const REPO = { name: 'Zippland/Snap-Solver', url: 'https://github.com/Zippland/Snap-Solver' };

class SettingsManager extends EventTarget {
    constructor() {
        super();
        this.apiKeyValues = {};
        this.models = [];
        this.currentModel = null;
        this.currentModelId = null;
        this._tier = 'deep';     // 思考档位全局统一，按模型能力钳制
        this.prompts = {};
        this.currentPromptId = null;
        this.relayApis = {};     // {provider: url} 中转地址
        this._language = '中文';
        this._proxyEnabled = false;
        this._proxyHost = '127.0.0.1';
        this._proxyPort = 4780;
        this.ready = this.init();
    }

    async init() {
        try {
            Object.keys(KEY_META).forEach(k => { this.apiKeyValues[k] = ''; });
            await Promise.all([this.loadApiKeys(), this.loadModels(), this.loadPrompts(), this.loadRelay()]);
            this.restoreLocalPrefs();
            this.renderVersion();
        } catch (e) {
            console.error('SettingsManager init failed', e);
        }
    }

    /* ---------- 加载 ---------- */
    async loadApiKeys() {
        try {
            const keys = await (await fetch('/api/keys')).json();
            Object.keys(KEY_META).forEach(k => { this.apiKeyValues[k] = keys[k] || ''; });
        } catch (e) { console.warn('load keys failed', e); }
    }
    async loadModels() {
        try { this.models = await (await fetch('/api/models')).json(); }
        catch (e) { this.models = []; }
    }
    async loadPrompts() {
        try { this.prompts = await (await fetch('/api/prompts')).json(); }
        catch (e) { this.prompts = {}; }
    }
    async loadRelay() {
        try {
            const cfg = await (await fetch('/api/proxy-api')).json();
            this.relayApis = (cfg && cfg.apis) || {};
        } catch (e) { this.relayApis = {}; }
    }

    /* ---------- 本地偏好 ---------- */
    restoreLocalPrefs() {
        let saved = {};
        try { saved = JSON.parse(localStorage.getItem('snapSettings') || '{}'); } catch (e) {}
        this._tier = ['fast', 'deep', 'max'].includes(saved.tier) ? saved.tier : 'deep';
        this.currentPromptId = (saved.promptId && this.prompts[saved.promptId]) ? saved.promptId : (Object.keys(this.prompts)[0] || null);
        this._language = saved.language || '中文';
        this._proxyEnabled = !!saved.proxyEnabled;
        this._proxyHost = saved.proxyHost || '127.0.0.1';
        this._proxyPort = parseInt(saved.proxyPort || 4780, 10);
        this.currentModel = this.models.find(m => m.id === saved.model) || this.models[0] || null;
        this.currentModelId = this.currentModel ? this.currentModel.id : null;
    }

    persist() {
        localStorage.setItem('snapSettings', JSON.stringify({
            model: this.currentModelId,
            tier: this._tier,
            promptId: this.currentPromptId,
            language: this._language,
            proxyEnabled: this._proxyEnabled,
            proxyHost: this._proxyHost,
            proxyPort: this._proxyPort,
        }));
    }

    emitChange(type) { this.dispatchEvent(new CustomEvent('change', { detail: { type } })); }

    /* ---------- 模型 / 档位 ---------- */
    selectModel(id) {
        const m = this.models.find(x => x.id === id);
        if (!m) return;
        this.currentModelId = id;
        this.currentModel = m;
        this.persist();
        this.emitChange('model');
    }

    tiersOf(model) { return (model && model.reasoning_tiers) || ['fast']; }

    // 全局档位按当前模型能力钳制：不支持时回退默认档，再回退首个可用档
    currentTier() {
        const m = this.currentModel;
        if (!m) return this._tier;
        const tiers = this.tiersOf(m);
        if (tiers.includes(this._tier)) return this._tier;
        return (m.default_tier && tiers.includes(m.default_tier)) ? m.default_tier : tiers[0];
    }

    setTier(tier) {
        if (!this.currentModel || !this.tiersOf(this.currentModel).includes(tier)) return;
        this._tier = tier;
        this.persist();
        this.emitChange('tier');
    }

    /* ---------- 密钥 ---------- */
    providerOf(model) { return model ? model.provider : null; }
    keyIdOf(model) { return PROVIDER_KEY[this.providerOf(model)] || null; }
    keyMeta(keyId) { return KEY_META[keyId]; }
    hasKeyFor(model) {
        const keyId = this.keyIdOf(model);
        return !!(keyId && this.apiKeyValues[keyId]);
    }
    hasAnyModelKey() { return Object.values(PROVIDER_KEY).some(k => !!this.apiKeyValues[k]); }

    /** 厂商展示顺序：已配密钥的在前、未配的在后，两块内部各自保持基础排序
        （基础排序 = models.json 中厂商首次出现的顺序） */
    providersOrdered() {
        const base = [];
        this.models.forEach(m => {
            const p = m.provider || 'other';
            if (!base.includes(p)) base.push(p);
        });
        if (!base.length) base.push(...Object.keys(PROVIDER_KEY));
        const configured = base.filter(p => !!this.apiKeyValues[PROVIDER_KEY[p]]);
        const rest = base.filter(p => !this.apiKeyValues[PROVIDER_KEY[p]]);
        return [...configured, ...rest];
    }
    keyStats() {
        const ids = Object.values(PROVIDER_KEY);
        return { set: ids.filter(k => !!this.apiKeyValues[k]).length, total: ids.length };
    }

    missingKeyForCurrentModel() {
        const keyId = this.keyIdOf(this.currentModel);
        if (keyId && !this.apiKeyValues[keyId]) return KEY_META[keyId].label;
        return null;
    }

    async saveApiKey(keyId, value) {
        this.apiKeyValues[keyId] = value;
        try {
            await fetch('/api/keys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [keyId]: value })
            });
            const provider = Object.keys(PROVIDER_KEY).find(p => PROVIDER_KEY[p] === keyId);
            window.uiManager?.showToast(`${PROVIDER_TAB[provider] || ''} 密钥${value ? '已保存' : '已清除'}`, 'success');
        } catch (e) {
            window.uiManager?.showToast('密钥保存失败，请重试', 'error');
        }
        this.emitChange('keys');
    }

    collectApiKeys() {
        const out = {};
        Object.keys(this.apiKeyValues).forEach(k => { if (this.apiKeyValues[k]) out[k] = this.apiKeyValues[k]; });
        return out;
    }

    /* 密钥掩码显示：sk-ant-…9f2 */
    maskKey(v) {
        if (!v) return '';
        return v.length > 12 ? v.slice(0, 7) + '…' + v.slice(-3) : '已设置';
    }

    /* ---------- 语言 / 代理（内存 + 持久化） ---------- */
    setLanguage(lang) {
        this._language = (lang || '').trim() || '中文';
        this.persist();
        this.emitChange('general');
    }
    setProxy({ enabled, host, port } = {}) {
        if (enabled !== undefined) this._proxyEnabled = !!enabled;
        if (host !== undefined) this._proxyHost = host || '127.0.0.1';
        if (port !== undefined) this._proxyPort = parseInt(port || 4780, 10);
        this.persist();
        this.emitChange('network');
    }

    /* ---------- 中转地址（填了即走中转） ---------- */
    async setRelay(provider, url) {
        this.relayApis[provider] = (url || '').trim();
        const enabled = Object.values(this.relayApis).some(v => !!v);
        try {
            await fetch('/api/proxy-api', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apis: this.relayApis, enabled })
            });
            window.uiManager?.showToast('中转地址已保存', 'success');
        } catch (e) {
            window.uiManager?.showToast('保存失败，请重试', 'error');
        }
        this.emitChange('network');
    }
    relayCount() { return Object.values(this.relayApis).filter(v => !!v).length; }

    /* ---------- 提示词 ---------- */
    isBuiltinPrompt(id) { return BUILTIN_PROMPT_IDS.includes(id); }

    selectPrompt(id) {
        if (!this.prompts[id]) return;
        this.currentPromptId = id;
        this.persist();
        this.emitChange('prompts');
    }

    async savePrompt(data) {
        await fetch('/api/prompts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        this.prompts[data.id] = { name: data.name, description: data.description, content: data.content };
        this.currentPromptId = data.id;
        this.persist();
        this.emitChange('prompts');
    }

    async deletePrompt(id) {
        await fetch('/api/prompts/' + encodeURIComponent(id), { method: 'DELETE' });
        delete this.prompts[id];
        if (this.currentPromptId === id) this.currentPromptId = Object.keys(this.prompts)[0] || null;
        this.persist();
        this.emitChange('prompts');
    }

    /* ---------- main.js 契约：getSettings ---------- */
    getSettings() {
        const m = this.currentModel;
        const prompt = this.prompts[this.currentPromptId];
        return {
            model: this.currentModelId,
            modelInfo: m ? { supportsMultimodal: !!m.is_multimodal, isReasoning: !!m.is_reasoning } : {},
            reasoningTier: this.currentTier(),
            systemPrompt: prompt ? prompt.content : '',
            language: this._language,
            proxyEnabled: this._proxyEnabled,
            proxyHost: this._proxyHost,
            proxyPort: this._proxyPort,
        };
    }

    /* ---------- 版本与更新条 ---------- */
    renderVersion() {
        const info = window.SERVER_DATA?.updateInfo;
        this.version = info?.current_version || '';
        if (info?.has_update && document.getElementById('updateBanner')) {
            document.getElementById('updateBannerText').textContent = `新版本 v${info.latest_version || ''} 可用`;
            if (info.release_url) document.getElementById('updateBannerLink').href = info.release_url;
            document.getElementById('updateBanner').classList.remove('hidden');
            document.getElementById('updateBannerClose')?.addEventListener('click', () => document.getElementById('updateBanner').classList.add('hidden'));
        }
    }

    /* ---------- 首连引导（判定在此，渲染在 ModelPage） ---------- */
    maybeStartOnboarding() {
        if (localStorage.getItem('onboarded') === '1') return;
        if (this.hasAnyModelKey()) { localStorage.setItem('onboarded', '1'); return; }
        window.modelPage?.openOnboarding();
    }
}

window.SettingsManager = SettingsManager;
