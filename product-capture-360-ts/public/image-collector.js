// Image Collector UI JavaScript - Powered by EyeAI

const state = {
  currentPath: '',
  backgrounds: [],
  augmentations: {
    // Standard augmentations
    zoom: true,
    lighting: true,
    color: true,
    shadows: true,
    rotation: true,
    flip: false,
    blur: false,
    noise: false,
    // Retail-specific augmentations
    shelfPlacement: true,
    storeLighting: true,
    occlusion: false,
    viewAngle: true,
    distanceScale: false,
    glare: false,
    shoppingContext: false,
  },
  capturedCount: 0,
  versions: [],
};

// Utility functions
const jget = (url) => fetch(url).then(r => r.json());
const jpost = (url, body) => fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body || {}),
}).then(r => r.json());

// Tab switching
window.switchTab = function(tabName) {
  // Update tab buttons
  document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
  const clickedTab = Array.from(document.querySelectorAll('.tab')).find(t => t.textContent.includes(tabName === 'capture' ? '1.' : tabName === 'augment' ? '2.' : tabName === 'generate' ? '3.' : '4.'));
  if (clickedTab) clickedTab.classList.add('active');

  // Update tab content
  document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
  document.getElementById(`${tabName}-tab`).classList.add('active');

  // Load data for specific tabs
  if (tabName === 'versions') {
    loadVersions();
  } else if (tabName === 'augment') {
    // Don't load source images automatically - wait for folder selection
    updateEstimates();
  } else if (tabName === 'generate') {
    updateEstimates();
  }
}

// Make functions globally accessible
window.connectCamera = connectCamera;
window.selectStorage = selectStorage;
window.captureImage = captureImage;
window.startSession = startSession;
window.toggleAug = toggleAug;
window.uploadBackgrounds = uploadBackgrounds;
window.removeBackground = removeBackground;
window.generatePreview = generatePreview;
window.generateDataset = generateDataset;
window.downloadVersion = downloadVersion;
window.loadDriveFolders = loadDriveFolders;
window.goUpFolder = goUpFolder;
window.selectProductFolder = selectProductFolder;
window.updateSliderValue = updateSliderValue;
window.batchGeneratePreview = batchGeneratePreview;
window.autoDetectProduct = autoDetectProduct;
window.goUpStorageFolder = goUpStorageFolder;
window.createStorageFolder = createStorageFolder;
window.useCurrentStoragePath = useCurrentStoragePath;
window.loadStorageBrowser = loadStorageBrowser;
window.stopSession = stopSession;
window.compareVersions = compareVersions;
window.exportVersionMetadata = exportVersionMetadata;

// Camera functions
async function loadCameras() {
  const res = await jget('/api/camera/scan');
  const select = document.getElementById('cameraSelect');
  select.innerHTML = '';

  const cameras = res.cameras.filter(cam => !cam.name.includes('Microphone'));
  cameras.forEach(cam => {
    const option = document.createElement('option');
    option.value = cam.index;
    option.textContent = `${cam.index}: ${cam.name}`;
    select.appendChild(option);
  });

  // Auto-connect to first USB camera or first camera if available
  if (cameras.length > 0) {
    const usbCamera = cameras.find(cam => cam.name.toLowerCase().includes('usb'));
    const defaultCamera = usbCamera || cameras[0];
    select.value = defaultCamera.index;

    // Auto-connect after a short delay to allow UI to update
    setTimeout(async () => {
      await connectCamera();
    }, 500);
  }
}

async function connectCamera() {
  const idx = document.getElementById('cameraSelect').value;
  const res = await jpost('/api/camera/init', {
    camera_index: parseInt(idx),
    width: 1920,
    height: 1080,
    fps: 10,
  });

  if (res.success) {
    document.getElementById('statusBadge').textContent = '🟢 Camera Connected';
    document.getElementById('statusBadge').classList.add('active');
  } else {
    alert('Camera connection failed: ' + res.message);
  }
}

// Storage functions
async function loadStorage() {
  const devices = await jget('/api/storage');
  const select = document.getElementById('storageSelect');
  select.innerHTML = '<option value="">Select a storage device...</option>';

  devices.forEach(dev => {
    const option = document.createElement('option');
    option.value = dev.mountpoint;
    option.textContent = `${dev.device} - ${dev.mountpoint}`;
    select.appendChild(option);
  });

  // Add event listener to load folder browser when storage is selected
  select.onchange = async (e) => {
    const path = e.target.value;
    if (path) {
      await loadStorageBrowser(path);
    }
  };
}

async function selectStorage() {
  const path = document.getElementById('storageSelect').value;
  const res = await jpost('/api/storage/select', { path });

  if (res.success) {
    state.currentPath = res.path;
    alert(`Storage selected: ${res.path}`);
    updateCaptureCount();
  } else {
    alert('Storage selection failed: ' + res.message);
  }
}

// Capture functions
async function captureImage() {
  const productName = document.getElementById('productName').value.trim();
  if (!productName) {
    alert('Please enter a product name');
    return;
  }

  const res = await jpost('/api/capture', {
    product_name: productName,
    high_res: true,
  });

  if (res.success) {
    state.capturedCount++;
    document.getElementById('capturedCount').textContent = state.capturedCount;
  } else {
    alert('Capture failed: ' + res.message);
  }
}

let sessionMonitorInterval = null;
let sessionStartTime = null;

