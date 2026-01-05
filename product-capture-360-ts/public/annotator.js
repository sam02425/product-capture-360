/**
 * Professional Annotation Tool - Roboflow-like Experience
 * Full-featured bounding box annotation with AI assistance
 */

// ============================================
// PERFORMANCE UTILITIES
// ============================================

/**
 * Throttle function - limits execution rate
 * @param {Function} func - Function to throttle
 * @param {number} limit - Minimum time between executions (ms)
 */
function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

/**
 * Debounce function - delays execution until after calls stop
 * @param {Function} func - Function to debounce
 * @param {number} delay - Delay in milliseconds
 */
function debounce(func, delay) {
    let timeoutId;
    return function(...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
}

/**
 * Validate bounding box
 * @param {Object} bbox - Bounding box {x, y, width, height}
 * @param {number} imageWidth - Image width
 * @param {number} imageHeight - Image height
 */
function validateBoundingBox(bbox, imageWidth, imageHeight) {
    const errors = [];

    if (bbox.x < 0 || bbox.y < 0) {
        errors.push('Negative coordinates not allowed');
    }
    if (bbox.width <= 0 || bbox.height <= 0) {
        errors.push('Width and height must be positive');
    }
    if (bbox.x + bbox.width > imageWidth || bbox.y + bbox.height > imageHeight) {
        errors.push('Annotation exceeds image bounds');
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Show toast notification to user
 * @param {string} message - Message to display
 * @param {string} type - Type: 'success', 'warning', 'error', 'info'
 */
function showToast(message, type = 'info') {
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 12px 20px;
        background: ${type === 'success' ? '#10b981' : type === 'warning' ? '#f59e0b' : type === 'error' ? '#ef4444' : '#3b82f6'};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        font-size: 14px;
        font-weight: 500;
        z-index: 10000;
        animation: slideIn 0.3s ease-out;
    `;

    document.body.appendChild(toast);

    // Auto-remove after 3 seconds
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Global State
const state = {
    images: [],
    currentImageIndex: 0,
    currentImage: null,
    annotations: {}, // {imageId: [{label, bbox, confidence, polygon}]}
    labels: [
        { id: 0, name: 'Abasolo_Whiskey_750ml', color: '#3b82f6', count: 0 }
    ],
    selectedLabelId: 0,
    currentTool: 'bbox',
    selectedAnnotationId: null,
    zoom: 1,
    pan: { x: 0, y: 0 },
    isDragging: false,
    isDrawing: false,
    startPoint: null,
    currentPoint: null,
    history: [],
    historyIndex: -1,
    canvas: null,
    ctx: null,
    // Layered canvas optimization
    imageCanvas: null,      // Static image layer (rarely changes)
    imageCtx: null,
    annotationCanvas: null, // Annotation layer (changes frequently)
    annotationCtx: null,
    needsImageRedraw: true, // Flag to redraw image layer
    // Resize state
    resizeHandle: null,
    resizeStartBox: null,
    // Polygon state
    polygonPoints: [],
    // Ellipse state
    ellipseCenter: null,
    ellipseRadius: null,
    // Keypoint state
    keypointAnnotations: {}, // {imageId: {template, instances: [{keypoints, bbox}]}}
    selectedKeypointTemplate: 'coco-person',
    currentKeypointInstance: null,
    currentKeypointIndex: 0,
    keypointTemplates: null, // Will be initialized with COCO templates
    // AI Preview state
    aiPreviewDetections: [],
    isPreviewMode: false,
    selectedPreviewIndices: new Set(),
    // Video support
    isVideoMode: false,
    videoFrames: [],
    currentFrameIndex: 0,
    fps: 30,
    // Object tracking
    trackingEnabled: false,
    tracks: {}, // {trackId: {annotations: [{frameId, bbox, ...}], label, color}}
    nextTrackId: 1,
    selectedTrackId: null,
    trackingMode: 'manual', // 'manual' | 'auto'
    // Augmentation settings
    augmentations: {
        enabled: false,
        brightness: 0,
        contrast: 0,
        rotation: 0,
        flip: { horizontal: false, vertical: false }
    },
    // Dataset versioning
    datasetVersion: '1.0.0',
    versionHistory: [],
    // Mask annotation state
    maskCanvas: null,
    maskCtx: null,
    maskLayers: {}, // {imageId: ImageData}
    brushSize: 20,
    brushOpacity: 0.7,
    currentMaskTool: 'brush', // brush | eraser | fill
    maskColors: {}, // {labelId: rgba color}
    isMaskDrawing: false
};

// Keypoint templates for different annotation tasks
const KEYPOINT_TEMPLATES = {
    'coco-person': {
        name: 'COCO Person (17 points)',
        keypoints: [
            'nose', 'left_eye', 'right_eye', 'left_ear', 'right_ear',
            'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
            'left_wrist', 'right_wrist', 'left_hip', 'right_hip',
            'left_knee', 'right_knee', 'left_ankle', 'right_ankle'
        ],
        skeleton: [
            [15, 13], [13, 11], [16, 14], [14, 12], // legs (1-indexed in COCO, 0-indexed here)
            [11, 12], [5, 11], [6, 12], // torso
            [5, 6], [5, 7], [6, 8], [7, 9], [8, 10], // arms
            [1, 2], [0, 1], [0, 2], [1, 3], [2, 4], [3, 5], [4, 6] // head
        ],
        colors: {
            visible: '#10b981',
            occluded: '#f59e0b',
            notLabeled: '#6b7280'
        }
    },
    'hand': {
        name: 'Hand (21 points)',
        keypoints: [
            'wrist',
            'thumb_cmc', 'thumb_mcp', 'thumb_ip', 'thumb_tip',
            'index_mcp', 'index_pip', 'index_dip', 'index_tip',
            'middle_mcp', 'middle_pip', 'middle_dip', 'middle_tip',
            'ring_mcp', 'ring_pip', 'ring_dip', 'ring_tip',
            'pinky_mcp', 'pinky_pip', 'pinky_dip', 'pinky_tip'
        ],
        skeleton: [
            [0, 1], [1, 2], [2, 3], [3, 4], // thumb
            [0, 5], [5, 6], [6, 7], [7, 8], // index
            [0, 9], [9, 10], [10, 11], [11, 12], // middle
            [0, 13], [13, 14], [14, 15], [15, 16], // ring
            [0, 17], [17, 18], [18, 19], [19, 20] // pinky
        ],
        colors: {
            visible: '#3b82f6',
            occluded: '#f59e0b',
            notLabeled: '#6b7280'
        }
    }
};

const ICONS = {
    camera: `
        <span class="icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
                <path d="M4 7h4l2-2h4l2 2h4a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z"></path>
                <circle cx="12" cy="13" r="3"></circle>
            </svg>
        </span>
    `,
    note: `
        <span class="icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
                <path d="M4 4h12l4 4v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"></path>
                <path d="M8 12h8"></path>
                <path d="M8 16h8"></path>
            </svg>
        </span>
    `,
    trash: `
        <span class="icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
                <path d="M4 7h16"></path>
                <path d="M9 7V5h6v2"></path>
                <rect x="6" y="7" width="12" height="12" rx="2"></rect>
            </svg>
        </span>
    `
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initializeCanvas();
    setupKeyboardShortcuts();
    renderLabels();
    applyHelpTooltips();
    setupAiThresholdLabel();
    setupSam2Hint();
    updateStats();
    hydrateFromQueryParams();
});

async function hydrateFromQueryParams() {
    const params = new URLSearchParams(window.location.search);
    const path = params.get('path');
    const batchJob = params.get('batchJob');

    console.log('Hydrating from query params:', { path, batchJob });

    if (!path) return;

    const datasetPathInput = document.getElementById('datasetPath');
    if (datasetPathInput) {
        datasetPathInput.value = path;
    }

    await loadDataset();

    if (batchJob) {
        console.log('Loading batch job data for:', batchJob);
        const raw = localStorage.getItem(`batchReviewData_${batchJob}`);
        console.log('Batch data from localStorage:', raw ? 'Found' : 'Not found');
        if (raw) {
            try {
                const batchData = JSON.parse(raw);
                console.log('Batch data parsed:', batchData);
                console.log('Results count:', batchData.results?.length || 0);
                applyBatchReviewData(batchData);
                console.log('Batch data applied successfully');
            } catch (error) {
                console.error('Failed to load batch review data:', error);
                alert('Failed to load batch annotations: ' + error.message);
            }
        } else {
            console.warn('No batch review data found in localStorage for job:', batchJob);
            alert('No batch annotation data found. Please run the batch annotation job first.');
        }
    }
}

// Utility function to convert hex color to rgba
function hexToRGBA(hex, alpha = 1) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function initializeCanvas() {
    // Main display canvas (what user sees)
    state.canvas = document.getElementById('annotationCanvas');
    state.ctx = state.canvas.getContext('2d');

    // Create offscreen canvases for layered rendering
    state.imageCanvas = document.createElement('canvas');
    state.imageCtx = state.imageCanvas.getContext('2d');

    state.annotationCanvas = document.createElement('canvas');
    state.annotationCtx = state.annotationCanvas.getContext('2d');

    // Initialize mask canvas
    state.maskCanvas = document.getElementById('maskCanvas');
    state.maskCtx = state.maskCanvas.getContext('2d');

    // Initialize mask colors for each label
    state.labels.forEach(label => {
        if (!state.maskColors[label.id]) {
            state.maskColors[label.id] = hexToRGBA(label.color, state.brushOpacity);
        }
    });

    // Mouse events with performance optimization
    state.canvas.addEventListener('mousedown', handleMouseDown);
    state.canvas.addEventListener('mousemove', throttle(handleMouseMove, 16)); // ~60fps
    state.canvas.addEventListener('mouseup', handleMouseUp);
    state.canvas.addEventListener('wheel', handleWheel, { passive: false });

    // Touch events for tablets
    state.canvas.addEventListener('touchstart', handleTouchStart);
    state.canvas.addEventListener('touchmove', handleTouchMove);
    state.canvas.addEventListener('touchend', handleTouchEnd);

    // Enable paste functionality for dataset path input
    const datasetPathInput = document.getElementById('datasetPath');
    if (datasetPathInput) {
        datasetPathInput.addEventListener('paste', (e) => {
            e.stopPropagation();
            // Let the default paste behavior work
        });

        // Also ensure the input is editable
        datasetPathInput.readOnly = false;
        datasetPathInput.disabled = false;
    }
}

// Storage Browser Functions
async function selectStorageDevice() {
    const path = document.getElementById('storageSelect').value;
    if (!path) return;

    document.getElementById('storagePath').value = path;
    await browseStorageFolder(path);
}

async function browseStorageFolder(path) {
    const browser = document.getElementById('storageBrowser');
    browser.innerHTML = '<div style="padding: 20px 10px; text-align: center; color: var(--text-dim); font-size: 0.75rem;">Loading...</div>';

    try {
        const response = await fetch('/api/list-directory', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to list directory');
        }

        const items = await response.json();

        // Filter to only show directories
        const folders = items.filter(item => item.isDirectory);

        if (folders.length === 0) {
            browser.innerHTML = '<div style="padding: 20px 10px; text-align: center; color: #4a5568; font-size: 0.75rem;">No subfolders found</div>';
            return;
        }

        browser.innerHTML = folders.map(folder => `
            <div class="folder-item" onclick="navigateToFolder('${path}', '${folder.name}')">
                <span class="folder-icon">📁</span>
                <span>${folder.name}</span>
            </div>
        `).join('');
    } catch (error) {
        browser.innerHTML = `<div style="padding: 20px 10px; text-align: center; color: #dc2626; font-size: 0.75rem;">Error: ${error.message}</div>`;
        console.error('Failed to browse folder:', error);
    }
}

async function navigateToFolder(basePath, folderName) {
    const newPath = basePath.endsWith('/') ? `${basePath}${folderName}` : `${basePath}/${folderName}`;
    document.getElementById('storagePath').value = newPath;
    await browseStorageFolder(newPath);
}

async function goUpStorageFolder() {
    const currentPath = document.getElementById('storagePath').value;
    if (!currentPath) return;

    const lastSlash = currentPath.lastIndexOf('/');
    if (lastSlash <= 0) return; // Can't go up from root

    const parentPath = currentPath.substring(0, lastSlash);
    document.getElementById('storagePath').value = parentPath;
    await browseStorageFolder(parentPath);
}

function useCurrentStoragePath(e) {
    const storagePath = document.getElementById('storagePath').value;
    if (!storagePath) {
        alert('Please select a folder first');
        return;
    }

    document.getElementById('datasetPath').value = storagePath;

    // Show success feedback
    if (e && e.target) {
        const btn = e.target;
        const originalText = btn.textContent;
        btn.textContent = '✓ Path Set!';
        btn.style.background = 'var(--success)';
        setTimeout(() => {
            btn.textContent = originalText;
            btn.style.background = '';
        }, 2000);
    }
}

// Load Dataset
async function loadDataset() {
    const actionId = window.appLogger?.startAction('loadDataset', { component: 'annotator' });

    let path = document.getElementById('datasetPath').value.trim();
    if (!path) {
        window.appLogger?.warn('Load dataset attempted with empty path');
        alert('Please enter a dataset path');
        if (actionId) window.appLogger.failAction(actionId, new Error('Empty path'));
        return;
    }

    // Remove trailing slash to avoid double slashes in path
    path = path.replace(/\/+$/, '');

    window.appLogger?.info('Loading dataset', { path });

    try {
        const response = await fetch('/api/list-directory', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path })
        });

        if (!response.ok) {
            let errorMsg = `Failed to load directory: ${response.status}`;
            try {
                const errorData = await response.json();
                if (errorData.error) {
                    errorMsg = errorData.error;
                }
            } catch (e) {
                // Response wasn't JSON, use default message
            }
            const error = new Error(`${errorMsg}\n\nPath: ${path}\n\nPlease verify:\n1. The path exists on your system\n2. The path is correctly formatted\n3. You have read permissions`);
            window.appLogger?.error('Directory listing failed', { path, status: response.status, error: errorMsg });
            throw error;
        }

        const items = await response.json();

        // Handle both old format (array of strings) and new format (array of objects)
        const fileNames = Array.isArray(items) && items.length > 0 && typeof items[0] === 'object'
            ? items.filter(item => !item.isDirectory).map(item => item.name)
            : items;

        const imageFiles = fileNames.filter(f =>
            f.match(/\.(jpg|jpeg|png)$/i) && !f.startsWith('._')
        );

        window.appLogger?.info('Dataset loaded successfully', {
            path,
            totalFiles: fileNames.length,
            imageFiles: imageFiles.length
        });

        console.log(`Found ${imageFiles.length} images in ${path}`);

        state.images = imageFiles.map((filename, idx) => ({
            id: idx,
            filename,
            path: `${path}/${filename}`,
            annotated: false
        }));

        console.log('First image path:', state.images.length > 0 ? state.images[0].path : 'none');

        renderImageList();
        if (state.images.length > 0) {
            loadImage(0);
        }
        updateStats();
        initializeHistory();

        if (actionId) window.appLogger.endAction(actionId, true, { imageCount: imageFiles.length });
    } catch (error) {
        console.error('Error loading dataset:', error);
        window.appLogger?.error('Failed to load dataset', { path }, { error: error.message });
        alert('Failed to load dataset: ' + error.message);
        if (actionId) window.appLogger.failAction(actionId, error, { path });
    }
}

function applyBatchReviewData(batchData) {
    if (!batchData || !Array.isArray(batchData.results)) return;

    const resultsByFilename = new Map();
    batchData.results.forEach(result => {
        if (result.status !== 'success') return;
        resultsByFilename.set(result.filename, result.annotations || []);
    });

    // Reset annotations and label counts for a clean import
    state.annotations = {};
    state.labels.forEach(label => {
        label.count = 0;
    });

    state.images.forEach(image => {
        const annotations = resultsByFilename.get(image.filename);
        if (!annotations || annotations.length === 0) return;

        const mapped = annotations.map(ann => {
            const labelName = ann.labelName || batchData.labelName || 'Product';
            const labelId = ensureLabel(labelName);
            const label = state.labels.find(l => l.id === labelId);
            if (label) label.count += 1;

            return {
                labelId,
                bbox: ann.bbox,
                confidence: ann.confidence || 1.0,
                createdBy: 'batch',
                polygon: ann.polygon
            };
        });

        state.annotations[image.id] = mapped;
    });

    renderLabels();
    renderImageList();
    renderAnnotationsList();
    updateStats();
    updateSam2Hint();
    initializeHistory();
}

function renderImageList() {
    const container = document.getElementById('imageList');
    if (state.images.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">${ICONS.camera}</div>
                <div>No images found</div>
            </div>
        `;
        return;
    }

    container.innerHTML = state.images.map((img, idx) => {
        const annotationCount = (state.annotations[img.id] || []).length;
        const isAnnotated = annotationCount > 0;

        return `
            <div class="image-item ${idx === state.currentImageIndex ? 'active' : ''} ${isAnnotated ? 'annotated' : ''}"
                 onclick="loadImage(${idx})">
                <div class="image-status ${isAnnotated ? 'done' : ''}"></div>
                <img src="/api/file?path=${encodeURIComponent(img.path)}"
                     class="image-thumb"
                     onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22><rect width=%22100%22 height=%22100%22 fill=%22%23333%22/></svg>'">
                <div class="image-info">
                    <div class="image-name">${img.filename}</div>
                    <div class="image-meta">${annotationCount} annotation${annotationCount !== 1 ? 's' : ''}</div>
                </div>
            </div>
        `;
    }).join('');

    document.getElementById('imageCount').textContent = state.images.length;
}

async function loadImage(index) {
    if (index < 0 || index >= state.images.length) return;

    state.currentImageIndex = index;
    const imageData = state.images[index];

    const img = new Image();
    img.onload = () => {
        state.currentImage = img;

        // Initialize mask layer for this image if it doesn't exist
        if (!state.maskLayers[imageData.id]) {
            const maskData = state.maskCtx.createImageData(state.canvas.width, state.canvas.height);
            state.maskLayers[imageData.id] = maskData;
        }

        resizeCanvas();
        render();
        renderImageList();
        renderAnnotationsList();
        updateStats();
    };

    img.onerror = () => {
        const imageUrl = `/api/file?path=${encodeURIComponent(imageData.path)}`;
        console.error('Failed to load image:', imageData.path);
        console.error('URL was:', imageUrl);
        window.appLogger?.error('Image load failed', {
            filename: imageData.filename,
            path: imageData.path,
            url: imageUrl,
            index
        });

        // Try loading EYEai logo as fallback
        const fallbackImg = new Image();
        fallbackImg.onload = () => {
            state.currentImage = fallbackImg;
            resizeCanvas();
            render();
            renderImageList();
            renderAnnotationsList();
            updateStats();
        };
        fallbackImg.src = '/EYEai.png';

        alert('Failed to load image: ' + imageData.path + '\n\nShowing placeholder. Please check the file path.');
    };

    const imageUrl = `/api/file?path=${encodeURIComponent(imageData.path)}`;
    console.log('Loading image from:', imageUrl);
    window.appLogger?.debug('Loading image', {
        filename: imageData.filename,
        path: imageData.path,
        index
    });
    img.src = imageUrl;
}

function resizeCanvas() {
    if (!state.currentImage) return;

    const container = document.getElementById('canvasContainer');
    const maxWidth = container.clientWidth - 40;
    const maxHeight = container.clientHeight - 100;

    const imgRatio = state.currentImage.width / state.currentImage.height;
    const containerRatio = maxWidth / maxHeight;

    let width, height;
    if (imgRatio > containerRatio) {
        width = Math.min(maxWidth, state.currentImage.width);
        height = width / imgRatio;
    } else {
        height = Math.min(maxHeight, state.currentImage.height);
        width = height * imgRatio;
    }

    state.canvas.width = width;
    state.canvas.height = height;

    // Resize offscreen canvases to match
    state.imageCanvas.width = width;
    state.imageCanvas.height = height;
    state.annotationCanvas.width = width;
    state.annotationCanvas.height = height;

    // Resize mask canvas to match
    if (state.maskCanvas) {
        state.maskCanvas.width = width;
        state.maskCanvas.height = height;
    }

    // Flag that image layer needs redraw
    state.needsImageRedraw = true;
}

/**
 * Render image layer (rarely changes - only on zoom/pan or image load)
 */
function renderImageLayer() {
    if (!state.needsImageRedraw || !state.currentImage) return;

    const ctx = state.imageCtx;
    const canvas = state.imageCanvas;

    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Apply transforms
    ctx.save();
    ctx.translate(state.pan.x, state.pan.y);
    ctx.scale(state.zoom, state.zoom);

    // Draw image
    ctx.drawImage(state.currentImage, 0, 0, canvas.width, canvas.height);

    ctx.restore();

    state.needsImageRedraw = false;
}

/**
 * Optimized render function using layered canvases
 */
function render() {
    if (!state.currentImage || !state.ctx) return;

    // Render image layer if needed (zoom/pan/new image)
    renderImageLayer();

    const ctx = state.ctx;
    const canvas = state.canvas;
    const annCtx = state.annotationCtx;
    const annCanvas = state.annotationCanvas;

    // Clear main canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw image layer to main canvas
    ctx.drawImage(state.imageCanvas, 0, 0);

    // Clear annotation layer
    annCtx.clearRect(0, 0, annCanvas.width, annCanvas.height);

    // Apply transforms to annotation layer
    annCtx.save();
    annCtx.translate(state.pan.x, state.pan.y);
    annCtx.scale(state.zoom, state.zoom);

    // Draw existing annotations
    const currentImageId = state.images[state.currentImageIndex].id;
    const annotations = state.annotations[currentImageId] || [];

    annotations.forEach((ann, idx) => {
        const label = state.labels.find(l => l.id === ann.labelId);
        const color = label ? label.color : '#3b82f6';
        const isSelected = state.selectedAnnotationId === idx;

        drawBoundingBox(ann.bbox, color, isSelected, label ? label.name : '', ann.polygon, ann.ellipse, ann.confidence, ann.trackId);
    });

    // Draw AI preview detections
    if (state.isPreviewMode && state.aiPreviewDetections.length > 0) {
        state.aiPreviewDetections.forEach((det, idx) => {
            const isSelectedPreview = state.selectedPreviewIndices.has(idx);
            const previewColor = isSelectedPreview ? '#10b981' : '#f59e0b'; // Green if selected, amber otherwise
            const opacity = isSelectedPreview ? '88' : '44';

            annCtx.strokeStyle = previewColor;
            annCtx.lineWidth = 2 / state.zoom;
            annCtx.setLineDash([10 / state.zoom, 5 / state.zoom]);
            annCtx.strokeRect(det.bbox.x, det.bbox.y, det.bbox.width, det.bbox.height);
            annCtx.setLineDash([]);

            // Fill with transparency
            annCtx.fillStyle = previewColor + opacity;
            annCtx.fillRect(det.bbox.x, det.bbox.y, det.bbox.width, det.bbox.height);

            // Confidence badge
            annCtx.font = `${12 / state.zoom}px sans-serif`;
            const confText = `${(det.confidence * 100).toFixed(0)}%`;
            const textWidth = annCtx.measureText(confText).width;
            const padding = 4 / state.zoom;

            annCtx.fillStyle = previewColor;
            annCtx.fillRect(
                det.bbox.x + det.bbox.width - textWidth - padding * 2,
                det.bbox.y,
                textWidth + padding * 2,
                16 / state.zoom
            );

            annCtx.fillStyle = '#ffffff';
            annCtx.fillText(
                confText,
                det.bbox.x + det.bbox.width - textWidth - padding,
                det.bbox.y + 12 / state.zoom
            );

            // Checkbox indicator
            if (isSelectedPreview) {
                const checkSize = 16 / state.zoom;
                annCtx.fillStyle = '#10b981';
                annCtx.fillRect(det.bbox.x, det.bbox.y, checkSize, checkSize);
                annCtx.fillStyle = '#ffffff';
                annCtx.font = `bold ${12 / state.zoom}px sans-serif`;
                annCtx.fillText('✓', det.bbox.x + 3 / state.zoom, det.bbox.y + 12 / state.zoom);
            }
        });
    }

    // Draw current drawing
    if (state.isDrawing && state.startPoint && state.currentPoint) {
        const label = state.labels.find(l => l.id === state.selectedLabelId);
        const color = label ? label.color : '#3b82f6';

        const bbox = {
            x: Math.min(state.startPoint.x, state.currentPoint.x),
            y: Math.min(state.startPoint.y, state.currentPoint.y),
            width: Math.abs(state.currentPoint.x - state.startPoint.x),
            height: Math.abs(state.currentPoint.y - state.startPoint.y)
        };

        annCtx.strokeStyle = color;
        annCtx.lineWidth = 2 / state.zoom;
        annCtx.setLineDash([5 / state.zoom, 5 / state.zoom]);
        annCtx.strokeRect(bbox.x, bbox.y, bbox.width, bbox.height);
        annCtx.setLineDash([]);
    }

    // Draw in-progress polygon
    if (state.polygonPoints.length > 0) {
        annCtx.strokeStyle = '#3b82f6';
        annCtx.lineWidth = 2 / state.zoom;
        annCtx.setLineDash([5 / state.zoom, 5 / state.zoom]);

        annCtx.beginPath();
        annCtx.moveTo(state.polygonPoints[0].x, state.polygonPoints[0].y);
        for (let i = 1; i < state.polygonPoints.length; i++) {
            annCtx.lineTo(state.polygonPoints[i].x, state.polygonPoints[i].y);
        }
        annCtx.stroke();

        // Draw points
        annCtx.setLineDash([]);
        state.polygonPoints.forEach((p, i) => {
            if (i === 0) {
                // First point is larger to indicate close target
                annCtx.fillStyle = '#3b82f6';
                annCtx.fillRect(p.x - 4/state.zoom, p.y - 4/state.zoom, 8/state.zoom, 8/state.zoom);
            } else {
                annCtx.fillStyle = '#3b82f6';
                annCtx.fillRect(p.x - 3/state.zoom, p.y - 3/state.zoom, 6/state.zoom, 6/state.zoom);
            }
        });
    }

    // Draw in-progress ellipse
    if (state.currentTool === 'ellipse' && state.isDrawing && state.startPoint && state.currentPoint) {
        const radiusX = Math.abs(state.currentPoint.x - state.startPoint.x);
        const radiusY = Math.abs(state.currentPoint.y - state.startPoint.y);

        annCtx.strokeStyle = '#3b82f6';
        annCtx.lineWidth = 2 / state.zoom;
        annCtx.setLineDash([5 / state.zoom, 5 / state.zoom]);

        annCtx.beginPath();
        annCtx.ellipse(state.startPoint.x, state.startPoint.y, radiusX, radiusY, 0, 0, 2 * Math.PI);
        annCtx.stroke();

        // Draw center point
        annCtx.setLineDash([]);
        annCtx.fillStyle = '#3b82f6';
        annCtx.fillRect(state.startPoint.x - 3/state.zoom, state.startPoint.y - 3/state.zoom, 6/state.zoom, 6/state.zoom);
    }

    // Draw keypoint annotations
    const keypointData = state.keypointAnnotations[currentImageId];
    if (keypointData && keypointData.instances) {
        const template = KEYPOINT_TEMPLATES[keypointData.template];
        if (template) {
            keypointData.instances.forEach((instance, idx) => {
                const isSelected = false; // TODO: Add selection support
                drawSkeleton(instance, template, isSelected);
            });
        }
    }

    // Restore annotation layer context
    annCtx.restore();

    // Composite annotation layer onto main canvas
    ctx.drawImage(annCanvas, 0, 0);

    // Render mask layer
    renderMaskLayer();
}

function renderMaskLayer() {
    if (!state.maskCanvas || !state.maskCtx || !state.currentImage) return;

    const maskCtx = state.maskCtx;
    const maskCanvas = state.maskCanvas;

    // Clear mask canvas
    maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);

    // Get current image's mask data
    const currentImageId = state.images[state.currentImageIndex]?.id;
    if (!currentImageId || !state.maskLayers[currentImageId]) return;

    // Apply zoom and pan to mask canvas
    maskCtx.save();
    maskCtx.translate(state.pan.x, state.pan.y);
    maskCtx.scale(state.zoom, state.zoom);

    // Draw the mask ImageData
    maskCtx.putImageData(state.maskLayers[currentImageId], 0, 0);

    maskCtx.restore();
}

function drawBoundingBox(bbox, color, isSelected, labelText, polygon = null, ellipse = null, confidence = null, trackId = null) {
    const ctx = state.annotationCtx || state.ctx; // Use annotation layer context if available

    // Draw ellipse if available
    if (ellipse) {
        ctx.strokeStyle = isSelected ? '#ffffff' : color;
        ctx.lineWidth = (isSelected ? 3 : 2) / state.zoom;

        ctx.beginPath();
        ctx.ellipse(ellipse.center.x, ellipse.center.y, ellipse.radiusX, ellipse.radiusY, 0, 0, 2 * Math.PI);
        ctx.stroke();

        // Fill with transparency
        ctx.fillStyle = color + '33';
        ctx.fill();

        // Draw center and radius handles when selected
        if (isSelected) {
            const handleSize = 6 / state.zoom;
            ctx.fillStyle = '#ffffff';

            // Center handle
            ctx.fillRect(ellipse.center.x - handleSize/2, ellipse.center.y - handleSize/2, handleSize, handleSize);

            // Radius handles (4 cardinal points)
            ctx.fillRect(ellipse.center.x + ellipse.radiusX - handleSize/2, ellipse.center.y - handleSize/2, handleSize, handleSize);
            ctx.fillRect(ellipse.center.x - ellipse.radiusX - handleSize/2, ellipse.center.y - handleSize/2, handleSize, handleSize);
            ctx.fillRect(ellipse.center.x - handleSize/2, ellipse.center.y + ellipse.radiusY - handleSize/2, handleSize, handleSize);
            ctx.fillRect(ellipse.center.x - handleSize/2, ellipse.center.y - ellipse.radiusY - handleSize/2, handleSize, handleSize);
        }
    }
    // Draw polygon if available
    else if (polygon && polygon.length > 0) {
        ctx.strokeStyle = isSelected ? '#ffffff' : color;
        ctx.lineWidth = (isSelected ? 3 : 2) / state.zoom;

        ctx.beginPath();
        ctx.moveTo(polygon[0].x, polygon[0].y);
        for (let i = 1; i < polygon.length; i++) {
            ctx.lineTo(polygon[i].x, polygon[i].y);
        }
        ctx.closePath();
        ctx.stroke();

        // Fill with transparency
        ctx.fillStyle = color + '33';
        ctx.fill();

        // Draw polygon vertices when selected
        if (isSelected) {
            const handleSize = 6 / state.zoom;
            ctx.fillStyle = '#ffffff';
            polygon.forEach(p => {
                ctx.fillRect(p.x - handleSize/2, p.y - handleSize/2, handleSize, handleSize);
            });
        }
    } else {
        // Draw regular bounding box
        ctx.strokeStyle = isSelected ? '#ffffff' : color;
        ctx.lineWidth = (isSelected ? 3 : 2) / state.zoom;
        ctx.strokeRect(bbox.x, bbox.y, bbox.width, bbox.height);

        // Resize handles when selected
        if (isSelected) {
            const handleSize = 6 / state.zoom;
            ctx.fillStyle = '#ffffff';

            // Corners
            ctx.fillRect(bbox.x - handleSize/2, bbox.y - handleSize/2, handleSize, handleSize);
            ctx.fillRect(bbox.x + bbox.width - handleSize/2, bbox.y - handleSize/2, handleSize, handleSize);
            ctx.fillRect(bbox.x - handleSize/2, bbox.y + bbox.height - handleSize/2, handleSize, handleSize);
            ctx.fillRect(bbox.x + bbox.width - handleSize/2, bbox.y + bbox.height - handleSize/2, handleSize, handleSize);
        }
    }

    // Label background with confidence and track ID (always at bbox position)
    if (labelText) {
        ctx.font = `${14 / state.zoom}px sans-serif`;
        const confText = confidence ? ` (${(confidence * 100).toFixed(0)}%)` : '';
        const trackText = trackId !== null && trackId !== undefined && state.trackingEnabled ? ` [T${trackId}]` : '';
        const fullText = labelText + confText + trackText;
        const textWidth = ctx.measureText(fullText).width;
        const padding = 4 / state.zoom;

        ctx.fillStyle = color;
        ctx.fillRect(bbox.x, bbox.y - (20 / state.zoom), textWidth + padding * 2, 20 / state.zoom);

        ctx.fillStyle = '#ffffff';
        ctx.fillText(fullText, bbox.x + padding, bbox.y - (6 / state.zoom));
    }
}

// Helper function to detect which resize handle is being clicked
function getResizeHandle(point, bbox, tolerance = 8) {
    const handles = {
        'nw': {x: bbox.x, y: bbox.y},
        'ne': {x: bbox.x + bbox.width, y: bbox.y},
        'se': {x: bbox.x + bbox.width, y: bbox.y + bbox.height},
        'sw': {x: bbox.x, y: bbox.y + bbox.height},
        'n': {x: bbox.x + bbox.width/2, y: bbox.y},
        'e': {x: bbox.x + bbox.width, y: bbox.y + bbox.height/2},
        's': {x: bbox.x + bbox.width/2, y: bbox.y + bbox.height},
        'w': {x: bbox.x, y: bbox.y + bbox.height/2}
    };

    for (const [name, pos] of Object.entries(handles)) {
        const dist = Math.sqrt((point.x - pos.x)**2 + (point.y - pos.y)**2);
        if (dist <= tolerance / state.zoom) return name;
    }
    return null;
}

// Mouse Handlers
function handleMouseDown(e) {
    const rect = state.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / state.zoom - state.pan.x / state.zoom;
    const y = (e.clientY - rect.top) / state.zoom - state.pan.y / state.zoom;

    // Handle preview mode clicks
    if (state.isPreviewMode) {
        // Check if clicking on a preview detection
        for (let i = state.aiPreviewDetections.length - 1; i >= 0; i--) {
            const det = state.aiPreviewDetections[i];
            if (isPointInBox({ x, y }, det.bbox)) {
                togglePreviewSelection(i);
                return;
            }
        }
    }

    // Handle mask tools (brush, eraser, fill)
    if (state.currentTool === 'brush' || state.currentTool === 'eraser') {
        state.isMaskDrawing = true;
        const isErasing = state.currentTool === 'eraser';
        drawMaskBrush(x, y, isErasing);
        return;
    }

    if (state.currentTool === 'fill') {
        floodFill(x, y);
        return;
    }

    if (state.currentTool === 'polygon') {
        const point = {x, y};

        // Check if clicking near first point to close polygon
        if (state.polygonPoints.length >= 3) {
            const first = state.polygonPoints[0];
            const dist = Math.sqrt((x - first.x)**2 + (y - first.y)**2);
            if (dist <= 10 / state.zoom) {
                // Close polygon
                addPolygonAnnotation(state.polygonPoints);
                state.polygonPoints = [];
                render();
                return;
            }
        }

        // Add point to polygon
        state.polygonPoints.push(point);
        render();
    } else if (state.currentTool === 'keypoint') {
        // Add keypoint at click position
        addKeypoint(x, y);
        return;
    } else if (state.currentTool === 'ellipse') {
        state.isDrawing = true;
        state.startPoint = { x, y };
        state.currentPoint = { x, y };
    } else if (state.currentTool === 'bbox') {
        state.isDrawing = true;
        state.startPoint = { x, y };
        state.currentPoint = { x, y };
    } else if (state.currentTool === 'select') {
        const currentImageId = state.images[state.currentImageIndex].id;
        const annotations = state.annotations[currentImageId] || [];

        // Check if selected annotation exists and mouse is on a resize handle
        if (state.selectedAnnotationId !== null) {
            const selected = annotations[state.selectedAnnotationId];
            const handle = getResizeHandle({x, y}, selected.bbox);

            if (handle) {
                state.resizeHandle = handle;
                state.resizeStartBox = {...selected.bbox};
                state.isDragging = true;
                state.startPoint = {x, y};
                return;
            }
        }

        // Otherwise check for selection
        let found = false;
        for (let i = annotations.length - 1; i >= 0; i--) {
            const ann = annotations[i];
            if (isPointInBox({ x, y }, ann.bbox)) {
                state.selectedAnnotationId = i;
                found = true;
                break;
            }
        }

        if (!found) {
            state.selectedAnnotationId = null;
        }

        render();
        renderAnnotationsList();
        updateSam2Hint();
    }
}

function handleMouseMove(e) {
    const rect = state.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / state.zoom - state.pan.x / state.zoom;
    const y = (e.clientY - rect.top) / state.zoom - state.pan.y / state.zoom;

    // Handle mask drawing (brush/eraser)
    if (state.isMaskDrawing && (state.currentTool === 'brush' || state.currentTool === 'eraser')) {
        const isErasing = state.currentTool === 'eraser';
        drawMaskBrush(x, y, isErasing);
        return;
    }

    // Handle resize
    if (state.isDragging && state.resizeHandle) {
        const currentImageId = state.images[state.currentImageIndex].id;
        const annotations = state.annotations[currentImageId];
        const selected = annotations[state.selectedAnnotationId];
        const box = state.resizeStartBox;
        const dx = x - state.startPoint.x;
        const dy = y - state.startPoint.y;

        // Calculate new bbox based on handle
        switch(state.resizeHandle) {
            case 'nw':
                selected.bbox = {
                    x: box.x + dx, y: box.y + dy,
                    width: box.width - dx, height: box.height - dy
                };
                break;
            case 'ne':
                selected.bbox = {
                    x: box.x, y: box.y + dy,
                    width: box.width + dx, height: box.height - dy
                };
                break;
            case 'se':
                selected.bbox = {
                    x: box.x, y: box.y,
                    width: box.width + dx, height: box.height + dy
                };
                break;
            case 'sw':
                selected.bbox = {
                    x: box.x + dx, y: box.y,
                    width: box.width - dx, height: box.height + dy
                };
                break;
            case 'n':
                selected.bbox = {
                    x: box.x, y: box.y + dy,
                    width: box.width, height: box.height - dy
                };
                break;
            case 'e':
                selected.bbox = {
                    x: box.x, y: box.y,
                    width: box.width + dx, height: box.height
                };
                break;
            case 's':
                selected.bbox = {
                    x: box.x, y: box.y,
                    width: box.width, height: box.height + dy
                };
                break;
            case 'w':
                selected.bbox = {
                    x: box.x + dx, y: box.y,
                    width: box.width - dx, height: box.height
                };
                break;
        }

        render();
        return;
    }

    // Handle normal drawing
    if (!state.isDrawing) return;

    state.currentPoint = { x, y };
    render();
}

function handleMouseUp(e) {
    // Handle mask drawing completion
    if (state.isMaskDrawing) {
        state.isMaskDrawing = false;
        saveToHistory();
        return;
    }

    // Handle resize completion
    if (state.isDragging && state.resizeHandle) {
        state.isDragging = false;
        state.resizeHandle = null;
        state.resizeStartBox = null;
        saveToHistory();
        renderAnnotationsList();
        render();
        return;
    }

    // Handle normal drawing
    if (!state.isDrawing) return;

    const rect = state.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / state.zoom - state.pan.x / state.zoom;
    const y = (e.clientY - rect.top) / state.zoom - state.pan.y / state.zoom;

    if (state.currentTool === 'ellipse') {
        // Create ellipse annotation
        const radiusX = Math.abs(x - state.startPoint.x);
        const radiusY = Math.abs(y - state.startPoint.y);

        // Only add if ellipse is large enough
        if (radiusX > 5 && radiusY > 5) {
            addEllipseAnnotation(state.startPoint, radiusX, radiusY);
        }
    } else {
        // Create bbox annotation
        const bbox = {
            x: Math.min(state.startPoint.x, x),
            y: Math.min(state.startPoint.y, y),
            width: Math.abs(x - state.startPoint.x),
            height: Math.abs(y - state.startPoint.y)
        };

        // Only add if box is large enough
        if (bbox.width > 10 && bbox.height > 10) {
            addAnnotation(bbox);
        }
    }

    state.isDrawing = false;
    state.startPoint = null;
    state.currentPoint = null;
    render();
}

function handleWheel(e) {
    e.preventDefault();

    // Smoother, more precise zoom for annotation work
    const delta = e.deltaY > 0 ? 0.95 : 1.05;
    const newZoom = Math.max(0.1, Math.min(10, state.zoom * delta));

    // Zoom towards mouse cursor position
    const rect = state.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Calculate the point in image coordinates before zoom
    const beforeX = (mouseX - state.pan.x) / state.zoom;
    const beforeY = (mouseY - state.pan.y) / state.zoom;

    // Update zoom
    state.zoom = newZoom;

    // Calculate the point in image coordinates after zoom
    const afterX = (mouseX - state.pan.x) / state.zoom;
    const afterY = (mouseY - state.pan.y) / state.zoom;

    // Adjust pan to keep the mouse position fixed
    state.pan.x += (afterX - beforeX) * state.zoom;
    state.pan.y += (afterY - beforeY) * state.zoom;

    // Mark that image layer needs redraw due to zoom/pan change
    state.needsImageRedraw = true;

    render();
}

function handleTouchStart(e) {
    if (e.touches.length === 1) {
        const touch = e.touches[0];
        handleMouseDown({ clientX: touch.clientX, clientY: touch.clientY });
    }
}

function handleTouchMove(e) {
    if (e.touches.length === 1) {
        const touch = e.touches[0];
        handleMouseMove({ clientX: touch.clientX, clientY: touch.clientY });
    }
}

function handleTouchEnd(e) {
    handleMouseUp({ clientX: 0, clientY: 0 });
}

// Annotations Management
function addAnnotation(bbox, options = {}) {
    const currentImageId = state.images[state.currentImageIndex].id;
    const { labelId = state.selectedLabelId, confidence = 1.0, createdBy = 'manual' } = options;

    // Validate bounding box before adding
    const validation = validateBoundingBox(bbox, state.canvas.width, state.canvas.height);
    if (!validation.valid) {
        console.warn('Invalid annotation rejected:', validation.errors);
        showToast(`Invalid annotation: ${validation.errors.join(', ')}`, 'warning');
        return false; // Annotation rejected
    }

    if (!state.annotations[currentImageId]) {
        state.annotations[currentImageId] = [];
    }

    const annotation = {
        labelId,
        bbox: bbox,
        confidence,
        createdBy
    };

    state.annotations[currentImageId].push(annotation);

    // Update label count
    const label = state.labels.find(l => l.id === labelId);
    if (label) label.count++;

    saveToHistory();
    renderLabels();
    renderAnnotationsList();
    renderImageList();
    updateStats();
}

function addPolygonAnnotation(points) {
    const currentImageId = state.images[state.currentImageIndex].id;

    if (!state.annotations[currentImageId]) {
        state.annotations[currentImageId] = [];
    }

    // Calculate bounding box from polygon
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const bbox = {
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys)
    };

    const annotation = {
        labelId: state.selectedLabelId,
        bbox: bbox,
        polygon: points,  // Store polygon points
        confidence: 1.0,
        createdBy: 'manual'
    };

    state.annotations[currentImageId].push(annotation);

    // Update label count
    const label = state.labels.find(l => l.id === state.selectedLabelId);
    if (label) label.count++;

    saveToHistory();
    renderLabels();
    renderAnnotationsList();
    renderImageList();
    updateStats();
    render();
}

