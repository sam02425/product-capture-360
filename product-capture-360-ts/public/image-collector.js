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

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadCameras();
  loadStorage();
  loadDrives(); // Load drives for folder browser
  loadSourceImages(); // Initialize preview dropdown with placeholder
  updateCaptureCount();

  // Update estimates when inputs change
  document.getElementById('augPerBg')?.addEventListener('input', updateEstimates);
});