async function startSession() {
  const productName = document.getElementById('productName').value.trim();
  if (!productName) {
    alert('Please enter a product name');
    return;
  }

  // Get capture rate from dropdown
  const rate = parseInt(document.getElementById('captureRate').value);
  const duration = prompt('Duration (seconds):', '60');

  if (!duration) return;

  const res = await jpost('/api/session/start', {
    rate: rate,
    duration: parseInt(duration),
    product_name: productName,
  });

  if (res.success) {
    document.getElementById('sessionStatus').textContent = 'Active';
    document.getElementById('sessionStatus').style.color = 'var(--success)';

    // Show progress section
    document.getElementById('sessionProgress').style.display = 'block';
    sessionStartTime = Date.now();

    const targetImages = Math.floor((rate * parseInt(duration)) / 60);

    // Poll session status with progress updates
    sessionMonitorInterval = setInterval(async () => {
      const status = await jget('/api/status');
      if (!status.active) {
        clearInterval(sessionMonitorInterval);
        sessionMonitorInterval = null;
        document.getElementById('sessionStatus').textContent = 'Idle';
        document.getElementById('sessionStatus').style.color = 'var(--text-dim)';
        document.getElementById('sessionProgress').style.display = 'none';
        state.capturedCount = status.capturedCount || 0;
        document.getElementById('capturedCount').textContent = state.capturedCount;
      } else {
        // Update progress
        const captured = status.capturedCount || 0;
        state.capturedCount = captured;
        document.getElementById('capturedCount').textContent = captured;

        // Update progress bar
        const progress = Math.min((captured / targetImages) * 100, 100);
        document.getElementById('sessionProgressBar').style.width = `${progress}%`;

        // Update stats
        document.getElementById('sessionImages').textContent = `${captured} / ${targetImages}`;
        document.getElementById('sessionRate').textContent = `${rate}/min`;

        // Calculate elapsed and remaining time
        const elapsedMs = Date.now() - sessionStartTime;
        const elapsedSec = Math.floor(elapsedMs / 1000);
        document.getElementById('sessionElapsed').textContent = formatTime(elapsedSec);

        // Estimate remaining time
        const remainingSec = Math.max(0, parseInt(duration) - elapsedSec);
        document.getElementById('sessionRemaining').textContent = formatTime(remainingSec);
      }
    }, 1000);
  }
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

async function stopSession() {
  try {
    const res = await jpost('/api/session/stop');
    if (res.success) {
      if (sessionMonitorInterval) {
        clearInterval(sessionMonitorInterval);
        sessionMonitorInterval = null;
      }
      document.getElementById('sessionStatus').textContent = 'Idle';
      document.getElementById('sessionStatus').style.color = 'var(--text-dim)';
      document.getElementById('sessionProgress').style.display = 'none';
    }
  } catch (error) {
    console.error('Error stopping session:', error);
  }
}

async function updateCaptureCount() {
  const res = await jget(`/api/folder?path=${encodeURIComponent(state.currentPath)}`);
  const imageCount = res.items.filter(it => /\.(jpg|jpeg|png)$/i.test(it.name)).length;
  state.capturedCount = imageCount;
  document.getElementById('capturedCount').textContent = imageCount;
  document.getElementById('sourceImagesCount').textContent = imageCount;
}

// Augmentation functions
function toggleAug(name) {
  state.augmentations[name] = !state.augmentations[name];
  const toggle = document.getElementById(`toggle-${name}`);
  toggle.classList.toggle('active');
}

async function uploadBackgrounds(event) {
  const files = event.target.files;
  if (!files.length) return;

  for (const file of files) {
    // In a real implementation, upload to server
    // For now, just add to state
    const reader = new FileReader();
    reader.onload = (e) => {
      state.backgrounds.push({
        name: file.name,
        data: e.target.result,
      });
      renderBackgrounds();
      updateEstimates();
    };
    reader.readAsDataURL(file);
  }
}

function renderBackgrounds() {
  const list = document.getElementById('backgroundList');
  list.innerHTML = '';

  state.backgrounds.forEach((bg, idx) => {
    const item = document.createElement('div');
    item.className = 'bg-item';
    item.innerHTML = `
      <img src="${bg.data}" alt="${bg.name}">
      <button class="bg-remove" onclick="removeBackground(${idx})">×</button>
    `;
    list.appendChild(item);
  });

  document.getElementById('backgroundsCount').textContent = state.backgrounds.length;
}

function removeBackground(idx) {
  state.backgrounds.splice(idx, 1);
  renderBackgrounds();
  updateEstimates();
}

async function loadSourceImages() {
  const select = document.getElementById('previewImageSelect');

  if (!state.currentPath) {
    select.innerHTML = '<option value="">Select a folder first...</option>';
    return;
  }

  try {
    const res = await jget(`/api/folder?path=${encodeURIComponent(state.currentPath)}`);
    const images = res.items.filter(it => /\.(jpg|jpeg|png)$/i.test(it.name));

    select.innerHTML = '';

    if (images.length === 0) {
      select.innerHTML = '<option value="">No images found in this folder</option>';
      return;
    }

    images.forEach(img => {
      const option = document.createElement('option');
      option.value = `${res.path}/${img.name}`;
      option.textContent = img.name;
      select.appendChild(option);
    });

    console.log(`Loaded ${images.length} images from ${state.currentPath}`);
  } catch (error) {
    console.error('Error loading images:', error);
    select.innerHTML = '<option value="">Error loading images</option>';
  }
}

function updateSliderValue(name, value) {
  document.getElementById(`${name}Value`).textContent = value;
}

async function generatePreview() {
  const imagePath = document.getElementById('previewImageSelect').value;
  if (!imagePath) {
    alert('Select an image first');
    return;
  }

  const grid = document.getElementById('previewGrid');
  grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 2rem; color: var(--text-dim);">Generating preview...</div>';

  // Get current slider values
  const zoom = parseFloat(document.getElementById('zoomSlider').value);
  const brightness = parseFloat(document.getElementById('brightnessSlider').value);
  const contrast = parseFloat(document.getElementById('contrastSlider').value);
  const saturation = parseFloat(document.getElementById('saturationSlider').value);

  // Create image URL that works with the server
  const imageUrl = imagePath.startsWith('http') ? imagePath : `/file?path=${encodeURIComponent(imagePath)}`;

  // Generate previews with different augmentations
  const augmentationTypes = [
    { name: 'Original', filter: 'none', scale: 1 },
    { name: `Zoom ${zoom}x`, filter: 'none', scale: zoom },
    { name: `Bright ${brightness}`, filter: `brightness(${brightness})`, scale: 1 },
    { name: `Contrast ${contrast}`, filter: `contrast(${contrast})`, scale: 1 },
    { name: `Saturation ${saturation}`, filter: `saturate(${saturation})`, scale: 1 },
    { name: 'Dark -30%', filter: 'brightness(0.7)', scale: 1 },
    { name: 'High Saturation', filter: 'saturate(1.5)', scale: 1 },
    { name: 'Low Saturation', filter: 'saturate(0.5)', scale: 1 },
    { name: 'Combined', filter: `brightness(${brightness}) contrast(${contrast}) saturate(${saturation})`, scale: zoom },
  ];

  grid.innerHTML = '';

  // Load and display each augmentation
  augmentationTypes.forEach(aug => {
    const item = document.createElement('div');
    item.className = 'preview-item';

    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = aug.name;
    img.style.filter = aug.filter;
    img.style.transform = `scale(${aug.scale})`;
    img.style.transformOrigin = 'center';

    const label = document.createElement('div');
    label.className = 'preview-label';
    label.textContent = aug.name;

    item.appendChild(img);
    item.appendChild(label);
    grid.appendChild(item);
  });
}

async function batchGeneratePreview() {
  if (!state.currentPath) {
    alert('Please select a folder first');
    return;
  }

  const grid = document.getElementById('previewGrid');
  const progress = document.getElementById('batchProgress');
  const progressBar = document.getElementById('batchProgressBar');
  const progressText = document.getElementById('batchProgressText');

  // Get current slider values
  const zoom = parseFloat(document.getElementById('zoomSlider').value);
  const brightness = parseFloat(document.getElementById('brightnessSlider').value);
  const contrast = parseFloat(document.getElementById('contrastSlider').value);
  const saturation = parseFloat(document.getElementById('saturationSlider').value);

  try {
    // Get all images from current folder
    const res = await jget(`/api/folder?path=${encodeURIComponent(state.currentPath)}`);
    const images = res.items.filter(it => /\.(jpg|jpeg|png)$/i.test(it.name));

    if (images.length === 0) {
      alert('No images found in selected folder');
      return;
    }

    // Show progress
    progress.style.display = 'block';
    grid.innerHTML = '';

    // Limit to first 20 images for preview performance
    const imagesToProcess = images.slice(0, 20);
    progressText.textContent = `Processing ${imagesToProcess.length} images...`;

    for (let i = 0; i < imagesToProcess.length; i++) {
      const img = imagesToProcess[i];
      const imagePath = `${res.path}/${img.name}`;
      const imageUrl = `/file?path=${encodeURIComponent(imagePath)}`;

      // Create preview item with combined augmentation
      const item = document.createElement('div');
      item.className = 'preview-item';

      const imgElem = document.createElement('img');
      imgElem.src = imageUrl;
      imgElem.alt = img.name;
      imgElem.style.filter = `brightness(${brightness}) contrast(${contrast}) saturate(${saturation})`;
      imgElem.style.transform = `scale(${zoom})`;
      imgElem.style.transformOrigin = 'center';

      const label = document.createElement('div');
      label.className = 'preview-label';
      label.textContent = `${i + 1}. ${img.name.substring(0, 20)}...`;

      item.appendChild(imgElem);
      item.appendChild(label);
      grid.appendChild(item);

      // Update progress
      const percent = ((i + 1) / imagesToProcess.length) * 100;
      progressBar.style.width = `${percent}%`;
      progressText.textContent = `Processed ${i + 1}/${imagesToProcess.length} images`;

      // Small delay to allow UI to update
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    if (images.length > 20) {
      const moreInfo = document.createElement('div');
      moreInfo.style.gridColumn = '1/-1';
      moreInfo.style.textAlign = 'center';
      moreInfo.style.padding = '2rem';
      moreInfo.style.color = 'var(--text-dim)';
      moreInfo.textContent = `Showing first 20 of ${images.length} total images. Use "Generate Dataset" to process all.`;
      grid.appendChild(moreInfo);
    }

    progress.style.display = 'none';
  } catch (error) {
    console.error('Batch preview error:', error);
    alert('Failed to generate batch preview: ' + error.message);
    progress.style.display = 'none';
  }
}

function updateEstimates() {
  const sourceImages = state.capturedCount;
  const backgrounds = state.backgrounds.length || 1;
  const augPerBg = parseInt(document.getElementById('augPerBg')?.value || 5);

  const estimated = sourceImages * backgrounds * (1 + augPerBg);

  document.getElementById('sourceImagesCount').textContent = sourceImages;
  document.getElementById('backgroundsCount').textContent = backgrounds;
  document.getElementById('estimatedCount').textContent = estimated.toLocaleString();
}

// Dataset generation
async function generateDataset() {
  const productName = document.getElementById('productName').value.trim();
  if (!productName) {
    alert('Please enter a product name');
    return;
  }

  if (state.capturedCount === 0) {
    alert('No images captured yet!');
    return;
  }

  const exportFormats = [];
  if (document.getElementById('export-yolov5').checked) exportFormats.push('yolov5');
  if (document.getElementById('export-yolov8').checked) exportFormats.push('yolov8');
  if (document.getElementById('export-yolov11').checked) exportFormats.push('yolov11');
  if (document.getElementById('export-coco').checked) exportFormats.push('coco');

  const trainSplit = parseInt(document.getElementById('trainSplit').value) / 100;

  // Show progress
  document.getElementById('progressSection').style.display = 'block';
  updateProgress(0, 'Starting pipeline...');

  try {
    // Call pipeline API
    const res = await jpost('/api/pipeline/run', {
      product_folder: state.currentPath,
      product_name: productName,
      segmentation_model: document.getElementById('segmentationModel').value,
      background_images: state.backgrounds.map(bg => bg.data), // In real impl, use paths
      augmentations_per_bg: parseInt(document.getElementById('augPerBg').value),
      enable_zoom: state.augmentations.zoom,
      enable_lighting: state.augmentations.lighting,
      enable_color_jitter: state.augmentations.color,
      enable_shadows: state.augmentations.shadows,
      export_formats: exportFormats,
      train_val_split: trainSplit,
    });

    if (res.success) {
      updateProgress(100, 'Dataset generated successfully!');

      // Save version
      await saveVersion(res, productName);

      setTimeout(() => {
        switchTab('versions');
        document.getElementById('progressSection').style.display = 'none';
      }, 2000);
    } else {
      updateProgress(0, 'Error: ' + res.message);
      alert('Dataset generation failed: ' + res.message);
    }
  } catch (err) {
    updateProgress(0, 'Error: ' + err.message);
    alert('Dataset generation failed: ' + err.message);
  }
}

function updateProgress(percent, text) {
  document.getElementById('progressBar').style.width = percent + '%';
  document.getElementById('progressText').textContent = text;
}

// Versioning
async function saveVersion(pipelineResult, productName) {
  const desc = document.getElementById('versionDesc').value;

  await jpost('/api/versions/create', {
    product_name: productName,
    source_folder: state.currentPath,
    source_images: state.capturedCount,
    segmentation_model: document.getElementById('segmentationModel').value,
    augmentations: state.augmentations,
    background_images: state.backgrounds.map(bg => bg.name),
    total_images: pipelineResult.stats.augmentedImages,
    train_images: pipelineResult.stats.trainImages,
    val_images: pipelineResult.stats.valImages,
    export_formats: pipelineResult.steps.export.formats,
    description: desc,
  });
}

async function loadVersions() {
  const versions = await jget('/api/versions/list');
  state.versions = versions;

  const list = document.getElementById('versionList');
  list.innerHTML = '';

  if (versions.length === 0) {
    list.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-dim);">No versions yet. Generate your first dataset!</div>';
    return;
  }

  versions.reverse().forEach((v, idx) => {
    const item = document.createElement('div');
    item.className = 'version-item';
    if (idx === 0) item.classList.add('active');

    item.innerHTML = `
      <div class="version-info">
        <div class="version-name">v${v.version} - ${v.productName}</div>
        <div class="version-meta">
          ${new Date(v.created).toLocaleDateString()} •
          ${v.totalImages} images •
          ${v.exportFormats.join(', ')}
        </div>
      </div>
      ${idx === 0 ? '<div class="version-badge">Latest</div>' : ''}
    `;

    item.onclick = () => showVersionDetails(v);
    list.appendChild(item);
  });

  // Populate comparison dropdowns
  const select1 = document.getElementById('compareVersion1');
  const select2 = document.getElementById('compareVersion2');
  select1.innerHTML = '<option value="">Select version 1...</option>';
  select2.innerHTML = '<option value="">Select version 2...</option>';

  versions.forEach(v => {
    const opt1 = document.createElement('option');
    opt1.value = v.version;
    opt1.textContent = `v${v.version} - ${v.productName} (${v.totalImages} imgs)`;
    select1.appendChild(opt1);

    const opt2 = document.createElement('option');
    opt2.value = v.version;
    opt2.textContent = `v${v.version} - ${v.productName} (${v.totalImages} imgs)`;
    select2.appendChild(opt2);
  });

  // Show first version details
  if (versions.length > 0) {
    showVersionDetails(versions[versions.length - 1]);
  }
}

function showVersionDetails(version) {
  const details = document.getElementById('versionDetails');

  const augList = Object.entries(version.augmentations)
    .filter(([key, val]) => val)
    .map(([key]) => key.charAt(0).toUpperCase() + key.slice(1))
    .join(', ');

  details.innerHTML = `
    <div style="padding: 1rem;">
      <h3 style="font-size: 1.5rem; margin-bottom: 1rem;">Version ${version.version}</h3>

      <div class="stats" style="margin-bottom: 1.5rem;">
        <div class="stat-card">
          <div class="stat-value">${version.sourceImages}</div>
          <div class="stat-label">Source Images</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${version.totalImages}</div>
          <div class="stat-label">Total Images</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${version.trainImages}</div>
          <div class="stat-label">Train</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${version.valImages}</div>
          <div class="stat-label">Val</div>
        </div>
      </div>

      <div style="margin-bottom: 1rem;">
        <strong>Product:</strong> ${version.productName}
      </div>

      <div style="margin-bottom: 1rem;">
        <strong>Segmentation:</strong> ${version.segmentationModel}
      </div>

      <div style="margin-bottom: 1rem;">
        <strong>Backgrounds:</strong> ${version.backgroundImages.length}
      </div>

      <div style="margin-bottom: 1rem;">
        <strong>Augmentations:</strong> ${augList || 'None'}
      </div>

      <div style="margin-bottom: 1rem;">
        <strong>Export Formats:</strong> ${version.exportFormats.join(', ')}
      </div>

      <div style="margin-bottom: 1rem;">
        <strong>Created:</strong> ${new Date(version.created).toLocaleString()}
      </div>

      ${version.description ? `
        <div style="margin-top: 1.5rem; padding: 1rem; background: var(--bg-dark); border-radius: 0.5rem;">
          <strong>Description:</strong><br>
          ${version.description}
        </div>
      ` : ''}

      ${version.metrics ? `
        <div style="margin-top: 1.5rem;">
          <strong>Training Metrics:</strong>
          <div class="stats" style="margin-top: 0.5rem;">
            ${version.metrics.mAP50 ? `
              <div class="stat-card">
                <div class="stat-value">${(version.metrics.mAP50 * 100).toFixed(1)}%</div>
                <div class="stat-label">mAP@50</div>
              </div>
            ` : ''}
            ${version.metrics.precision ? `
              <div class="stat-card">
                <div class="stat-value">${(version.metrics.precision * 100).toFixed(1)}%</div>
                <div class="stat-label">Precision</div>
              </div>
            ` : ''}
          </div>
        </div>
      ` : ''}

      <div style="margin-top: 1.5rem;">
        <button class="btn btn-primary btn-full" onclick="downloadVersion(${version.version})">
          📥 Download Dataset
        </button>
      </div>
    </div>
  `;

  // Update active state
  document.querySelectorAll('.version-item').forEach(item => item.classList.remove('active'));
  event?.target?.closest('.version-item')?.classList.add('active');
}

function downloadVersion(version) {
  alert(`Download functionality for version ${version} - Coming soon!`);
}

// Folder Browser Functions
async function loadDrives() {
  const devices = await jget('/api/storage');
  const select = document.getElementById('driveSelect');
  select.innerHTML = '<option value="">Select a drive...</option>';

  devices.forEach(dev => {
    const option = document.createElement('option');
    option.value = dev.mountpoint;
    option.textContent = `📁 ${dev.device} (${dev.mountpoint})`;
    select.appendChild(option);
  });
}

async function loadDriveFolders() {
  const drivePath = document.getElementById('driveSelect').value;
  if (!drivePath) return;

  state.currentPath = drivePath;
  await browseFolder(drivePath);
}

async function browseFolder(folderPath) {
  try {
    const res = await jget(`/api/folder?path=${encodeURIComponent(folderPath)}`);

    state.currentPath = res.path;
    document.getElementById('currentPath').value = res.path;

    const browser = document.getElementById('folderBrowser');
    browser.innerHTML = '';

    // Show parent folder link if available
    if (res.parent) {
      const parentItem = document.createElement('div');
      parentItem.className = 'folder-item';
      parentItem.innerHTML = `
        <div class="folder-icon">⬆️</div>
        <div class="folder-name">..</div>
      `;
      parentItem.onclick = () => browseFolder(res.parent);
      browser.appendChild(parentItem);
    }

    // Sort: directories first, then files
    const dirs = res.items.filter(it => it.is_dir).sort((a, b) => a.name.localeCompare(b.name));
    const files = res.items.filter(it => !it.is_dir).sort((a, b) => a.name.localeCompare(b.name));

    // Render directories
    dirs.forEach(item => {
      // Skip hidden files/folders
      if (item.name.startsWith('.') || item.name.startsWith('._')) return;

      const folderItem = document.createElement('div');
      folderItem.className = 'folder-item';
      folderItem.innerHTML = `
        <div class="folder-icon">📁</div>
        <div class="folder-name">${item.name}</div>
      `;
      folderItem.onclick = (e) => {
        if (e.detail === 1) {
          // Single click - select
          document.querySelectorAll('.folder-item').forEach(fi => fi.classList.remove('selected'));
          folderItem.classList.add('selected');
          selectProductFolder(`${res.path}/${item.name}`, item.name);
        } else if (e.detail === 2) {
          // Double click - browse
          browseFolder(`${res.path}/${item.name}`);
        }
      };
      browser.appendChild(folderItem);
    });

    // Render image files
    const imageFiles = files.filter(f => /\.(jpg|jpeg|png)$/i.test(f.name));
    if (imageFiles.length > 0) {
      const fileCount = document.createElement('div');
      fileCount.className = 'folder-item';
      fileCount.style.background = 'var(--bg-hover)';
      fileCount.style.cursor = 'default';
      fileCount.innerHTML = `
        <div class="folder-icon">🖼️</div>
        <div class="folder-name">${imageFiles.length} images in this folder</div>
      `;
      browser.appendChild(fileCount);
    }

  } catch (error) {
    console.error('Error browsing folder:', error);
    alert('Failed to browse folder: ' + error.message);
  }
}

function selectProductFolder(folderPath, folderName) {
  state.currentPath = folderPath;
  document.getElementById('selectedProductFolder').value = `${folderName} (${folderPath})`;

  // Load images from this folder into preview dropdown
  loadSourceImages();

  // Auto-generate batch preview to show images immediately
  setTimeout(() => {
    batchGeneratePreview();
  }, 500);

  console.log('Selected product folder:', folderPath);
}

function goUpFolder() {
  const currentPath = state.currentPath;
  if (!currentPath) return;

  const parent = currentPath.split('/').slice(0, -1).join('/');
  if (parent) {
    browseFolder(parent || '/');
  }
}

// Auto-Detection Function
async function autoDetectProduct() {
  const imagePath = document.getElementById('previewImageSelect').value;
  if (!imagePath) {
    alert('Please select an image first');
    return;
  }

  try {
    // Extract product name from folder path
    const folderName = state.currentPath ? state.currentPath.split('/').pop() : 'product';

    // Show loading state
    const btn = event?.target;
    if (btn) btn.textContent = '⏳ Detecting...';

    // Call detection API
    const res = await jpost('/api/detect/auto', {
      image_path: imagePath,
      product_name: folderName,
      model_type: 'rembg'
    });

    if (!res.success) {
      alert('Detection failed: ' + (res.message || 'Unknown error'));
      if (btn) btn.textContent = '🎯 Auto-Detect Product & Show BBox';
      return;
    }

    // Display detection result
    const detection = res.detection;
    const detectionResult = document.getElementById('detectionResult');
    detectionResult.style.display = 'block';

    // Update info
    document.getElementById('detectionClass').textContent = detection.className;
    document.getElementById('detectionBBox').textContent =
      `[x:${detection.bbox[0]}, y:${detection.bbox[1]}, w:${detection.bbox[2]}, h:${detection.bbox[3]}]`;
    document.getElementById('detectionConfidence').textContent =
      (detection.confidence * 100).toFixed(1) + '%';

    // Draw image with bounding box on canvas
    const canvas = document.getElementById('detectionCanvas');
    const ctx = canvas.getContext('2d');

    const img = new Image();
    img.onload = () => {
      // Set canvas size to match image
      canvas.width = img.width;
      canvas.height = img.height;

      // Draw image
      ctx.drawImage(img, 0, 0);

      // Draw bounding box
      const [x, y, w, h] = detection.bbox;
      ctx.strokeStyle = '#6366f1';
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, w, h);

      // Draw label
      ctx.fillStyle = '#6366f1';
      ctx.fillRect(x, y - 25, ctx.measureText(detection.className).width + 10, 25);
      ctx.fillStyle = 'white';
      ctx.font = '16px system-ui';
      ctx.fillText(detection.className, x + 5, y - 7);

      console.log('Detection complete:', detection);
    };

    img.src = imagePath.startsWith('http') ? imagePath : `/file?path=${encodeURIComponent(imagePath)}`;

    if (btn) btn.textContent = '🎯 Auto-Detect Product & Show BBox';

  } catch (error) {
    console.error('Detection error:', error);
    alert('Detection failed: ' + error.message);
    if (event?.target) event.target.textContent = '🎯 Auto-Detect Product & Show BBox';
  }
}

