/**
 * Nano Banana Watermark Remover
 * 使用 Reverse Alpha Blending 技術移除浮水印
 */

// ===== Global State =====
const state = {
    masks: new Map(), // Map<size, {image, canvas, ctx, imageData, margin}>
    processedImages: [],
    isProcessing: false,
    forceRemove: false,
    videoPreviewEnabled: true,
    customMargin: 0, // 0 表示使用預設值
    customOpacity: 0, // 0 表示使用預設值
    // Lightbox state
    lightbox: {
        isOpen: false,
        currentIndex: 0,
        showingOriginal: false
    }
};

// ===== DOM Elements =====
const DOM = {
    dropZone: document.getElementById('dropZone'),
    fileInput: document.getElementById('fileInput'),
    statusBar: document.getElementById('statusBar'),
    statusText: document.getElementById('statusText'),
    statusCount: document.getElementById('statusCount'),
    progressFill: document.getElementById('progressFill'),
    resultsSection: document.getElementById('resultsSection'),
    resultsGrid: document.getElementById('resultsGrid'),
    clearBtn: document.getElementById('clearBtn'),
    downloadAllBtn: document.getElementById('downloadAllBtn'),
    // Modal elements
    infoBtn: document.getElementById('infoBtn'),
    infoModal: document.getElementById('infoModal'),
    modalClose: document.getElementById('modalClose'),
    // GitHub elements
    githubLink: document.getElementById('githubLink'),
    starCount: document.getElementById('starCount'),
    // Lightbox elements
    lightbox: document.getElementById('lightbox'),
    lightboxClose: document.getElementById('lightboxClose'),
    lightboxImage: document.getElementById('lightboxImage'),
    lightboxVideo: document.getElementById('lightboxVideo'),
    lightboxImageContainer: document.getElementById('lightboxImageContainer'),
    lightboxHint: document.getElementById('lightboxHint'),
    lightboxFilename: document.getElementById('lightboxFilename'),
    toggleProcessed: document.getElementById('toggleProcessed'),
    toggleOriginal: document.getElementById('toggleOriginal'),
    lightboxPrev: document.getElementById('lightboxPrev'),
    lightboxNext: document.getElementById('lightboxNext'),
    // Theme toggle
    themeToggle: document.getElementById('themeToggle'),
    // Toast container
    toastContainer: document.getElementById('toastContainer'),
    // Settings
    forceRemoveToggle: document.getElementById('forceRemoveToggle'),
    videoPreviewToggle: document.getElementById('videoPreviewToggle'),
    // Video Preview Modal elements
    videoPreviewModal: document.getElementById('videoPreviewModal'),
    videoPreviewClose: document.getElementById('videoPreviewClose'),
    modalPreviewCanvas: document.getElementById('modalPreviewCanvas'),
    modalMarginSlider: document.getElementById('modalMarginSlider'),
    modalMarginValue: document.getElementById('modalMarginValue'),
    modalOpacitySlider: document.getElementById('modalOpacitySlider'),
    modalOpacityValue: document.getElementById('modalOpacityValue'),
    modalForceRemoveToggle: document.getElementById('modalForceRemoveToggle'),
    modalCancelBtn: document.getElementById('modalCancelBtn'),
    modalConvertBtn: document.getElementById('modalConvertBtn')
};

// ===== Mask Configuration =====
// margin: 浮水印距離右下角的邊距
const MASK_CONFIGS = [
    { size: 96, path: 'assets/mask_96.png', margin: 64 },
    { size: 48, path: 'assets/mask_48.png', margin: 32 }
];

// ===== Web Worker =====
let worker = null;

// ===== Initialize =====
async function init() {
    initTheme();
    initWorker();
    registerServiceWorker();
    await loadMasks();
    setupEventListeners();
    fetchGitHubStars();
    console.log('🍌 Nano Banana Watermark Remover initialized');
}

/**
 * 初始化 Web Worker
 */
function initWorker() {
    if (window.Worker) {
        worker = new Worker('worker.js');
        console.log('🔧 Web Worker initialized');
    } else {
        console.warn('Web Workers not supported, using main thread');
    }
}

/**
 * 註冊 Service Worker (PWA)
 */
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('📱 Service Worker registered'))
            .catch(err => console.warn('Service Worker registration failed:', err));
    }
}

/**
 * 初始化主題設定
 */
function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
    }
    // 如果沒有儲存的主題，則依賴系統偏好 (CSS media query 會處理)
}

/**
 * 切換主題
 */
function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    let newTheme;
    if (currentTheme === 'light') {
        newTheme = 'dark';
    } else if (currentTheme === 'dark') {
        newTheme = 'light';
    } else {
        // 目前跟隨系統，切換到相反
        newTheme = prefersDark ? 'light' : 'dark';
    }
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    console.log(`🌙 Theme changed to: ${newTheme}`);
}

/**
 * 從 shields.io 獲取 GitHub stars
 */
async function fetchGitHubStars() {
    const user = 'ADT109119';
    const repo = 'NanoBananaWaterMarkRemover';
    const url = `https://img.shields.io/github/stars/${user}/${repo}`;
    
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch');
        
        const svgText = await response.text();
        
        // 從 SVG 中提取 star 數字
        // 尋找 textLength 後的數字內容
        const match = svgText.match(/<text[^>]*id="rlink"[^>]*>([^<]+)<\/text>/);
        
        if (match && match[1]) {
            const starCount = match[1].trim();
            if (DOM.starCount) {
                DOM.starCount.textContent = starCount;
            }
            console.log(`⭐ GitHub stars: ${starCount}`);
        }
    } catch (error) {
        console.log('Could not fetch GitHub stars:', error.message);
        // 保持顯示 "--"
    }
}

/**
 * 載入所有 mask 圖片並預處理 alpha 通道
 * mask 是黑底的圖片，白色區域為浮水印，需要提取亮度作為 alpha
 */
async function loadMasks() {
    const loadPromises = MASK_CONFIGS.map(async (config) => {
        try {
            const image = await loadImage(config.path);
            const canvas = document.createElement('canvas');
            canvas.width = image.width;
            canvas.height = image.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(image, 0, 0);
            const rawImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            
            // 預處理：從 RGB 亮度提取 alpha 通道
            // mask 是黑底白字，白色 = 浮水印區域
            const processedData = preprocessMask(rawImageData);
            
            state.masks.set(config.size, {
                image,
                canvas,
                ctx,
                imageData: processedData,
                width: image.width,
                height: image.height,
                margin: config.margin
            });
            
            console.log(`✓ Loaded mask: ${config.size}x${config.size} (margin: ${config.margin}px)`);
        } catch (error) {
            console.error(`✗ Failed to load mask: ${config.path}`, error);
        }
    });
    
    await Promise.all(loadPromises);
}

/**
 * 預處理 mask：從 RGB 亮度提取 alpha 值
 * 輸入：黑底白字的圖片
 * 輸出：RGB 為白色 (255,255,255)，alpha 為亮度值
 * 
 * @param {ImageData} imageData - 原始 mask ImageData
 * @returns {ImageData} 處理後的 ImageData
 */
