/**
 * Professional Annotation Tool - Roboflow-like Experience
 * Full-featured bounding box annotation with AI assistance
 */

// Global State
const state = {
    images: [],
    currentImageIndex: 0,
    currentImage: null,
    annotations: {}, // {imageId: [{label, bbox, confidence}]}
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
    history: [],
    historyIndex: -1,
    canvas: null,
    ctx: null
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initializeCanvas();
    setupKeyboardShortcuts();
    renderLabels();
    updateStats();
});

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
}

// Load Dataset
async function loadDataset() {
    const path = document.getElementById('datasetPath').value.trim();
    if (!path) {
        alert('Please enter a dataset path');
        return;
    }

    try {
        const response = await fetch('/api/list-directory', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path })
        });

        if (!response.ok) throw new Error('Failed to load directory');

        const files = await response.json();
        const imageFiles = files.filter(f =>
            f.match(/\.(jpg|jpeg|png)$/i) && !f.startsWith('._')
        );

        state.images = imageFiles.map((filename, idx) => ({
            id: idx,
            filename,
            path: `${path}/${filename}`,
            annotated: false
        }));

        renderImageList();
        if (state.images.length > 0) {
            loadImage(0);
        }
        updateStats();
    } catch (error) {
        console.error('Error loading dataset:', error);
        alert('Failed to load dataset: ' + error.message);
    }
}

function renderImageList() {
    const container = document.getElementById('imageList');
    if (state.images.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📷</div>
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
                <img src="/file?path=${encodeURIComponent(img.path)}"
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
        console.error('Failed to load image:', imageData.path);
        alert('Failed to load image');
    };

    img.src = `/file?path=${encodeURIComponent(imageData.path)}`;
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
function addAnnotation(bbox) {
    const currentImageId = state.images[state.currentImageIndex].id;

    if (!state.annotations[currentImageId]) {
        state.annotations[currentImageId] = [];
    }

    const annotation = {
        labelId: state.selectedLabelId,
        bbox: bbox,
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
                <div class="empty-state-icon">📝</div>
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
                            🗑️
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
}

function addNewLabel() {
    const name = prompt('Enter label name:');
    if (!name) return;

    const colors = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
    const color = colors[state.labels.length % colors.length];

    state.labels.push({
        id: state.labels.length,
        name,
        color,
        count: 0
    });

    renderLabels();
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

    const confirmed = confirm('Use AI to auto-detect bottles in this image?');
    if (!confirmed) return;

    try {
        // This would call your YOLO detection endpoint
        alert('AI auto-annotation will be implemented with your YOLO detection endpoint');

        // Example implementation:
        // const response = await fetch('/api/auto-annotate', {...});
        // const detections = await response.json();
        // detections.forEach(det => addAnnotation(det.bbox));
    } catch (error) {
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
