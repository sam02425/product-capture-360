(() => {
  const jget = (u, cb) => fetch(u).then(r => r.json()).then(cb).catch(console.error);
  const jpost = (u, body, cb) => fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }).then(r => r.json()).then(cb).catch(console.error);
  let currentPath = '';
  let currentItems = [];
  let previewImagePath = '';

  function scan(){ jget('/api/camera/scan', r => {
    const sel = document.getElementById('camSelect'); if (!sel) return;
    sel.innerHTML = '';
    (r.cameras||[]).forEach(c => { const o = document.createElement('option'); o.value = c.index; o.textContent = `${c.index}: ${c.name}`; sel.appendChild(o); });
  }); }
  function connectCam(){ const val = (document.getElementById('camSelect')||{}).value || 0; jpost('/api/camera/init', { camera_index: parseInt(val), width: 640, height: 480, fps: 10 }, r => { const b = document.getElementById('camBadge'); if (b) b.textContent = r.success ? 'Camera: connected' : ('Camera: failed - '+(r.message||'')); const log = document.getElementById('camLog'); if (log && !r.success) { log.textContent = String(r.message||''); } refreshDiag(); if(!r.success){ alert('Camera init failed: '+(r.message||'Unknown error')); console.error('Camera init error:', r.message); } }); }
  function autoConnectFirst(){ const sel=document.getElementById('camSelect'); if(!sel) return; if(sel.options.length>0){ sel.selectedIndex=0; connectCam(); } }
  function refreshDiag(){ jget('/api/camera/health', d => { const t = document.getElementById('diagTxt'); if (t) t.textContent = `connected=${d.connected} idx=${d.index} fps=${d.fps} ageMs=${d.lastFrameAgeMs}`; }); }

  function loadStorage(){ jget('/api/storage', list => { const sel = document.getElementById('storageSelect'); if (!sel) return; sel.innerHTML=''; list.forEach(d => { const o=document.createElement('option'); o.value=d.mountpoint; o.textContent = `${d.device} - ${d.mountpoint}`; sel.appendChild(o); }); }); }
  function selectStorage(){ const mp=(document.getElementById('storageSelect')||{}).value; if(!mp) return; jpost('/api/storage/select',{ path: mp }, r => { alert(r.success ? `Using ${r.path}` : `Failed: ${r.message}`); loadFolder(r.path); }); }
  function useManual(){ const p=(document.getElementById('manualPath')||{}).value||''; if(!p) return; jpost('/api/storage/select', { path: p }, r => { alert(r.success ? `Using ${r.path}` : `Failed: ${r.message}`); loadFolder(r.path); }); }
  function loadFolder(path){ jget('/api/folder?path='+encodeURIComponent(path||''), r => { currentPath = r.path || currentPath; currentItems = r.items || []; const box=document.getElementById('browser'); if(!box) return; box.innerHTML=''; currentItems.forEach(it => { const div=document.createElement('div'); div.className='item'; div.textContent = it.name + (it.size? ` (${it.size} bytes)` : ''); box.appendChild(div); }); populatePreviewSelect(); }); }

  function capture(){ const product=(document.getElementById('productName')||{}).value||''; jpost('/api/capture', { product_name: product }, r => { alert(r.success? ('Captured: '+r.message) : ('Failed: '+r.message)); if(r.success){ loadFolder(); } }); }
  function createClip(){ const fps=parseInt((document.getElementById('clipFps')||{}).value||'30'); const name=(document.getElementById('clipName')||{}).value||'clip.mp4'; jpost('/api/video/create', { path: currentPath, fps, output_name: name }, r => { alert(r.success? ('Clip created: '+r.path) : ('Failed: '+(r.message||''))); if(r.success){ loadFolder(currentPath); } }); }
  function applyBackgroundReplace(){
    const key=(document.getElementById('bgKeyColor')||{}).value||'#00ff00';
    const tol=parseFloat((document.getElementById('bgTolerance')||{}).value||'0.20');
    const soft=parseFloat((document.getElementById('bgSoftness')||{}).value||'0.10');
    const preset=(document.getElementById('bgPreset')||{}).value||'';
    const mode=(Array.from(document.getElementsByName('bgFillMode')).find(i=>i.checked)||{value:'color'}).value;
    const fillColor=(document.getElementById('bgFillColor')||{}).value||'#ffffff';
    const fillImagePath=(document.getElementById('bgFillImagePath')||{}).value||'';
    // apply preset to mode
    if(preset){ const [t,v]=preset.split(':'); if(t==='color'){ mode='color'; } else { mode='image'; }
      if(t==='color'){ document.getElementById('bgFillColor').value = v; } else { document.getElementById('bgFillImagePath').value = v; }
    }
    const body = { path: currentPath, key_color: key, tolerance: tol, softness: soft };
    if(mode==='image' && fillImagePath){ body.fill_image_path = fillImagePath; } else { body.fill_color = fillColor; }
    jpost('/api/background/replace', body, r => {
      alert(r.success ? ('Background replaced. Output: '+(r.outputDir||'')) : ('Failed: '+(r.message||'')));
      if(r.success){ loadFolder(currentPath); }
    });
  }
  function populatePreviewSelect(){ const sel=document.getElementById('previewSelect'); if(!sel) return; sel.innerHTML=''; currentItems.filter(it=>/\.jpe?g$/i.test(it.name)).forEach(it=>{ const o=document.createElement('option'); o.value = it.path || (currentPath + '/' + it.name); o.textContent = it.name; sel.appendChild(o); }); }
  function drawPreview(){ const sel=document.getElementById('previewSelect'); if(!sel) return; const p=sel.value; if(!p) return; previewImagePath = p; const img = new Image(); img.crossOrigin='anonymous'; img.onload = () => { const c=document.getElementById('previewCanvas'); if(!c) return; const ctx=c.getContext('2d'); c.width = img.naturalWidth; c.height = img.naturalHeight; // fit into container
      const rect = c.getBoundingClientRect(); const scale = Math.min(rect.width / c.width, rect.height / c.height); const w = Math.floor(c.width * scale); const h = Math.floor(c.height * scale);
      c.width = w; c.height = h; ctx.drawImage(img, 0, 0, w, h);
    }; img.src = '/api/file?path='+encodeURIComponent(p); }
  function previewApply(){ const key=(document.getElementById('bgKeyColor')||{}).value||'#00ff00'; const tol=parseFloat((document.getElementById('bgTolerance')||{}).value||'0.20'); const soft=parseFloat((document.getElementById('bgSoftness')||{}).value||'0.10'); const preset=(document.getElementById('bgPreset')||{}).value||''; const mode=(Array.from(document.getElementsByName('bgFillMode')).find(i=>i.checked)||{value:'color'}).value; const fillColor=(document.getElementById('bgFillColor')||{}).value||'#ffffff'; const fillImagePath=(document.getElementById('bgFillImagePath')||{}).value||''; if(!previewImagePath){ alert('Select an image first'); return; }
    if(preset){ const [t,v]=preset.split(':'); if(t==='color'){ mode='color'; document.getElementById('bgFillColor').value=v; } else { mode='image'; document.getElementById('bgFillImagePath').value=v; } }
    const body = { image_path: previewImagePath, key_color: key, tolerance: tol, softness: soft };
    if(mode==='image' && fillImagePath){ body.fill_image_path = fillImagePath; } else { body.fill_color = fillColor; }
    fetch('/api/background/preview', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) })
      .then(r => r.ok ? r.blob() : r.json().then(j => Promise.reject(j.message||'Preview failed')))
      .then(blob => blob.arrayBuffer())
      .then(buf => { const img = new Image(); img.onload = () => { const c=document.getElementById('previewCanvas'); const ctx=c.getContext('2d'); const rect = c.getBoundingClientRect(); let w = img.naturalWidth; let h = img.naturalHeight; const scale = Math.min(rect.width / w, rect.height / h); w = Math.floor(w*scale); h = Math.floor(h*scale); c.width=w; c.height=h; ctx.drawImage(img, 0, 0, w, h); }; img.src = URL.createObjectURL(new Blob([buf], { type: 'image/jpeg' })); })
      .catch(err => alert('Preview failed: '+err));
  }
  const canvasClick = (ev) => { const c=document.getElementById('previewCanvas'); if(!c) return; const rect=c.getBoundingClientRect(); const x = Math.floor(ev.clientX - rect.left); const y = Math.floor(ev.clientY - rect.top); const ctx=c.getContext('2d'); const d=ctx.getImageData(x, y, 1, 1).data; const hex = '#'+[d[0],d[1],d[2]].map(v => v.toString(16).padStart(2,'0')).join(''); const el=document.getElementById('bgKeyColor'); if(el) el.value = hex; };
  function start(){ const rate=parseInt((document.getElementById('rate')||{}).value||'0'); const dur=parseInt((document.getElementById('dur')||{}).value||'0'); const product=(document.getElementById('productName')||{}).value||''; jpost('/api/session/start', { rate, duration: dur, product_name: product }, r => { statusTick(); }); }
  function stop(){ jpost('/api/session/stop', {}, r => { statusTick(); }); }
  function statusTick(){ jget('/api/status', s => { const el=document.getElementById('status'); if(!el) return; el.textContent = s.active ? `Active | captured=${s.capturedCount} | rate=${s.ratePerMin}/min | elapsed=${s.elapsedSec}s | remaining=${s.remainingSec ?? '-'}s` : 'Inactive'; }); }
  function setRate(v){ const el=document.getElementById('rate'); if(el) el.value = String(v); }

  document.addEventListener('DOMContentLoaded', () => { scan(); loadStorage(); refreshDiag(); statusTick(); const c=document.getElementById('previewCanvas'); if(c) c.addEventListener('click', canvasClick); setTimeout(autoConnectFirst, 800); });

  // YOLOv11 preprocessing functions
  function preprocessYOLO() {
    const targetSize = parseInt((document.getElementById('yoloTargetSize') || {}).value || '640');
    const augmentCount = parseInt((document.getElementById('yoloAugmentCount') || {}).value || '3');
    const retailBgsStr = (document.getElementById('yoloRetailBgs') || {}).value || '';
    const retailBgs = retailBgsStr.split(',').map(s => s.trim()).filter(Boolean);
    const key = (document.getElementById('bgKeyColor') || {}).value || '#00ff00';
    const tol = parseFloat((document.getElementById('bgTolerance') || {}).value || '0.25');
    const soft = parseFloat((document.getElementById('bgSoftness') || {}).value || '0.15');

    if (retailBgs.length === 0) {
      // Use basic YOLO preprocessing without backgrounds
      jpost('/api/preprocess/yolo', {
        input_dir: currentPath,
        key_color: key,
        tolerance: tol,
        softness: soft,
        augment: true,
        augment_count: augmentCount,
        target_size: targetSize,
      }, r => {
        alert(r.success ? `Dataset generated! ${r.processedCount} images in ${r.outputDir}` : ('Failed: ' + (r.message || '')));
        if (r.success && r.outputDir) { loadFolder(r.outputDir); }
      });
    } else {
      // Use retail backgrounds
      jpost('/api/preprocess/retail', {
        input_dir: currentPath,
        key_color: key,
        tolerance: tol,
        softness: soft,
        retail_backgrounds: retailBgs,
        augment_per_background: augmentCount,
      }, r => {
        alert(r.success ? `Retail dataset generated! ${r.processedCount} images in ${r.outputDir}` : ('Failed: ' + (r.message || '')));
        if (r.success && r.outputDir) { loadFolder(r.outputDir); }
      });
    }
  }

  function createAnnotations() {
    const imagesDir = currentPath ? (currentPath + '/images') : '';
    jpost('/api/preprocess/create-annotations', { images_dir: imagesDir, class_name: 'product' }, r => {
      alert(r.success ? r.message : ('Failed: ' + (r.message || '')));
    });
  }

  // Expose handlers to global scope for inline onclick bindings
  Object.assign(window, {
    scan,
    connectCam,
    refreshDiag,
    loadStorage,
    selectStorage,
    useManual,
    loadFolder,
    capture,
    createClip,
    setRate,
    start,
    stop,
    drawPreview,
    previewApply,
    applyBackgroundReplace,
    preprocessYOLO,
    createAnnotations,
  });
})();