function preprocessMask(imageData) {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    
    // 創建新的 ImageData
    const processed = new ImageData(width, height);
    const output = processed.data;
    
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        
        // 計算亮度作為 alpha (使用 luminance 公式)
        // 白色 (255,255,255) → alpha = 255
        // 黑色 (0,0,0) → alpha = 0
        const luminance = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        
        // 設置 RGB 為白色（浮水印顏色），alpha 為亮度
        output[i] = 255;     // R - 浮水印是白色
        output[i + 1] = 255; // G
        output[i + 2] = 255; // B
        output[i + 3] = luminance; // Alpha
    }
    
    return processed;
}

/**
 * 載入圖片並返回 Promise
 * @param {string} src - 圖片路徑
 * @returns {Promise<HTMLImageElement>}
 */
function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
        img.src = src;
    });
}

// ===== Event Listeners =====
function setupEventListeners() {
    // Drop zone click
    DOM.dropZone.addEventListener('click', () => DOM.fileInput.click());
    
    // File input change
    DOM.fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            processFiles(Array.from(e.target.files));
        }
    });
    
    // Drag and drop
    DOM.dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        DOM.dropZone.classList.add('drag-over');
    });
    
    DOM.dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        DOM.dropZone.classList.remove('drag-over');
    });
    
    DOM.dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        DOM.dropZone.classList.remove('drag-over');
        
        const files = Array.from(e.dataTransfer.files).filter(file => 
            file.type === 'image/png' || file.type === 'image/jpeg' || file.type.startsWith('video/')
        );
        
        if (files.length > 0) {
            processFiles(files);
        }
    });
    
    // Clear button
    DOM.clearBtn.addEventListener('click', clearResults);
    
    // Download all button
    DOM.downloadAllBtn.addEventListener('click', downloadAll);
    
    // Modal open/close
    if (DOM.infoBtn) {
        DOM.infoBtn.addEventListener('click', openModal);
    }
    if (DOM.modalClose) {
        DOM.modalClose.addEventListener('click', closeModal);
    }
    if (DOM.infoModal) {
        DOM.infoModal.addEventListener('click', (e) => {
            if (e.target === DOM.infoModal) {
                closeModal();
            }
        });
    }
    
    // Close modal on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (state.lightbox.isOpen) {
                closeLightbox();
            } else if (DOM.infoModal && !DOM.infoModal.hidden) {
                closeModal();
            }
        }
        // Lightbox navigation with arrow keys
        if (state.lightbox.isOpen) {
            if (e.key === 'ArrowLeft') {
                navigateLightbox(-1);
            } else if (e.key === 'ArrowRight') {
                navigateLightbox(1);
            } else if (e.key === ' ') {
                e.preventDefault();
                toggleOriginalImage();
            }
        }
    });
    
    // Lightbox event listeners
    if (DOM.lightboxClose) {
        DOM.lightboxClose.addEventListener('click', closeLightbox);
    }
    if (DOM.lightbox) {
        DOM.lightbox.addEventListener('click', (e) => {
            if (e.target === DOM.lightbox) {
                closeLightbox();
            }
        });
    }
    if (DOM.lightboxImageContainer) {
        DOM.lightboxImageContainer.addEventListener('click', toggleOriginalImage);
    }
    if (DOM.toggleProcessed) {
        DOM.toggleProcessed.addEventListener('click', () => showProcessedImage());
    }
    if (DOM.toggleOriginal) {
        DOM.toggleOriginal.addEventListener('click', () => showOriginalImage());
    }
    if (DOM.lightboxPrev) {
        DOM.lightboxPrev.addEventListener('click', () => navigateLightbox(-1));
    }
    if (DOM.lightboxNext) {
        DOM.lightboxNext.addEventListener('click', () => navigateLightbox(1));
    }
    
    // Theme toggle
    if (DOM.themeToggle) {
        DOM.themeToggle.addEventListener('click', toggleTheme);
    }

    // Force remove toggle
    if (DOM.forceRemoveToggle) {
        DOM.forceRemoveToggle.addEventListener('change', (e) => {
            state.forceRemove = e.target.checked;
            console.log(`🔧 Force remove: ${state.forceRemove}`);
            updateAllVideoPreviews();
        });
    }

    // Video conversion preview toggle
    if (DOM.videoPreviewToggle) {
        DOM.videoPreviewToggle.addEventListener('change', (e) => {
            state.videoPreviewEnabled = e.target.checked;
            console.log(`🔧 Video preview enabled: ${state.videoPreviewEnabled}`);
        });
    }

    // Margin slider listener
    const marginSlider = document.getElementById('marginSlider');
    const marginValue = document.getElementById('marginValue');
    if (marginSlider && marginValue) {
        marginSlider.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            state.customMargin = val;
            if (val === 0) {
                marginValue.textContent = typeof translate === 'function' ? translate('auto') : '自動';
            } else {
                marginValue.textContent = `${val} px`;
            }
            console.log(`🔧 Custom margin: ${state.customMargin}`);
            updateAllVideoPreviews();
        });
    }

    // Opacity slider listener
    const opacitySlider = document.getElementById('opacitySlider');
    const opacityValue = document.getElementById('opacityValue');
    if (opacitySlider && opacityValue) {
        opacitySlider.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            state.customOpacity = val;
            if (val === 0) {
                opacityValue.textContent = typeof translate === 'function' ? translate('auto') : '自動';
            } else {
                opacityValue.textContent = `${val}%`;
            }
            console.log(`🔧 Custom opacity: ${state.customOpacity}%`);
            updateAllVideoPreviews();
        });
    }
}

// ===== Modal Functions =====
function openModal() {
    if (DOM.infoModal) {
        DOM.infoModal.hidden = false;
        document.body.style.overflow = 'hidden';
    }
}

function closeModal() {
    if (DOM.infoModal) {
        DOM.infoModal.hidden = true;
        document.body.style.overflow = '';
    }
}

// ===== Lightbox Functions =====

/**
 * 開啟燈箱
 * @param {number} index - 圖片索引
 */
function openLightbox(index) {
    if (!DOM.lightbox || index < 0 || index >= state.processedImages.length) return;
    
    const result = state.processedImages[index];
    if (!result.success) return;
    
    state.lightbox.isOpen = true;
    state.lightbox.currentIndex = index;
    state.lightbox.showingOriginal = false;
    
    updateLightboxImage();
    updateLightboxNav();
    
    DOM.lightbox.hidden = false;
    document.body.style.overflow = 'hidden';
    
    // 重置 toggle 按鈕狀態
    DOM.toggleProcessed.classList.add('active');
    DOM.toggleOriginal.classList.remove('active');
    DOM.lightboxImageContainer.classList.remove('showing-original');
}

/**
 * 關閉燈箱
 */
function closeLightbox() {
    if (!DOM.lightbox) return;
    
    state.lightbox.isOpen = false;
    DOM.lightbox.hidden = true;
    document.body.style.overflow = '';
    
    if (DOM.lightboxVideo) {
        DOM.lightboxVideo.pause();
    }
}

/**
 * 更新燈箱圖片
 */
