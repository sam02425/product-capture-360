/**
 * Professional Annotation Tool - Roboflow-like Experience
 * Full-featured bounding box annotation with AI assistance
 */

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
    // Resize state
    resizeHandle: null,
    resizeStartBox: null,
    // Polygon state
    polygonPoints: []
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

function initializeCanvas() {
    state.canvas = document.getElementById('annotationCanvas');
    state.ctx = state.canvas.getContext('2d');

    // Mouse events
    state.canvas.addEventListener('mousedown', handleMouseDown);
    state.canvas.addEventListener('mousemove', handleMouseMove);
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
            browser.innerHTML = '<div style="padding: 20px 10px; text-align: center; color: var(--text-dim); font-size: 0.75rem;">No subfolders found</div>';
            return;
        }

        browser.innerHTML = folders.map(folder => `
            <div class="folder-item" onclick="navigateToFolder('${path}', '${folder.name}')">
                <span class="folder-icon">📁</span>
                <span>${folder.name}</span>
            </div>
        `).join('');
    } catch (error) {
        browser.innerHTML = `<div style="padding: 20px 10px; text-align: center; color: var(--danger); font-size: 0.75rem;">Error: ${error.message}</div>`;
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
}

function render() {
    if (!state.currentImage || !state.ctx) return;

    const ctx = state.ctx;
    const canvas = state.canvas;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Apply zoom and pan
    ctx.save();
    ctx.translate(state.pan.x, state.pan.y);
    ctx.scale(state.zoom, state.zoom);

    // Draw image
    ctx.drawImage(state.currentImage, 0, 0, canvas.width, canvas.height);

    // Draw existing annotations
    const currentImageId = state.images[state.currentImageIndex].id;
    const annotations = state.annotations[currentImageId] || [];

    annotations.forEach((ann, idx) => {
        const label = state.labels.find(l => l.id === ann.labelId);
        const color = label ? label.color : '#3b82f6';
        const isSelected = state.selectedAnnotationId === idx;

        drawBoundingBox(ann.bbox, color, isSelected, label ? label.name : '');
    });

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

        ctx.strokeStyle = color;
        ctx.lineWidth = 2 / state.zoom;
        ctx.setLineDash([5 / state.zoom, 5 / state.zoom]);
        ctx.strokeRect(bbox.x, bbox.y, bbox.width, bbox.height);
        ctx.setLineDash([]);
    }

    ctx.restore();
}