function addEllipseAnnotation(center, radiusX, radiusY) {
    const currentImageId = state.images[state.currentImageIndex].id;

    if (!state.annotations[currentImageId]) {
        state.annotations[currentImageId] = [];
    }

    // Calculate bounding box from ellipse
    const bbox = {
        x: center.x - radiusX,
        y: center.y - radiusY,
        width: radiusX * 2,
        height: radiusY * 2
    };

    const annotation = {
        labelId: state.selectedLabelId,
        bbox: bbox,
        ellipse: { center, radiusX, radiusY },  // Store ellipse parameters
        confidence: 1.0,
        createdBy: 'manual'
    };

    state.annotations[currentImageId].push(annotation);

    // Update label count
    const label = state.labels.find(l => l.id === state.selectedLabelId);
    if (label) label.count++;

    saveToHistory();
    renderLabels();
    renderAnnotationsList();
    renderImageList();
    updateStats();
    render();
}

// Keypoint Annotation Functions
function startNewKeypointInstance() {
    const currentImageId = state.images[state.currentImageIndex].id;
    const template = KEYPOINT_TEMPLATES[state.selectedKeypointTemplate];

    if (!state.keypointAnnotations[currentImageId]) {
        state.keypointAnnotations[currentImageId] = {
            template: state.selectedKeypointTemplate,
            instances: []
        };
    }

    // Create new instance with empty keypoints array
    const newInstance = {
        keypoints: new Array(template.keypoints.length).fill(null),
        bbox: null,
        labelId: state.selectedLabelId
    };

    state.keypointAnnotations[currentImageId].instances.push(newInstance);
    state.currentKeypointInstance = newInstance;
    state.currentKeypointIndex = 0;

    render();
}

