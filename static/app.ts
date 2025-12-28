// TypeScript version of app.js for Fast 360 Product Capture

(function () {
    console.log('app.js loaded successfully');

    let currentPath: string = '';

    interface JSONResponse {
        success: boolean;
        [key: string]: any;
    }

    function jget(u: string, cb: (data: JSONResponse) => void): void {
        fetch(u)
            .then(r => r.json())
            .then(cb)
            .catch(e => console.error(e));
    }

    function jpost(u: string, b: object, cb: (data: JSONResponse) => void): void {
        fetch(u, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(b || {})
        })
            .then(r => r.json())
            .then(cb)
            .catch(e => console.error(e));
    }

    function init(): void {
        loadStorage(() => {
            statusTick(() => {
                setInterval(statusTick, 1500);
                setInterval(sessionTick, 500);
                setInterval(refreshDiag, 2000);
            });
        });
    }

    function statusTick(cb?: () => void): void {
        jget('/api/status', (s) => {
            const badge = document.getElementById('camBadge');
            if (badge) badge.textContent = s.camera_connected ? 'Camera: connected' : 'Camera: disconnected';
            const le = document.getElementById('lastErr');
            if (le) le.textContent = s.last_error || '-';
            if (!currentPath && s.current_folder) {
                currentPath = s.current_folder;
                loadFolder(currentPath);
            }
            if (cb) cb();
        });
    }

    function scan(): void {
        jget('/api/camera/scan', (r) => {
            const sel = document.getElementById('camSelect') as HTMLSelectElement | null;
            if (!sel) return;
            sel.innerHTML = '';
            if (r.success && r.cameras && r.cameras.length) {
                for (let i = 0; i < r.cameras.length; i++) {
                    const c = r.cameras[i];
                    const o = document.createElement('option');
                    o.value = c.index.toString();
                    o.textContent = c.name;
                    sel.appendChild(o);
                }
                sel.selectedIndex = 0;
            } else {
                const o = document.createElement('option');
                o.value = '';
                o.textContent = 'No cameras found';
                sel.appendChild(o);
            }
        });
        console.log('scan function defined');
    }

    function connectCam(): void {
        const val = (document.getElementById('camSelect') as HTMLSelectElement | null)?.value || '0';
        jpost('/api/camera/init', { camera_index: parseInt(val) }, (r) => {
            alert(r.message || (r.success ? 'Connected' : 'Failed'));
            statusTick();
        });
    }

    function hardReset(): void {
        jpost('/api/camera/hard_reset', {}, (r) => {
            alert(r.success ? 'Camera hard reset OK' : ('Reset failed: ' + (r.message || '')));
            statusTick();
            refreshDiag();
        });
    }

    function capture(): void {
        jpost('/api/capture', {}, (r) => {
            alert(r.success ? ('Captured:\n' + r.message) : ('Failed:\n' + r.message));
            loadFolder(currentPath);
        });
    }

    function loadStorage(cb: () => void): void {
        jget('/api/storage', (list) => {
            const sel = document.getElementById('storageSelect') as HTMLSelectElement | null;
            if (!sel) return;
            sel.innerHTML = '';
            for (let i = 0; i < list.length; i++) {
                const d = list[i];
                const o = document.createElement('option');
                o.value = d.mountpoint;
                o.textContent = d.device + ' (' + d.free_gb + ' GB free) - ' + d.mountpoint;
                sel.appendChild(o);
            }
            cb();
        });
    }

    function selectStorage(): void {
        const mp = (document.getElementById('storageSelect') as HTMLSelectElement | null)?.value;
        if (!mp) return;
        jpost('/api/storage/select', { path: mp }, (r) => {
            if (r.success) {
                currentPath = r.path;
                const cp = document.getElementById('currentPath') as HTMLInputElement | null;
                if (cp) cp.value = currentPath;
                loadFolder(currentPath);
            } else {
                alert('Failed: ' + r.message);
            }
        });
    }

    function useManual(): void {
        let p = (document.getElementById('manualPath') as HTMLInputElement | null)?.value || '';
        p = p.trim();
        if (!p) return;
        jpost('/api/storage/select', { path: p }, (r) => {
            if (r.success) {
                currentPath = r.path;
                const cp = document.getElementById('currentPath') as HTMLInputElement | null;
                if (cp) cp.value = currentPath;
                loadFolder(currentPath);
            } else {
                alert('Failed: ' + r.message);
            }
        });
    }

    function setToCurrent(): void {
        let p = (document.getElementById('currentPath') as HTMLInputElement | null)?.value || '';
        p = p.trim();
        if (!p) return;
        jpost('/api/storage/select', { path: p }, (r) => {
            if (r.success) {
                currentPath = r.path;
                loadFolder(currentPath);
            } else {
                alert('Failed: ' + r.message);
            }
        });
    }

    function loadFolder(path: string): void {
        jget('/api/folder?path=' + encodeURIComponent(path || currentPath || ''), (r) => {
            currentPath = r.path || currentPath;
            const cp = document.getElementById('currentPath') as HTMLInputElement | null;
            if (cp) cp.value = currentPath;
            const box = document.getElementById('browser');
            if (!box) return;
            box.innerHTML = '';
            if (r.parent) {
                const up = document.createElement('div');
                up.className = 'item';
                up.innerHTML = '<span class="up">⬆️ .. (Up)</span>';
                up.onclick = () => loadFolder(r.parent);
                box.appendChild(up);
            }
            if (r.contents && r.contents.length) {
                for (let i = 0; i < r.contents.length; i++) {
                    const it = r.contents[i];
                    const div = document.createElement('div');
                    div.className = 'item';
                    div.innerHTML = '<span>' + (it.is_dir ? '📁' : '🖼️') + '</span><span>' + it.name + '</span><span class="small">' + (it.is_dir ? 'Folder' : (Math.round(it.size / 1024) + ' KB')) + '</span>';
                    if (it.is_dir) {
                        div.onclick = () => loadFolder(it.path);
                    }
                    box.appendChild(div);
                }
            } else {
                const pe = document.createElement('div');
                pe.className = 'item';
                pe.textContent = '(empty)';
                box.appendChild(pe);
            }
        });
    }

    function start(): void {
        const rate = parseInt((document.getElementById('rate') as HTMLInputElement | null)?.value || '0');
        const durv = (document.getElementById('dur') as HTMLInputElement | null)?.value || '';
        let product = (document.getElementById('productName') as HTMLInputElement | null)?.value || '';
        product = product.trim();
        jget('/api/status', (status) => {
            if (!status.camera_connected) {
                const sel = document.getElementById('camSelect') as HTMLSelectElement | null;
                const idx = sel && sel.value ? parseInt(sel.value) : 0;
                jpost('/api/camera/reconnect', { camera_index: idx }, (rec) => {
                    if (!rec.success) {
                        alert('Camera reconnect failed. Please Scan → Connect first.');
                        return;
                    }
                    doStart(rate, durv, product);
                });
            } else {
                doStart(rate, durv, product);
            }
        });
    }

    function doStart(rate: number, durv: string, product: string): void {
        const payload: { rate: number; duration?: number; product_name?: string } = { rate };
        if (durv) payload.duration = parseInt(durv);
        if (product) payload.product_name = product;
        jpost('/api/session/start', payload, (r) => {
            if (r.success) {
                const sb = document.getElementById('startBtn') as HTMLButtonElement | null;
                const xb = document.getElementById('stopBtn') as HTMLButtonElement | null;
                if (sb) sb.disabled = true;
                if (xb) xb.disabled = false;
                if (r.product_dir) {
                    currentPath = r.product_dir;
                    const cp = document.getElementById('currentPath') as HTMLInputElement | null;
                    if (cp) cp.value = currentPath;
                    loadFolder(currentPath);
                    alert('Saving to:\n' + r.product_dir);
                }
            } else {
                alert('Failed to start: ' + (r.message || ''));
                return;
            }
            sessionTick();
        });
    }

    function stop(): void {
        jpost('/api/session/stop', {}, (r) => {
            const sb = document.getElementById('startBtn') as HTMLButtonElement | null;
            const xb = document.getElementById('stopBtn') as HTMLButtonElement | null;
            if (sb) sb.disabled = false;
            if (xb) xb.disabled = true;
            alert(r.message || 'Stopped');
            sessionTick();
            loadFolder(currentPath);
        });
    }

    function sessionTick(): void {
        jget('/api/session/status', (s) => {
            const st = document.getElementById('sessState');
            if (st) st.textContent = s.active ? 'Active' : 'Inactive';
            const ic = document.getElementById('imgCount');
            if (ic) ic.textContent = s.captures?.toString() || '0';
            const rt = document.getElementById('rateTxt');
            if (rt) rt.textContent = s.rate?.toString() || '0';
            const et = document.getElementById('elapsedTxt');
            if (et) et.textContent = (s.elapsed != null) ? (s.elapsed + 's') : '0s';
            const targetWrap = document.getElementById('imgTargetWrap');
            const imgTarget = document.getElementById('imgTarget');
            const remRow = document.getElementById('remRow');
            const remainTxt = document.getElementById('remainTxt');
            const progWrap = document.getElementById('progWrap');
            const progBar = document.getElementById('progBar');
            if (s.expected_total != null) {
                if (targetWrap) targetWrap.style.display = 'inline';
                if (imgTarget) imgTarget.textContent = s.expected_total.toString();
                if (remRow) remRow.style.display = 'block';
                if (remainTxt) {
                    remainTxt.style.display = 'block';
                    remainTxt.textContent = (s.remaining != null) ? (s.remaining + 's') : '0s';
                }
                if (progWrap) progWrap.style.display = 'block';
                const pct = (s.percent != null) ? s.percent : 0;
                if (progBar) progBar.style.width = pct + '%';
            } else {
                if (targetWrap) targetWrap.style.display = 'none';
                if (remRow) remRow.style.display = 'none';
                if (remainTxt) remainTxt.style.display = 'none';
                if (progWrap) progWrap.style.display = 'none';
                if (progBar) progBar.style.width = '0%';
            }
        });
    }

    function refreshDiag(): void {
        jget('/api/camera/health', (d) => {
            const dc = document.getElementById('d_connected');
            if (dc) dc.textContent = d.connected.toString();
            const di = document.getElementById('d_index');
            if (di) di.textContent = (d.index != null) ? d.index.toString() : '-';
            const dw = document.getElementById('d_wh');
            if (dw) dw.textContent = (d.width || '-') + ' x ' + (d.height || '-');
            const df = document.getElementById('d_fps');
            if (df) df.textContent = (d.fps != null) ? d.fps.toString() : '-';
            const da = document.getElementById('d_age');
            if (da) da.textContent = (d.last_ok_age_s != null) ? (d.last_ok_age_s + 's') : '-';
            const dq = document.getElementById('d_q');
            if (dq) dq.textContent = (d.save_queue_len != null) ? d.save_queue_len.toString() : '-';
            const dp = document.getElementById('d_pfps');
            if (dp) dp.textContent = (d.preview_fps != null) ? d.preview_fps.toString() : '-';
            const le = document.getElementById('lastErr');
            if (d.last_error && le) le.textContent = d.last_error;
            const m = d.metrics || {};
            const wavg = document.getElementById('d_wavg');
            if (wavg) wavg.textContent = (m.avg_write_ms != null) ? m.avg_write_ms.toString() : '-';
            const wp95 = document.getElementById('d_wp95');
            if (wp95) wp95.textContent = (m.p95_write_ms != null) ? m.p95_write_ms.toString() : '-';
            const javg = document.getElementById('d_javg');
            if (javg) javg.textContent = (m.capture_jitter_ms_avg != null) ? m.capture_jitter_ms_avg.toString() : '-';
            const jp95 = document.getElementById('d_jp95');
            if (jp95) jp95.textContent = (m.capture_jitter_ms_p95 != null) ? m.capture_jitter_ms_p95.toString() : '-';
            const reco = document.getElementById('d_reco');
            if (reco) reco.textContent = (m.reconnects != null) ? m.reconnects.toString() : '-';
        });
    }

    function mkfolder(): void {
        const base = (document.getElementById('currentPath') as HTMLInputElement | null)?.value || currentPath;
        let name = (document.getElementById('newFolder') as HTMLInputElement | null)?.value || '';
        name = name.trim();
        if (!name) {
            alert('Invalid folder name');
            return;
        }
        jpost('/api/folder/create', { path: base, name }, (r) => {
            alert(r.message || 'OK');
            loadFolder(base);
        });
    }

    // Expose functions to window
    (window as any).jget = jget;
    (window as any).jpost = jpost;
    (window as any).init = init;
    (window as any).statusTick = statusTick;
    (window as any).scan = scan;
    console.log('window.scan assigned');
    (window as any).connectCam = connectCam;
    (window as any).hardReset = hardReset;
    (window as any).capture = capture;
    (window as any).loadStorage = loadStorage;
    (window as any).selectStorage = selectStorage;
    (window as any).useManual = useManual;
    (window as any).setToCurrent = setToCurrent;
    (window as any).loadFolder = loadFolder;
    (window as any).start = start;
    (window as any).stop = stop;
    (window as any).sessionTick = sessionTick;
    (window as any).refreshDiag = refreshDiag;
    (window as any).mkfolder = mkfolder;

    document.addEventListener('DOMContentLoaded', init);
})();