function updateLightboxImage() {
    const result = state.processedImages[state.lightbox.currentIndex];
    if (!result) return;
    
    const imageUrl = state.lightbox.showingOriginal 
        ? result.originalBlobUrl 
        : result.blobUrl;
    
    if (result.isVideo) {
        DOM.lightboxImage.style.display = 'none';
        DOM.lightboxVideo.style.display = 'block';
        DOM.lightboxVideo.muted = true;
        
        if (DOM.lightboxVideo.src !== imageUrl) {
            const currentTime = DOM.lightboxVideo.currentTime || 0;
            DOM.lightboxVideo.src = imageUrl;
            
            const onMetadata = () => {
                DOM.lightboxVideo.currentTime = currentTime;
                DOM.lightboxVideo.play().catch(e => console.warn('Video play failed:', e));
                DOM.lightboxVideo.removeEventListener('loadedmetadata', onMetadata);
            };
            DOM.lightboxVideo.addEventListener('loadedmetadata', onMetadata);
        } else {
            DOM.lightboxVideo.play().catch(e => console.warn('Video play failed:', e));
        }
    } else {
        DOM.lightboxImage.style.display = 'block';
        DOM.lightboxVideo.style.display = 'none';
        DOM.lightboxVideo.pause();
        
        DOM.lightboxImage.src = imageUrl;
        DOM.lightboxImage.alt = result.filename;
    }
    
    DOM.lightboxFilename.textContent = state.lightbox.showingOriginal 
        ? `${result.originalName} (原圖)`
        : result.filename;
}

/**
 * 更新燈箱導覽按鈕狀態
 */
function updateLightboxNav() {
    if (DOM.lightboxPrev) {
        let hasPrev = false;
        for (let i = state.lightbox.currentIndex - 1; i >= 0; i--) {
            if (state.processedImages[i].success && !state.processedImages[i].isPreview && !state.processedImages[i].isConverting) {
                hasPrev = true;
                break;
            }
        }
        DOM.lightboxPrev.disabled = !hasPrev;
    }
    if (DOM.lightboxNext) {
        let hasNext = false;
        for (let i = state.lightbox.currentIndex + 1; i < state.processedImages.length; i++) {
            if (state.processedImages[i].success && !state.processedImages[i].isPreview && !state.processedImages[i].isConverting) {
                hasNext = true;
                break;
            }
        }
        DOM.lightboxNext.disabled = !hasNext;
    }
}

/**
 * 導覽燈箱
 * @param {number} direction - 方向 (-1: 上一張, 1: 下一張)
 */
function navigateLightbox(direction) {
    const newIndex = state.lightbox.currentIndex + direction;
    
    // 跳過失敗或處理中的檔案
    let targetIndex = newIndex;
    while (targetIndex >= 0 && targetIndex < state.processedImages.length) {
        const item = state.processedImages[targetIndex];
        if (item.success && !item.isPreview && !item.isConverting) {
            break;
        }
        targetIndex += direction;
    }
    
    if (targetIndex >= 0 && targetIndex < state.processedImages.length && state.processedImages[targetIndex].success) {
        state.lightbox.currentIndex = targetIndex;
        state.lightbox.showingOriginal = false;
        
        updateLightboxImage();
        updateLightboxNav();
        
        // 重置 toggle 按鈕
        DOM.toggleProcessed.classList.add('active');
        DOM.toggleOriginal.classList.remove('active');
        DOM.lightboxImageContainer.classList.remove('showing-original');
    }
}

/**
 * 切換顯示原圖/處理後圖片
 */
function toggleOriginalImage() {
    state.lightbox.showingOriginal = !state.lightbox.showingOriginal;
    
    if (state.lightbox.showingOriginal) {
        showOriginalImage();
    } else {
        showProcessedImage();
    }
}

/**
 * 顯示原圖
 */
function showOriginalImage() {
    state.lightbox.showingOriginal = true;
    updateLightboxImage();
    
    DOM.toggleOriginal.classList.add('active');
    DOM.toggleProcessed.classList.remove('active');
    DOM.lightboxImageContainer.classList.add('showing-original');
}

/**
 * 顯示處理後圖片
 */
function showProcessedImage() {
    state.lightbox.showingOriginal = false;
    updateLightboxImage();
    
    DOM.toggleProcessed.classList.add('active');
    DOM.toggleOriginal.classList.remove('active');
    DOM.lightboxImageContainer.classList.remove('showing-original');
}

// ===== Image Processing =====

/**
 * 批次處理圖片
 * @param {File[]} files - 檔案陣列
 */
async function processFiles(files) {
    if (state.isProcessing) return;
    
    state.isProcessing = true;
    showStatus();
    
    let processed = 0;
    const total = files.length;
    
    for (const file of files) {
        updateStatus(typeof translate === 'function' ? translate('processingFile', { filename: file.name }) : `處理中: ${file.name}`, processed, total);
        
        try {
            let result;
            if (file.type.startsWith('video/')) {
                if (state.videoPreviewEnabled) {
                    const previewResult = await createVideoPreview(file);
                    const userConfirmed = await openVideoPreviewModal(previewResult);
                    if (userConfirmed) {
                        const resultId = 'video-' + Math.random().toString(36).substr(2, 9);
                        const initialResult = {
                            id: resultId,
                            filename: file.name,
                            originalName: file.name,
                            success: true,
                            isVideo: true,
                            isConverting: true,
                            progress: 0,
                            width: previewResult.width,
                            height: previewResult.height,
                            file
                        };
                        state.processedImages.push(initialResult);
                        addResultCard(initialResult);
                        
                        const cardIndex = state.processedImages.length - 1;
                        const card = DOM.resultsGrid.querySelector(`.result-card[data-index="${cardIndex}"]`);
                        
                        const finalResult = await processVideo(file, processed, total, card);
                        
                        result = {
                            ...initialResult,
                            ...finalResult,
                            isConverting: false
                        };
                        state.processedImages[cardIndex] = result;
                        updateCard(card, result, cardIndex);
                    } else {
                        processed++;
                        updateProgress(processed / total);
                        continue;
                    }
                } else {
                    const resultId = 'video-' + Math.random().toString(36).substr(2, 9);
                    const initialResult = {
                        id: resultId,
                        filename: file.name,
                        originalName: file.name,
                        success: true,
                        isVideo: true,
                        isConverting: true,
                        progress: 0,
                        width: 0,
                        height: 0,
                        file
                    };
                    state.processedImages.push(initialResult);
                    addResultCard(initialResult);
                    
                    const cardIndex = state.processedImages.length - 1;
                    const card = DOM.resultsGrid.querySelector(`.result-card[data-index="${cardIndex}"]`);
                    
                    const finalResult = await processVideo(file, processed, total, card);
                    
                    result = {
                        ...initialResult,
                        ...finalResult,
                        isConverting: false
                    };
                    state.processedImages[cardIndex] = result;
                    updateCard(card, result, cardIndex);
                }
            } else {
                result = await processImage(file);
                state.processedImages.push(result);
                addResultCard(result);
            }
        } catch (error) {
            console.error(`Error processing ${file.name}:`, error);
            state.processedImages.push({
                filename: file.name,
                error: error.message,
                success: false
            });
            addResultCard({
                filename: file.name,
                error: error.message,
                success: false
            });
        }
        
        processed++;
        updateProgress(processed / total);
    }
    
    updateStatus(typeof translate === 'function' ? translate('completed') : '處理完成', total, total);
    state.isProcessing = false;
    showResults();
    
    // Show completion toast
    const successCount = state.processedImages.filter(r => r.success).length;
    const failCount = state.processedImages.length - successCount;
    if (typeof translate === 'function') {
        if (failCount > 0) {
            showToast(translate('toastPartial', { success: successCount, fail: failCount }), 'warning');
        } else {
            showToast(translate('toastSuccess', { count: successCount }), 'success');
        }
    } else {
        if (failCount > 0) {
            showToast(`處理完成：${successCount} 張成功，${failCount} 張失敗`, 'warning');
        } else {
            showToast(`處理完成：${successCount} 張圖片已處理`, 'success');
        }
    }
    
    // Reset file input
    DOM.fileInput.value = '';
    
    // Hide status after delay
    setTimeout(() => {
        DOM.statusBar.hidden = true;
    }, 2000);
}