function addKeypoint(x, y) {
    if (!state.currentKeypointInstance) {
        startNewKeypointInstance();
    }

    const template = KEYPOINT_TEMPLATES[state.selectedKeypointTemplate];

    if (state.currentKeypointIndex >= template.keypoints.length) {
        // All keypoints placed, start new instance
        startNewKeypointInstance();
    }

    // Add keypoint at current index
    state.currentKeypointInstance.keypoints[state.currentKeypointIndex] = {
        x: x,
        y: y,
        visibility: 2 // 0=not labeled, 1=occluded, 2=visible
    };

    // Move to next keypoint
    state.currentKeypointIndex++;

    // Update bounding box
    updateKeypointBbox(state.currentKeypointInstance);

    saveToHistory();
    render();
}

function updateKeypointBbox(instance) {
    const points = instance.keypoints.filter(kp => kp !== null);

    if (points.length === 0) {
        instance.bbox = null;
        return;
    }

    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);

    instance.bbox = {
        x: Math.min(...xs) - 10,
        y: Math.min(...ys) - 10,
        width: Math.max(...xs) - Math.min(...xs) + 20,
        height: Math.max(...ys) - Math.min(...ys) + 20
    };
}

function drawSkeleton(instance, template, isSelected = false) {
    const ctx = state.ctx;
    const colors = template.colors;

    // Draw skeleton lines
    template.skeleton.forEach(([idx1, idx2]) => {
        const kp1 = instance.keypoints[idx1];
        const kp2 = instance.keypoints[idx2];

        if (kp1 && kp2 && kp1.visibility > 0 && kp2.visibility > 0) {
            ctx.strokeStyle = kp1.visibility === 2 && kp2.visibility === 2
                ? colors.visible
                : colors.occluded;
            ctx.lineWidth = (isSelected ? 3 : 2) / state.zoom;

            ctx.beginPath();
            ctx.moveTo(kp1.x, kp1.y);
            ctx.lineTo(kp2.x, kp2.y);
            ctx.stroke();
        }
    });

    // Draw keypoint circles
    instance.keypoints.forEach((kp, idx) => {
        if (kp && kp.visibility > 0) {
            const radius = 5 / state.zoom;

            // Fill circle
            ctx.fillStyle = kp.visibility === 2 ? colors.visible : colors.occluded;
            ctx.beginPath();
            ctx.arc(kp.x, kp.y, radius, 0, Math.PI * 2);
            ctx.fill();

            // White outline
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2 / state.zoom;
            ctx.stroke();

            // Draw keypoint label if selected
            if (isSelected) {
                ctx.fillStyle = '#ffffff';
                ctx.font = `${12 / state.zoom}px sans-serif`;
                const label = template.keypoints[idx];
                ctx.fillText(label, kp.x + 8 / state.zoom, kp.y - 8 / state.zoom);
            }
        }
    });

    // Highlight next keypoint to place
    if (state.currentKeypointInstance === instance && state.currentKeypointIndex < instance.keypoints.length) {
        const nextIdx = state.currentKeypointIndex;
        const template_kp = KEYPOINT_TEMPLATES[state.selectedKeypointTemplate];

        // Show indicator for next keypoint
        ctx.fillStyle = 'rgba(59, 130, 246, 0.3)';
        ctx.font = `${14 / state.zoom}px sans-serif`;
        const text = `Next: ${template_kp.keypoints[nextIdx]} (${nextIdx + 1}/${template_kp.keypoints.length})`;
        ctx.fillText(text, 10, 30);
    }
}

