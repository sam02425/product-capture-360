// YOLO Annotation Reviewer - JavaScript

const state = {
    annotations: {},
    images: [],
    currentIndex: 0,
    filter: 'all', // 'all', 'annotated', 'missing'
    canvas: null,
    ctx: null
};

// Initialize
async function init() {
    state.canvas = document.getElementById('canvas');
    state.ctx = state.canvas.getContext('2d');

    // Load annotations
    await loadAnnotations();

    // Setup keyboard shortcuts
    document.addEventListener('keydown', handleKeyPress);
}

async function loadAnnotations() {
    try {
        // Load YOLO annotations
        const response = await fetch('/annotations_yolo_auto.json');
        if (!response.ok) {
            throw new Error('Annotations file not found');
        }
        state.annotations = await response.json();

        // Load image list
        const pathResponse = await fetch('/api/list-directory', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                path: '/Volumes/UBUNTU 24_0/360Photo_Captures/Abasolo_Whiskey_750ml'
            })
        });

        if (!pathResponse.ok) {
            throw new Error('Failed to load image directory');
        }

        const files = await pathResponse.json();
        state.images = files
            .filter(f => f.endsWith('.jpg') || f.endsWith('.png'))
            .filter(f => !f.startsWith('._'))
            .sort();

        // Update UI
        updateStats();
        renderImageList();
        loadImage(0);

    } catch (error) {
        console.error('Error loading annotations:', error);
        alert('Failed to load annotations. Make sure YOLO auto-annotation has been run:\npython scripts/yolo_auto_annotate.py');
    }
}

function updateStats() {
    const total = state.images.length;
    const annotated = Object.keys(state.annotations).length;
    const missing = total - annotated;

    document.getElementById('total-images').textContent = total;
    document.getElementById('annotated-count').textContent = annotated;
    document.getElementById('annotated-percent').textContent = ((annotated / total) * 100).toFixed(1);
    document.getElementById('missing-count').textContent = missing;
    document.getElementById('missing-percent').textContent = ((missing / total) * 100).toFixed(1);
}

function renderImageList() {
    const listEl = document.getElementById('image-list');
    listEl.innerHTML = '';

    const filteredImages = getFilteredImages();

    filteredImages.forEach((filename, idx) => {
        const originalIdx = state.images.indexOf(filename);
        const isAnnotated = filename in state.annotations;

        const item = document.createElement('div');
        item.className = `image-item ${isAnnotated ? 'annotated' : 'not-annotated'}`;
        if (originalIdx === state.currentIndex) {
            item.className += ' selected';
        }

        const nameEl = document.createElement('div');
        nameEl.className = 'image-name';
        nameEl.textContent = filename;

        item.appendChild(nameEl);
        item.onclick = () => loadImage(originalIdx);

        listEl.appendChild(item);
    });
}

function getFilteredImages() {
    switch (state.filter) {
        case 'annotated':
            return state.images.filter(f => f in state.annotations);
        case 'missing':
            return state.images.filter(f => !(f in state.annotations));
        default:
            return state.images;
    }
}

function filterImages(filter) {
    state.filter = filter;

    // Update button states
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');

    // Re-render list
    renderImageList();
}

async function loadImage(index) {
    if (index < 0 || index >= state.images.length) return;

    state.currentIndex = index;
    const filename = state.images[index];
    const isAnnotated = filename in state.annotations;

    // Update UI
    document.getElementById('current-filename').textContent = filename;

    const statusEl = document.getElementById('current-status');
    if (isAnnotated) {
        const boxCount = state.annotations[filename].length;
        statusEl.innerHTML = `<span class="annotation-badge">✓ ${boxCount} annotation(s)</span>`;
    } else {
        statusEl.innerHTML = `<span class="annotation-badge missing-badge">✗ Not annotated</span>`;
    }

    // Update image list selection
    renderImageList();

    // Load and display image
    try {
        const imagePath = `/file?path=${encodeURIComponent('/Volumes/UBUNTU 24_0/360Photo_Captures/Abasolo_Whiskey_750ml/' + filename)}`;

        const img = new Image();
        img.onload = () => {
            // Set canvas size
            state.canvas.width = img.width;
            state.canvas.height = img.height;

            // Draw image
            state.ctx.drawImage(img, 0, 0);

            // Draw annotations if available
            if (isAnnotated) {
                drawAnnotations(img.width, img.height, state.annotations[filename]);
            }
        };
        img.onerror = () => {
            console.error('Failed to load image:', filename);
            state.ctx.fillStyle = '#2a2a2a';
            state.ctx.fillRect(0, 0, state.canvas.width, state.canvas.height);
            state.ctx.fillStyle = '#999';
            state.ctx.font = '20px Arial';
            state.ctx.textAlign = 'center';
            state.ctx.fillText('Failed to load image', state.canvas.width / 2, state.canvas.height / 2);
        };
        img.src = imagePath;

    } catch (error) {
        console.error('Error loading image:', error);
    }
}