/**
 * 處理單張圖片 (使用 Web Worker)
 * @param {File} file - 圖片檔案
 * @returns {Promise<Object>} 處理結果
 */
async function processImage(file) {
    const image = await loadImageFromFile(file);
    
    // 找到合適的 mask
    const mask = selectMask(image.width, image.height);
    if (!mask) {
        throw new Error('找不到合適的 mask');
    }
    
    const activeMargin = state.customMargin > 0 ? state.customMargin : mask.margin;
    const activeOpacityMultiplier = state.customOpacity > 0 ? (state.customOpacity / 100) : 1.0;
    const activeMask = {
        ...mask,
        margin: activeMargin,
        opacityMultiplier: activeOpacityMultiplier
    };
    
    // 創建 canvas 進行處理
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    
    // 保存原圖 Blob (用於燈箱比較)
    const originalBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    
    // 取得原圖 ImageData
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    // 使用 Worker 進行偵測 and 處理
    if (worker) {
        // 偵測是否有浮水印
        const hasWatermark = await detectWatermarkWithWorker(
            imageData.data, 
            mask.imageData.data, 
            mask.width, 
            mask.height, 
            activeMargin, 
            canvas.width, 
            canvas.height
        );
        
        if (!hasWatermark && !state.forceRemove) {
            // 沒有偵測到浮水印，且未開啟強制移除，返回原圖
            return {
                filename: file.name,
                originalName: file.name,
                blob: originalBlob,
                originalBlob: originalBlob,
                width: image.width,
                height: image.height,
                maskSize: mask.width,
                margin: activeMargin,
                success: true,
                noWatermark: true
            };
        }
        
        // 使用 Worker 執行 Reverse Alpha Blending
        const processedData = await processImageWithWorker(
            imageData.data,
            mask.imageData.data,
            mask.width,
            mask.height,
            activeMargin,
            canvas.width,
            canvas.height,
            activeOpacityMultiplier
        );
        
        // 將結果寫回 canvas
        const newImageData = new ImageData(processedData, canvas.width, canvas.height);
        ctx.putImageData(newImageData, 0, 0);
    } else {
        // Fallback: 使用主線程處理
        const hasWatermark = detectWatermark(imageData, activeMask, canvas.width, canvas.height);
        
        if (!hasWatermark && !state.forceRemove) {
            return {
                filename: file.name,
                originalName: file.name,
                blob: originalBlob,
                originalBlob: originalBlob,
                width: image.width,
                height: image.height,
                maskSize: mask.width,
                margin: activeMargin,
                success: true,
                noWatermark: true
            };
        }
        
        reverseAlphaBlend(imageData, activeMask, canvas.width, canvas.height);
        ctx.putImageData(imageData, 0, 0);
    }
    
    // 轉換為 Blob
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    
    // 生成檔案名稱
    const baseName = file.name.replace(/\.[^.]+$/, '');
    const outputFilename = `${baseName}_(watermark removed).png`;
    
    return {
        filename: outputFilename,
        originalName: file.name,
        blob,
        originalBlob,
        width: image.width,
        height: image.height,
        maskSize: mask.width,
        margin: activeMargin,
        success: true,
        noWatermark: false
    };
}

/**
 * 針對局部區域執行 Reverse Alpha Blending (用於影片加速)
 */
function applyReverseAlphaBlendRegion(ctx, mask, imgWidth, imgHeight) {
    const maskWidth = mask.width;
    const maskHeight = mask.height;
    const margin = mask.margin;
    
    const offsetX = imgWidth - maskWidth - margin;
    const offsetY = imgHeight - maskHeight - margin;
    
    if (offsetX < 0 || offsetY < 0) return;
    
    // 僅獲取浮水印區域的像素數據，避免讀取/寫入整張大圖，大幅提升影片處理效能
    const regionData = ctx.getImageData(offsetX, offsetY, maskWidth, maskHeight);
    const pixels = regionData.data;
    const maskPixels = mask.imageData.data;
    
    for (let my = 0; my < maskHeight; my++) {
        for (let mx = 0; mx < maskWidth; mx++) {
            const idx = (my * maskWidth + mx) * 4;
            const multiplier = mask.opacityMultiplier !== undefined ? mask.opacityMultiplier : 1.0;
            const alpha = (maskPixels[idx + 3] / 255) * multiplier;
            
            if (alpha < 0.01) continue;
            
            const wmR = 255, wmG = 255, wmB = 255;
            const compR = pixels[idx];
            const compG = pixels[idx + 1];
            const compB = pixels[idx + 2];
            
            const invAlpha = 1 - alpha;
            if (invAlpha < 0.01) continue;
            
            let origR = (compR - wmR * alpha) / invAlpha;
            let origG = (compG - wmG * alpha) / invAlpha;
            let origB = (compB - wmB * alpha) / invAlpha;
            
            pixels[idx] = Math.max(0, Math.min(255, Math.round(origR)));
            pixels[idx + 1] = Math.max(0, Math.min(255, Math.round(origG)));
            pixels[idx + 2] = Math.max(0, Math.min(255, Math.round(origB)));
        }
    }
    
    ctx.putImageData(regionData, offsetX, offsetY);
}

/**
 * 偵測影片當前畫面是否含有浮水印
 */
function detectWatermarkVideo(video, mask) {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return detectWatermark(imageData, mask, canvas.width, canvas.height);
}

/**
 * 取得瀏覽器支援的影片錄製 MIME 格式
 */
function getSupportedVideoMimeType() {
    const types = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
        'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
        'video/mp4'
    ];
    for (const type of types) {
        if (MediaRecorder.isTypeSupported(type)) {
            return type;
        }
    }
    return '';
}

/**
 * 處理單個影片檔案 (使用 MediaRecorder & Canvas API 實時處理)
 */