function deleteAnnotation(index) {
    const currentImageId = state.images[state.currentImageIndex].id;
    const annotations = state.annotations[currentImageId];

    if (!annotations || index >= annotations.length) return;

    const ann = annotations[index];
    const label = state.labels.find(l => l.id === ann.labelId);
    if (label && label.count > 0) label.count--;

    annotations.splice(index, 1);

    if (state.selectedAnnotationId === index) {
        state.selectedAnnotationId = null;
    }

    saveToHistory();
    renderLabels();
    renderAnnotationsList();
    renderImageList();
    render();
    updateStats();
    updateSam2Hint();
}

function deleteSelected() {
    if (state.selectedAnnotationId !== null) {
        deleteAnnotation(state.selectedAnnotationId);
    }
}

function isPointInBox(point, bbox) {
    return point.x >= bbox.x && point.x <= bbox.x + bbox.width &&
           point.y >= bbox.y && point.y <= bbox.y + bbox.height;
}

// UI Rendering
function renderLabels() {
    const container = document.getElementById('labelsList');

    container.innerHTML = state.labels.map(label => `
        <div class="label-item ${label.id === state.selectedLabelId ? 'active' : ''}"
             onclick="selectLabel(${label.id})">
            <div class="label-color" style="background: ${label.color};"></div>
            <div class="label-name">${label.name}</div>
            <div class="label-count">${label.count}</div>
        </div>
    `).join('');
}

/**
 * Optimized annotation list rendering using DocumentFragment
 * Avoids expensive innerHTML reflows
 */
function renderAnnotationsList() {
    const container = document.getElementById('annotationsList');
    const currentImageId = state.images[state.currentImageIndex]?.id;
    const annotations = state.annotations[currentImageId] || [];

    if (annotations.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">${ICONS.note}</div>
                <div>No annotations yet</div>
            </div>
        `;
        document.getElementById('annotationCount').textContent = '0';
        return;
    }

    // Use DocumentFragment for batch DOM updates (single reflow)
    const fragment = document.createDocumentFragment();

    annotations.forEach((ann, idx) => {
        const label = state.labels.find(l => l.id === ann.labelId);
        const isSelected = state.selectedAnnotationId === idx;

        // Create elements directly (faster than innerHTML parsing)
        const card = document.createElement('div');
        card.className = `annotation-card${isSelected ? ' selected' : ''}`;
        card.onclick = () => selectAnnotation(idx);

        const header = document.createElement('div');
        header.className = 'annotation-header';

        const labelDiv = document.createElement('div');
        labelDiv.className = 'annotation-label';
        labelDiv.style.color = label ? label.color : '#3b82f6';
        labelDiv.textContent = label ? label.name : 'Unknown';

        const actions = document.createElement('div');
        actions.className = 'annotation-actions';

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'icon-btn delete';
        deleteBtn.innerHTML = ICONS.trash;
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            deleteAnnotation(idx);
        };

        const coords = document.createElement('div');
        coords.className = 'annotation-coords';
        coords.innerHTML = `x: ${Math.round(ann.bbox.x)}, y: ${Math.round(ann.bbox.y)}<br>w: ${Math.round(ann.bbox.width)}, h: ${Math.round(ann.bbox.height)}`;

        // Assemble DOM tree
        actions.appendChild(deleteBtn);
        header.appendChild(labelDiv);
        header.appendChild(actions);
        card.appendChild(header);
        card.appendChild(coords);
        fragment.appendChild(card);
    });

    // Single DOM update (single reflow)
    container.replaceChildren(fragment);

    document.getElementById('annotationCount').textContent = annotations.length;
}

function selectLabel(labelId) {
    state.selectedLabelId = labelId;
    renderLabels();
}

function selectAnnotation(index) {
    state.selectedAnnotationId = index;
    renderAnnotationsList();
    render();
    updateSam2Hint();
    updateTrackingUI(); // Update tracking buttons when selection changes
}

function addNewLabel() {
    const name = prompt('Enter label name:');
    if (!name) return;

    const labelId = ensureLabel(name);
    state.selectedLabelId = labelId;
    renderLabels();
}

function ensureLabel(name) {
    const existing = state.labels.find(label => label.name === name);
    if (existing) return existing.id;

    const colors = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
    const color = colors[state.labels.length % colors.length];

    state.labels.push({
        id: state.labels.length,
        name,
        color,
        count: 0
    });

    return state.labels.length - 1;
}

function getDatasetLabelName() {
    const input = document.getElementById('datasetPath');
    const rawPath = (input && input.value ? input.value : '').trim();
    if (!rawPath) return null;
    const parts = rawPath.split(/[\\/]/).filter(Boolean);
    if (!parts.length) return null;
    return parts[parts.length - 1];
}

function getAiConfidenceThreshold() {
    const input = document.getElementById('aiConfidence');
    const rawValue = input && input.value !== undefined ? input.value : '';
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) return 0.85;
    return Math.min(1, Math.max(0, parsed));
}

function setupAiThresholdLabel() {
    const input = document.getElementById('aiConfidence');
    if (!input) return;
    const updateLabel = () => {
        const label = document.getElementById('aiThresholdLabel');
        if (!label) return;
        const value = getAiConfidenceThreshold();
        label.textContent = `conf: ${value.toFixed(2)}`;
    };
    input.addEventListener('input', updateLabel);
    updateLabel();
}

const HELP_TOOLTIPS = {
    aiThreshold: 'Range 0.00–1.00. Higher = stricter detections (fewer boxes); lower = more detections.',
    aiEngine: 'Choose YOLO for auto-detect, SAM2 to refine a selected box, or Gemini when configured.'
};

function applyHelpTooltips() {
    document.querySelectorAll('[data-help]').forEach((el) => {
        const key = el.getAttribute('data-help');
        const text = key && HELP_TOOLTIPS[key];
        if (text) {
            el.setAttribute('title', text);
            el.setAttribute('aria-label', text);
        }
    });
}

function getAiEngine() {
    const select = document.getElementById('aiEngine');
    return select && select.value ? select.value : 'yolo';
}

function getSam2AutoRefineEnabled() {
    const input = document.getElementById('aiRefineWithSam2');
    return Boolean(input && input.checked);
}

function setupSam2Hint() {
    const select = document.getElementById('aiEngine');
    if (!select) return;
    select.addEventListener('change', updateSam2Hint);
    updateSam2Hint();
}

function updateSam2Hint() {
    const hint = document.getElementById('sam2Hint');
    const drawBtn = document.getElementById('sam2DrawBox');
    const spinner = document.getElementById('sam2Spinner');
    if (!hint || !drawBtn || !spinner) return;
    const isSam2 = getAiEngine() === 'sam2';
    const shouldShow = isSam2 && state.selectedAnnotationId === null;
    hint.style.display = shouldShow ? 'inline-flex' : 'none';
    drawBtn.style.display = shouldShow ? 'inline-flex' : 'none';
    spinner.style.display = 'none';

    const refineToggle = document.getElementById('aiRefineToggle');
    if (refineToggle) {
        refineToggle.style.display = getAiEngine() === 'yolo' ? 'block' : 'none';
    }
}

function setSam2SpinnerVisible(visible) {
    const spinner = document.getElementById('sam2Spinner');
    const button = document.getElementById('aiDetectBtn');
    const engineSelect = document.getElementById('aiEngine');
    const status = document.getElementById('sam2Status');
    const done = document.getElementById('sam2Done');
    if (!spinner) return;
    if (visible) {
        spinner.style.display = 'inline-flex';
        requestAnimationFrame(() => {
            spinner.style.opacity = '1';
            spinner.style.transform = 'translateY(0)';
        });
    } else {
        spinner.style.opacity = '0';
        spinner.style.transform = 'translateY(2px)';
        setTimeout(() => {
            spinner.style.display = 'none';
        }, 200);
    }
    if (status) {
        if (visible) {
            status.style.display = 'inline-flex';
            requestAnimationFrame(() => {
                status.style.opacity = '1';
                status.style.transform = 'translateY(0)';
            });
        } else {
            status.style.opacity = '0';
            status.style.transform = 'translateY(2px)';
            setTimeout(() => {
                status.style.display = 'none';
            }, 200);
        }
    }
    if (done) {
        done.style.display = 'none';
        done.style.opacity = '0';
        done.style.transform = 'translateY(2px)';
    }
    if (button) {
        button.disabled = visible;
    }
    if (engineSelect) {
        engineSelect.disabled = visible;
    }
}

function showSam2DoneTick() {
    const done = document.getElementById('sam2Done');
    if (!done) return;
    done.style.display = 'inline-flex';
    requestAnimationFrame(() => {
        done.style.opacity = '1';
        done.style.transform = 'translateY(0)';
    });
    setTimeout(() => {
        done.style.opacity = '0';
        done.style.transform = 'translateY(2px)';
        setTimeout(() => {
            done.style.display = 'none';
        }, 200);
    }, 900);
}

function switchToBoxTool() {
    const select = document.getElementById('aiEngine');
    if (select) {
        select.value = 'sam2';
    }
    setTool('bbox');
    if (state.canvas && typeof state.canvas.focus === 'function') {
        state.canvas.focus();
    }
    updateSam2Hint();
}

// Tools
function setTool(tool) {
    state.currentTool = tool;

    // Reset polygon if switching away
    if (tool !== 'polygon') {
        state.polygonPoints = [];
    }

    // Show/hide mask tool controls
    const maskToolControls = document.getElementById('maskToolControls');
    if (maskToolControls) {
        maskToolControls.style.display = ['brush', 'eraser', 'fill'].includes(tool) ? 'block' : 'none';
    }

    // Update UI
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-tool="${tool}"]`)?.classList.add('active');

    const toolNames = {
        'bbox': 'Box',
        'select': 'Select',
        'polygon': 'Polygon',
        'ellipse': 'Ellipse',
        'keypoint': 'Keypoint',
        'brush': 'Brush',
        'eraser': 'Eraser',
        'fill': 'Fill'
    };
    document.getElementById('currentTool').textContent = toolNames[tool] || tool;

    // Update cursor
    const cursors = {
        'bbox': 'crosshair',
        'select': 'default',
        'polygon': 'crosshair',
        'ellipse': 'crosshair',
        'keypoint': 'crosshair',
        'brush': 'crosshair',
        'eraser': 'crosshair',
        'fill': 'crosshair'
    };
    state.canvas.style.cursor = cursors[tool] || 'default';
}

// Mask tool control functions
function updateBrushSize(value) {
    state.brushSize = parseInt(value);
    document.getElementById('brushSizeValue').textContent = value;
}

function updateBrushOpacity(value) {
    state.brushOpacity = parseInt(value) / 100;
    document.getElementById('brushOpacityValue').textContent = value;

    // Update mask colors with new opacity
    state.labels.forEach(label => {
        state.maskColors[label.id] = hexToRGBA(label.color, state.brushOpacity);
    });
}

// Mask drawing functions
function drawMaskBrush(x, y, isErasing = false) {
    if (!state.maskCtx || !state.currentImage) return;

    const currentImageId = state.images[state.currentImageIndex]?.id;
    if (!currentImageId) return;

    // Ensure mask layer exists
    if (!state.maskLayers[currentImageId]) {
        state.maskLayers[currentImageId] = state.maskCtx.createImageData(state.canvas.width, state.canvas.height);
    }

    const maskData = state.maskLayers[currentImageId];
    const label = state.labels.find(l => l.id === state.selectedLabelId);
    if (!label && !isErasing) return;

    // Get color components
    let r = 0, g = 0, b = 0, a = 0;
    if (!isErasing) {
        const color = label.color;
        r = parseInt(color.slice(1, 3), 16);
        g = parseInt(color.slice(3, 5), 16);
        b = parseInt(color.slice(5, 7), 16);
        a = Math.floor(state.brushOpacity * 255);
    }

    // Draw circular brush
    const radius = state.brushSize / state.zoom;
    for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist <= radius) {
                const px = Math.floor(x + dx);
                const py = Math.floor(y + dy);

                if (px >= 0 && px < maskData.width && py >= 0 && py < maskData.height) {
                    const idx = (py * maskData.width + px) * 4;
                    maskData.data[idx] = r;
                    maskData.data[idx + 1] = g;
                    maskData.data[idx + 2] = b;
                    maskData.data[idx + 3] = a;
                }
            }
        }
    }

    state.maskLayers[currentImageId] = maskData;
    render();
}

