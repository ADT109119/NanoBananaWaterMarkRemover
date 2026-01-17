/**
 * i18n - 國際化模組
 * 支援 18 種語言的翻譯功能
 * 
 * 支援兩種模式：
 * 1. HTTP Server 模式: 動態載入 locales/*.json
 * 2. file:// 模式: 使用內嵌的預設翻譯
 */

// ===== 語言配置 =====
const LANGUAGES = {
    'zh-TW': { name: '繁體中文', nativeName: '繁體中文', dir: 'ltr' },
    'zh-CN': { name: 'Simplified Chinese', nativeName: '简体中文', dir: 'ltr' },
    'en': { name: 'English', nativeName: 'English', dir: 'ltr' },
    'ja': { name: 'Japanese', nativeName: '日本語', dir: 'ltr' },
    'ko': { name: 'Korean', nativeName: '한국어', dir: 'ltr' },
    'es': { name: 'Spanish', nativeName: 'Español', dir: 'ltr' },
    'fr': { name: 'French', nativeName: 'Français', dir: 'ltr' },
    'de': { name: 'German', nativeName: 'Deutsch', dir: 'ltr' },
    'it': { name: 'Italian', nativeName: 'Italiano', dir: 'ltr' },
    'pt': { name: 'Portuguese', nativeName: 'Português', dir: 'ltr' },
    'ru': { name: 'Russian', nativeName: 'Русский', dir: 'ltr' },
    'ar': { name: 'Arabic', nativeName: 'العربية', dir: 'rtl' },
    'hi': { name: 'Hindi', nativeName: 'हिन्दी', dir: 'ltr' },
    'th': { name: 'Thai', nativeName: 'ภาษาไทย', dir: 'ltr' },
    'vi': { name: 'Vietnamese', nativeName: 'Tiếng Việt', dir: 'ltr' },
    'id': { name: 'Indonesian', nativeName: 'Bahasa Indonesia', dir: 'ltr' },
    'nl': { name: 'Dutch', nativeName: 'Nederlands', dir: 'ltr' },
    'pl': { name: 'Polish', nativeName: 'Polski', dir: 'ltr' }
};

// ===== 內嵌預設翻譯 (file:// fallback) =====
const EMBEDDED_TRANSLATIONS = {
    'zh-TW': {
        title: 'Gemini Nano Banana 浮水印移除工具',
        subtitle: '使用 Reverse Alpha Blending 技術 <strong>無損</strong>移除浮水印· 純前端計算',
        metaDescription: '使用 Reverse Alpha Blending 技術移除 Nano Banana 浮水印的純前端工具',
        blog: 'Blog', toggleTheme: '切換主題',
        dropText: '拖放圖片到這裡，或點擊選擇檔案',
        dropHint: '支援 PNG、JPG 格式，可批次上傳',
        step1Title: '上傳圖片', step1Desc: '拖放或點擊選擇帶有浮水印的圖片',
        step2Title: '自動處理', step2Desc: '系統自動偵測並移除浮水印',
        step3Title: '下載結果', step3Desc: '預覽並下載處理完成的圖片',
        processing: '處理中...', processingFile: '處理中: {filename}', completed: '處理完成',
        results: '處理結果', clearAll: '清除全部', downloadAll: '下載全部', download: '下載',
        badgeSuccess: '✓ 完成', badgeNoWatermark: '⚠ 未偵測到浮水印', originalImage: '原圖',
        privacyNote: '所有處理皆在瀏覽器本地完成，圖片不會上傳至伺服器',
        madeBy: 'Made by The walking fish 步行魚', detailInfo: '詳細資訊',
        versionInfo: '版本資訊', license: '授權條款',
        lightboxHint: '點擊圖片切換 原圖 / 處理後', processed: '處理後', original: '原圖',
        toastSuccess: '處理完成：{count} 張圖片已處理',
        toastPartial: '處理完成：{success} 張成功，{fail} 張失敗',
        language: '語言'
    },
    'en': {
        title: 'Gemini Nano Banana Watermark Remover',
        subtitle: 'Remove watermarks <strong>losslessly</strong> using Reverse Alpha Blending · Client-side processing',
        metaDescription: 'A client-side tool for removing Nano Banana watermarks using Reverse Alpha Blending technology',
        blog: 'Blog', toggleTheme: 'Toggle Theme',
        dropText: 'Drag & drop images here, or click to select files',
        dropHint: 'Supports PNG, JPG formats. Batch upload available',
        step1Title: 'Upload Images', step1Desc: 'Drag & drop or click to select watermarked images',
        step2Title: 'Auto Process', step2Desc: 'System automatically detects and removes watermarks',
        step3Title: 'Download Results', step3Desc: 'Preview and download processed images',
        processing: 'Processing...', processingFile: 'Processing: {filename}', completed: 'Completed',
        results: 'Results', clearAll: 'Clear All', downloadAll: 'Download All', download: 'Download',
        badgeSuccess: '✓ Done', badgeNoWatermark: '⚠ No watermark detected', originalImage: 'Original',
        privacyNote: 'All processing is done locally in your browser. Images are never uploaded',
        madeBy: 'Made by The walking fish', detailInfo: 'Details',
        versionInfo: 'Version Info', license: 'License',
        lightboxHint: 'Click image to toggle Original / Processed', processed: 'Processed', original: 'Original',
        toastSuccess: 'Completed: {count} images processed',
        toastPartial: 'Completed: {success} succeeded, {fail} failed',
        language: 'Language'
    }
};

// ===== i18n State =====
let currentLanguage = 'zh-TW';
const loadedTranslations = {};
let isFileProtocol = window.location.protocol === 'file:';

