class I18nManager {
    constructor() {
        this.translations = {};
        this.currentLang = 'en';
    }

    async setLanguage(lang) {
        if (!lang) lang = 'en';
        if (this.translations[lang]) {
            this.currentLang = lang;
            this.translatePage();
            return;
        }
        try {
            const response = await fetch(`/static/locales/${lang}.json`);
            if (!response.ok) throw new Error(`Language file not found for ${lang}`);
            this.translations[lang] = await response.json();
            this.currentLang = lang;
            this.translatePage();
        } catch (error) {
            console.error(`Could not load language: ${lang}`, error);
            if (lang !== 'en') {
                await this.setLanguage('en');
            }
        }
    }

    t(key, options = {}) {
        const keys = key.split('.');
        let text = this.translations[this.currentLang] || this.translations['en'] || {};
        for (const k of keys) {
            if (text === undefined) return key;
            text = text[k];
        }

        if (text === undefined) return key;

        if (typeof text === 'string') {
            return text.replace(/\{\{(\w+)\}\}/g, (_, varName) => options[varName] || `{{${varName}}}`);
        }
        return text;
    }

    translatePage() {
        document.querySelectorAll('[data-i18n]').forEach(element => {
            const key = element.getAttribute('data-i18n');
            element.textContent = this.t(key);
        });
        document.querySelectorAll('[data-i18n-title]').forEach(element => {
            const key = element.getAttribute('data-i18n-title');
            element.title = this.t(key);
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
            const key = element.getAttribute('data-i18n-placeholder');
            element.placeholder = this.t(key);
        });
    }
}

const i18n = new I18nManager();
const t = i18n.t.bind(i18n);
window.i18n = i18n;

document.addEventListener('DOMContentLoaded', () => {
    const settings = JSON.parse(localStorage.getItem('snapSolverSettings') || '{}');
    let lang = settings.language || 'en';

    if (lang.length > 2) {
        const langMap = { english: 'en', chinese: 'zh', spanish: 'es', french: 'fr', german: 'de' };
        lang = langMap[lang.toLowerCase()] || 'en';
    }

    i18n.setLanguage(lang);
});