// Flood fill (bucket fill) tool
function floodFill(startX, startY) {
    if (!state.maskCtx || !state.currentImage) return;

    const currentImageId = state.images[state.currentImageIndex]?.id;
    if (!currentImageId) return;

    // Ensure mask layer exists
    if (!state.maskLayers[currentImageId]) {
        state.maskLayers[currentImageId] = state.maskCtx.createImageData(state.canvas.width, state.canvas.height);
    }

    const maskData = state.maskLayers[currentImageId];
    const label = state.labels.find(l => l.id === state.selectedLabelId);
    if (!label) return;

    const width = maskData.width;
    const height = maskData.height;
    const data = maskData.data;

    // Get target color (color we're filling)
    const startIdx = (Math.floor(startY) * width + Math.floor(startX)) * 4;
    const targetR = data[startIdx];
    const targetG = data[startIdx + 1];
    const targetB = data[startIdx + 2];
    const targetA = data[startIdx + 3];

    // Get fill color
    const color = label.color;
    const fillR = parseInt(color.slice(1, 3), 16);
    const fillG = parseInt(color.slice(3, 5), 16);
    const fillB = parseInt(color.slice(5, 7), 16);
    const fillA = Math.floor(state.brushOpacity * 255);

    // Don't fill if already the same color
    if (targetR === fillR && targetG === fillG && targetB === fillB && targetA === fillA) {
        return;
    }

    // Stack-based flood fill to avoid recursion stack overflow
    const stack = [[Math.floor(startX), Math.floor(startY)]];
    const visited = new Set();

    while (stack.length > 0) {
        const [x, y] = stack.pop();

        // Check bounds
        if (x < 0 || x >= width || y < 0 || y >= height) continue;

        // Check if already visited
        const key = `${x},${y}`;
        if (visited.has(key)) continue;
        visited.add(key);

        // Check if pixel matches target color
        const idx = (y * width + x) * 4;
        if (data[idx] !== targetR || data[idx + 1] !== targetG ||
            data[idx + 2] !== targetB || data[idx + 3] !== targetA) {
            continue;
        }

        // Fill this pixel
        data[idx] = fillR;
        data[idx + 1] = fillG;
        data[idx + 2] = fillB;
        data[idx + 3] = fillA;

        // Add neighbors to stack
        stack.push([x + 1, y]);
        stack.push([x - 1, y]);
        stack.push([x, y + 1]);
        stack.push([x, y - 1]);
    }

    state.maskLayers[currentImageId] = maskData;
    saveToHistory();
    render();
}

// Zoom (slower, more precise for annotation work)
function zoomIn() {
    state.zoom = Math.min(10, state.zoom * 1.1); // Increased max zoom to 10x, slower increment
    render();
}

function zoomOut() {
    state.zoom = Math.max(0.1, state.zoom / 1.1); // Slower decrement
    render();
}

function resetZoom() {
    state.zoom = 1;
    state.pan = { x: 0, y: 0 };
    render();
}

function setZoom(zoomLevel) {
    state.zoom = Math.max(0.1, Math.min(10, zoomLevel));
    render();
}

// History
function saveToHistory() {
    // Remove any history after current index
    state.history = state.history.slice(0, state.historyIndex + 1);

    // Add current state
    state.history.push(JSON.stringify(state.annotations));
    state.historyIndex++;

    // Limit history to 50 steps
    if (state.history.length > 50) {
        state.history.shift();
        state.historyIndex--;
    }
}

function initializeHistory() {
    state.history = [JSON.stringify(state.annotations)];
    state.historyIndex = 0;
}

function undo() {
    if (state.historyIndex > 0) {
        state.historyIndex--;
        state.annotations = JSON.parse(state.history[state.historyIndex]);
        renderAnnotationsList();
        renderImageList();
        render();
        updateStats();
    }
}

function redo() {
    if (state.historyIndex < state.history.length - 1) {
        state.historyIndex++;
        state.annotations = JSON.parse(state.history[state.historyIndex]);
        renderAnnotationsList();
        renderImageList();
        render();
        updateStats();
    }
}

// Navigation
function nextImage() {
    if (state.currentImageIndex < state.images.length - 1) {
        loadImage(state.currentImageIndex + 1);
    }
}

function previousImage() {
    if (state.currentImageIndex > 0) {
        loadImage(state.currentImageIndex - 1);
    }
}

// Keyboard Shortcuts
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Don't trigger if typing in input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        // Prevent default for our shortcuts
        const shouldPrevent = ['a', 'b', 'v', 'p', 'l', 'k', 'm', 'e', 'f', '0', '+', '-', 'ArrowLeft', 'ArrowRight', 'Delete', 'Escape'].includes(e.key) ||
                             (e.ctrlKey && ['z', 'y'].includes(e.key.toLowerCase()));

        if (shouldPrevent) {
            e.preventDefault();
        }

        // Tools
        if (e.key === 'b') setTool('bbox');
        if (e.key === 'v') setTool('select');
        if (e.key === 'p') setTool('polygon');
        if (e.key === 'l') setTool('ellipse');
        if (e.key === 'k') setTool('keypoint');
        if (e.key === 'm') setTool('brush');
        if (e.key === 'e') setTool('eraser');
        if (e.key === 'f') setTool('fill');

        // Actions
        if (e.key === 'a' && !e.ctrlKey && !e.metaKey) {
            aiAutoAnnotate();
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (!e.ctrlKey && !e.metaKey) {
                deleteSelected();
            }
        }
        if (e.key === 'Enter' && state.isPreviewMode) {
            acceptSelectedDetections();
        }
        if (e.key === 'Escape') {
            // Exit preview mode
            if (state.isPreviewMode) {
                rejectAllPreviews();
            }
            // Cancel polygon
            else if (state.currentTool === 'polygon' && state.polygonPoints.length > 0) {
                state.polygonPoints = [];
                render();
            } else {
                // Deselect
                state.selectedAnnotationId = null;
                renderAnnotationsList();
                render();
            }
        }
        if (e.ctrlKey && e.key === 'z') undo();
        if (e.ctrlKey && e.key === 'y') redo();

        // Navigation
        if (e.key === 'ArrowRight') nextImage();
        if (e.key === 'ArrowLeft') previousImage();

        // Zoom
        if (e.key === '+' || e.key === '=') zoomIn();
        if (e.key === '-') zoomOut();
        if (e.key === '0') resetZoom();

        // Help
        if (e.key === '?') showShortcuts();
    });
}

// Shortcuts Help
function showShortcuts() {
    // Use new keyboard shortcuts overlay
    showKeyboardShortcuts();
}

function hideShortcuts() {
    document.getElementById('overlay').classList.remove('visible');
    document.getElementById('shortcutsHelp').classList.remove('visible');
}

// Stats
function updateStats() {
    document.getElementById('currentImageIndex').textContent = state.currentImageIndex + 1;
    document.getElementById('totalImages').textContent = state.images.length;

    const annotatedCount = Object.keys(state.annotations).filter(key =>
        state.annotations[key].length > 0
    ).length;
    document.getElementById('annotatedCount').textContent = annotatedCount;

    const totalBoxes = Object.values(state.annotations).reduce((sum, anns) =>
        sum + anns.length, 0
    );
    document.getElementById('totalBoxes').textContent = totalBoxes;
}

// Filter Images
function filterImages(query) {
    const items = document.querySelectorAll('.image-item');
    items.forEach(item => {
        const name = item.querySelector('.image-name').textContent.toLowerCase();
        if (name.includes(query.toLowerCase())) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

// AI Preview Mode Functions
async function runAIPreview() {
    if (!state.currentImage) {
        alert('No image loaded');
        return;
    }

    const actionId = window.appLogger?.startAction('runAIPreview');

    try {
        setSam2SpinnerVisible(true);
        const imageData = state.images[state.currentImageIndex];
        const datasetLabel = getDatasetLabelName();
        const fallbackLabel = state.labels.find(l => l.id === state.selectedLabelId)?.name || 'product';
        const labelName = datasetLabel || fallbackLabel;

        window.appLogger?.info('Running AI preview', {
            engine: 'yolo',
            confidence: getAiConfidenceThreshold()
        });

        const response = await fetch('/api/auto-annotate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                image_path: imageData.path,
                confidence: getAiConfidenceThreshold(),
                label: labelName,
                target_class: 'bottle'
            })
        });

        if (!response.ok) {
            const errorPayload = await response.json().catch(() => null);
            throw new Error(errorPayload?.error || 'AI detection failed');
        }

        const payload = await response.json();
        if (!payload.success) {
            throw new Error(payload.error || 'AI detection failed');
        }

        const detections = Array.isArray(payload.detections) ? payload.detections : [];

        if (detections.length === 0) {
            alert(`No detections found at ${(getAiConfidenceThreshold() * 100).toFixed(0)}% confidence.\n\nTry lowering the confidence threshold.`);
            setSam2SpinnerVisible(false);
            return;
        }

        // Convert detections to canvas coordinates
        const scaleX = state.canvas.width / state.currentImage.width;
        const scaleY = state.canvas.height / state.currentImage.height;

        state.aiPreviewDetections = detections.map(det => ({
            bbox: {
                x: det.x * scaleX,
                y: det.y * scaleY,
                width: det.width * scaleX,
                height: det.height * scaleY
            },
            confidence: det.confidence,
            labelName: labelName
        }));

        // Select all by default
        state.selectedPreviewIndices = new Set(
            state.aiPreviewDetections.map((_, idx) => idx)
        );

        state.isPreviewMode = true;
        setSam2SpinnerVisible(false);
        render();
        updatePreviewUI();

        window.appLogger?.info('AI preview ready', {
            detections: detections.length
        });
        if (actionId) window.appLogger.endAction(actionId, true, { count: detections.length });

    } catch (error) {
        setSam2SpinnerVisible(false);
        console.error('AI preview error:', error);
        window.appLogger?.error('AI preview failed', {}, { error: error.message });
        alert('AI detection failed: ' + error.message);
        if (actionId) window.appLogger.failAction(actionId, error);
    }
}

function togglePreviewSelection(index) {
    if (state.selectedPreviewIndices.has(index)) {
        state.selectedPreviewIndices.delete(index);
    } else {
        state.selectedPreviewIndices.add(index);
    }
    render();
    updatePreviewUI();
}

function selectAllPreviews() {
    state.selectedPreviewIndices = new Set(
        state.aiPreviewDetections.map((_, idx) => idx)
    );
    render();
    updatePreviewUI();
}

function deselectAllPreviews() {
    state.selectedPreviewIndices.clear();
    render();
    updatePreviewUI();
}

function acceptSelectedDetections() {
    const datasetLabel = getDatasetLabelName();
    const fallbackLabel = state.labels.find(l => l.id === state.selectedLabelId)?.name || 'product';
    const labelName = datasetLabel || fallbackLabel;
    const labelId = ensureLabel(labelName);

    let acceptedCount = 0;
    state.selectedPreviewIndices.forEach(idx => {
        const det = state.aiPreviewDetections[idx];
        if (det) {
            addAnnotation(det.bbox, {
                labelId,
                confidence: det.confidence,
                createdBy: 'ai-preview'
            });
            acceptedCount++;
        }
    });

    // Exit preview mode
    state.isPreviewMode = false;
    state.aiPreviewDetections = [];
    state.selectedPreviewIndices.clear();

    render();
    updatePreviewUI();
    window.appLogger?.info('Accepted AI detections', { count: acceptedCount });
    alert(`✅ Accepted ${acceptedCount} detection(s)`);
}

function rejectAllPreviews() {
    state.isPreviewMode = false;
    state.aiPreviewDetections = [];
    state.selectedPreviewIndices.clear();
    render();
    updatePreviewUI();
}

function updatePreviewUI() {
    const controls = document.getElementById('aiPreviewControls');
    const stats = document.getElementById('aiPreviewStats');

    if (!controls) return; // UI not ready yet

    if (state.isPreviewMode) {
        controls.style.display = 'block';
        if (stats) {
            const total = state.aiPreviewDetections.length;
            const selected = state.selectedPreviewIndices.size;
            stats.textContent = `${selected} of ${total} selected`;
        }
    } else {
        controls.style.display = 'none';
    }
}

// AI Auto-Annotation
async function aiAutoAnnotate() {
    if (!state.currentImage) {
        alert('No image loaded');
        return;
    }

    const engine = getAiEngine();

    // For YOLO, use preview mode
    if (engine === 'yolo') {
        await runAIPreview();
        return;
    }

    // For SAM2 and Gemini, use original flow
    const engineLabel = engine === 'sam2' ? 'refine with SAM2' : 'auto-detect bottles';
    const confirmed = confirm(`Use AI to ${engineLabel} in this image?`);
    if (!confirmed) return;

    try {
        const imageData = state.images[state.currentImageIndex];
        const datasetLabel = getDatasetLabelName();
        const fallbackLabel = state.labels.find(l => l.id === state.selectedLabelId)?.name || 'product';
        const labelName = datasetLabel || fallbackLabel;
        const labelId = ensureLabel(labelName);

        state.selectedLabelId = labelId;
        renderLabels();

        if (engine === 'sam2') {
            if (state.selectedAnnotationId === null) {
                alert('Select or draw a rough box first, then refine with SAM2.');
                return;
            }

            const currentImageId = state.images[state.currentImageIndex].id;
            const annotations = state.annotations[currentImageId] || [];
            const selected = annotations[state.selectedAnnotationId];
            if (!selected) {
                alert('Selected annotation not found.');
                return;
            }

            setSam2SpinnerVisible(true);
            const toImageScaleX = state.currentImage.width / state.canvas.width;
            const toImageScaleY = state.currentImage.height / state.canvas.height;

            const response = await fetch('/api/segment/sam2', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image_path: imageData.path,
                    box: {
                        x: selected.bbox.x * toImageScaleX,
                        y: selected.bbox.y * toImageScaleY,
                        width: selected.bbox.width * toImageScaleX,
                        height: selected.bbox.height * toImageScaleY
                    }
                })
            });

            if (!response.ok) {
                const errorPayload = await response.json().catch(() => null);
                throw new Error(errorPayload?.error || errorPayload?.message || 'SAM2 refinement failed');
            }

            const payload = await response.json();
            if (!payload.success || !payload.bbox) {
                throw new Error(payload.error || payload.message || 'SAM2 refinement failed');
            }

            const toCanvasScaleX = state.canvas.width / state.currentImage.width;
            const toCanvasScaleY = state.canvas.height / state.currentImage.height;
            selected.bbox = {
                x: payload.bbox.x * toCanvasScaleX,
                y: payload.bbox.y * toCanvasScaleY,
                width: payload.bbox.width * toCanvasScaleX,
                height: payload.bbox.height * toCanvasScaleY
            };
            selected.confidence = payload.score ?? selected.confidence;
            selected.createdBy = 'sam2';

            saveToHistory();
            renderAnnotationsList();
            renderImageList();
            render();
            updateStats();
            setSam2SpinnerVisible(false);
            showSam2DoneTick();
            return;
        }

        if (engine === 'gemini') {
            alert('Gemini auto-annotation is not configured yet.');
            return;
        }

        const response = await fetch('/api/auto-annotate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                image_path: imageData.path,
                confidence: getAiConfidenceThreshold(),
                label: labelName,
                target_class: 'bottle'
            })
        });

        if (!response.ok) {
            const errorPayload = await response.json().catch(() => null);
            throw new Error(errorPayload?.error || errorPayload?.message || 'Auto-annotation failed');
        }

        const payload = await response.json();
        if (!payload.success) {
            throw new Error(payload.error || payload.message || 'Auto-annotation failed');
        }

        const detections = Array.isArray(payload.detections) ? payload.detections : [];
        if (detections.length === 0) {
            alert('No bottle detected at the current threshold.');
            return;
        }

        const best = detections.reduce((top, det) => (
            det.confidence > top.confidence ? det : top
        ), detections[0]);

        const scaleX = state.canvas.width / state.currentImage.width;
        const scaleY = state.canvas.height / state.currentImage.height;
        const bbox = {
            x: best.x * scaleX,
            y: best.y * scaleY,
            width: best.width * scaleX,
            height: best.height * scaleY
        };

        addAnnotation(bbox, {
            labelId,
            confidence: best.confidence,
            createdBy: 'ai'
        });

        if (getSam2AutoRefineEnabled()) {
            const currentImageId = state.images[state.currentImageIndex].id;
            const annotations = state.annotations[currentImageId] || [];
            const lastIndex = annotations.length - 1;
            const created = annotations[lastIndex];
            if (!created) return;

            setSam2SpinnerVisible(true);
            const toImageScaleX = state.currentImage.width / state.canvas.width;
            const toImageScaleY = state.currentImage.height / state.canvas.height;

            const refineResponse = await fetch('/api/segment/sam2', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image_path: imageData.path,
                    box: {
                        x: created.bbox.x * toImageScaleX,
                        y: created.bbox.y * toImageScaleY,
                        width: created.bbox.width * toImageScaleX,
                        height: created.bbox.height * toImageScaleY
                    }
                })
            });

            if (!refineResponse.ok) {
                const errorPayload = await refineResponse.json().catch(() => null);
                throw new Error(errorPayload?.error || errorPayload?.message || 'SAM2 refinement failed');
            }

            const refinePayload = await refineResponse.json();
            if (!refinePayload.success || !refinePayload.bbox) {
                throw new Error(refinePayload.error || refinePayload.message || 'SAM2 refinement failed');
            }

            const toCanvasScaleX = state.canvas.width / state.currentImage.width;
            const toCanvasScaleY = state.canvas.height / state.currentImage.height;
            created.bbox = {
                x: refinePayload.bbox.x * toCanvasScaleX,
                y: refinePayload.bbox.y * toCanvasScaleY,
                width: refinePayload.bbox.width * toCanvasScaleX,
                height: refinePayload.bbox.height * toCanvasScaleY
            };
            created.confidence = refinePayload.score ?? created.confidence;
            created.createdBy = 'sam2';

            saveToHistory();
            renderAnnotationsList();
            renderImageList();
            render();
            updateStats();
            setSam2SpinnerVisible(false);
            showSam2DoneTick();
        }
    } catch (error) {
        setSam2SpinnerVisible(false);
        console.error('AI annotation error:', error);
        alert('AI annotation failed: ' + error.message);
    }
}