function drawAnnotations(imgWidth, imgHeight, yoloLines) {
    yoloLines.forEach(yoloLine => {
        const bbox = yoloToBbox(yoloLine, imgWidth, imgHeight);

        // Draw green box
        state.ctx.strokeStyle = '#00ff00';
        state.ctx.lineWidth = 3;
        state.ctx.strokeRect(bbox.x1, bbox.y1, bbox.x2 - bbox.x1, bbox.y2 - bbox.y1);

        // Draw label background
        const label = 'Bottle (YOLO)';
        state.ctx.font = 'bold 16px Arial';
        const textMetrics = state.ctx.measureText(label);
        const textWidth = textMetrics.width;
        const textHeight = 20;

        state.ctx.fillStyle = '#00ff00';
        state.ctx.fillRect(bbox.x1, bbox.y1 - textHeight - 5, textWidth + 10, textHeight + 5);

        // Draw label text
        state.ctx.fillStyle = '#000000';
        state.ctx.fillText(label, bbox.x1 + 5, bbox.y1 - 8);
    });
}

function yoloToBbox(yoloLine, imgWidth, imgHeight) {
    const parts = yoloLine.split(' ');
    const centerX = parseFloat(parts[1]) * imgWidth;
    const centerY = parseFloat(parts[2]) * imgHeight;
    const width = parseFloat(parts[3]) * imgWidth;
    const height = parseFloat(parts[4]) * imgHeight;

    return {
        x1: centerX - width / 2,
        y1: centerY - height / 2,
        x2: centerX + width / 2,
        y2: centerY + height / 2
    };
}

function previousImage() {
    const filteredImages = getFilteredImages();
    if (filteredImages.length === 0) return;

    const currentFilename = state.images[state.currentIndex];
    const currentFilteredIndex = filteredImages.indexOf(currentFilename);

    let nextFilteredIndex = currentFilteredIndex - 1;
    if (nextFilteredIndex < 0) {
        nextFilteredIndex = filteredImages.length - 1;
    }

    const nextFilename = filteredImages[nextFilteredIndex];
    const nextIndex = state.images.indexOf(nextFilename);

    loadImage(nextIndex);
}

function nextImage() {
    const filteredImages = getFilteredImages();
    if (filteredImages.length === 0) return;

    const currentFilename = state.images[state.currentIndex];
    const currentFilteredIndex = filteredImages.indexOf(currentFilename);

    let nextFilteredIndex = currentFilteredIndex + 1;
    if (nextFilteredIndex >= filteredImages.length) {
        nextFilteredIndex = 0;
    }

    const nextFilename = filteredImages[nextFilteredIndex];
    const nextIndex = state.images.indexOf(nextFilename);

    loadImage(nextIndex);
}

function handleKeyPress(e) {
    switch (e.key) {
        case 'ArrowLeft':
            previousImage();
            break;
        case 'ArrowRight':
            nextImage();
            break;
        case 'a':
        case 'A':
            filterImages('annotated');
            document.querySelectorAll('.filter-btn')[1].classList.add('active');
            document.querySelectorAll('.filter-btn')[0].classList.remove('active');
            document.querySelectorAll('.filter-btn')[2].classList.remove('active');
            break;
        case 'm':
        case 'M':
            filterImages('missing');
            document.querySelectorAll('.filter-btn')[2].classList.add('active');
            document.querySelectorAll('.filter-btn')[0].classList.remove('active');
            document.querySelectorAll('.filter-btn')[1].classList.remove('active');
            break;
        case 'Escape':
            filterImages('all');
            document.querySelectorAll('.filter-btn')[0].classList.add('active');
            document.querySelectorAll('.filter-btn')[1].classList.remove('active');
            document.querySelectorAll('.filter-btn')[2].classList.remove('active');
            break;
    }
}

function openAnnotator() {
    window.open('/annotator.html', '_blank');
}

function downloadReport() {
    const total = state.images.length;
    const annotated = Object.keys(state.annotations).length;
    const missing = total - annotated;

    const missingImages = state.images.filter(f => !(f in state.annotations));

    const report = {
        timestamp: new Date().toISOString(),
        summary: {
            total_images: total,
            annotated: annotated,
            annotated_percent: ((annotated / total) * 100).toFixed(2),
            missing: missing,
            missing_percent: ((missing / total) * 100).toFixed(2)
        },
        annotated_images: Object.keys(state.annotations),
        missing_images: missingImages,
        annotations: state.annotations
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'yolo_review_report.json';
    a.click();
    URL.revokeObjectURL(url);

    alert('Review report downloaded!\n\n' +
          `Total: ${total}\n` +
          `Annotated: ${annotated} (${((annotated / total) * 100).toFixed(1)}%)\n` +
          `Missing: ${missing} (${((missing / total) * 100).toFixed(1)}%)`);
}

// Initialize on load
window.addEventListener('load', init);
