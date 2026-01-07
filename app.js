/**
 * Nano Banana Watermark Remover
 * 使用 Reverse Alpha Blending 技術移除浮水印
 */

// ===== Global State =====
const state = {
    masks: new Map(), // Map<size, {image, canvas, ctx, imageData, margin}>
    processedImages: [],
    isProcessing: false,
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
    lightboxImageContainer: document.getElementById('lightboxImageContainer'),
    lightboxHint: document.getElementById('lightboxHint'),
    lightboxFilename: document.getElementById('lightboxFilename'),
    toggleProcessed: document.getElementById('toggleProcessed'),
    toggleOriginal: document.getElementById('toggleOriginal'),
    lightboxPrev: document.getElementById('lightboxPrev'),
    lightboxNext: document.getElementById('lightboxNext'),
    // Theme toggle
    themeToggle: document.getElementById('themeToggle')
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
            file.type === 'image/png' || file.type === 'image/jpeg'
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
    
    DOM.lightboxImage.src = imageUrl;
    DOM.lightboxImage.alt = result.filename;
    DOM.lightboxFilename.textContent = state.lightbox.showingOriginal 
        ? `${result.originalName} (原圖)`
        : result.filename;
}

/**
 * 更新燈箱導覽按鈕狀態
 */
function updateLightboxNav() {
    if (DOM.lightboxPrev) {
        DOM.lightboxPrev.disabled = state.lightbox.currentIndex <= 0;
    }
    if (DOM.lightboxNext) {
        DOM.lightboxNext.disabled = state.lightbox.currentIndex >= state.processedImages.length - 1;
    }
}

/**
 * 導覽燈箱
 * @param {number} direction - 方向 (-1: 上一張, 1: 下一張)
 */
function navigateLightbox(direction) {
    const newIndex = state.lightbox.currentIndex + direction;
    
    // 跳過失敗的圖片
    let targetIndex = newIndex;
    while (targetIndex >= 0 && targetIndex < state.processedImages.length) {
        if (state.processedImages[targetIndex].success) {
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
        updateStatus(`處理中: ${file.name}`, processed, total);
        
        try {
            const result = await processImage(file);
            state.processedImages.push(result);
            addResultCard(result);
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
    
    updateStatus('處理完成', total, total);
    state.isProcessing = false;
    showResults();
    
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
    
    // 使用 Worker 進行偵測和處理
    if (worker) {
        // 偵測是否有浮水印
        const hasWatermark = await detectWatermarkWithWorker(
            imageData.data, 
            mask.imageData.data, 
            mask.width, 
            mask.height, 
            mask.margin, 
            canvas.width, 
            canvas.height
        );
        
        if (!hasWatermark) {
            // 沒有偵測到浮水印，返回原圖
            return {
                filename: file.name,
                originalName: file.name,
                blob: originalBlob,
                originalBlob: originalBlob,
                width: image.width,
                height: image.height,
                maskSize: mask.width,
                margin: mask.margin,
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
            mask.margin,
            canvas.width,
            canvas.height
        );
        
        // 將結果寫回 canvas
        const newImageData = new ImageData(processedData, canvas.width, canvas.height);
        ctx.putImageData(newImageData, 0, 0);
    } else {
        // Fallback: 使用主線程處理
        const hasWatermark = detectWatermark(imageData, mask, canvas.width, canvas.height);
        
        if (!hasWatermark) {
            return {
                filename: file.name,
                originalName: file.name,
                blob: originalBlob,
                originalBlob: originalBlob,
                width: image.width,
                height: image.height,
                maskSize: mask.width,
                margin: mask.margin,
                success: true,
                noWatermark: true
            };
        }
        
        reverseAlphaBlend(imageData, mask, canvas.width, canvas.height);
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
        margin: mask.margin,
        success: true,
        noWatermark: false
    };
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
function processImageWithWorker(imageData, maskData, maskWidth, maskHeight, margin, imgWidth, imgHeight) {
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
                imgHeight
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
            const alpha = maskPixels[maskIdx + 3] / 255;
            
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
    
    // 記住當前圖片的索引 (用於開啟燈箱)
    const imageIndex = state.processedImages.length - 1;
    
    if (result.success) {
        // 創建 Object URL 用於預覽和下載
        const blobUrl = URL.createObjectURL(result.blob);
        const originalBlobUrl = result.originalBlob ? URL.createObjectURL(result.originalBlob) : blobUrl;
        
        // 根據是否有浮水印顯示不同的 badge
        const badgeClass = result.noWatermark ? 'no-watermark' : 'success';
        const badgeText = result.noWatermark ? '⚠ 未偵測到浮水印' : '✓ 完成';
        const statusNote = result.noWatermark ? ' · 原圖' : '';
        
        card.innerHTML = `
            <div class="result-image-container clickable">
                <img src="${blobUrl}" alt="${result.filename}" class="result-image">
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
                        下載
                    </button>
                </div>
            </div>
        `;
        
        // 綁定圖片點擊開啟燈箱
        const imageContainer = card.querySelector('.result-image-container');
        imageContainer.addEventListener('click', () => {
            openLightbox(imageIndex);
        });
        
        // 綁定下載按鈕事件
        const downloadBtn = card.querySelector('.result-download-btn');
        downloadBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            downloadFile(result.blob, result.filename);
        });
        
        // 儲存 blobUrl 以便之後清理和燈箱使用
        result.blobUrl = blobUrl;
        result.originalBlobUrl = originalBlobUrl;
    } else {
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
    }
    
    DOM.resultsGrid.appendChild(card);
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
    const successfulResults = state.processedImages.filter(r => r.success);
    
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