// Save Progress
async function saveProgress() {
    try {
        const data = {
            annotations: state.annotations,
            labels: state.labels,
            images: state.images,
            timestamp: new Date().toISOString()
        };

        // Save to local storage
        localStorage.setItem('annotation_progress', JSON.stringify(data));

        alert('✅ Progress saved successfully!');
    } catch (error) {
        console.error('Save error:', error);
        alert('Failed to save progress');
    }
}

// Mask to polygon approximation using contour tracing
function maskToPolygon(maskData, imageId) {
    const width = maskData.width;
    const height = maskData.height;
    const data = maskData.data;

    // Find contours for each label
    const contours = {};

    // Create binary masks for each label
    const labelMasks = {};
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            const alpha = data[idx + 3];

            if (alpha > 0) {
                // Get label color
                const r = data[idx];
                const g = data[idx + 1];
                const b = data[idx + 2];
                const colorKey = `${r},${g},${b}`;

                if (!labelMasks[colorKey]) {
                    labelMasks[colorKey] = new Set();
                }
                labelMasks[colorKey].add(`${x},${y}`);
            }
        }
    }

    // Simple boundary tracing for each label
    Object.entries(labelMasks).forEach(([colorKey, pixels]) => {
        const boundary = [];
        const visited = new Set();

        // Find starting point (topmost, leftmost pixel)
        let startX = width, startY = height;
        pixels.forEach(pixelKey => {
            const [x, y] = pixelKey.split(',').map(Number);
            if (y < startY || (y === startY && x < startX)) {
                startX = x;
                startY = y;
            }
        });

        // Trace boundary (simplified Moore-Neighbor tracing)
        let x = startX, y = startY;
        const directions = [[0,-1], [1,-1], [1,0], [1,1], [0,1], [-1,1], [-1,0], [-1,-1]];
        let dir = 0;

        do {
            boundary.push([x, y]);
            visited.add(`${x},${y}`);

            // Find next boundary pixel
            let found = false;
            for (let i = 0; i < 8; i++) {
                const [dx, dy] = directions[(dir + i) % 8];
                const nx = x + dx, ny = y + dy;
                const key = `${nx},${ny}`;

                if (pixels.has(key) && !visited.has(key)) {
                    x = nx;
                    y = ny;
                    dir = (dir + i + 6) % 8; // Turn left
                    found = true;
                    break;
                }
            }

            if (!found || boundary.length > 1000) break;
        } while (x !== startX || y !== startY);

        if (boundary.length > 2) {
            contours[colorKey] = boundary;
        }
    });

    return contours;
}