// ===== i18n Functions =====

/**
 * 獲取當前語言
 */
function getCurrentLanguage() {
    return currentLanguage;
}

/**
 * 載入語言翻譯檔案
 */
async function loadTranslation(lang) {
    // 已載入則直接返回
    if (loadedTranslations[lang]) {
        return loadedTranslations[lang];
    }
    
    // file:// 協議使用內嵌翻譯
    if (isFileProtocol) {
        if (EMBEDDED_TRANSLATIONS[lang]) {
            loadedTranslations[lang] = EMBEDDED_TRANSLATIONS[lang];
            return loadedTranslations[lang];
        }
        // 不支援的語言使用 zh-TW
        loadedTranslations[lang] = EMBEDDED_TRANSLATIONS['zh-TW'];
        return loadedTranslations[lang];
    }
    
    // HTTP 模式: 從 JSON 檔案載入
    try {
        const response = await fetch(`locales/${lang}.json`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        loadedTranslations[lang] = await response.json();
        return loadedTranslations[lang];
    } catch (error) {
        console.warn(`Failed to load ${lang}, using fallback`);
        // 使用內嵌翻譯作為 fallback
        if (EMBEDDED_TRANSLATIONS[lang]) {
            loadedTranslations[lang] = EMBEDDED_TRANSLATIONS[lang];
        } else if (EMBEDDED_TRANSLATIONS['zh-TW']) {
            loadedTranslations[lang] = EMBEDDED_TRANSLATIONS['zh-TW'];
        }
        return loadedTranslations[lang] || {};
    }
}

/**
 * 獲取瀏覽器語言並匹配支援的語言
 */
function detectBrowserLanguage() {
    const browserLang = navigator.language || navigator.userLanguage;
    if (LANGUAGES[browserLang]) return browserLang;
    
    const primaryLang = browserLang.split('-')[0];
    if (LANGUAGES[primaryLang]) return primaryLang;
    
    if (primaryLang === 'zh') {
        return browserLang.includes('CN') || browserLang.includes('Hans') ? 'zh-CN' : 'zh-TW';
    }
    return 'zh-TW';
}

/**
 * 設定語言
 */
async function setLanguage(lang) {
    if (!LANGUAGES[lang]) {
        console.warn(`Language '${lang}' is not supported`);
        return;
    }
    
    await loadTranslation(lang);
    currentLanguage = lang;
    localStorage.setItem('language', lang);
    
    document.documentElement.setAttribute('dir', LANGUAGES[lang].dir);
    document.documentElement.setAttribute('lang', lang);
    
    applyTranslations();
    updateLanguageSelector();
    
    console.log(`🌍 Language: ${LANGUAGES[lang].nativeName}`);
}

/**
 * 翻譯函數
 */
function translate(key, params = {}) {
    const translations = loadedTranslations[currentLanguage] || EMBEDDED_TRANSLATIONS['zh-TW'];
    const fallback = EMBEDDED_TRANSLATIONS['zh-TW'];
    let text = translations[key] || fallback[key] || key;
    
    for (const [param, value] of Object.entries(params)) {
        text = text.replace(`{${param}}`, value);
    }
    return text;
}

const t = translate;

/**
 * 應用翻譯到所有 data-i18n 元素
 */
function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const text = translate(key);
        if (text.includes('<')) el.innerHTML = text;
        else el.textContent = text;
    });
    
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        el.placeholder = translate(el.getAttribute('data-i18n-placeholder'));
    });
    
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        el.title = translate(el.getAttribute('data-i18n-title'));
    });
    
    document.title = translate('title');
    
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute('content', translate('metaDescription'));
    
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute('content', translate('title'));
    
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.setAttribute('content', translate('metaDescription'));
}

/**
 * 更新語言選擇器顯示
 */
function updateLanguageSelector() {
    const langBtn = document.getElementById('langToggle');
    if (langBtn) {
        const span = langBtn.querySelector('.current-lang');
        if (span) span.textContent = LANGUAGES[currentLanguage].nativeName;
    }
}

/**
 * 初始化 i18n
 */
async function initI18n() {
    const savedLang = localStorage.getItem('language');
    const lang = savedLang || detectBrowserLanguage();
    currentLanguage = LANGUAGES[lang] ? lang : 'zh-TW';
    
    // 載入翻譯
    await loadTranslation(currentLanguage);
    if (currentLanguage !== 'zh-TW') {
        await loadTranslation('zh-TW'); // 載入 fallback
    }
    
    document.documentElement.setAttribute('dir', LANGUAGES[currentLanguage].dir);
    document.documentElement.setAttribute('lang', currentLanguage);
    
    applyTranslations();
    setupLanguageSelector();
    
    const mode = isFileProtocol ? '(file://)' : '(HTTP)';
    console.log(`🌍 i18n initialized ${mode}: ${LANGUAGES[currentLanguage].nativeName}`);
}

/**
 * 設置語言選擇器事件
 */
function setupLanguageSelector() {
    const langToggle = document.getElementById('langToggle');
    const langDropdown = document.getElementById('langDropdown');
    
    if (!langToggle || !langDropdown) return;
    
    updateLanguageSelector();
    
    langToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        langDropdown.classList.toggle('show');
    });
    
    langDropdown.querySelectorAll('.lang-option').forEach(option => {
        option.addEventListener('click', (e) => {
            e.stopPropagation();
            setLanguage(option.getAttribute('data-lang'));
            langDropdown.classList.remove('show');
        });
    });
    
    document.addEventListener('click', () => langDropdown.classList.remove('show'));
}

// 自動初始化
document.addEventListener('DOMContentLoaded', initI18n);