async function processVideo(file, processed, total, card = null) {
    const video = document.createElement('video');
    video.src = URL.createObjectURL(file);
    video.muted = true;
    video.playsInline = true;
    video.style.position = 'absolute';
    video.style.width = '0';
    video.style.height = '0';
    video.style.opacity = '0';
    video.style.pointerEvents = 'none';
    document.body.appendChild(video);
    
    await new Promise((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error(typeof translate === 'function' ? translate('errLoadVideo') : '載入影片失敗'));
    });
    
    // 選擇合適的 mask
    const mask = selectMask(video.videoWidth, video.videoHeight);
    if (!mask) {
        document.body.removeChild(video);
        throw new Error('找不到合適的 mask');
    }
    
    // 影片預設使用 72px 邊距以避開播放器控制列，除非使用者有自訂
    const activeMargin = state.customMargin > 0 ? state.customMargin : 72;
    // 影片預設使用 0.6 的透明度倍數，因為其透明度通常比靜態圖片更淡，除非使用者有自訂
    const activeOpacityMultiplier = state.customOpacity > 0 ? (state.customOpacity / 100) : 0.6;
    const activeMask = {
        ...mask,
        margin: activeMargin,
        opacityMultiplier: activeOpacityMultiplier
    };
    
    // 偵測是否含有浮水印
    // 在影片長度的中間或 1 秒處進行偵測，避開開頭黑畫面
    const targetTime = Math.min(1.0, video.duration / 2);
    video.currentTime = targetTime;
    await new Promise(resolve => video.addEventListener('seeked', resolve, { once: true }));
    
    const hasWatermark = detectWatermarkVideo(video, activeMask);
    
    // 重置影片至起點
    video.currentTime = 0;
    await new Promise(resolve => video.addEventListener('seeked', resolve, { once: true }));
    
    if (!hasWatermark && !state.forceRemove) {
        document.body.removeChild(video);
        return {
            filename: file.name,
            originalName: file.name,
            blob: file,
            originalBlob: file,
            width: video.videoWidth,
            height: video.videoHeight,
            maskSize: mask.width,
            margin: activeMargin,
            success: true,
            noWatermark: true,
            isVideo: true
        };
    }
    
    // 建立繪圖 Canvas
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    
    // 建立錄製 Stream 並且抓取音軌 (若有的話)
    const canvasStream = canvas.captureStream(30); // 固定 30 fps 錄製
    const recordStream = new MediaStream();
    recordStream.addTrack(canvasStream.getVideoTracks()[0]);
    
    let audioTrack = null;
    let audioCtx = null;
    let mediaElementSource = null;
    let mediaStreamDestination = null;
    
    try {
        const stream = video.captureStream ? video.captureStream() : video.mozCaptureStream();
        if (stream && stream.getAudioTracks().length > 0) {
            audioTrack = stream.getAudioTracks()[0];
            recordStream.addTrack(audioTrack);
        }
    } catch (e) {
        console.warn('Direct audio capture failed, trying Web Audio API...', e);
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            mediaElementSource = audioCtx.createMediaElementSource(video);
            mediaStreamDestination = audioCtx.createMediaStreamDestination();
            mediaElementSource.connect(mediaStreamDestination);
            audioTrack = mediaStreamDestination.stream.getAudioTracks()[0];
            if (audioTrack) {
                recordStream.addTrack(audioTrack);
            }
        } catch (webAudioError) {
            console.warn('Web Audio API capture also failed:', webAudioError);
        }
    }
    
    const mimeType = getSupportedVideoMimeType();
    const recorder = new MediaRecorder(recordStream, { mimeType });
    const chunks = [];
    
    recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
            chunks.push(e.data);
        }
    };
    
    return new Promise((resolve, reject) => {
        let lastFrameTime = -1;
        let animationFrameId = null;
        let isFinished = false;
        
        const cleanup = () => {
            if (animationFrameId) {
                if (video.cancelVideoFrameCallback) {
                    video.cancelVideoFrameCallback(animationFrameId);
                } else {
                    cancelAnimationFrame(animationFrameId);
                }
            }
            if (audioCtx) {
                audioCtx.close().catch(() => {});
            }
            recordStream.getTracks().forEach(track => track.stop());
            if (video.parentNode) {
                document.body.removeChild(video);
            }
        };
        
        recorder.onstop = () => {
            cleanup();
            const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';
            const baseName = file.name.replace(/\.[^.]+$/, '');
            const outputFilename = `${baseName}_(watermark removed).${extension}`;
            const blob = new Blob(chunks, { type: mimeType });
            
            resolve({
                filename: outputFilename,
                originalName: file.name,
                blob,
                originalBlob: file,
                width: video.videoWidth,
                height: video.videoHeight,
                maskSize: mask.width,
                margin: activeMargin,
                success: true,
                noWatermark: false,
                isVideo: true
            });
        };
        
        video.onerror = () => {
            cleanup();
            reject(new Error(typeof translate === 'function' ? translate('errProcessVideo') : '影片播放或處理錯誤'));
        };
        
        const processFrame = () => {
            if (isFinished || video.paused || video.ended) return;
            
            if (video.currentTime !== lastFrameTime) {
                lastFrameTime = video.currentTime;
                
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                applyReverseAlphaBlendRegion(ctx, activeMask, canvas.width, canvas.height);
                
                const currentRatio = video.currentTime / video.duration;
                updateProgress((processed + currentRatio) / total);
                
                if (card) {
                    const percent = Math.min(99, Math.round(currentRatio * 100));
                    const convertBtn = card.querySelector('.result-convert-btn');
                    if (convertBtn) {
                        convertBtn.innerHTML = `
                            <svg class="spinner" width="14" height="14" viewBox="0 0 50 50" style="animation: spin 1s linear infinite; margin-right: 0.25rem;">
                                <circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" stroke-width="5" stroke-dasharray="80, 200" stroke-dashoffset="0"></circle>
                            </svg>
                            ${percent}%
                        `;
                    }
                }
            }
            
            if (video.requestVideoFrameCallback) {
                animationFrameId = video.requestVideoFrameCallback(processFrame);
            } else {
                animationFrameId = requestAnimationFrame(processFrame);
            }
        };
        
        video.onended = () => {
            if (isFinished) return;
            isFinished = true;
            recorder.stop();
        };
        
        recorder.start();
        video.play().then(() => {
            if (video.requestVideoFrameCallback) {
                animationFrameId = video.requestVideoFrameCallback(processFrame);
            } else {
                animationFrameId = requestAnimationFrame(processFrame);
            }
        }).catch(err => {
            cleanup();
            reject(new Error('無法播放影片: ' + err.message));
        });
    });
}

/**
 * 使用 Worker 偵測浮水印
 */
function detectWatermarkWithWorker(imageData, maskData, maskWidth, maskHeight, margin, imgWidth, imgHeight) {
    return new Promise((resolve) => {
        const handler = (e) => {
            if (e.data.type === 'detectResult') {
                worker.removeEventListener('message', handler);
                console.log(`🔍 Worker detection: diff=${e.data.debug?.brightnessDiff?.toFixed(1)}`);
                resolve(e.data.hasWatermark);
            }
        };
        worker.addEventListener('message', handler);
        
        // 複製數據以避免 transfer 後無法使用
        const imgDataCopy = new Uint8ClampedArray(imageData);
        const maskDataCopy = new Uint8ClampedArray(maskData);
        
        worker.postMessage({
            type: 'detect',
            data: {
                imageData: imgDataCopy,
                maskData: maskDataCopy,
                maskWidth,
                maskHeight,
                margin,
                imgWidth,
                imgHeight
            }
        });
    });
}

/**
 * 使用 Worker 處理圖片
 */
function processImageWithWorker(imageData, maskData, maskWidth, maskHeight, margin, imgWidth, imgHeight, opacityMultiplier) {
    return new Promise((resolve) => {
        const handler = (e) => {
            if (e.data.type === 'processResult') {
                worker.removeEventListener('message', handler);
                resolve(new Uint8ClampedArray(e.data.imageData));
            }
        };
        worker.addEventListener('message', handler);
        
        // 複製數據給 Worker
        const imgDataCopy = new Uint8ClampedArray(imageData);
        const maskDataCopy = new Uint8ClampedArray(maskData);
        
        worker.postMessage({
            type: 'process',
            data: {
                imageData: imgDataCopy,
                maskData: maskDataCopy,
                maskWidth,
                maskHeight,
                margin,
                imgWidth,
                imgHeight,
                opacityMultiplier
            }
        });
    });
}