// Export Annotations with multiple format support
async function exportAnnotations(format = 'yolo') {
    try {
        const imgWidth = state.currentImage ? state.currentImage.width : state.canvas.width;
        const imgHeight = state.currentImage ? state.currentImage.height : state.canvas.height;

        if (format === 'coco') {
            // COCO JSON format
            const cocoData = {
                info: {
                    description: "Product Capture 360 Annotations",
                    version: "1.0",
                    year: new Date().getFullYear(),
                    date_created: new Date().toISOString()
                },
                licenses: [],
                images: [],
                annotations: [],
                categories: state.labels.map(label => ({
                    id: label.id,
                    name: label.name,
                    supercategory: "product"
                }))
            };

            let annotationId = 1;

            state.images.forEach((image, imageIdx) => {
                cocoData.images.push({
                    id: image.id,
                    file_name: image.filename,
                    width: imgWidth,
                    height: imgHeight
                });

                const annotations = state.annotations[image.id] || [];
                annotations.forEach(ann => {
                    const scaleX = imgWidth / state.canvas.width;
                    const scaleY = imgHeight / state.canvas.height;

                    const annotation = {
                        id: annotationId++,
                        image_id: image.id,
                        category_id: ann.labelId,
                        score: ann.confidence || 1.0,
                        iscrowd: 0
                    };

                    if (ann.ellipse) {
                        // Ellipse - approximate as polygon for COCO format
                        const numPoints = 32; // Number of points to approximate ellipse
                        const points = [];
                        for (let i = 0; i < numPoints; i++) {
                            const angle = (i / numPoints) * 2 * Math.PI;
                            const x = (ann.ellipse.center.x + Math.cos(angle) * ann.ellipse.radiusX) * scaleX;
                            const y = (ann.ellipse.center.y + Math.sin(angle) * ann.ellipse.radiusY) * scaleY;
                            points.push(x, y);
                        }
                        annotation.segmentation = [points];

                        // Bounding box from ellipse
                        const bbox = [
                            (ann.ellipse.center.x - ann.ellipse.radiusX) * scaleX,
                            (ann.ellipse.center.y - ann.ellipse.radiusY) * scaleY,
                            ann.ellipse.radiusX * 2 * scaleX,
                            ann.ellipse.radiusY * 2 * scaleY
                        ];
                        annotation.bbox = bbox;
                        annotation.area = Math.PI * ann.ellipse.radiusX * ann.ellipse.radiusY * scaleX * scaleY;
                    } else if (ann.polygon && ann.polygon.length > 0) {
                        // Polygon segmentation
                        const points = ann.polygon.flatMap(p => [
                            p.x * scaleX,
                            p.y * scaleY
                        ]);
                        annotation.segmentation = [points];

                        // Calculate bbox and area from polygon
                        const xs = ann.polygon.map(p => p.x * scaleX);
                        const ys = ann.polygon.map(p => p.y * scaleY);
                        const bbox = [
                            Math.min(...xs),
                            Math.min(...ys),
                            Math.max(...xs) - Math.min(...xs),
                            Math.max(...ys) - Math.min(...ys)
                        ];
                        annotation.bbox = bbox;
                        annotation.area = bbox[2] * bbox[3];
                    } else {
                        // Bounding box
                        const bbox = [
                            ann.bbox.x * scaleX,
                            ann.bbox.y * scaleY,
                            ann.bbox.width * scaleX,
                            ann.bbox.height * scaleY
                        ];
                        annotation.bbox = bbox;
                        annotation.area = bbox[2] * bbox[3];
                        annotation.segmentation = [];
                    }

                    cocoData.annotations.push(annotation);
                });

                // Export masks if they exist
                if (state.maskLayers[image.id]) {
                    const maskPolygons = maskToPolygon(state.maskLayers[image.id], image.id);

                    Object.entries(maskPolygons).forEach(([colorKey, boundary]) => {
                        const [r, g, b] = colorKey.split(',').map(Number);

                        // Find label by color
                        const label = state.labels.find(l => {
                            const lr = parseInt(l.color.slice(1, 3), 16);
                            const lg = parseInt(l.color.slice(3, 5), 16);
                            const lb = parseInt(l.color.slice(5, 7), 16);
                            return Math.abs(lr - r) < 10 && Math.abs(lg - g) < 10 && Math.abs(lb - b) < 10;
                        });

                        if (label && boundary.length > 2) {
                            const scaleX = imgWidth / state.canvas.width;
                            const scaleY = imgHeight / state.canvas.height;

                            const points = boundary.flatMap(([x, y]) => [x * scaleX, y * scaleY]);
                            const xs = boundary.map(([x]) => x * scaleX);
                            const ys = boundary.map(([, y]) => y * scaleY);

                            const bbox = [
                                Math.min(...xs),
                                Math.min(...ys),
                                Math.max(...xs) - Math.min(...xs),
                                Math.max(...ys) - Math.min(...ys)
                            ];

                            cocoData.annotations.push({
                                id: annotationId++,
                                image_id: image.id,
                                category_id: label.id,
                                segmentation: [points],
                                bbox: bbox,
                                area: bbox[2] * bbox[3],
                                score: 1.0,
                                iscrowd: 0
                            });
                        }
                    });
                }

                // Export keypoint annotations if they exist
                if (state.keypointAnnotations[image.id]) {
                    const keypointData = state.keypointAnnotations[image.id];
                    const template = KEYPOINT_TEMPLATES[keypointData.template];

                    keypointData.instances.forEach(instance => {
                        const scaleX = imgWidth / state.canvas.width;
                        const scaleY = imgHeight / state.canvas.height;

                        // Flatten keypoints to COCO format: [x1, y1, v1, x2, y2, v2, ...]
                        const keypoints = [];
                        let numKeypoints = 0;

                        instance.keypoints.forEach(kp => {
                            if (kp) {
                                keypoints.push(
                                    kp.x * scaleX,
                                    kp.y * scaleY,
                                    kp.visibility
                                );
                                if (kp.visibility > 0) numKeypoints++;
                            } else {
                                keypoints.push(0, 0, 0);
                            }
                        });

                        // Create COCO keypoint annotation
                        const bbox = instance.bbox ? [
                            instance.bbox.x * scaleX,
                            instance.bbox.y * scaleY,
                            instance.bbox.width * scaleX,
                            instance.bbox.height * scaleY
                        ] : [0, 0, 0, 0];

                        cocoData.annotations.push({
                            id: annotationId++,
                            image_id: image.id,
                            category_id: instance.labelId,
                            keypoints: keypoints,
                            num_keypoints: numKeypoints,
                            bbox: bbox,
                            area: bbox[2] * bbox[3],
                            iscrowd: 0
                        });
                    });
                }
            });

            // Add keypoint definitions to categories if keypoint annotations exist
            const hasKeypoints = Object.values(state.keypointAnnotations).some(data => data.instances.length > 0);
            if (hasKeypoints) {
                cocoData.categories = cocoData.categories.map(cat => {
                    const template = KEYPOINT_TEMPLATES['coco-person']; // Default to COCO person
                    return {
                        ...cat,
                        keypoints: template.keypoints,
                        skeleton: template.skeleton.map(([a, b]) => [a + 1, b + 1]) // COCO uses 1-indexed
                    };
                });
            }

            const blob = new Blob([JSON.stringify(cocoData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'annotations_coco.json';
            a.click();
            URL.revokeObjectURL(url);

        } else if (format === 'voc') {
            // Pascal VOC XML format
            const JSZip = window.JSZip || null;

            if (!JSZip) {
                alert('JSZip library not loaded. VOC export requires JSZip for creating archives.');
                return;
            }

            const zip = new JSZip();
            const annotationsFolder = zip.folder('Annotations');

            state.images.forEach((image) => {
                const annotations = state.annotations[image.id] || [];

                if (annotations.length === 0) return; // Skip images without annotations

                const scaleX = imgWidth / state.canvas.width;
                const scaleY = imgHeight / state.canvas.height;

                // Create XML document
                let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
                xml += '<annotation>\n';
                xml += `\t<folder>images</folder>\n`;
                xml += `\t<filename>${image.filename}</filename>\n`;
                xml += `\t<path>${image.path || image.filename}</path>\n`;
                xml += `\t<source>\n`;
                xml += `\t\t<database>Product Capture 360</database>\n`;
                xml += `\t</source>\n`;
                xml += `\t<size>\n`;
                xml += `\t\t<width>${imgWidth}</width>\n`;
                xml += `\t\t<height>${imgHeight}</height>\n`;
                xml += `\t\t<depth>3</depth>\n`;
                xml += `\t</size>\n`;
                xml += `\t<segmented>0</segmented>\n`;

                // Add objects
                annotations.forEach(ann => {
                    const label = state.labels.find(l => l.id === ann.labelId);
                    const labelName = label ? label.name : 'unknown';

                    // Calculate bounding box in image coordinates
                    let xmin, ymin, xmax, ymax;

                    if (ann.ellipse) {
                        // Ellipse bounding box
                        xmin = Math.round((ann.ellipse.center.x - ann.ellipse.radiusX) * scaleX);
                        ymin = Math.round((ann.ellipse.center.y - ann.ellipse.radiusY) * scaleY);
                        xmax = Math.round((ann.ellipse.center.x + ann.ellipse.radiusX) * scaleX);
                        ymax = Math.round((ann.ellipse.center.y + ann.ellipse.radiusY) * scaleY);
                    } else if (ann.polygon && ann.polygon.length > 0) {
                        // Polygon bounding box
                        const xs = ann.polygon.map(p => p.x * scaleX);
                        const ys = ann.polygon.map(p => p.y * scaleY);
                        xmin = Math.round(Math.min(...xs));
                        ymin = Math.round(Math.min(...ys));
                        xmax = Math.round(Math.max(...xs));
                        ymax = Math.round(Math.max(...ys));
                    } else {
                        // Regular bounding box
                        xmin = Math.round(ann.bbox.x * scaleX);
                        ymin = Math.round(ann.bbox.y * scaleY);
                        xmax = Math.round((ann.bbox.x + ann.bbox.width) * scaleX);
                        ymax = Math.round((ann.bbox.y + ann.bbox.height) * scaleY);
                    }

                    // Ensure coordinates are within image bounds
                    xmin = Math.max(0, Math.min(xmin, imgWidth));
                    ymin = Math.max(0, Math.min(ymin, imgHeight));
                    xmax = Math.max(0, Math.min(xmax, imgWidth));
                    ymax = Math.max(0, Math.min(ymax, imgHeight));

                    xml += `\t<object>\n`;
                    xml += `\t\t<name>${labelName}</name>\n`;
                    xml += `\t\t<pose>Unspecified</pose>\n`;
                    xml += `\t\t<truncated>0</truncated>\n`;
                    xml += `\t\t<difficult>0</difficult>\n`;
                    xml += `\t\t<bndbox>\n`;
                    xml += `\t\t\t<xmin>${xmin}</xmin>\n`;
                    xml += `\t\t\t<ymin>${ymin}</ymin>\n`;
                    xml += `\t\t\t<xmax>${xmax}</xmax>\n`;
                    xml += `\t\t\t<ymax>${ymax}</ymax>\n`;
                    xml += `\t\t</bndbox>\n`;
                    xml += `\t</object>\n`;
                });

                xml += '</annotation>\n';

                // Add XML file to zip (same name as image but with .xml extension)
                const xmlFilename = image.filename.replace(/\.[^/.]+$/, '.xml');
                annotationsFolder.file(xmlFilename, xml);
            });

            // Generate and download zip file
            zip.generateAsync({type: 'blob'}).then(blob => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'annotations_voc.zip';
                a.click();
                URL.revokeObjectURL(url);
            });

        } else {
            // YOLO format (default)
            const yoloData = {};

            Object.keys(state.annotations).forEach(imageId => {
                const image = state.images.find(img => img.id == imageId);
                if (!image) return;

                const annotations = state.annotations[imageId];
                const yoloLines = annotations.map(ann => {
                    const scaleX = imgWidth / state.canvas.width;
                    const scaleY = imgHeight / state.canvas.height;

                    if (ann.ellipse) {
                        // Ellipse - approximate as polygon for YOLO segmentation format
                        const numPoints = 32;
                        const points = [];
                        for (let i = 0; i < numPoints; i++) {
                            const angle = (i / numPoints) * 2 * Math.PI;
                            const x = (ann.ellipse.center.x + Math.cos(angle) * ann.ellipse.radiusX) * scaleX;
                            const y = (ann.ellipse.center.y + Math.sin(angle) * ann.ellipse.radiusY) * scaleY;
                            const x_norm = x / imgWidth;
                            const y_norm = y / imgHeight;
                            points.push(`${x_norm.toFixed(6)} ${y_norm.toFixed(6)}`);
                        }
                        return `${ann.labelId} ${points.join(' ')}`;
                    } else if (ann.polygon && ann.polygon.length > 0) {
                        const points = ann.polygon.map(p => {
                            const x_norm = (p.x * scaleX) / imgWidth;
                            const y_norm = (p.y * scaleY) / imgHeight;
                            return `${x_norm.toFixed(6)} ${y_norm.toFixed(6)}`;
                        }).join(' ');

                        return `${ann.labelId} ${points}`;
                    } else {
                        const centerX = ((ann.bbox.x + ann.bbox.width / 2) * scaleX) / imgWidth;
                        const centerY = ((ann.bbox.y + ann.bbox.height / 2) * scaleY) / imgHeight;
                        const width = (ann.bbox.width * scaleX) / imgWidth;
                        const height = (ann.bbox.height * scaleY) / imgHeight;

                        return `${ann.labelId} ${centerX.toFixed(6)} ${centerY.toFixed(6)} ${width.toFixed(6)} ${height.toFixed(6)}`;
                    }
                });

                yoloData[image.filename] = yoloLines;
            });

            const blob = new Blob([JSON.stringify(yoloData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'annotations_yolo.json';
            a.click();
            URL.revokeObjectURL(url);
        }

        alert('✅ Annotations exported successfully!');
    } catch (error) {
        console.error('Export error:', error);
        alert('Failed to export annotations: ' + error.message);
    }
}

// ==============================
// VIDEO FRAME EXTRACTION
// ==============================

// Global video element for frame extraction
let videoElement = null;

/**
 * Handle video file upload
 */
function handleVideoUpload(input) {
    const file = input.files[0];
    if (!file) return;

    window.appLogger?.info('Video file selected', {
        filename: file.name,
        size: (file.size / 1024 / 1024).toFixed(2) + ' MB'
    });

    // Create video element
    if (videoElement) {
        URL.revokeObjectURL(videoElement.src);
    }

    videoElement = document.createElement('video');
    videoElement.src = URL.createObjectURL(file);
    videoElement.preload = 'metadata';

    videoElement.addEventListener('loadedmetadata', () => {
        const duration = videoElement.duration;
        const minutes = Math.floor(duration / 60);
        const seconds = Math.floor(duration % 60);

        window.appLogger?.info('Video metadata loaded', {
            duration: `${minutes}:${seconds.toString().padStart(2, '0')}`,
            width: videoElement.videoWidth,
            height: videoElement.videoHeight
        });

        // Enable extract button
        document.getElementById('extractFramesBtn').disabled = false;
    });

    videoElement.addEventListener('error', (e) => {
        window.appLogger?.error('Video load error', { filename: file.name });
        alert('Failed to load video: ' + (videoElement.error?.message || 'Unknown error'));
        document.getElementById('extractFramesBtn').disabled = true;
    });
}

/**
 * Extract frames from uploaded video
 */
async function extractVideoFrames() {
    if (!videoElement) {
        alert('Please upload a video first');
        return;
    }

    const frameInterval = parseInt(document.getElementById('frameInterval').value) || 5;
    const duration = videoElement.duration;
    const fps = 30; // Assume 30fps (will extract actual metadata later if needed)

    // Calculate total frames
    const totalVideoFrames = Math.floor(duration * fps);
    const framesToExtract = Math.floor(totalVideoFrames / frameInterval);

    window.appLogger?.info('Starting frame extraction', {
        duration,
        frameInterval,
        framesToExtract
    });

    // Show progress
    const progressDiv = document.getElementById('videoProgress');
    const progressText = document.getElementById('videoProgressText');
    const progressBar = document.getElementById('videoProgressBar');

    progressDiv.style.display = 'block';
    progressText.textContent = `Extracting frames... 0 / ${framesToExtract}`;
    progressBar.style.width = '0%';

    // Disable button during extraction
    document.getElementById('extractFramesBtn').disabled = true;

    // Create canvas for frame extraction
    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    const ctx = canvas.getContext('2d');

    const extractedFrames = [];
    let frameIndex = 0;

    try {
        // Extract frames at intervals
        for (let i = 0; i < totalVideoFrames; i += frameInterval) {
            const timestamp = i / fps;

            // Seek to timestamp
            await seekVideoTo(videoElement, timestamp);

            // Draw current frame to canvas
            ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

            // Convert canvas to blob
            const blob = await new Promise(resolve => {
                canvas.toBlob(resolve, 'image/jpeg', 0.95);
            });

            // Create data URL
            const dataUrl = await blobToDataURL(blob);

            // Create image object
            const frameObj = {
                id: frameIndex,
                filename: `frame_${String(frameIndex + 1).padStart(5, '0')}.jpg`,
                path: dataUrl,
                annotated: false,
                frameNumber: i,
                timestamp: timestamp
            };

            extractedFrames.push(frameObj);
            frameIndex++;

            // Update progress
            const progress = Math.floor((frameIndex / framesToExtract) * 100);
            progressText.textContent = `Extracting frames... ${frameIndex} / ${framesToExtract}`;
            progressBar.style.width = `${progress}%`;

            // Allow UI to update
            await new Promise(resolve => setTimeout(resolve, 10));
        }

        // Update state with extracted frames
        state.images = extractedFrames;
        state.isVideoMode = true;
        state.videoFrames = extractedFrames;
        state.fps = fps;

        // Render image list
        renderImageList();

        // Load first frame
        if (extractedFrames.length > 0) {
            loadImage(0);
        }

        // Show video timeline
        document.getElementById('videoTimeline').style.display = 'block';
        document.getElementById('totalFrames').textContent = extractedFrames.length;
        document.getElementById('frameSlider').max = extractedFrames.length - 1;
        updateFrameDisplay();

        updateStats();
        initializeHistory();

        window.appLogger?.info('Frame extraction complete', {
            framesExtracted: extractedFrames.length
        });

        // Hide progress
        progressDiv.style.display = 'none';

        alert(`✅ Extracted ${extractedFrames.length} frames successfully!`);
    } catch (error) {
        window.appLogger?.error('Frame extraction failed', {}, { error: error.message });
        alert('Frame extraction failed: ' + error.message);

        progressDiv.style.display = 'none';
    } finally {
        // Re-enable button
        document.getElementById('extractFramesBtn').disabled = false;
    }
}

/**
 * Seek video to specific timestamp
 */
function seekVideoTo(video, timestamp) {
    return new Promise((resolve, reject) => {
        const onSeeked = () => {
            video.removeEventListener('seeked', onSeeked);
            video.removeEventListener('error', onError);
            resolve();
        };

        const onError = (e) => {
            video.removeEventListener('seeked', onSeeked);
            video.removeEventListener('error', onError);
            reject(new Error('Video seek failed'));
        };

        video.addEventListener('seeked', onSeeked);
        video.addEventListener('error', onError);

        video.currentTime = timestamp;
    });
}

/**
 * Convert blob to data URL
 */
function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

/**
 * Navigate to next frame
 */
function nextFrame() {
    if (!state.isVideoMode || state.currentImageIndex >= state.images.length - 1) return;
    loadImage(state.currentImageIndex + 1);
    updateFrameDisplay();
}

/**
 * Navigate to previous frame
 */
function previousFrame() {
    if (!state.isVideoMode || state.currentImageIndex <= 0) return;
    loadImage(state.currentImageIndex - 1);
    updateFrameDisplay();
}

/**
 * Seek to specific frame
 */
function seekToFrame(frameIndex) {
    if (!state.isVideoMode) return;
    loadImage(frameIndex);
    updateFrameDisplay();
}

/**
 * Update frame display in timeline
 */
function updateFrameDisplay() {
    if (!state.isVideoMode) return;

    const frame = state.images[state.currentImageIndex];
    if (!frame) return;

    document.getElementById('currentFrameNum').textContent = state.currentImageIndex + 1;
    document.getElementById('frameSlider').value = state.currentImageIndex;

    // Calculate timestamp
    const timestamp = frame.timestamp || 0;
    const minutes = Math.floor(timestamp / 60);
    const seconds = Math.floor(timestamp % 60);
    const ms = Math.floor((timestamp % 1) * 100);

    document.getElementById('frameTimestamp').textContent =
        `${minutes}:${seconds.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;

    // Update tracking UI
    updateTrackingUI();
}

// ==============================
// OBJECT TRACKING
// ==============================

/**
 * Toggle tracking mode
 */
function toggleTracking(enabled) {
    state.trackingEnabled = enabled;

    window.appLogger?.info('Tracking toggled', { enabled });

    // Enable/disable tracking buttons
    updateTrackingUI();
}

/**
 * Update tracking UI state
 */
function updateTrackingUI() {
    if (!state.isVideoMode) return;

    const hasSelection = state.selectedAnnotationId !== null;
    const trackingEnabled = state.trackingEnabled;

    const propagateBtn = document.getElementById('propagateBtn');
    const autoTrackBtn = document.getElementById('autoTrackBtn');

    if (propagateBtn) {
        propagateBtn.disabled = !trackingEnabled || !hasSelection;
    }

    if (autoTrackBtn) {
        autoTrackBtn.disabled = !trackingEnabled || !hasSelection;
    }

    // Update track count
    const trackCount = Object.keys(state.tracks).length;
    const trackCountEl = document.getElementById('trackCount');
    if (trackCountEl) {
        trackCountEl.textContent = trackCount;
    }
}

/**
 * Create or get track ID for annotation
 */
function getOrCreateTrackId(annotation) {
    // If annotation already has trackId, return it
    if (annotation.trackId !== undefined) {
        return annotation.trackId;
    }

    // Create new track
    const trackId = state.nextTrackId++;
    annotation.trackId = trackId;

    // Initialize track in state
    const label = state.labels.find(l => l.id === annotation.labelId);
    state.tracks[trackId] = {
        id: trackId,
        label: label ? label.name : 'unknown',
        labelId: annotation.labelId,
        color: label ? label.color : '#3b82f6',
        annotations: []
    };

    window.appLogger?.info('Created new track', { trackId, label: state.tracks[trackId].label });

    return trackId;
}

/**
 * Propagate selected annotation to next frame
 */
function propagateAnnotation() {
    if (!state.trackingEnabled || state.selectedAnnotationId === null) {
        return;
    }

    const currentImageId = state.images[state.currentImageIndex].id;
    const annotations = state.annotations[currentImageId] || [];
    const selectedAnn = annotations[state.selectedAnnotationId];

    if (!selectedAnn) {
        alert('No annotation selected');
        return;
    }

    // Check if next frame exists
    if (state.currentImageIndex >= state.images.length - 1) {
        alert('Already at last frame');
        return;
    }

    // Get or create track ID
    const trackId = getOrCreateTrackId(selectedAnn);

    // Move to next frame
    const nextFrameIndex = state.currentImageIndex + 1;
    const nextImageId = state.images[nextFrameIndex].id;

    // Create copy of annotation for next frame
    const nextAnn = {
        ...selectedAnn,
        trackId: trackId,
        createdBy: 'tracking'
    };

    // Add to next frame
    if (!state.annotations[nextImageId]) {
        state.annotations[nextImageId] = [];
    }

    state.annotations[nextImageId].push(nextAnn);

    // Update track
    state.tracks[trackId].annotations.push({
        frameId: nextImageId,
        frameIndex: nextFrameIndex,
        bbox: nextAnn.bbox
    });

    // Save and move to next frame
    saveToHistory();
    loadImage(nextFrameIndex);

    window.appLogger?.info('Annotation propagated', {
        trackId,
        fromFrame: state.currentImageIndex,
        toFrame: nextFrameIndex
    });
}

/**
 * Auto-track object forward using simple interpolation
 */
async function autoTrackForward() {
    if (!state.trackingEnabled || state.selectedAnnotationId === null) {
        return;
    }

    const currentImageId = state.images[state.currentImageIndex].id;
    const annotations = state.annotations[currentImageId] || [];
    const selectedAnn = annotations[state.selectedAnnotationId];

    if (!selectedAnn) {
        alert('No annotation selected');
        return;
    }

    // Get or create track ID
    const trackId = getOrCreateTrackId(selectedAnn);

    // Ask user how many frames to track
    const framesToTrack = prompt('How many frames forward to auto-track?', '10');
    if (!framesToTrack) return;

    const numFrames = parseInt(framesToTrack);
    if (isNaN(numFrames) || numFrames <= 0) {
        alert('Please enter a valid number');
        return;
    }

    const maxFrames = Math.min(numFrames, state.images.length - state.currentImageIndex - 1);

    if (maxFrames === 0) {
        alert('Already at last frame');
        return;
    }

    window.appLogger?.info('Starting auto-track', {
        trackId,
        startFrame: state.currentImageIndex,
        numFrames: maxFrames
    });

    // Simple tracking: propagate with slight motion compensation
    let currentBbox = { ...selectedAnn.bbox };
    const motionX = 0; // Could add motion estimation here
    const motionY = 0;

    for (let i = 1; i <= maxFrames; i++) {
        const targetFrameIndex = state.currentImageIndex + i;
        const targetImageId = state.images[targetFrameIndex].id;

        // Apply motion compensation (simple constant velocity model)
        currentBbox = {
            x: currentBbox.x + motionX,
            y: currentBbox.y + motionY,
            width: currentBbox.width,
            height: currentBbox.height
        };

        // Create annotation for this frame
        const trackedAnn = {
            labelId: selectedAnn.labelId,
            bbox: { ...currentBbox },
            trackId: trackId,
            confidence: 1.0 - (i * 0.05), // Decrease confidence over time
            createdBy: 'auto-tracking',
            polygon: selectedAnn.polygon ? [...selectedAnn.polygon] : null,
            ellipse: selectedAnn.ellipse ? { ...selectedAnn.ellipse } : null
        };

        // Add to frame
        if (!state.annotations[targetImageId]) {
            state.annotations[targetImageId] = [];
        }

        state.annotations[targetImageId].push(trackedAnn);

        // Update track
        state.tracks[trackId].annotations.push({
            frameId: targetImageId,
            frameIndex: targetFrameIndex,
            bbox: trackedAnn.bbox
        });

        // Small delay to allow UI update
        if (i % 5 === 0) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    }

    saveToHistory();
    renderAnnotationsList();
    updateTrackingUI();

    alert(`✅ Auto-tracked for ${maxFrames} frames!`);

    window.appLogger?.info('Auto-track complete', {
        trackId,
        framesTracked: maxFrames
    });
}

/**
 * Export tracking data in MOT format
 */
function exportTrackingData() {
    if (!state.isVideoMode || Object.keys(state.tracks).length === 0) {
        alert('No tracking data available');
        return;
    }

    // MOT Challenge format:
    // <frame>, <id>, <bb_left>, <bb_top>, <bb_width>, <bb_height>, <conf>, <x>, <y>, <z>

    const lines = [];

    // Iterate through all frames
    state.images.forEach((image, frameIdx) => {
        const frameNum = frameIdx + 1; // 1-indexed
        const imageId = image.id;
        const annotations = state.annotations[imageId] || [];

        annotations.forEach(ann => {
            if (ann.trackId !== undefined) {
                const bbox = ann.bbox;
                const conf = ann.confidence || 1.0;

                // MOT format line
                const line = [
                    frameNum,
                    ann.trackId,
                    Math.round(bbox.x),
                    Math.round(bbox.y),
                    Math.round(bbox.width),
                    Math.round(bbox.height),
                    conf.toFixed(2),
                    -1, // x (3D, not used)
                    -1, // y (3D, not used)
                    -1  // z (3D, not used)
                ].join(',');

                lines.push(line);
            }
        });
    });

    // Download as .txt file
    const content = lines.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tracking_mot.txt';
    a.click();
    URL.revokeObjectURL(url);

    window.appLogger?.info('Tracking data exported', {
        format: 'MOT',
        tracks: Object.keys(state.tracks).length,
        lines: lines.length
    });

    alert(`✅ Exported ${lines.length} tracking annotations in MOT format!`);
}

// ==================== UI ENHANCEMENTS ====================

// Performance Tracking
const performanceStats = {
    sessionStartTime: Date.now(),
    totalAnnotations: 0,
    annotationTimestamps: [],
    toolUsage: {},
    avgAnnotationTime: 0
};

// Update performance metrics
function updatePerformanceMetrics() {
    const sessionTime = Math.floor((Date.now() - performanceStats.sessionStartTime) / 1000);
    const minutes = Math.floor(sessionTime / 60);
    const seconds = sessionTime % 60;

    document.getElementById('sessionTime').textContent =
        `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    // Calculate annotations per minute
    const sessionMinutes = sessionTime / 60 || 1;
    const totalAnnots = Object.values(state.annotations).reduce((sum, anns) => sum + anns.length, 0);
    const annotsPerMin = (totalAnnots / sessionMinutes).toFixed(1);

    document.getElementById('annotsPerMin').textContent = annotsPerMin;
}

// Start performance tracking interval
let performanceInterval = null;
function startPerformanceTracking() {
    if (performanceInterval) return;

    performanceInterval = setInterval(() => {
        updatePerformanceMetrics();
    }, 1000); // Update every second
}

// Performance Dashboard Panel
function togglePerformancePanel() {
    const existing = document.getElementById('performancePanel');
    if (existing) {
        existing.remove();
        return;
    }

    const sessionTime = Math.floor((Date.now() - performanceStats.sessionStartTime) / 1000);
    const totalAnnots = Object.values(state.annotations).reduce((sum, anns) => sum + anns.length, 0);
    const annotatedImages = Object.values(state.annotations).filter(anns => anns.length > 0).length;
    const avgAnnotsPerImage = annotatedImages > 0 ? (totalAnnots / annotatedImages).toFixed(1) : '0.0';
    const sessionMinutes = sessionTime / 60 || 1;
    const annotsPerMin = (totalAnnots / sessionMinutes).toFixed(1);

    // Calculate tool usage
    const toolCounts = { bbox: 0, polygon: 0, ellipse: 0, keypoint: 0, mask: 0 };
    Object.values(state.annotations).forEach(anns => {
        anns.forEach(ann => {
            if (ann.polygon) toolCounts.polygon++;
            else if (ann.ellipse) toolCounts.ellipse++;
            else toolCounts.bbox++;
        });
    });

    Object.values(state.keypointAnnotations).forEach(kpData => {
        if (kpData && kpData.instances) {
            toolCounts.keypoint += kpData.instances.length;
        }
    });

    const html = `
        <div id="performancePanel" style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
                    background: var(--bg-secondary); border-radius: 12px; padding: 2rem;
                    box-shadow: var(--shadow); z-index: 10000; max-width: 600px; width: 90%;">
            <h2 style="margin-bottom: 1.5rem; color: var(--text-primary);">📊 Performance Dashboard</h2>

            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; margin-bottom: 1.5rem;">
                <div style="background: var(--bg-tertiary); padding: 1rem; border-radius: 8px;">
                    <div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.25rem;">Total Annotations</div>
                    <div style="font-size: 1.5rem; font-weight: 600; color: var(--primary);">${totalAnnots}</div>
                </div>
                <div style="background: var(--bg-tertiary); padding: 1rem; border-radius: 8px;">
                    <div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.25rem;">Annotated Images</div>
                    <div style="font-size: 1.5rem; font-weight: 600; color: var(--success);">${annotatedImages} / ${state.images.length}</div>
                </div>
                <div style="background: var(--bg-tertiary); padding: 1rem; border-radius: 8px;">
                    <div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.25rem;">Annotations/Minute</div>
                    <div style="font-size: 1.5rem; font-weight: 600; color: var(--accent);">${annotsPerMin}</div>
                </div>
                <div style="background: var(--bg-tertiary); padding: 1rem; border-radius: 8px;">
                    <div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.25rem;">Avg Annotations/Image</div>
                    <div style="font-size: 1.5rem; font-weight: 600; color: var(--warning);">${avgAnnotsPerImage}</div>
                </div>
            </div>

            <h3 style="margin-bottom: 0.75rem; color: var(--text-primary); font-size: 1rem;">Tool Usage Breakdown</h3>
            <div style="display: grid; gap: 0.5rem; margin-bottom: 1.5rem;">
                <div style="display: flex; justify-content: space-between; align-items: center;
                           padding: 0.5rem; background: var(--bg-tertiary); border-radius: 6px;">
                    <span style="color: var(--text-secondary);">Bounding Boxes</span>
                    <span style="font-weight: 600; color: var(--text-primary);">${toolCounts.bbox}</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;
                           padding: 0.5rem; background: var(--bg-tertiary); border-radius: 6px;">
                    <span style="color: var(--text-secondary);">Polygons</span>
                    <span style="font-weight: 600; color: var(--text-primary);">${toolCounts.polygon}</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;
                           padding: 0.5rem; background: var(--bg-tertiary); border-radius: 6px;">
                    <span style="color: var(--text-secondary);">Ellipses</span>
                    <span style="font-weight: 600; color: var(--text-primary);">${toolCounts.ellipse}</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;
                           padding: 0.5rem; background: var(--bg-tertiary); border-radius: 6px;">
                    <span style="color: var(--text-secondary);">Keypoints</span>
                    <span style="font-weight: 600; color: var(--text-primary);">${toolCounts.keypoint}</span>
                </div>
            </div>

            <h3 style="margin-bottom: 0.75rem; color: var(--text-primary); font-size: 1rem;">Progress</h3>
            <div style="margin-bottom: 1.5rem;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                    <span style="font-size: 0.85rem; color: var(--text-secondary);">Completion Rate</span>
                    <span style="font-size: 0.85rem; font-weight: 600; color: var(--text-primary);">${((annotatedImages / (state.images.length || 1)) * 100).toFixed(1)}%</span>
                </div>
                <div style="width: 100%; height: 8px; background: var(--bg-tertiary); border-radius: 4px; overflow: hidden;">
                    <div style="height: 100%; background: linear-gradient(90deg, var(--success), var(--primary)); width: ${((annotatedImages / (state.images.length || 1)) * 100).toFixed(1)}%; transition: width 0.3s;"></div>
                </div>
            </div>

            <button onclick="document.getElementById('performancePanel').remove(); document.getElementById('performancePanelOverlay').remove();"
                    style="width: 100%; padding: 0.75rem;
                           background: var(--primary); color: white; border: none;
                           border-radius: 6px; cursor: pointer; font-weight: 500;">
                Close
            </button>
        </div>
        <div id="performancePanelOverlay" onclick="document.getElementById('performancePanel').remove(); this.remove();"
             style="position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0, 0, 0, 0.5); z-index: 9999;"></div>
    `;

    const panel = document.createElement('div');
    panel.innerHTML = html;
    document.body.appendChild(panel);

    window.appLogger?.info('Performance panel opened', {
        totalAnnots,
        annotatedImages,
        annotsPerMin
    });
}

// ==================== UI ENHANCEMENTS ====================

// Dark Mode Toggle
function toggleDarkMode() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);

    // Update button
    const btn = document.getElementById('darkModeText');
    const icon = document.getElementById('darkModeIcon');

    if (newTheme === 'dark') {
        btn.textContent = 'Light';
        icon.innerHTML = `
            <svg viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="5"></circle>
                <line x1="12" y1="1" x2="12" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="23"></line>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                <line x1="1" y1="12" x2="3" y2="12"></line>
                <line x1="21" y1="12" x2="23" y2="12"></line>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
            </svg>
        `;
    } else {
        btn.textContent = 'Dark';
        icon.innerHTML = `
            <svg viewBox="0 0 24 24">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
            </svg>
        `;
    }

    window.appLogger?.info('Theme toggled', { theme: newTheme });
}

// Load theme on startup
function loadTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);

    if (savedTheme === 'dark') {
        const btn = document.getElementById('darkModeText');
        const icon = document.getElementById('darkModeIcon');
        if (btn) btn.textContent = 'Light';
        if (icon) {
            icon.innerHTML = `
                <svg viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="5"></circle>
                    <line x1="12" y1="1" x2="12" y2="3"></line>
                    <line x1="12" y1="21" x2="12" y2="23"></line>
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                    <line x1="1" y1="12" x2="3" y2="12"></line>
                    <line x1="21" y1="12" x2="23" y2="12"></line>
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                </svg>
            `;
        }
    }
}

// Drag and Drop for Images
function setupDragAndDrop() {
    const canvasArea = document.querySelector('.canvas-area');
    if (!canvasArea) return;

    canvasArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        canvasArea.style.opacity = '0.7';
        canvasArea.style.border = '3px dashed var(--primary)';
    });

    canvasArea.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        canvasArea.style.opacity = '1';
        canvasArea.style.border = 'none';
    });

    canvasArea.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        canvasArea.style.opacity = '1';
        canvasArea.style.border = 'none';

        const files = Array.from(e.dataTransfer.files);
        const imageFiles = files.filter(f => f.type.startsWith('image/'));

        if (imageFiles.length === 0) {
            alert('No image files found. Please drop image files only.');
            return;
        }

        window.appLogger?.info('Images dropped', { count: imageFiles.length });

        // Load dropped images
        const loadedImages = [];
        for (let i = 0; i < imageFiles.length; i++) {
            const file = imageFiles[i];
            const dataUrl = await new Promise(resolve => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.readAsDataURL(file);
            });

            loadedImages.push({
                id: state.images.length + i,
                filename: file.name,
                path: dataUrl,
                annotated: false
            });
        }

        state.images = state.images.concat(loadedImages);
        renderImageList();

        if (state.currentImageIndex === -1 || state.currentImage === null) {
            loadImage(0);
        }

        updateStats();
        initializeHistory();

        alert(`✅ Loaded ${imageFiles.length} images via drag & drop!`);
    });
}