// Storage Folder Browser Functions
let currentStoragePath = '';

async function loadStorageBrowser(path) {
  try {
    const res = await jget(`/api/folder?path=${encodeURIComponent(path)}`);
    currentStoragePath = res.path;
    document.getElementById('storagePath').value = res.path;

    const browser = document.getElementById('storageBrowser');
    browser.innerHTML = '';

    // Sort: directories first
    const dirs = res.items.filter(it => it.is_dir).sort((a, b) => a.name.localeCompare(b.name));

    // Render directories
    dirs.forEach(item => {
      // Skip hidden files/folders
      if (item.name.startsWith('.') || item.name.startsWith('._')) return;

      const folderItem = document.createElement('div');
      folderItem.className = 'folder-item';
      folderItem.style.padding = '0.5rem';
      folderItem.style.cursor = 'pointer';
      folderItem.style.borderBottom = '1px solid var(--border)';
      folderItem.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <div style="font-size: 1.2rem;">📁</div>
          <div style="flex: 1;">${item.name}</div>
        </div>
      `;
      folderItem.onmouseover = () => {
        folderItem.style.background = 'var(--bg-hover)';
      };
      folderItem.onmouseout = () => {
        folderItem.style.background = 'transparent';
      };
      folderItem.onclick = () => {
        loadStorageBrowser(`${res.path}/${item.name}`);
      };
      browser.appendChild(folderItem);
    });

    // Show image count if any
    const imageFiles = res.items.filter(f => !f.is_dir && /\.(jpg|jpeg|png)$/i.test(f.name));
    if (imageFiles.length > 0) {
      const infoDiv = document.createElement('div');
      infoDiv.style.padding = '0.5rem';
      infoDiv.style.color = 'var(--text-dim)';
      infoDiv.style.fontSize = '0.875rem';
      infoDiv.style.borderTop = '1px solid var(--border)';
      infoDiv.textContent = `📷 ${imageFiles.length} images in this folder`;
      browser.appendChild(infoDiv);
    }

  } catch (error) {
    console.error('Error loading storage browser:', error);
    alert('Failed to browse folder: ' + error.message);
  }
}

async function goUpStorageFolder() {
  if (!currentStoragePath) return;

  const parent = currentStoragePath.split('/').slice(0, -1).join('/');
  if (parent) {
    await loadStorageBrowser(parent || '/');
  }
}

async function createStorageFolder() {
  const newFolderName = document.getElementById('newFolderName').value.trim();
  if (!newFolderName) {
    alert('Please enter a folder name');
    return;
  }

  try {
    const res = await jpost('/api/folder/create', {
      path: `${currentStoragePath}/${newFolderName}`
    });

    if (res.success) {
      document.getElementById('newFolderName').value = '';
      // Reload browser to show new folder
      await loadStorageBrowser(currentStoragePath);
    } else {
      alert('Failed to create folder: ' + res.message);
    }
  } catch (error) {
    console.error('Error creating folder:', error);
    alert('Failed to create folder: ' + error.message);
  }
}

async function useCurrentStoragePath() {
  if (!currentStoragePath) {
    alert('No storage path selected');
    return;
  }

  try {
    const res = await jpost('/api/storage/select', { path: currentStoragePath });

    if (res.success) {
      state.currentPath = res.path;
      document.getElementById('storageSelect').value = currentStoragePath;
      alert(`Storage location set to: ${res.path}`);
      updateCaptureCount();
    } else {
      alert('Failed to set storage location: ' + res.message);
    }
  } catch (error) {
    console.error('Error setting storage location:', error);
    alert('Failed to set storage location: ' + error.message);
  }
}

// Version comparison and metadata export
function compareVersions() {
  const v1Num = parseInt(document.getElementById('compareVersion1').value);
  const v2Num = parseInt(document.getElementById('compareVersion2').value);

  if (!v1Num || !v2Num) {
    alert('Please select two versions to compare');
    return;
  }

  if (v1Num === v2Num) {
    alert('Please select different versions');
    return;
  }

  const v1 = state.versions.find(v => v.version === v1Num);
  const v2 = state.versions.find(v => v.version === v2Num);

  if (!v1 || !v2) {
    alert('Versions not found');
    return;
  }

  const details = document.getElementById('versionDetails');

  // Calculate differences
  const imageDiff = v2.totalImages - v1.totalImages;
  const imageDiffPercent = ((imageDiff / v1.totalImages) * 100).toFixed(1);
  const trainDiff = v2.trainImages - v1.trainImages;
  const valDiff = v2.valImages - v1.valImages;

  // Compare augmentations
  const v1Augs = Object.entries(v1.augmentations).filter(([k, v]) => v).map(([k]) => k);
  const v2Augs = Object.entries(v2.augmentations).filter(([k, v]) => v).map(([k]) => k);
  const addedAugs = v2Augs.filter(a => !v1Augs.includes(a));
  const removedAugs = v1Augs.filter(a => !v2Augs.includes(a));

  details.innerHTML = `
    <div style="padding: 1rem;">
      <h3 style="font-size: 1.5rem; margin-bottom: 1rem; color: var(--primary);">Version Comparison</h3>

      <div class="grid grid-2" style="margin-bottom: 1.5rem;">
        <div style="background: var(--bg-dark); padding: 1rem; border-radius: 0.5rem; border-left: 3px solid var(--primary);">
          <h4 style="margin-bottom: 0.5rem;">v${v1.version} - ${v1.productName}</h4>
          <div style="font-size: 0.875rem; color: var(--text-dim);">${new Date(v1.created).toLocaleString()}</div>
        </div>
        <div style="background: var(--bg-dark); padding: 1rem; border-radius: 0.5rem; border-left: 3px solid var(--success);">
          <h4 style="margin-bottom: 0.5rem;">v${v2.version} - ${v2.productName}</h4>
          <div style="font-size: 0.875rem; color: var(--text-dim);">${new Date(v2.created).toLocaleString()}</div>
        </div>
      </div>

      <div style="background: var(--bg-dark); padding: 1.5rem; border-radius: 0.5rem; margin-bottom: 1.5rem;">
        <h4 style="color: var(--success); margin-bottom: 1rem;">📊 Dataset Size Changes</h4>
        <div class="stats">
          <div class="stat-card">
            <div class="stat-value">${v1.totalImages} → ${v2.totalImages}</div>
            <div class="stat-label">Total Images</div>
            <div style="font-size: 0.875rem; color: ${imageDiff > 0 ? 'var(--success)' : 'var(--danger)'};">
              ${imageDiff > 0 ? '+' : ''}${imageDiff} (${imageDiffPercent > 0 ? '+' : ''}${imageDiffPercent}%)
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${v1.trainImages} → ${v2.trainImages}</div>
            <div class="stat-label">Train Images</div>
            <div style="font-size: 0.875rem; color: ${trainDiff > 0 ? 'var(--success)' : 'var(--danger)'};">
              ${trainDiff > 0 ? '+' : ''}${trainDiff}
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${v1.valImages} → ${v2.valImages}</div>
            <div class="stat-label">Val Images</div>
            <div style="font-size: 0.875rem; color: ${valDiff > 0 ? 'var(--success)' : 'var(--danger)'};">
              ${valDiff > 0 ? '+' : ''}${valDiff}
            </div>
          </div>
        </div>
      </div>

      <div style="background: var(--bg-dark); padding: 1.5rem; border-radius: 0.5rem; margin-bottom: 1.5rem;">
        <h4 style="color: var(--success); margin-bottom: 1rem;">🎨 Augmentation Changes</h4>
        ${addedAugs.length > 0 ? `
          <div style="margin-bottom: 1rem;">
            <div style="color: var(--success); font-weight: 600; margin-bottom: 0.5rem;">✓ Added:</div>
            <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
              ${addedAugs.map(a => `<span style="background: rgba(16, 185, 129, 0.2); color: var(--success); padding: 0.25rem 0.75rem; border-radius: 999px; font-size: 0.875rem;">${a}</span>`).join('')}
            </div>
          </div>
        ` : ''}
        ${removedAugs.length > 0 ? `
          <div>
            <div style="color: var(--danger); font-weight: 600; margin-bottom: 0.5rem;">✗ Removed:</div>
            <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
              ${removedAugs.map(a => `<span style="background: rgba(239, 68, 68, 0.2); color: var(--danger); padding: 0.25rem 0.75rem; border-radius: 999px; font-size: 0.875rem;">${a}</span>`).join('')}
            </div>
          </div>
        ` : ''}
        ${addedAugs.length === 0 && removedAugs.length === 0 ? `
          <div style="color: var(--text-dim); text-align: center;">No augmentation changes</div>
        ` : ''}
      </div>

      <div style="background: var(--bg-dark); padding: 1.5rem; border-radius: 0.5rem;">
        <h4 style="color: var(--success); margin-bottom: 1rem;">🔧 Configuration Comparison</h4>
        <div style="display: grid; grid-template-columns: auto auto auto; gap: 1rem; font-size: 0.875rem;">
          <div style="font-weight: 600;">Setting</div>
          <div style="font-weight: 600; text-align: center;">v${v1.version}</div>
          <div style="font-weight: 600; text-align: center;">v${v2.version}</div>

          <div style="color: var(--text-dim);">Segmentation</div>
          <div style="text-align: center;">${v1.segmentationModel}</div>
          <div style="text-align: center;">${v2.segmentationModel}</div>

          <div style="color: var(--text-dim);">Backgrounds</div>
          <div style="text-align: center;">${v1.backgroundImages.length}</div>
          <div style="text-align: center;">${v2.backgroundImages.length}</div>

          <div style="color: var(--text-dim);">Export Formats</div>
          <div style="text-align: center;">${v1.exportFormats.join(', ')}</div>
          <div style="text-align: center;">${v2.exportFormats.join(', ')}</div>
        </div>
      </div>
    </div>
  `;
}

function exportVersionMetadata() {
  if (state.versions.length === 0) {
    alert('No versions to export');
    return;
  }

  // Create comprehensive metadata export
  const metadata = {
    exportedAt: new Date().toISOString(),
    exportedBy: 'Image Collector - EyeAI',
    totalVersions: state.versions.length,
    versions: state.versions.map(v => ({
      version: v.version,
      productName: v.productName,
      created: v.created,
      sourceFolder: v.sourceFolder,
      stats: {
        sourceImages: v.sourceImages,
        totalImages: v.totalImages,
        trainImages: v.trainImages,
        valImages: v.valImages,
      },
      configuration: {
        segmentationModel: v.segmentationModel,
        augmentations: v.augmentations,
        backgroundImages: v.backgroundImages,
        exportFormats: v.exportFormats,
      },
      description: v.description || '',
      metrics: v.metrics || null,
    })),
    summary: {
      totalImages: state.versions.reduce((sum, v) => sum + v.totalImages, 0),
      latestVersion: state.versions.length > 0 ? state.versions[state.versions.length - 1].version : 0,
      products: [...new Set(state.versions.map(v => v.productName))],
    },
  };

  // Download as JSON
  const blob = new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dataset_versions_metadata_${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  alert(`Exported metadata for ${state.versions.length} versions`);
}

// ==================== ANNOTATION SYSTEM ====================

// Annotation State
const annotationState = {
  files: [],
  currentFileIndex: -1,
  currentImage: null,
  labels: [],
  selectedLabel: null,
  annotations: [],
  selectedAnnotation: null,
  tool: 'bbox', // bbox, obb, polygon, segmentation, select, pan
  zoom: 1.0,
  pan: { x: 0, y: 0 },
  drawing: false,
  currentShape: null,
  history: [],
  historyIndex: -1,
  showAnnotations: true,
  canvas: null,
  ctx: null,
};

// Color palette for labels
const LABEL_COLORS = [
  '#ef4444', '#f59e0b', '#10b981', '#06b6d4', '#6366f1', '#8b5cf6',
  '#ec4899', '#f97316', '#84cc16', '#14b8a6', '#3b82f6', '#a855f7'
];

// Initialize annotation canvas
function initAnnotationCanvas() {
  const canvas = document.getElementById('annotationCanvas');
  if (!canvas) return;

  annotationState.canvas = canvas;
  annotationState.ctx = canvas.getContext('2d');

  // Add event listeners
  canvas.addEventListener('mousedown', handleCanvasMouseDown);
  canvas.addEventListener('mousemove', handleCanvasMouseMove);
  canvas.addEventListener('mouseup', handleCanvasMouseUp);
  canvas.addEventListener('wheel', handleCanvasWheel, { passive: false });

  // File input listener
  document.getElementById('annotationFileInput')?.addEventListener('change', handleFileUpload);

  // Keyboard shortcuts
  document.addEventListener('keydown', handleAnnotationKeyboard);
}

// File Upload Handler
function handleFileUpload(event) {
  const files = Array.from(event.target.files);

  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = (e) => {
      annotationState.files.push({
        name: file.name,
        type: file.type,
        data: e.target.result,
        annotations: [],
      });
      renderFileList();

      // Load first file automatically
      if (annotationState.currentFileIndex === -1) {
        loadAnnotationFile(0);
      }
    };

    if (file.type.startsWith('image/')) {
      reader.readAsDataURL(file);
    } else if (file.type.startsWith('video/')) {
      // Video support - will be implemented in Phase 2
      console.log('Video support coming soon');
    }
  });
}

// Render File List
function renderFileList() {
  const fileList = document.getElementById('annotationFileList');
  if (!fileList) return;

  fileList.innerHTML = annotationState.files.map((file, idx) => `
    <div class="file-item ${idx === annotationState.currentFileIndex ? 'active' : ''}" onclick="loadAnnotationFile(${idx})">
      <img src="${file.data}" class="file-thumbnail" alt="${file.name}">
      <div class="file-info">
        <div class="file-name">${file.name}</div>
        <div class="file-meta">${file.annotations?.length || 0} annotations</div>
      </div>
    </div>
  `).join('');
}

// Load Annotation File
window.loadAnnotationFile = function(index) {
  const file = annotationState.files[index];
  if (!file) return;

  annotationState.currentFileIndex = index;
  annotationState.annotations = file.annotations || [];

  const img = new Image();
  img.onload = () => {
    annotationState.currentImage = img;

    // Resize canvas to fit image
    const canvas = annotationState.canvas;
    const container = canvas.parentElement;
    const maxWidth = container.clientWidth - 40;
    const maxHeight = container.clientHeight - 40;

    let scale = Math.min(maxWidth / img.width, maxHeight / img.height, 1);
    canvas.width = img.width * scale;
    canvas.height = img.height * scale;

    annotationState.zoom = scale;
    annotationState.pan = { x: 0, y: 0 };

    renderCanvas();
    renderFileList();
    renderAnnotationsList();
    updateAnnotationStatus();
  };
  img.src = file.data;
};

// Render Canvas
function renderCanvas() {
  const { canvas, ctx, currentImage, zoom, pan, annotations, showAnnotations } = annotationState;
  if (!ctx || !currentImage) return;

  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw image
  ctx.save();
  ctx.translate(pan.x, pan.y);
  ctx.scale(zoom, zoom);
  ctx.drawImage(currentImage, 0, 0);
  ctx.restore();

  // Draw annotations
  if (showAnnotations) {
    annotations.forEach((ann, idx) => {
      const isSelected = idx === annotationState.selectedAnnotation;
      drawAnnotation(ann, isSelected);
    });
  }

  // Draw current shape being drawn
  if (annotationState.currentShape) {
    drawAnnotation(annotationState.currentShape, true, true);
  }
}

// Draw Annotation
function drawAnnotation(ann, isSelected = false, isDrawing = false) {
  const { ctx, zoom, pan } = annotationState;
  const label = annotationState.labels.find(l => l.name === ann.label);
  const color = label?.color || '#6366f1';

  ctx.save();
  ctx.translate(pan.x, pan.y);
  ctx.scale(zoom, zoom);

  ctx.strokeStyle = color;
  ctx.lineWidth = isSelected ? 3 / zoom : 2 / zoom;
  ctx.fillStyle = color + '20'; // 20% opacity

  switch (ann.type) {
    case 'bbox':
      const [x, y, w, h] = ann.bbox;
      ctx.strokeRect(x, y, w, h);
      if (isDrawing || isSelected) {
        ctx.fillRect(x, y, w, h);
      }
      break;

    case 'obb':
      // Oriented Bounding Box: [cx, cy, width, height, angle]
      if (ann.obb) {
        const [cx, cy, width, height, angle] = ann.obb;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        ctx.strokeRect(-width/2, -height/2, width, height);
        if (isDrawing || isSelected) {
          ctx.fillRect(-width/2, -height/2, width, height);
        }
        // Draw rotation handle
        if (isSelected) {
          ctx.beginPath();
          ctx.arc(0, -height/2 - 10, 5 / zoom, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
        }
        ctx.restore();
      }
      break;

    case 'polygon':
      if (ann.points && ann.points.length > 0) {
        ctx.beginPath();
        ctx.moveTo(ann.points[0][0], ann.points[0][1]);
        ann.points.forEach(([px, py]) => ctx.lineTo(px, py));
        ctx.closePath();
        ctx.stroke();
        if (isDrawing || isSelected) {
          ctx.fill();
        }
        // Draw points
        if (isSelected || isDrawing) {
          ann.points.forEach(([px, py]) => {
            ctx.beginPath();
            ctx.arc(px, py, 4 / zoom, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
          });
        }
      }
      break;

    case 'segmentation':
      // Draw segmentation mask
      if (ann.maskCanvas) {
        ctx.globalAlpha = 0.5;
        ctx.drawImage(ann.maskCanvas, 0, 0);
        ctx.globalAlpha = 1.0;
      }
      break;
  }

  ctx.restore();
}

// Canvas Event Handlers
function handleCanvasMouseDown(e) {
  const rect = annotationState.canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left - annotationState.pan.x) / annotationState.zoom;
  const y = (e.clientY - rect.top - annotationState.pan.y) / annotationState.zoom;

  if (annotationState.tool === 'bbox') {
    annotationState.drawing = true;
    annotationState.currentShape = {
      type: 'bbox',
      bbox: [x, y, 0, 0],
      label: annotationState.selectedLabel?.name || 'unlabeled',
    };
  } else if (annotationState.tool === 'obb') {
    annotationState.drawing = true;
    annotationState.currentShape = {
      type: 'obb',
      obb: [x, y, 0, 0, 0], // cx, cy, w, h, angle
      label: annotationState.selectedLabel?.name || 'unlabeled',
      startPoint: { x, y },
    };
  } else if (annotationState.tool === 'polygon') {
    if (!annotationState.currentShape) {
      // Start new polygon
      annotationState.drawing = true;
      annotationState.currentShape = {
        type: 'polygon',
        points: [[x, y]],
        label: annotationState.selectedLabel?.name || 'unlabeled',
      };
    } else if (annotationState.currentShape.type === 'polygon') {
      // Add point to existing polygon
      const firstPoint = annotationState.currentShape.points[0];
      const distToFirst = Math.sqrt(Math.pow(x - firstPoint[0], 2) + Math.pow(y - firstPoint[1], 2));

      if (distToFirst < 10 / annotationState.zoom && annotationState.currentShape.points.length >= 3) {
        // Close polygon
        annotationState.annotations.push(annotationState.currentShape);
        if (annotationState.currentFileIndex >= 0) {
          annotationState.files[annotationState.currentFileIndex].annotations = annotationState.annotations;
        }
        addToHistory();
        annotationState.currentShape = null;
        annotationState.drawing = false;
        renderAnnotationsList();
        updateAnnotationStatus();
      } else {
        // Add new point
        annotationState.currentShape.points.push([x, y]);
      }
      renderCanvas();
    }
  } else if (annotationState.tool === 'segmentation') {
    annotationState.drawing = true;
    if (!annotationState.currentShape) {
      // Create new segmentation mask
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = annotationState.currentImage.width;
      maskCanvas.height = annotationState.currentImage.height;
      const maskCtx = maskCanvas.getContext('2d');

      annotationState.currentShape = {
        type: 'segmentation',
        maskCanvas: maskCanvas,
        maskCtx: maskCtx,
        label: annotationState.selectedLabel?.name || 'unlabeled',
      };
    }
    // Start drawing on mask
    const maskCtx = annotationState.currentShape.maskCtx;
    const label = annotationState.labels.find(l => l.name === annotationState.currentShape.label);
    maskCtx.strokeStyle = label?.color || '#6366f1';
    maskCtx.lineWidth = 20; // Brush size
    maskCtx.lineCap = 'round';
    maskCtx.lineJoin = 'round';
    maskCtx.beginPath();
    maskCtx.moveTo(x, y);
  } else if (annotationState.tool === 'select') {
    // Select annotation
    const selectedIdx = findAnnotationAtPoint(x, y);
    annotationState.selectedAnnotation = selectedIdx;
    renderCanvas();
    renderAnnotationsList();
    updatePropertiesPanel();
  } else if (annotationState.tool === 'pan') {
    annotationState.drawing = true;
    annotationState.panStart = { x: e.clientX - annotationState.pan.x, y: e.clientY - annotationState.pan.y };
  }
}

function handleCanvasMouseMove(e) {
  const rect = annotationState.canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left - annotationState.pan.x) / annotationState.zoom;
  const y = (e.clientY - rect.top - annotationState.pan.y) / annotationState.zoom;

  // Show preview for polygon tool
  if (annotationState.tool === 'polygon' && annotationState.currentShape && annotationState.currentShape.type === 'polygon') {
    renderCanvas();
    // Draw line to cursor
    const { ctx, zoom, pan } = annotationState;
    const lastPoint = annotationState.currentShape.points[annotationState.currentShape.points.length - 1];
    const label = annotationState.labels.find(l => l.name === annotationState.currentShape.label);
    const color = label?.color || '#6366f1';

    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 / zoom;
    ctx.setLineDash([5 / zoom, 5 / zoom]);
    ctx.beginPath();
    ctx.moveTo(lastPoint[0], lastPoint[1]);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (!annotationState.drawing) return;

  if (annotationState.tool === 'bbox' && annotationState.currentShape) {
    const [startX, startY] = annotationState.currentShape.bbox;
    annotationState.currentShape.bbox = [startX, startY, x - startX, y - startY];
    renderCanvas();
  } else if (annotationState.tool === 'obb' && annotationState.currentShape) {
    const startPoint = annotationState.currentShape.startPoint;
    const cx = (startPoint.x + x) / 2;
    const cy = (startPoint.y + y) / 2;
    const width = Math.abs(x - startPoint.x);
    const height = Math.abs(y - startPoint.y);

    // Calculate angle if shift key is pressed
    let angle = 0;
    if (e.shiftKey) {
      angle = Math.atan2(y - startPoint.y, x - startPoint.x);
    }

    annotationState.currentShape.obb = [cx, cy, width, height, angle];
    renderCanvas();
  } else if (annotationState.tool === 'segmentation' && annotationState.currentShape) {
    const maskCtx = annotationState.currentShape.maskCtx;
    maskCtx.lineTo(x, y);
    maskCtx.stroke();
    renderCanvas();
  } else if (annotationState.tool === 'pan') {
    annotationState.pan.x = e.clientX - annotationState.panStart.x;
    annotationState.pan.y = e.clientY - annotationState.panStart.y;
    renderCanvas();
  }
}

function handleCanvasMouseUp(e) {
  if (annotationState.tool === 'bbox' && annotationState.currentShape) {
    const [x, y, w, h] = annotationState.currentShape.bbox;

    // Only add if bbox has meaningful size
    if (Math.abs(w) > 5 && Math.abs(h) > 5) {
      // Normalize negative dimensions
      const normalizedBbox = [
        w < 0 ? x + w : x,
        h < 0 ? y + h : y,
        Math.abs(w),
        Math.abs(h)
      ];

      annotationState.currentShape.bbox = normalizedBbox;
      delete annotationState.currentShape.startPoint;
      annotationState.annotations.push(annotationState.currentShape);

      // Save to file
      if (annotationState.currentFileIndex >= 0) {
        annotationState.files[annotationState.currentFileIndex].annotations = annotationState.annotations;
      }

      addToHistory();
      renderAnnotationsList();
      updateAnnotationStatus();
    }

    annotationState.currentShape = null;
  } else if (annotationState.tool === 'obb' && annotationState.currentShape) {
    const [cx, cy, w, h, angle] = annotationState.currentShape.obb;

    // Only add if OBB has meaningful size
    if (w > 5 && h > 5) {
      delete annotationState.currentShape.startPoint;
      annotationState.annotations.push(annotationState.currentShape);

      // Save to file
      if (annotationState.currentFileIndex >= 0) {
        annotationState.files[annotationState.currentFileIndex].annotations = annotationState.annotations;
      }

      addToHistory();
      renderAnnotationsList();
      updateAnnotationStatus();
    }

    annotationState.currentShape = null;
  } else if (annotationState.tool === 'segmentation' && annotationState.currentShape) {
    // Finalize segmentation stroke (don't close the shape yet, allow multiple strokes)
    // User can press Enter or Escape to finish
  }

  if (annotationState.tool !== 'polygon' && annotationState.tool !== 'segmentation') {
    annotationState.drawing = false;
  }

  renderCanvas();
}

function handleCanvasWheel(e) {
  e.preventDefault();

  const delta = e.deltaY > 0 ? 0.9 : 1.1;
  const newZoom = Math.max(0.1, Math.min(5, annotationState.zoom * delta));

  // Zoom towards mouse position
  const rect = annotationState.canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  annotationState.pan.x = mouseX - (mouseX - annotationState.pan.x) * (newZoom / annotationState.zoom);
  annotationState.pan.y = mouseY - (mouseY - annotationState.pan.y) * (newZoom / annotationState.zoom);
  annotationState.zoom = newZoom;

  updateZoomLevel();
  renderCanvas();
}

// Find annotation at point
function findAnnotationAtPoint(x, y) {
  for (let i = annotationState.annotations.length - 1; i >= 0; i--) {
    const ann = annotationState.annotations[i];
    if (ann.type === 'bbox') {
      const [bx, by, bw, bh] = ann.bbox;
      if (x >= bx && x <= bx + bw && y >= by && y <= by + bh) {
        return i;
      }
    }
  }
  return -1;
}

// Tool Selection
window.selectTool = function(tool) {
  annotationState.tool = tool;
  document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById(`tool-${tool}`)?.classList.add('active');

  // Update cursor
  const canvas = annotationState.canvas;
  if (tool === 'pan') {
    canvas.style.cursor = 'grab';
  } else if (tool === 'select') {
    canvas.style.cursor = 'pointer';
  } else {
    canvas.style.cursor = 'crosshair';
  }
};

// Label Management
window.addLabel = function() {
  const input = document.getElementById('newLabelInput');
  const labelName = input.value.trim();

  if (!labelName) {
    alert('Please enter a label name');
    return;
  }

  if (annotationState.labels.find(l => l.name === labelName)) {
    alert('Label already exists');
    return;
  }

  const color = LABEL_COLORS[annotationState.labels.length % LABEL_COLORS.length];
  annotationState.labels.push({
    name: labelName,
    color: color,
    count: 0,
  });

  input.value = '';
  renderLabelList();
};

window.selectLabel = function(index) {
  annotationState.selectedLabel = annotationState.labels[index];
  renderLabelList();
};

window.deleteLabel = function(index) {
  if (confirm(`Delete label "${annotationState.labels[index].name}"?`)) {
    annotationState.labels.splice(index, 1);
    renderLabelList();
  }
};

function renderLabelList() {
  const labelList = document.getElementById('labelList');
  if (!labelList) return;

  // Count annotations per label
  const labelCounts = {};
  annotationState.files.forEach(file => {
    file.annotations?.forEach(ann => {
      labelCounts[ann.label] = (labelCounts[ann.label] || 0) + 1;
    });
  });

  labelList.innerHTML = annotationState.labels.map((label, idx) => `
    <div class="label-item ${annotationState.selectedLabel?.name === label.name ? 'active' : ''}" onclick="selectLabel(${idx})">
      <div class="label-color" style="background: ${label.color};"></div>
      <div class="label-name">${label.name}</div>
      <div class="label-count">${labelCounts[label.name] || 0}</div>
      <button class="label-delete" onclick="event.stopPropagation(); deleteLabel(${idx})">×</button>
    </div>
  `).join('');
}

// Annotations List
function renderAnnotationsList() {
  const list = document.getElementById('annotationsList');
  if (!list) return;

  list.innerHTML = annotationState.annotations.map((ann, idx) => {
    const icon = ann.type === 'bbox' ? '⬜' : ann.type === 'obb' ? '📐' : ann.type === 'polygon' ? '⬡' : '🎨';
    const coords = ann.type === 'bbox' ?
      `[${ann.bbox.map(v => Math.round(v)).join(', ')}]` :
      ann.type === 'polygon' ? `${ann.points.length} points` : '';

    return `
      <div class="annotation-item ${idx === annotationState.selectedAnnotation ? 'active' : ''}" onclick="selectAnnotationFromList(${idx})">
        <div class="annotation-icon">${icon}</div>
        <div class="annotation-details">
          <div class="annotation-label">${ann.label}</div>
          <div class="annotation-coords">${coords}</div>
        </div>
      </div>
    `;
  }).join('');
}

window.selectAnnotationFromList = function(index) {
  annotationState.selectedAnnotation = index;
  renderCanvas();
  renderAnnotationsList();
  updatePropertiesPanel();
};

// Properties Panel
function updatePropertiesPanel() {
  const panel = document.getElementById('annotationProperties');
  if (!panel) return;

  if (annotationState.selectedAnnotation === null || annotationState.selectedAnnotation === -1) {
    panel.innerHTML = '<p style="color: var(--text-dim); font-size: 0.875rem; text-align: center; padding: 2rem 1rem;">Select an annotation to view properties</p>';
    return;
  }

  const ann = annotationState.annotations[annotationState.selectedAnnotation];
  const label = annotationState.labels.find(l => l.name === ann.label);

  panel.innerHTML = `
    <div style="padding: 1rem; display: flex; flex-direction: column; gap: 1rem;">
      <div>
        <label style="font-size: 0.75rem; color: var(--text-dim); display: block; margin-bottom: 0.25rem;">Type</label>
        <div style="font-size: 0.875rem; color: var(--text);">${ann.type.toUpperCase()}</div>
      </div>
      <div>
        <label style="font-size: 0.75rem; color: var(--text-dim); display: block; margin-bottom: 0.25rem;">Label</label>
        <div style="font-size: 0.875rem; color: var(--text); display: flex; align-items: center; gap: 0.5rem;">
          <div style="width: 12px; height: 12px; border-radius: 50%; background: ${label?.color || '#6366f1'};"></div>
          ${ann.label}
        </div>
      </div>
      ${ann.type === 'bbox' ? `
        <div>
          <label style="font-size: 0.75rem; color: var(--text-dim); display: block; margin-bottom: 0.25rem;">Bounding Box</label>
          <div style="font-size: 0.875rem; color: var(--text); font-family: monospace;">
            x: ${Math.round(ann.bbox[0])}<br>
            y: ${Math.round(ann.bbox[1])}<br>
            w: ${Math.round(ann.bbox[2])}<br>
            h: ${Math.round(ann.bbox[3])}
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

// Zoom Controls
window.zoomIn = function() {
  annotationState.zoom = Math.min(5, annotationState.zoom * 1.2);
  updateZoomLevel();
  renderCanvas();
};

window.zoomOut = function() {
  annotationState.zoom = Math.max(0.1, annotationState.zoom / 1.2);
  updateZoomLevel();
  renderCanvas();
};

window.resetZoom = function() {
  annotationState.zoom = 1.0;
  annotationState.pan = { x: 0, y: 0 };
  updateZoomLevel();
  renderCanvas();
};

function updateZoomLevel() {
  const zoomEl = document.getElementById('zoomLevel');
  if (zoomEl) {
    zoomEl.textContent = Math.round(annotationState.zoom * 100) + '%';
  }
}

// Undo/Redo
function addToHistory() {
  annotationState.history = annotationState.history.slice(0, annotationState.historyIndex + 1);
  annotationState.history.push(JSON.stringify(annotationState.annotations));
  annotationState.historyIndex++;
}

window.undoAnnotation = function() {
  if (annotationState.historyIndex > 0) {
    annotationState.historyIndex--;
    annotationState.annotations = JSON.parse(annotationState.history[annotationState.historyIndex]);
    renderCanvas();
    renderAnnotationsList();
  }
};

window.redoAnnotation = function() {
  if (annotationState.historyIndex < annotationState.history.length - 1) {
    annotationState.historyIndex++;
    annotationState.annotations = JSON.parse(annotationState.history[annotationState.historyIndex]);
    renderCanvas();
    renderAnnotationsList();
  }
};

window.deleteSelected = function() {
  if (annotationState.selectedAnnotation !== null && annotationState.selectedAnnotation !== -1) {
    annotationState.annotations.splice(annotationState.selectedAnnotation, 1);
    annotationState.selectedAnnotation = null;

    if (annotationState.currentFileIndex >= 0) {
      annotationState.files[annotationState.currentFileIndex].annotations = annotationState.annotations;
    }

    addToHistory();
    renderCanvas();
    renderAnnotationsList();
    updatePropertiesPanel();
    updateAnnotationStatus();
  }
};

window.toggleAnnotationVisibility = function() {
  annotationState.showAnnotations = !annotationState.showAnnotations;
  renderCanvas();
};

// Status Update
function updateAnnotationStatus() {
  const statusEl = document.getElementById('annotationStatus');
  if (!statusEl) return;

  if (annotationState.currentFileIndex === -1) {
    statusEl.textContent = 'No file loaded';
  } else {
    const file = annotationState.files[annotationState.currentFileIndex];
    statusEl.innerHTML = `
      <span>${file.name}</span>
      <span>${annotationState.annotations.length} annotation${annotationState.annotations.length !== 1 ? 's' : ''}</span>
    `;
  }
}

// Export Functions
window.exportAnnotations = function() {
  const format = document.getElementById('exportFormatSelect')?.value || 'yolo';
  const file = annotationState.files[annotationState.currentFileIndex];

  if (!file) {
    alert('No file loaded');
    return;
  }

  let exportData = '';
  const filename = file.name.replace(/\.[^/.]+$/, '');

  if (format === 'yolo') {
    exportData = exportToYOLO(file);
    downloadFile(`${filename}.txt`, exportData);
  } else if (format === 'coco') {
    exportData = exportToCOCO([file]);
    downloadFile(`${filename}.json`, JSON.stringify(exportData, null, 2));
  } else if (format === 'custom') {
    downloadFile(`${filename}.json`, JSON.stringify(file.annotations, null, 2));
  }
};

window.exportAllAnnotations = function() {
  const format = document.getElementById('exportFormatSelect')?.value || 'yolo';

  if (annotationState.files.length === 0) {
    alert('No files to export');
    return;
  }

  if (format === 'yolo') {
    annotationState.files.forEach(file => {
      const data = exportToYOLO(file);
      const filename = file.name.replace(/\.[^/.]+$/, '.txt');
      downloadFile(filename, data);
    });
  } else if (format === 'coco') {
    const data = exportToCOCO(annotationState.files);
    downloadFile('annotations.json', JSON.stringify(data, null, 2));
  } else if (format === 'custom') {
    const data = {
      files: annotationState.files.map(f => ({
        name: f.name,
        annotations: f.annotations
      })),
      labels: annotationState.labels
    };
    downloadFile('annotations.json', JSON.stringify(data, null, 2));
  }
};

function exportToYOLO(file) {
  const img = annotationState.currentImage;
  const lines = [];

  file.annotations.forEach(ann => {
    if (ann.type === 'bbox') {
      const labelIdx = annotationState.labels.findIndex(l => l.name === ann.label);
      if (labelIdx === -1) return;

      const [x, y, w, h] = ann.bbox;
      const centerX = (x + w / 2) / img.width;
      const centerY = (y + h / 2) / img.height;
      const width = w / img.width;
      const height = h / img.height;

      lines.push(`${labelIdx} ${centerX.toFixed(6)} ${centerY.toFixed(6)} ${width.toFixed(6)} ${height.toFixed(6)}`);
    }
  });

  return lines.join('\n');
}

function exportToCOCO(files) {
  const coco = {
    images: [],
    annotations: [],
    categories: annotationState.labels.map((label, idx) => ({
      id: idx + 1,
      name: label.name,
      supercategory: 'object'
    }))
  };

  let annId = 1;

  files.forEach((file, fileIdx) => {
    coco.images.push({
      id: fileIdx + 1,
      file_name: file.name,
      width: annotationState.currentImage?.width || 0,
      height: annotationState.currentImage?.height || 0
    });

    file.annotations.forEach(ann => {
      if (ann.type === 'bbox') {
        const labelIdx = annotationState.labels.findIndex(l => l.name === ann.label);
        if (labelIdx === -1) return;

        const [x, y, w, h] = ann.bbox;
        coco.annotations.push({
          id: annId++,
          image_id: fileIdx + 1,
          category_id: labelIdx + 1,
          bbox: [x, y, w, h],
          area: w * h,
          iscrowd: 0
        });
      }
    });
  });

  return coco;
}

function downloadFile(filename, content) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Keyboard Shortcuts
function handleAnnotationKeyboard(e) {
  // Only handle shortcuts when annotation tab is active
  if (!document.getElementById('annotate-tab')?.classList.contains('active')) return;

  // Handle polygon/segmentation completion
  if (e.key === 'Enter' && annotationState.currentShape) {
    if (annotationState.currentShape.type === 'polygon' && annotationState.currentShape.points.length >= 3) {
      // Finish polygon
      annotationState.annotations.push(annotationState.currentShape);
      if (annotationState.currentFileIndex >= 0) {
        annotationState.files[annotationState.currentFileIndex].annotations = annotationState.annotations;
      }
      addToHistory();
      annotationState.currentShape = null;
      annotationState.drawing = false;
      renderCanvas();
      renderAnnotationsList();
      updateAnnotationStatus();
    } else if (annotationState.currentShape.type === 'segmentation') {
      // Finish segmentation
      annotationState.annotations.push(annotationState.currentShape);
      if (annotationState.currentFileIndex >= 0) {
        annotationState.files[annotationState.currentFileIndex].annotations = annotationState.annotations;
      }
      addToHistory();
      annotationState.currentShape = null;
      annotationState.drawing = false;
      renderCanvas();
      renderAnnotationsList();
      updateAnnotationStatus();
    }
    return;
  }

  // Cancel current shape
  if (e.key === 'Escape' && annotationState.currentShape) {
    annotationState.currentShape = null;
    annotationState.drawing = false;
    renderCanvas();
    return;
  }

  switch(e.key.toLowerCase()) {
    case 'b': selectTool('bbox'); break;
    case 'o': selectTool('obb'); break;
    case 'p': selectTool('polygon'); break;
    case 's': selectTool('segmentation'); break;
    case 'v': selectTool('select'); break;
    case 'h': selectTool('pan'); break;
    case 't': toggleAnnotationVisibility(); break;
    case 'delete': deleteSelected(); break;
    case '0': resetZoom(); break;
    case '+': case '=': zoomIn(); break;
    case '-': case '_': zoomOut(); break;
    case 'z':
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        undoAnnotation();
      }
      break;
    case 'y':
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        redoAnnotation();
      }
      break;
    case '?':
      // Show keyboard shortcuts help
      showKeyboardHelp();
      break;
  }
}

// Keyboard Shortcuts Help
function showKeyboardHelp() {
  alert(`Keyboard Shortcuts:

TOOLS:
B - Bounding Box
O - Oriented Bounding Box (hold Shift to rotate)
P - Polygon (click points, Enter to finish)
S - Segmentation (brush tool, Enter to finish)
V - Select
H - Pan

ACTIONS:
Enter - Finish polygon/segmentation
Escape - Cancel current shape
Delete - Delete selected annotation
T - Toggle annotation visibility

ZOOM:
0 - Reset zoom
+/= - Zoom in
-/_ - Zoom out
Mouse Wheel - Zoom in/out

UNDO/REDO:
Ctrl+Z - Undo
Ctrl+Y - Redo

? - Show this help`);
}

// AI Auto-Annotate
window.runAutoAnnotate = async function() {
  if (annotationState.currentFileIndex === -1) {
    alert('Please load an image first');
    return;
  }

  const model = document.getElementById('aiModelSelect')?.value || 'yolov8n';
  const file = annotationState.files[annotationState.currentFileIndex];

  if (!file) {
    alert('No file loaded');
    return;
  }

  try {
    // Show loading indicator
    const statusEl = document.getElementById('annotationStatus');
    const originalStatus = statusEl.innerHTML;
    statusEl.innerHTML = `<span>Running AI detection with ${model}...</span>`;

    // Convert data URL to blob
    const response = await fetch(file.data);
    const blob = await response.blob();

    // Create FormData
    const formData = new FormData();
    formData.append('file', blob, file.name);
    formData.append('model', model);
    formData.append('confidence', '0.25');
    formData.append('iou', '0.45');

    // Call AI backend
    const aiResponse = await fetch('http://localhost:8000/detect', {
      method: 'POST',
      body: formData
    });

    if (!aiResponse.ok) {
      throw new Error(`AI backend error: ${aiResponse.status} ${aiResponse.statusText}`);
    }

    const result = await aiResponse.json();

    if (!result.success) {
      throw new Error('Detection failed');
    }

    // Add detections as annotations
    let addedCount = 0;
    result.detections.forEach(detection => {
      // Check if we have a label for this class
      let label = annotationState.labels.find(l => l.name === detection.class_name);

      if (!label) {
        // Create label automatically
        const color = LABEL_COLORS[annotationState.labels.length % LABEL_COLORS.length];
        label = {
          name: detection.class_name,
          color: color,
          count: 0
        };
        annotationState.labels.push(label);
        renderLabelList();
      }

      // Add annotation
      annotationState.annotations.push({
        type: 'bbox',
        bbox: detection.bbox,
        label: detection.class_name,
        confidence: detection.confidence,
        aiGenerated: true
      });
      addedCount++;
    });

    // Save to file
    if (annotationState.currentFileIndex >= 0) {
      annotationState.files[annotationState.currentFileIndex].annotations = annotationState.annotations;
    }

    addToHistory();
    renderCanvas();
    renderAnnotationsList();
    statusEl.innerHTML = originalStatus;
    updateAnnotationStatus();

    alert(`AI Detection Complete!\n\nModel: ${model}\nDetected: ${result.count} objects\nAdded: ${addedCount} annotations`);

  } catch (error) {
    console.error('Auto-annotation error:', error);
    alert(`Auto-annotation failed: ${error.message}\n\nMake sure the AI backend is running:\npython ai_backend.py\n\nOr start with:\nuvicorn ai_backend:app --host 0.0.0.0 --port 8000`);
    updateAnnotationStatus();
  }
};

window.runAutoTrack = async function() {
  alert('Video Object Tracking\n\nTo use video tracking:\n\n1. Start the AI backend:\n   python ai_backend.py\n\n2. Upload a video file in the Files section\n\n3. Click "Track Video" to track objects across frames\n\nThe backend will:\n- Extract frames from video\n- Run YOLO tracking\n- Return frame-by-frame annotations\n\nNote: Video upload support will be added in Phase 2.2');
};

// ==================== END ANNOTATION SYSTEM ====================

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadCameras();
  loadStorage();
  loadDrives(); // Load drives for folder browser
  loadSourceImages(); // Initialize preview dropdown with placeholder
  updateCaptureCount();

  // Initialize annotation system
  initAnnotationCanvas();

  // Update estimates when inputs change
  document.getElementById('augPerBg')?.addEventListener('input', updateEstimates);
});