function drawBoundingBox(bbox, color, isSelected, labelText) {
    const ctx = state.ctx;

    // Box
    ctx.strokeStyle = isSelected ? '#ffffff' : color;
    ctx.lineWidth = (isSelected ? 3 : 2) / state.zoom;
    ctx.strokeRect(bbox.x, bbox.y, bbox.width, bbox.height);

    // Label background
    if (labelText) {
        ctx.font = `${14 / state.zoom}px sans-serif`;
        const textWidth = ctx.measureText(labelText).width;
        const padding = 4 / state.zoom;

        ctx.fillStyle = color;
        ctx.fillRect(bbox.x, bbox.y - (20 / state.zoom), textWidth + padding * 2, 20 / state.zoom);

        ctx.fillStyle = '#ffffff';
        ctx.fillText(labelText, bbox.x + padding, bbox.y - (6 / state.zoom));
    }

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

// Mouse Handlers
function handleMouseDown(e) {
    const rect = state.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / state.zoom - state.pan.x / state.zoom;
    const y = (e.clientY - rect.top) / state.zoom - state.pan.y / state.zoom;

    if (state.currentTool === 'bbox') {
        state.isDrawing = true;
        state.startPoint = { x, y };
        state.currentPoint = { x, y };
    } else if (state.currentTool === 'select') {
        // Check if clicking on existing annotation
        const currentImageId = state.images[state.currentImageIndex].id;
        const annotations = state.annotations[currentImageId] || [];

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
    if (!state.isDrawing) return;

    const rect = state.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / state.zoom - state.pan.x / state.zoom;
    const y = (e.clientY - rect.top) / state.zoom - state.pan.y / state.zoom;

    state.currentPoint = { x, y };
    render();
}

function handleMouseUp(e) {
    if (!state.isDrawing) return;

    const rect = state.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / state.zoom - state.pan.x / state.zoom;
    const y = (e.clientY - rect.top) / state.zoom - state.pan.y / state.zoom;

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

    state.isDrawing = false;
    state.startPoint = null;
    state.currentPoint = null;
    render();
}

function handleWheel(e) {
    e.preventDefault();

    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.1, Math.min(5, state.zoom * delta));

    state.zoom = newZoom;
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

    container.innerHTML = annotations.map((ann, idx) => {
        const label = state.labels.find(l => l.id === ann.labelId);
        const isSelected = state.selectedAnnotationId === idx;

        return `
            <div class="annotation-card ${isSelected ? 'selected' : ''}"
                 onclick="selectAnnotation(${idx})">
                <div class="annotation-header">
                    <div class="annotation-label" style="color: ${label ? label.color : '#3b82f6'};">
                        ${label ? label.name : 'Unknown'}
                    </div>
                    <div class="annotation-actions">
                        <button class="icon-btn delete" onclick="event.stopPropagation(); deleteAnnotation(${idx})">
                            ${ICONS.trash}
                        </button>
                    </div>
                </div>
                <div class="annotation-coords">
                    x: ${Math.round(ann.bbox.x)}, y: ${Math.round(ann.bbox.y)}<br>
                    w: ${Math.round(ann.bbox.width)}, h: ${Math.round(ann.bbox.height)}
                </div>
            </div>
        `;
    }).join('');

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

    // Update UI
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-tool="${tool}"]`)?.classList.add('active');

    document.getElementById('currentTool').textContent =
        tool === 'bbox' ? 'Box' : 'Select';

    // Update cursor
    state.canvas.style.cursor = tool === 'bbox' ? 'crosshair' : 'default';
}

// Zoom
function zoomIn() {
    state.zoom = Math.min(5, state.zoom * 1.2);
    render();
}

function zoomOut() {
    state.zoom = Math.max(0.1, state.zoom / 1.2);
    render();
}

function resetZoom() {
    state.zoom = 1;
    state.pan = { x: 0, y: 0 };
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
        // Prevent default for our shortcuts
        const shouldPrevent = ['b', 'v', '0', '+', '-', 'ArrowLeft', 'ArrowRight', 'Delete'].includes(e.key) ||
                             (e.ctrlKey && ['z', 'y'].includes(e.key.toLowerCase()));

        if (shouldPrevent) {
            e.preventDefault();
        }

        // Tools
        if (e.key === 'b') setTool('bbox');
        if (e.key === 'v') setTool('select');

        // Actions
        if (e.key === 'Delete') deleteSelected();
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
    document.getElementById('overlay').classList.add('visible');
    document.getElementById('shortcutsHelp').classList.add('visible');
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

// AI Auto-Annotation
async function aiAutoAnnotate() {
    if (!state.currentImage) {
        alert('No image loaded');
        return;
    }

    const engine = getAiEngine();
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

// Export Annotations
async function exportAnnotations() {
    try {
        // Convert to YOLO format
        const yoloData = {};

        Object.keys(state.annotations).forEach(imageId => {
            const image = state.images.find(img => img.id == imageId);
            if (!image) return;

            const annotations = state.annotations[imageId];
            const yoloLines = annotations.map(ann => {
                // Convert pixel bbox to normalized YOLO format
                const centerX = (ann.bbox.x + ann.bbox.width / 2) / state.canvas.width;
                const centerY = (ann.bbox.y + ann.bbox.height / 2) / state.canvas.height;
                const width = ann.bbox.width / state.canvas.width;
                const height = ann.bbox.height / state.canvas.height;

                return `${ann.labelId} ${centerX.toFixed(6)} ${centerY.toFixed(6)} ${width.toFixed(6)} ${height.toFixed(6)}`;
            });

            yoloData[image.filename] = yoloLines;
        });

        // Create downloadable file
        const blob = new Blob([JSON.stringify(yoloData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'annotations_yolo.json';
        a.click();
        URL.revokeObjectURL(url);

        alert('✅ Annotations exported successfully!');
    } catch (error) {
        console.error('Export error:', error);
        alert('Failed to export annotations');
    }
}

// Load saved progress on startup
window.addEventListener('load', () => {
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