// Keyboard Shortcuts Overlay
function showKeyboardShortcuts() {
    const shortcuts = [
        { key: 'B', description: 'Bounding Box Tool' },
        { key: 'P', description: 'Polygon Tool' },
        { key: 'L', description: 'Ellipse Tool' },
        { key: 'K', description: 'Keypoint Tool' },
        { key: 'V', description: 'Select Tool' },
        { key: 'M', description: 'Mask Tool' },
        { key: 'Space', description: 'Run AI Annotation' },
        { key: '←/→', description: 'Previous/Next Image' },
        { key: 'Delete', description: 'Delete Selected' },
        { key: 'Ctrl+Z', description: 'Undo' },
        { key: 'Ctrl+Y', description: 'Redo' },
        { key: 'Ctrl+D', description: 'Toggle Dark Mode' },
        { key: '?', description: 'Show This Help' },
        { key: 'Esc', description: 'Cancel Current Operation' }
    ];

    let html = `
        <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
                    background: var(--bg-secondary); border-radius: 12px; padding: 2rem;
                    box-shadow: var(--shadow); z-index: 10000; max-width: 500px; width: 90%;">
            <h2 style="margin-bottom: 1.5rem; color: var(--text-primary);">⌨️ Keyboard Shortcuts</h2>
            <div style="display: grid; gap: 0.75rem;">
    `;

    shortcuts.forEach(s => {
        html += `
            <div style="display: flex; justify-content: space-between; align-items: center;
                       padding: 0.5rem; background: var(--bg-tertiary); border-radius: 6px;">
                <span style="color: var(--text-secondary);">${s.description}</span>
                <kbd style="background: var(--bg-primary); padding: 0.25rem 0.5rem;
                           border-radius: 4px; font-family: monospace; font-size: 0.9rem;
                           color: var(--text-primary); border: 1px solid var(--border);">${s.key}</kbd>
            </div>
        `;
    });

    html += `
            </div>
            <button onclick="this.parentElement.parentElement.remove()"
                    style="margin-top: 1.5rem; width: 100%; padding: 0.75rem;
                           background: var(--primary); color: white; border: none;
                           border-radius: 6px; cursor: pointer; font-weight: 500;">
                Got it!
            </button>
        </div>
        <div onclick="this.remove()"
             style="position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0, 0, 0, 0.5); z-index: 9999;"></div>
    `;

    const overlay = document.createElement('div');
    overlay.innerHTML = html;
    document.body.appendChild(overlay);
}

// Enhanced Keyboard Handler
document.addEventListener('keydown', (e) => {
    // Don't trigger shortcuts when typing in inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
        return;
    }

    // Ctrl+D for dark mode
    if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        toggleDarkMode();
        return;
    }

    // ? for keyboard shortcuts
    if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        showKeyboardShortcuts();
        return;
    }
});

// Load saved progress on startup
window.addEventListener('load', () => {
    // Load theme first
    loadTheme();

    // Setup drag and drop
    setupDragAndDrop();

    // Start performance tracking
    startPerformanceTracking();

    const params = new URLSearchParams(window.location.search);
    const batchJob = params.get('batchJob');
    if (batchJob) {
        return;
    }
    const saved = localStorage.getItem('annotation_progress');
    if (saved) {
        try {
            const data = JSON.parse(saved);
            if (confirm('Found saved progress. Would you like to restore it?')) {
                state.annotations = data.annotations || {};
                state.labels = data.labels || state.labels;
                // Don't restore images - user needs to load dataset
                renderLabels();
                updateStats();
            }
        } catch (error) {
            console.error('Failed to restore progress:', error);
        }
    }
});