/**
 * 偵測圖片是否含有浮水印
 * 
 * 原理：浮水印是白色半透明疊加，會使原圖在浮水印區域變亮。
 * 我們檢查 mask 有效區域的平均亮度，如果亮度高於周圍區域，則可能有浮水印。
 * 
 * @param {ImageData} imageData - 圖片 ImageData
 * @param {Object} mask - mask 物件
 * @param {number} imgWidth - 圖片寬度
 * @param {number} imgHeight - 圖片高度
 * @returns {boolean} 是否有浮水印
 */
function detectWatermark(imageData, mask, imgWidth, imgHeight) {
    const imgPixels = imageData.data;
    const maskPixels = mask.imageData.data;
    const maskWidth = mask.width;
    const maskHeight = mask.height;
    const margin = mask.margin;
    
    // 計算 mask 在圖片右下角的位置
    const offsetX = imgWidth - maskWidth - margin;
    const offsetY = imgHeight - maskHeight - margin;
    
    // 確保位置有效
    if (offsetX < 0 || offsetY < 0) {
        return false;
    }
    
    let watermarkBrightness = 0;
    let watermarkPixelCount = 0;
    let surroundingBrightness = 0;
    let surroundingPixelCount = 0;
    
    // 計算浮水印區域的亮度 (只計算 mask alpha > 0 的區域)
    for (let my = 0; my < maskHeight; my++) {
        for (let mx = 0; mx < maskWidth; mx++) {
            const imgX = offsetX + mx;
            const imgY = offsetY + my;
            
            if (imgX < 0 || imgY < 0 || imgX >= imgWidth || imgY >= imgHeight) continue;
            
            const imgIdx = (imgY * imgWidth + imgX) * 4;
            const maskIdx = (my * maskWidth + mx) * 4;
            
            const alpha = maskPixels[maskIdx + 3] / 255;
            
            // 只檢查浮水印實際覆蓋的區域 (alpha > 0.1)
            if (alpha > 0.1) {
                const r = imgPixels[imgIdx];
                const g = imgPixels[imgIdx + 1];
                const b = imgPixels[imgIdx + 2];
                const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
                
                watermarkBrightness += brightness * alpha;
                watermarkPixelCount += alpha;
            }
        }
    }
    
    // 計算 mask 區域左邊和上邊的參考區域亮度
    const sampleSize = Math.min(maskWidth, maskHeight);
    
    // 左側參考區域
    for (let y = offsetY; y < offsetY + maskHeight && y < imgHeight; y++) {
        for (let x = Math.max(0, offsetX - sampleSize); x < offsetX && x >= 0; x++) {
            const imgIdx = (y * imgWidth + x) * 4;
            const r = imgPixels[imgIdx];
            const g = imgPixels[imgIdx + 1];
            const b = imgPixels[imgIdx + 2];
            const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
            
            surroundingBrightness += brightness;
            surroundingPixelCount++;
        }
    }
    
    // 上方參考區域
    for (let y = Math.max(0, offsetY - sampleSize); y < offsetY && y >= 0; y++) {
        for (let x = offsetX; x < offsetX + maskWidth && x < imgWidth; x++) {
            const imgIdx = (y * imgWidth + x) * 4;
            const r = imgPixels[imgIdx];
            const g = imgPixels[imgIdx + 1];
            const b = imgPixels[imgIdx + 2];
            const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
            
            surroundingBrightness += brightness;
            surroundingPixelCount++;
        }
    }
    
    // 計算平均亮度
    const avgWatermarkBrightness = watermarkPixelCount > 0 
        ? watermarkBrightness / watermarkPixelCount 
        : 0;
    const avgSurroundingBrightness = surroundingPixelCount > 0 
        ? surroundingBrightness / surroundingPixelCount 
        : 128;
    
    // 浮水印區域應該比周圍更亮 (因為是白色半透明疊加)
    // 如果浮水印區域亮度比周圍高出一定閾值，則認為有浮水印
    const brightnessDiff = avgWatermarkBrightness - avgSurroundingBrightness;
    const threshold = 10; // 亮度差閾值，調高以減少誤判
    
    console.log(`🔍 Watermark detection: wmBrightness=${avgWatermarkBrightness.toFixed(1)}, surroundingBrightness=${avgSurroundingBrightness.toFixed(1)}, diff=${brightnessDiff.toFixed(1)}`);
    
    return brightnessDiff > threshold;
}

/**
 * 從 File 載入圖片
 * @param {File} file - 圖片檔案
 * @returns {Promise<HTMLImageElement>}
 */
function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(img.src);
            resolve(img);
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = URL.createObjectURL(file);
    });
}

/**
 * 根據圖片尺寸選擇合適的 mask
 * - 長寬都大於 1024：96px mask
 * - 其他：48px mask
 * 
 * @param {number} width - 圖片寬度
 * @param {number} height - 圖片高度
 * @returns {Object|null} mask 物件
 */
function selectMask(width, height) {
    // 當長寬都大於 1024 時，使用 96px mask
    if (width > 1024 && height > 1024) {
        return state.masks.get(96);
    }
    // 其他使用 48px mask
    return state.masks.get(48);
}

/**
 * 執行 Reverse Alpha Blending
 * 
 * 公式：Original = (Composite - Watermark × α) / (1 - α)
 * 
 * @param {ImageData} imageData - 原圖 ImageData
 * @param {Object} mask - mask 物件 (已預處理，alpha 為浮水印強度)
 * @param {number} imgWidth - 圖片寬度
 * @param {number} imgHeight - 圖片高度
 */
function reverseAlphaBlend(imageData, mask, imgWidth, imgHeight) {
    const imgPixels = imageData.data;
    const maskPixels = mask.imageData.data;
    const maskWidth = mask.width;
    const maskHeight = mask.height;
    const margin = mask.margin;
    
    // 計算 mask 在圖片右下角的位置 (考慮邊距)
    const offsetX = imgWidth - maskWidth - margin;
    const offsetY = imgHeight - maskHeight - margin;
    
    // 處理 mask 覆蓋的區域
    for (let my = 0; my < maskHeight; my++) {
        for (let mx = 0; mx < maskWidth; mx++) {
            const imgX = offsetX + mx;
            const imgY = offsetY + my;
            
            // 確保在圖片範圍內
            if (imgX < 0 || imgY < 0 || imgX >= imgWidth || imgY >= imgHeight) continue;
            
            const imgIdx = (imgY * imgWidth + imgX) * 4;
            const maskIdx = (my * maskWidth + mx) * 4;
            
            // 取得 mask 的 alpha 值 (已預處理：亮度 → alpha)
            const multiplier = mask.opacityMultiplier !== undefined ? mask.opacityMultiplier : 1.0;
            const alpha = (maskPixels[maskIdx + 3] / 255) * multiplier;
            
            // 如果 alpha 接近 0，跳過處理 (非浮水印區域)
            if (alpha < 0.01) continue;
            
            // 取得 mask 的 RGB 值 (浮水印顏色，預處理後為白色)
            const wmR = maskPixels[maskIdx];
            const wmG = maskPixels[maskIdx + 1];
            const wmB = maskPixels[maskIdx + 2];
            
            // 取得合成圖的 RGB 值
            const compR = imgPixels[imgIdx];
            const compG = imgPixels[imgIdx + 1];
            const compB = imgPixels[imgIdx + 2];
            
            // Reverse Alpha Blending
            // Original = (Composite - Watermark × α) / (1 - α)
            const invAlpha = 1 - alpha;
            
            // 防止除以零
            if (invAlpha < 0.01) {
                // 完全被浮水印覆蓋，無法還原，保持原樣
                continue;
            }
            
            let origR = (compR - wmR * alpha) / invAlpha;
            let origG = (compG - wmG * alpha) / invAlpha;
            let origB = (compB - wmB * alpha) / invAlpha;
            
            // 限制在 0-255 範圍內
            imgPixels[imgIdx] = Math.max(0, Math.min(255, Math.round(origR)));
            imgPixels[imgIdx + 1] = Math.max(0, Math.min(255, Math.round(origG)));
            imgPixels[imgIdx + 2] = Math.max(0, Math.min(255, Math.round(origB)));
        }
    }
}

// ===== Toast Functions =====

/**
 * 顯示 Toast 通知
 * @param {string} message - 訊息內容
 * @param {string} type - 類型 ('success', 'error', 'warning', 'info')
 * @param {number} duration - 顯示時間 (ms), 預設 3000
 */
function showToast(message, type = 'success', duration = 3000) {
    if (!DOM.toastContainer) return;
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    // 根據類型選擇圖示
    const icons = {
        success: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
        error: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
        warning: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
        info: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
    };
    
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || icons.info}</span>
        <span class="toast-message">${message}</span>
    `;
    
    DOM.toastContainer.appendChild(toast);
    
    // 自動移除
    setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => {
            toast.remove();
        }, 150);
    }, duration);
}

// ===== UI Functions =====

function showStatus() {
    DOM.statusBar.hidden = false;
    DOM.progressFill.style.width = '0%';
}

function updateStatus(text, current, total) {
    DOM.statusText.textContent = text;
    DOM.statusCount.textContent = `${current} / ${total}`;
}

function updateProgress(ratio) {
    DOM.progressFill.style.width = `${ratio * 100}%`;
}

function showResults() {
    if (state.processedImages.length > 0) {
        DOM.resultsSection.hidden = false;
    }
}

function addResultCard(result) {
    const card = document.createElement('div');
    card.className = 'result-card';
    card.style.animationDelay = `${state.processedImages.length * 50}ms`;
    
    const index = state.processedImages.length - 1;
    updateCard(card, result, index);
    
    DOM.resultsGrid.appendChild(card);
}

/**
 * 更新單個卡片的 HTML 內容與事件綁定
 */
/**
 * 更新單個卡片的 HTML 內容與事件綁定
 */
function updateCard(card, result, index) {
    card.innerHTML = '';
    card.setAttribute('data-index', index);
    if (result.id) {
        card.setAttribute('data-id', result.id);
    }
    
    if (!result.success) {
        card.innerHTML = `
            <div class="result-image-container" style="display: flex; align-items: center; justify-content: center;">
                <span style="color: var(--error); font-size: 2rem;">✗</span>
            </div>
            <div class="result-info">
                <div class="result-filename" title="${result.filename}">${result.filename}</div>
                <div class="result-meta">
                    <span class="result-size" style="color: var(--error);">${result.error}</span>
                </div>
            </div>
        `;
        return;
    }
    
    if (result.isConverting) {
        const convertingText = typeof translate === 'function' ? translate('processing') : '處理中...';
        card.innerHTML = `
            <div class="result-image-container" style="display: flex; flex-direction: column; align-items: center; justify-content: center; background: var(--bg-tertiary); gap: 1rem; min-height: 200px;">
                <svg class="spinner" width="40" height="40" viewBox="0 0 50 50" style="color: var(--accent-primary);">
                    <circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" stroke-width="5" stroke-dasharray="80, 200" stroke-dashoffset="0"></circle>
                </svg>
                <span class="convert-progress-text" style="font-weight: 600; color: var(--accent-primary); font-size: 1.125rem;">0%</span>
            </div>
            <div class="result-info">
                <div class="result-filename" title="${result.filename}">${result.filename}</div>
                <div class="result-meta">
                    <span class="result-size">${convertingText}</span>
                </div>
            </div>
        `;
        return;
    }
    
    const blobUrl = result.blobUrl || URL.createObjectURL(result.blob);
    const originalBlobUrl = result.originalBlobUrl || (result.originalBlob ? URL.createObjectURL(result.originalBlob) : blobUrl);
    result.blobUrl = blobUrl;
    result.originalBlobUrl = originalBlobUrl;
    
    const badgeClass = result.noWatermark ? 'no-watermark' : 'success';
    const badgeText = result.noWatermark 
        ? (typeof translate === 'function' ? translate('badgeNoWatermark') : '⚠ 未偵測到浮水印')
        : (typeof translate === 'function' ? translate('badgeSuccess') : '✓ 完成');
    const statusNote = result.noWatermark 
        ? ` · ${typeof translate === 'function' ? translate('originalImage') : '原圖'}`
        : '';
    const downloadText = typeof translate === 'function' ? translate('download') : '下載';
    
    const mediaElement = result.isVideo 
        ? `<video src="${blobUrl}" class="result-image" loop muted playsinline autoplay></video>`
        : `<img src="${blobUrl}" alt="${result.filename}" class="result-image">`;
    
    card.innerHTML = `
        <div class="result-image-container clickable">
            ${mediaElement}
            <span class="result-badge ${badgeClass}">${badgeText}</span>
            <div class="result-zoom-hint">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8"/>
                    <path d="m21 21-4.35-4.35"/>
                    <line x1="11" y1="8" x2="11" y2="14"/>
                    <line x1="8" y1="11" x2="14" y2="11"/>
                </svg>
            </div>
        </div>
        <div class="result-info">
            <div class="result-filename" title="${result.filename}">${result.filename}</div>
            <div class="result-meta">
                <span class="result-size">${result.width} × ${result.height}${statusNote}</span>
                <button class="result-download-btn" data-filename="${result.filename}">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="7 10 12 15 17 10"/>
                        <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    ${downloadText}
                </button>
            </div>
        </div>
    `;
    
    const imageContainer = card.querySelector('.result-image-container');
    if (imageContainer) {
        imageContainer.addEventListener('click', () => {
            openLightbox(index);
        });
    }
    
    const downloadBtn = card.querySelector('.result-download-btn');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            downloadFile(result.blob, result.filename);
        });
    }
}

/**
 * 創建影片預覽，提取第一幀作為 Preview ImageData
 */
async function createVideoPreview(file) {
    const video = document.createElement('video');
    video.src = URL.createObjectURL(file);
    video.muted = true;
    video.playsInline = true;
    video.style.position = 'absolute';
    video.style.width = '0';
    video.style.height = '0';
    video.style.opacity = '0';
    video.style.pointerEvents = 'none';
    document.body.appendChild(video);
    
    await new Promise((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error(typeof translate === 'function' ? translate('errLoadVideo') : '載入影片失敗'));
    });
    
    video.currentTime = 0;
    await new Promise(resolve => video.addEventListener('seeked', resolve, { once: true }));
    
    const width = video.videoWidth;
    const height = video.videoHeight;
    
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, width, height);
    
    const originalFrameData = ctx.getImageData(0, 0, width, height);
    
    document.body.removeChild(video);
    
    return {
        id: 'video-' + Math.random().toString(36).substr(2, 9),
        filename: file.name,
        originalName: file.name,
        file,
        width,
        height,
        success: true,
        isVideo: true,
        isPreview: true,
        originalFrameData,
        margin: 72,
        opacityMultiplier: 0.6
    };
}

/**
 * 繪製單個影片預覽畫面的浮水印處理效果
 */
function drawVideoPreview(result, canvas) {
    const ctx = canvas.getContext('2d');
    ctx.putImageData(result.originalFrameData, 0, 0);
    
    const mask = selectMask(result.width, result.height);
    if (!mask) return;
    
    const activeMargin = state.customMargin > 0 ? state.customMargin : 72;
    const activeOpacityMultiplier = state.customOpacity > 0 ? (state.customOpacity / 100) : 0.6;
    const activeMask = {
        ...mask,
        margin: activeMargin,
        opacityMultiplier: activeOpacityMultiplier
    };
    
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const hasWatermark = detectWatermark(imgData, activeMask, canvas.width, canvas.height);
    
    if (hasWatermark || state.forceRemove) {
        applyReverseAlphaBlendRegion(ctx, activeMask, canvas.width, canvas.height);
    }
}

/**
 * 更新所有目前正在預覽的影片卡片畫布
 */
function updateAllVideoPreviews() {
    state.processedImages.forEach((result, index) => {
        if (result.isVideo && result.isPreview) {
            const card = DOM.resultsGrid.querySelector(`.result-card[data-index="${index}"]`);
            if (card) {
                const canvas = card.querySelector('canvas');
                if (canvas) {
                    drawVideoPreview(result, canvas);
                }
            }
        }
    });
}

/**
 * 開啟影片轉換預覽的 Modal 視窗
 * @param {Object} previewResult - 影片預覽資訊 (包含 originalFrameData 等)
 * @returns {Promise<boolean>} 是否確認開始轉換
 */
function openVideoPreviewModal(previewResult) {
    return new Promise((resolve) => {
        const modal = DOM.videoPreviewModal;
        const canvas = DOM.modalPreviewCanvas;
        const closeBtn = DOM.videoPreviewClose;
        const cancelBtn = DOM.modalCancelBtn;
        const convertBtn = DOM.modalConvertBtn;
        
        const marginSlider = DOM.modalMarginSlider;
        const marginValue = DOM.modalMarginValue;
        const opacitySlider = DOM.modalOpacitySlider;
        const opacityValue = DOM.modalOpacityValue;
        const forceRemoveToggle = DOM.modalForceRemoveToggle;
        
        // 1. 初始化控制項數值
        const startMargin = state.customMargin > 0 ? state.customMargin : 72;
        const startOpacity = state.customOpacity > 0 ? state.customOpacity : 60;
        
        marginSlider.value = startMargin;
        marginValue.textContent = `${startMargin} px`;
        
        opacitySlider.value = startOpacity;
        opacityValue.textContent = `${startOpacity}%`;
        
        forceRemoveToggle.checked = state.forceRemove;
        
        // 2. 繪製預覽畫面
        canvas.width = previewResult.width;
        canvas.height = previewResult.height;
        
        function updateModalPreview() {
            const ctx = canvas.getContext('2d');
            ctx.putImageData(previewResult.originalFrameData, 0, 0);
            
            const mask = selectMask(previewResult.width, previewResult.height);
            if (!mask) return;
            
            const activeMargin = parseInt(marginSlider.value);
            const activeOpacityMultiplier = parseInt(opacitySlider.value) / 100;
            const activeForceRemove = forceRemoveToggle.checked;
            
            const activeMask = {
                ...mask,
                margin: activeMargin,
                opacityMultiplier: activeOpacityMultiplier
            };
            
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const hasWatermark = detectWatermark(imgData, activeMask, canvas.width, canvas.height);
            
            if (hasWatermark || activeForceRemove) {
                applyReverseAlphaBlendRegion(ctx, activeMask, canvas.width, canvas.height);
            }
        }
        
        updateModalPreview();
        
        // 3. 監聽 Modal 內控制項變更並同步至 global state
        const onMarginInput = (e) => {
            const val = parseInt(e.target.value);
            marginValue.textContent = `${val} px`;
            state.customMargin = val;
            const mainSlider = document.getElementById('marginSlider');
            const mainValue = document.getElementById('marginValue');
            if (mainSlider) mainSlider.value = val;
            if (mainValue) mainValue.textContent = `${val} px`;
            updateModalPreview();
        };
        
        const onOpacityInput = (e) => {
            const val = parseInt(e.target.value);
            opacityValue.textContent = `${val}%`;
            state.customOpacity = val;
            const mainSlider = document.getElementById('opacitySlider');
            const mainValue = document.getElementById('opacityValue');
            if (mainSlider) mainSlider.value = val;
            if (mainValue) mainValue.textContent = `${val}%`;
            updateModalPreview();
        };
        
        const onForceRemoveChange = (e) => {
            const val = e.target.checked;
            state.forceRemove = val;
            const mainToggle = DOM.forceRemoveToggle;
            if (mainToggle) mainToggle.checked = val;
            updateModalPreview();
        };
        
        marginSlider.addEventListener('input', onMarginInput);
        opacitySlider.addEventListener('input', onOpacityInput);
        forceRemoveToggle.addEventListener('change', onForceRemoveChange);
        
        // 4. 清理事件與關閉 Modal 輔助函數
        const cleanupAndClose = (confirmed) => {
            marginSlider.removeEventListener('input', onMarginInput);
            opacitySlider.removeEventListener('input', onOpacityInput);
            forceRemoveToggle.removeEventListener('change', onForceRemoveChange);
            
            closeBtn.removeEventListener('click', onCancel);
            cancelBtn.removeEventListener('click', onCancel);
            convertBtn.removeEventListener('click', onConfirm);
            
            modal.hidden = true;
            document.body.style.overflow = '';
            resolve(confirmed);
        };
        
        const onCancel = () => cleanupAndClose(false);
        const onConfirm = () => cleanupAndClose(true);
        
        closeBtn.addEventListener('click', onCancel);
        cancelBtn.addEventListener('click', onCancel);
        convertBtn.addEventListener('click', onConfirm);
        
        // 5. 顯示 Modal
        modal.hidden = false;
        document.body.style.overflow = 'hidden';
    });
}

/**
 * 下載單一檔案
 * @param {Blob} blob - 檔案 Blob
 * @param {string} filename - 檔案名稱
 */
function downloadFile(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // 延遲釋放 URL 以確保下載開始
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function clearResults() {
    // 釋放所有 blob URLs
    state.processedImages.forEach(result => {
        if (result.blobUrl) {
            URL.revokeObjectURL(result.blobUrl);
        }
    });
    
    state.processedImages = [];
    DOM.resultsGrid.innerHTML = '';
    DOM.resultsSection.hidden = true;
}

async function downloadAll() {
    const successfulResults = state.processedImages.filter(r => r.success && !r.isPreview && !r.isConverting);
    
    if (successfulResults.length === 0) return;
    
    for (let i = 0; i < successfulResults.length; i++) {
        const result = successfulResults[i];
        downloadFile(result.blob, result.filename);
        
        // 短暫延遲避免瀏覽器阻擋
        if (i < successfulResults.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 300));
        }
    }
}

// ===== Start Application =====
init();
