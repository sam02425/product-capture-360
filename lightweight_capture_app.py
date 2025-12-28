#!/usr/bin/env python3
"""
360° Product Capture System (Production)
- Single camera reader loop + global MJPEG preview fan-out (prevents CPU creep)
- Robust camera scanning (macOS/Windows/Linux)
- Storage discovery + manual path + folder browser with Up
- Product-named session folder; all images saved there
- High-rate auto capture (up to 180/min) with drift-corrected scheduler
- Progress UI: images, target, time left, progress bar
- Session artifacts: session_meta.json + captures.csv
- Global CSV log: ~/.360photo/logs/product_log.csv (one row per session)
- Rotating file logs: ~/.360photo/logs/app.log
- Stability additions:
  * Low-latency grab/retrieve
  * Bad/frozen frame detection + auto-reopen
  * Periodic hard reopen watchdog
  * Safer format/FPS probing order (MJPG→YUYV; 25/15 fps first)
  * Preview client limits + cleanup
"""

import os, cv2, time, psutil, threading, signal, sys, atexit, platform, re, csv, json, gc
try:
    # Optional fast JPEG encoder; falls back to OpenCV if unavailable
    from turbojpeg import TurboJPEG, TJPF_BGR
except Exception:
    TurboJPEG = None
    TJPF_BGR = None
import numpy as np
from datetime import datetime
from pathlib import Path
from collections import deque
from logging.handlers import RotatingFileHandler

from flask import Flask, Response, request, jsonify
from flask_cors import CORS
import logging

# ---- OpenCV thread control to avoid thrash on some systems
try:
    cv2.setNumThreads(1)
except Exception:
    pass

# ---------------- Optional Windows tweak ----------------
if platform.system() == "Windows":
    # Prefer DirectShow if MSMF is flaky
    os.environ.setdefault("OPENCV_VIDEOIO_PRIORITY_MSMF", "0")

# ---------------- Paths & Logging ----------------
APP_HOME = Path.home() / ".360photo"
LOG_DIR  = APP_HOME / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)
PRODUCT_LOG_CSV = LOG_DIR / "product_log.csv"  # global per-session log

# Console + rotating file logger
logger = logging.getLogger("capture-app")
logger.setLevel(logging.INFO)
fmt = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")

ch = logging.StreamHandler(sys.stdout)
ch.setLevel(logging.INFO)
ch.setFormatter(fmt)
logger.addHandler(ch)

fh = RotatingFileHandler(LOG_DIR / "app.log", maxBytes=10_000_000, backupCount=5)
fh.setLevel(logging.INFO)
fh.setFormatter(fmt)
logger.addHandler(fh)

def log_info(msg):  logger.info(msg)
def log_warn(msg):  logger.warning(msg)
def log_err(msg):   logger.error(msg)

# ---------------- Flask ----------------
app = Flask(__name__)
CORS(app)

# ---------------- Helpers ----------------
def is_windows(): return platform.system() == "Windows"
def is_macos():   return platform.system() == "Darwin"
def is_linux():   return platform.system() == "Linux"

def sanitize_product_name(name: str) -> str:
    name = name.strip()
    name = re.sub(r"\s+", "-", name)
    name = re.sub(r"[^A-Za-z0-9._\\-]", "", name)
    name = re.sub(r"-{2,}", "-", name)
    return name[:128] if name else "Product"

def list_windows_drives():
    out = []
    for letter in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
        p = f"{letter}:/"
        if os.path.exists(p):
            try:
                u = psutil.disk_usage(p)
                out.append({
                    "device": f"{letter}:",
                    "mountpoint": p,
                    "fstype": "NTFS/FAT/exFAT",
                    "total": u.total, "used": u.used, "free": u.free,
                    "percent": round(u.used/u.total*100, 1),
                    "free_gb": round(u.free/1024**3, 2),
                })
            except Exception:
                pass
    return out

def extra_mount_roots():
    roots = []
    if is_macos(): roots.append(Path("/Volumes"))
    if is_linux(): roots += [Path("/media"), Path("/mnt")]
    return [r for r in roots if r.exists()]

def ts_now():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

def iso_now():
    return datetime.now().isoformat(timespec="seconds")

# Ensure global product log exists with header
if not PRODUCT_LOG_CSV.exists():
    with PRODUCT_LOG_CSV.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["session_id","product","start_time","end_time","images","rate_per_min","duration_s","output_dir"])

# ---------------- Core System ----------------
class CaptureSystem:
    def __init__(self):
        # Camera
        self.cap = None
        self.camera_index = 0
        self.reader_thread = None
        self.reader_stop = threading.Event()
        self.frame_lock = threading.Lock()
        self.latest_frame = None
        self.preview_width = 1280
        self.preview_height = 720
        self.request_fps = 30
        self.last_ok_ts = 0
        self.last_error = ""

        # Watchdogs / stability knobs
        self.hard_reopen_every_s = 600.0  # periodic hard reopen (10 min)
        self.last_open_ts = time.time()

        # Global preview encoder (fan-out)
        self.preview_fps = 8  # lower FPS to reduce encode pressure
        self.jpeg_quality_preview = 55  # lighter preview compression for CPU relief
        self.preview_max_width = 720  # smaller preview to cut resize+encode cost
        # Perf metrics (EWMA)
        self.preview_encode_ms_last = 0.0
        self.preview_encode_ms_avg = 0.0
        self.preview_jpeg = b""
        self.preview_lock = threading.Lock()
        self.preview_stop = threading.Event()
        self.preview_thread = threading.Thread(target=self._preview_loop, name="PreviewEncoder", daemon=True)
        self.preview_thread.start()

        # Preview client protection
        self.max_preview_clients = 4
        self.preview_clients = 0

        # Async saver
        self.jpeg_quality_capture = 88  # balanced capture quality vs CPU cost
        self.save_q = deque(maxlen=1000)  # drop-oldest strategy when overwhelmed
        self.saver_stop = threading.Event()
        self.saver_write_ms_last = 0.0
        self.saver_write_ms_avg = 0.0
        self.saver_thread = threading.Thread(target=self._saver_loop, name="DiskSaver", daemon=True)
        self.saver_thread.start()

        # Fast JPEG if available
        self.turbojpeg = None
        try:
            if TurboJPEG:
                self.turbojpeg = TurboJPEG()
                log_info("TurboJPEG available: using accelerated JPEG encoding")
            else:
                log_info("TurboJPEG not available: using OpenCV JPEG encoding")
        except Exception as e:
            self.turbojpeg = None
            log_warn(f"TurboJPEG init failed; falling back to OpenCV: {e}")

        # Storage
        self.default_folder = str(Path.home() / "360Photo" / "captures")
        Path(self.default_folder).mkdir(parents=True, exist_ok=True)
        self.current_folder = self.default_folder

        # Session
        self.session_active = False
        self.session_thread = None
        self.session_stop = threading.Event()
        self.session_rate = 24  # per minute
        self.session_duration_s = None
        self.session_start_time = None
        self.session_start_mono = None
        self.session_captures = 0
        self.session_output_dir = None
        self.session_product_name = None
        self.session_id = None
        self.total_captures = 0
        self.session_lock = threading.Lock()

        atexit.register(self.cleanup)
        signal.signal(signal.SIGINT,  self._signal)
        signal.signal(signal.SIGTERM, self._signal)

        log_info("CaptureSystem initialized")

    # ---------- Lifecycle ----------
    def _signal(self, *_):
        self.cleanup()
        sys.exit(0)

    def cleanup(self):
        # stop preview thread
        self.preview_stop.set()
        try:
            if self.preview_thread and self.preview_thread.is_alive():
                self.preview_thread.join(timeout=2)
        except Exception:
            pass

        # stop saver
        self.saver_stop.set()
        try:
            if self.saver_thread and self.saver_thread.is_alive():
                self.saver_thread.join(timeout=2)
        except Exception:
            pass

        # stop reader
        self.stop_reader()
        if self.cap:
            try: self.cap.release()
            except Exception: pass
            self.cap = None

    # ---------- Camera ----------
    def _apply_safe_video_params(self, cap):
        try:
            cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*'MJPG'))
            cap.set(cv2.CAP_PROP_FRAME_WIDTH,  self.preview_width)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.preview_height)
            cap.set(cv2.CAP_PROP_FPS,          self.request_fps)
            cap.set(cv2.CAP_PROP_BUFFERSIZE,   1)
            # settle a few frames
            for _ in range(3): cap.grab()
        except Exception:
            pass

    def _try_formats_and_resolutions(self, index, backend):
        # First, try a neutral open without forcing FOURCC (AVFoundation often ignores/blocks it)
        try:
            cap0 = cv2.VideoCapture(index, backend)
            if cap0 and cap0.isOpened():
                try:
                    # Probe by grabbing a few frames without any format pressure
                    for _ in range(3):
                        cap0.grab()
                    ret0, fr0 = cap0.retrieve()
                    if ret0 and fr0 is not None and fr0.size:
                        return cap0
                except Exception:
                    pass
                cap0.release()
        except Exception:
            pass

        # Prefer MJPG first, fallback to YUYV; start with stabler FPS values
        fourccs = [cv2.VideoWriter_fourcc(*'MJPG'), cv2.VideoWriter_fourcc(*'YUYV')]
        resolutions = [(640, 480), (1280, 720), (1920, 1080)]
        fps_candidates = [25, 15, 30]  # safer first, then 30
        for fourcc in fourccs:
            for (w, h) in resolutions:
                for fps in fps_candidates:
                    cap = cv2.VideoCapture(index, backend)
                    if not cap or not cap.isOpened():
                        if cap: cap.release()
                        continue
                    try:
                        cap.set(cv2.CAP_PROP_FOURCC, fourcc)
                        cap.set(cv2.CAP_PROP_FRAME_WIDTH,  w)
                        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, h)
                        cap.set(cv2.CAP_PROP_FPS,          fps)
                        cap.set(cv2.CAP_PROP_BUFFERSIZE,   1)
                        # Let backend settle, then test retrieve
                        for _ in range(3): cap.grab()
                        ret, frame = cap.retrieve()
                        if ret and frame is not None and frame.size:
                            self.request_fps = fps  # align request with working FPS
                            return cap
                    except Exception:
                        pass
                    cap.release()
        return None

    def scan_cameras(self, max_index=20):
        if is_macos():
            backends = [cv2.CAP_AVFOUNDATION, cv2.CAP_ANY]
        elif is_windows():
            backends = [cv2.CAP_MSMF, cv2.CAP_DSHOW, cv2.CAP_ANY]
        else:
            backends = [cv2.CAP_V4L2, cv2.CAP_ANY]

        found = []
        for i in range(max_index):
            opened = False
            for be in backends:
                cap = self._try_formats_and_resolutions(i, be)
                if cap:
                    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                    found.append({"index": i, "name": f"Camera {i} ({w}x{h})"})
                    cap.release()
                    opened = True
                    break
            if not opened:
                logger.debug(f"Index {i} could not be opened on any backend.")
        log_info(f"Camera scan: found {len(found)} device(s)")
        return found

    def _open_camera(self, index):
        if is_macos():
            backends = [cv2.CAP_AVFOUNDATION, cv2.CAP_ANY]
        elif is_windows():
            backends = [cv2.CAP_MSMF, cv2.CAP_DSHOW, cv2.CAP_ANY]
        else:
            backends = [cv2.CAP_V4L2, cv2.CAP_ANY]

        for be in backends:
            cap = self._try_formats_and_resolutions(index, be)
            if cap:
                self.camera_index = index
                self._apply_safe_video_params(cap)
                self.last_open_ts = time.time()
                return cap
        return None

    def start_reader(self, index=0):
        # If already running & healthy on same index, keep it
        if self.cap and self.cap.isOpened() and self.reader_thread and self.reader_thread.is_alive() and self.camera_index == index:
            return True
        self.stop_reader()
        self.cap = self._open_camera(index)
        if not self.cap:
            self.last_error = f"Failed to open camera {index}"
            log_err(self.last_error)
            return False

        # Warm-up: drain a few frames
        for _ in range(5):
            self.cap.grab()

        self.reader_stop.clear()
        self.reader_thread = threading.Thread(target=self._reader_loop, name="CameraReader", daemon=True)
        self.reader_thread.start()
        log_info(f"Camera reader started on index {index}")
        return True

    def stop_reader(self):
        if self.reader_thread and self.reader_thread.is_alive():
            self.reader_stop.set()
            self.reader_thread.join(timeout=2)
        self.reader_thread = None
        self.reader_stop.clear()

    # ---- Frame validation and resilient reader ----
    def _is_frame_bad(self, frame):
        if frame is None or frame.size == 0:
            return True
        if frame.ndim != 3 or frame.shape[0] < 120 or frame.shape[1] < 160:
            return True
        # Reject frames with no variation (often corrupt)
        if np.max(frame) == np.min(frame):
            return True
        return False

    def _reader_loop(self):
        stall_limit = 1.5  # seconds without a good frame before considering stall
        backoff = 0.5
        last_frame_sum = None

        while not self.reader_stop.is_set():
            try:
                now = time.time()

                # Periodic hard reopen to defeat long-run drift
                if self.cap and self.cap.isOpened() and (now - self.last_open_ts) > self.hard_reopen_every_s:
                    log_warn("Hard camera reopen (periodic maintenance)…")
                    try: self.cap.release()
                    except Exception: pass
                    time.sleep(0.2)
                    self.cap = self._open_camera(self.camera_index)
                    self.last_open_ts = time.time()
                    self.last_ok_ts = self.last_open_ts

                if not self.cap or not self.cap.isOpened():
                    time.sleep(backoff); continue

                # Low-latency path: drop queued stale frames
                grabbed = self.cap.grab()
                if not grabbed:
                    # Stall handling
                    if (now - self.last_ok_ts) > stall_limit:
                        log_warn("Camera stalled; reopening with backoff…")
                        try: self.cap.release()
                        except Exception: pass
                        time.sleep(backoff)
                        self.cap = self._open_camera(self.camera_index)
                        self.last_open_ts = time.time()
                        self.last_ok_ts = self.last_open_ts
                        backoff = min(2.0, backoff * 1.5)
                    else:
                        time.sleep(0.01)
                    continue

                ret, frame = self.cap.retrieve()
                if not ret or self._is_frame_bad(frame):
                    # Treat as stall if bad frame persists
                    if (now - self.last_ok_ts) > stall_limit:
                        log_warn("Bad/corrupt frames; reopening…")
                        try: self.cap.release()
                        except Exception: pass
                        time.sleep(backoff)
                        self.cap = self._open_camera(self.camera_index)
                        self.last_open_ts = time.time()
                        self.last_ok_ts = self.last_open_ts
                        backoff = min(2.0, backoff * 1.5)
                    else:
                        time.sleep(0.01)
                    continue

                # Detect a frozen feed cheaply (only when stalled): compare downsampled sum
                if (now - self.last_ok_ts) > stall_limit:
                    try:
                        small = cv2.resize(frame, (64, 36))
                        s = int(small.sum())
                        if last_frame_sum is not None and s == last_frame_sum:
                            log_warn("Frozen feed detected; reopening camera…")
                            try: self.cap.release()
                            except Exception: pass
                            time.sleep(backoff)
                            self.cap = self._open_camera(self.camera_index)
                            self.last_open_ts = time.time()
                            self.last_ok_ts = self.last_open_ts
                            continue
                        last_frame_sum = s
                    except Exception:
                        # If resize fails, skip frozen detection this cycle
                        pass
                else:
                    last_frame_sum = None

                with self.frame_lock:
                    self.latest_frame = frame
                self.last_ok_ts = now
                backoff = 0.5
            except Exception as e:
                self.last_error = f"Reader error: {e}"
                log_err(self.last_error)
                time.sleep(0.05)

    def get_latest_frame(self):
        with self.frame_lock:
            return None if self.latest_frame is None else self.latest_frame.copy()

    def wait_for_frame(self, timeout=5.0):
        end = time.time() + float(timeout)
        while time.time() < end:
            fr = self.get_latest_frame()
            if fr is not None:
                return True
            time.sleep(0.02)
        return False

    # ---------- Global preview encoder (single JPEG fan-out) ----------
    def _preview_loop(self):
        interval = 1.0 / float(self.preview_fps)
        while not self.preview_stop.is_set():
            frame = self.get_latest_frame()
            if frame is not None and not self._is_frame_bad(frame):
                try:
                    # Optional downscale for preview only
                    img = frame
                    try:
                        if self.preview_max_width and frame.shape[1] > int(self.preview_max_width):
                            new_w = int(self.preview_max_width)
                            new_h = int(frame.shape[0] * (new_w / frame.shape[1]))
                            img = cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_AREA)
                    except Exception:
                        img = frame

                    t0 = time.time()
                    if self.turbojpeg:
                        img_bytes = self.turbojpeg.encode(img, quality=int(self.jpeg_quality_preview), pixel_format=TJPF_BGR)
                        with self.preview_lock:
                            self.preview_jpeg = img_bytes
                    else:
                        ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, int(self.jpeg_quality_preview)])
                        if ok:
                            with self.preview_lock:
                                self.preview_jpeg = buf.tobytes()
                    # Update metrics
                    enc_ms = (time.time() - t0) * 1000.0
                    self.preview_encode_ms_last = enc_ms
                    self.preview_encode_ms_avg = (0.2 * enc_ms) + (0.8 * self.preview_encode_ms_avg)
                except Exception as e:
                    self.last_error = f"preview encode error: {e}"
                    log_err(self.last_error)
            time.sleep(interval)

    # ---------- Async saver ----------
    def _saver_loop(self):
        while not self.saver_stop.is_set():
            try:
                if not self.save_q:
                    time.sleep(0.002)
                    continue
                outdir, fname, frame = self.save_q.popleft()
                fpath = Path(outdir) / fname
                t0 = time.time()
                if self.turbojpeg:
                    # Fast-path JPEG encode and write
                    img_bytes = self.turbojpeg.encode(frame, quality=int(self.jpeg_quality_capture), pixel_format=TJPF_BGR)
                    with open(str(fpath), "wb") as f:
                        f.write(img_bytes)
                else:
                    # Fallback to OpenCV
                    cv2.imwrite(str(fpath), frame, [cv2.IMWRITE_JPEG_QUALITY, int(self.jpeg_quality_capture)])
                # Update metrics
                w_ms = (time.time() - t0) * 1000.0
                self.saver_write_ms_last = w_ms
                self.saver_write_ms_avg = (0.2 * w_ms) + (0.8 * self.saver_write_ms_avg)
            except Exception as e:
                self.last_error = f"saver error: {e}"
                log_err(self.last_error)

    # ---------- Capture ----------
    def _resolve_save_dir(self):
        return self.session_output_dir if (self.session_active and self.session_output_dir) else self.current_folder

    def _write_manifest_entry(self, outdir: Path, filename: str):
        csv_path = outdir / "captures.csv"
        new_file = not csv_path.exists()
        try:
            with csv_path.open("a", newline="") as f:
                w = csv.writer(f)
                if new_file:
                    w.writerow(["timestamp", "filename", "product", "camera_index", "session_id"])
                w.writerow([ts_now(), filename, self.session_product_name or "", self.camera_index, self.session_id or ""])
        except Exception as e:
            self.last_error = f"CSV write error: {e}"
            log_err(self.last_error)

    def _ensure_session_meta(self, outdir: Path):
        meta = {
            "session_id": self.session_id,
            "product": self.session_product_name or "",
            "rate_per_min": self.session_rate,
            "start_time_iso": iso_now(),
            "duration_seconds": self.session_duration_s,
            "camera_index": self.camera_index,
            "created_at": ts_now(),
        }
        try:
            (outdir / "session_meta.json").write_text(json.dumps(meta, indent=2))
        except Exception as e:
            self.last_error = f"Meta write error: {e}"
            log_err(self.last_error)

    def capture_image(self):
        frame = self.get_latest_frame()
        if frame is None:
            self.wait_for_frame(timeout=1.0)
            frame = self.get_latest_frame()
        if frame is None and self.cap and self.cap.isOpened():
            # Last-chance direct read
            if self.cap.grab():
                ret, fr = self.cap.retrieve()
                frame = fr if ret else None
        if frame is None:
            return False, "No camera frame. Connect camera and ensure preview shows an image."

        try:
            ts_str = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]
            fname = f"capture_{self.total_captures:06d}_{ts_str}.jpg"
            outdir = Path(self._resolve_save_dir())
            outdir.mkdir(parents=True, exist_ok=True)

            # enqueue async write
            if len(self.save_q) >= self.save_q.maxlen:
                log_warn("Save queue full; dropping oldest frame to keep up.")
            self.save_q.append((str(outdir), fname, frame.copy()))
            self.total_captures += 1

            if self.session_active and self.session_output_dir:
                self._write_manifest_entry(outdir, fname)
            return True, str(outdir / fname)
        except Exception as e:
            self.last_error = str(e)
            return False, self.last_error

    # ---------- Storage ----------
    def get_storage_devices(self):
        devs = []
        try:
            for part in psutil.disk_partitions(all=True):
                mp = part.mountpoint
                try: u = psutil.disk_usage(mp)
                except Exception: continue
                if is_macos() and mp in ["/", "/System", "/private/var/vm"]:
                    continue
                devs.append({
                    "device": part.device or mp,
                    "mountpoint": mp,
                    "fstype": part.fstype or "",
                    "total": u.total, "used": u.used, "free": u.free,
                    "percent": round(u.used/u.total*100, 1),
                    "free_gb": round(u.free/1024**3, 2),
                })
        except Exception as e:
            log_warn(f"disk_partitions error: {e}")

        if is_windows():
            by_mp = {d["mountpoint"]: d for d in devs}
            for d in list_windows_drives():
                by_mp[d["mountpoint"]] = d
            devs = list(by_mp.values())

        for root in extra_mount_roots():
            try:
                for child in root.iterdir():
                    if child.is_dir():
                        try:
                            u = psutil.disk_usage(str(child))
                            devs.append({
                                "device": child.name,
                                "mountpoint": str(child),
                                "fstype": "external",
                                "total": u.total, "used": u.used, "free": u.free,
                                "percent": round(u.used/u.total*100, 1),
                                "free_gb": round(u.free/1024**3, 2),
                            })
                        except Exception:
                            pass
            except Exception:
                pass

        # Always add home
        try:
            home = str(Path.home())
            u = psutil.disk_usage(home)
            devs.insert(0, {
                "device": "User Home",
                "mountpoint": home,
                "fstype": "User",
                "total": u.total, "used": u.used, "free": u.free,
                "percent": round(u.used/u.total*100, 1),
                "free_gb": round(u.free/1024**3, 2),
            })
        except Exception:
            pass

        uniq = {d["mountpoint"]: d for d in devs}
        out = list(uniq.values())
        out.sort(key=lambda x: (-x["free"], x["mountpoint"]))
        return out

    def set_storage_location(self, path):
        try:
            p = Path(path).expanduser().resolve()
            p.mkdir(parents=True, exist_ok=True)
            self.current_folder = str(p)
            log_info(f"Storage set to: {self.current_folder}")
            return True, self.current_folder
        except Exception as e:
            self.last_error = str(e)
            log_err(f"Storage set error: {e}")
            return False, self.last_error

    def list_folder(self, folder):
        try:
            p = Path(folder).expanduser().resolve()
            if not p.exists():
                return {"path": str(p), "parent": None, "contents": []}
            parent = str(p.parent) if p != p.parent else None
            rows = []
            for item in sorted(p.iterdir(), key=lambda q: (not q.is_dir(), q.name.lower())):
                try:
                    st = item.stat()
                    if item.is_dir() or item.suffix.lower() in [".jpg", ".jpeg", ".png"]:
                        rows.append({
                            "name": item.name,
                            "path": str(item),
                            "is_dir": item.is_dir(),
                            "size": 0 if item.is_dir() else st.st_size,
                            "modified": datetime.fromtimestamp(st.st_mtime).strftime("%Y-%m-%d %H:%M:%S"),
                        })
                except Exception:
                    continue
            return {"path": str(p), "parent": parent, "contents": rows}
        except Exception:
            return {"path": str(folder), "parent": None, "contents": []}

    # ---------- Session ----------
    def _append_global_product_log(self, end_time_iso: str):
        try:
            with PRODUCT_LOG_CSV.open("a", newline="") as f:
                w = csv.writer(f)
                w.writerow([
                    self.session_id or "",
                    self.session_product_name or "",
                    datetime.fromtimestamp(self.session_start_time).isoformat(timespec="seconds") if self.session_start_time else "",
                    end_time_iso,
                    self.session_captures,
                    self.session_rate,
                    self.session_duration_s if self.session_duration_s else "",
                    self.session_output_dir or self.current_folder
                ])
        except Exception as e:
            log_err(f"Product log write error: {e}")

    def start_session(self, rate, duration_minutes=None, product_name=None):
        with self.session_lock:
            if self.session_active:
                return False, "Session already active", None

            # Ensure camera is running; auto-reconnect once
            if not (self.cap and self.cap.isOpened()):
                if not self.start_reader(self.camera_index or 0):
                    return False, "Camera not available. Please scan & connect.", None

            # Warm up & ensure frames are flowing
            if not self.wait_for_frame(timeout=3.0):
                self.stop_reader()
                if not self.start_reader(self.camera_index or 0) or not self.wait_for_frame(timeout=3.0):
                    return False, "Camera connected but no frames arriving (permissions/cable/port).", None

            try: rate = int(rate)
            except Exception: rate = 24
            rate = max(1, min(300, rate))
            self.session_rate = rate
            self.session_duration_s = (duration_minutes * 60) if duration_minutes else None
            self.session_start_time = time.time()
            self.session_start_mono = time.monotonic()
            self.session_captures = 0
            self.session_id = datetime.now().strftime("%Y%m%d-%H%M%S")

            # Prepare product folder
            self.session_product_name = (product_name or "").strip()
            product_dir = None
            if self.session_product_name:
                safe = sanitize_product_name(self.session_product_name)
                base = Path(self.current_folder) / safe
                if base.exists():
                    stamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
                    base = Path(self.current_folder) / f"{safe}_{stamp}"
                base.mkdir(parents=True, exist_ok=True)
                product_dir = str(base)
                self.session_output_dir = product_dir
                self._ensure_session_meta(Path(product_dir))
            else:
                self.session_output_dir = None

            self.session_stop.clear()
            self.session_active = True
            self.session_thread = threading.Thread(target=self._session_worker, name="CaptureSession", daemon=True)
            self.session_thread.start()
            log_info(f"Session started: rate={self.session_rate}/min, duration_s={self.session_duration_s}, product={self.session_product_name or '-'}")
            return True, f"Session started at {rate}/min", product_dir

    def stop_session(self):
        with self.session_lock:
            if not self.session_active:
                return False, "No active session"
            self.session_active = False
            self.session_stop.set()

        if self.session_thread and self.session_thread.is_alive():
            self.session_thread.join(timeout=2)

        end_iso = iso_now()
        self._append_global_product_log(end_iso)
        msg = f"Session stopped. Captured {self.session_captures} images."
        log_info(msg)

        # clear per-session only (keep current_folder)
        self.session_output_dir = None
        self.session_product_name = None
        self.session_id = None

        return True, msg

    def _session_worker(self):
        interval = 60.0 / float(self.session_rate)
        start = self.session_start_mono or time.monotonic()
        next_t = start
        end_t = (start + self.session_duration_s) if self.session_duration_s else None

        while not self.session_stop.is_set():
            now = time.monotonic()
            if end_t and now >= end_t:
                break

            # Catch up if we fell behind (e.g., temporary blocking);
            # ensure we don't exceed the planned end time.
            caught = 0
            while next_t <= now and (end_t is None or next_t < end_t):
                ok, path = self.capture_image()
                if ok:
                    with self.session_lock:
                        self.session_captures += 1
                    logger.debug(f"Captured: {path}")
                next_t += interval
                caught += 1
                # Avoid extreme bursts in pathological lag; still maintain correctness.
                if caught >= 10:
                    break

            # Sleep until the next scheduled capture time.
            sleep_for = max(0.001, next_t - time.monotonic())
            time.sleep(sleep_for)

        with self.session_lock:
            self.session_active = False

    def session_status(self):
        with self.session_lock:
            if self.session_active:
                now_m = time.monotonic()
                start_m = self.session_start_mono or now_m
                elapsed = int(now_m - start_m)
            else:
                elapsed = 0
            remaining = None
            expected_total = None
            percent = None
            if self.session_duration_s:
                remaining = max(0, int(self.session_duration_s - elapsed)) if self.session_active else 0
                expected_total = int((self.session_duration_s / 60.0) * self.session_rate)
                if expected_total > 0:
                    percent = min(100, int((self.session_captures / expected_total) * 100))
            return {
                "active": self.session_active,
                "captures": self.session_captures,
                "elapsed": elapsed,
                "rate": self.session_rate,
                "duration": self.session_duration_s,
                "remaining": remaining,
                "expected_total": expected_total,
                "percent": percent,
                "session_output_dir": self.session_output_dir,
            }

system = CaptureSystem()

# ---------------- UI ----------------
HTML = """<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>360° Product Capture</title>
<style>
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;background:#0f172a;color:#e5e7eb;margin:0}
.wrap{max-width:1200px;margin:0 auto;padding:16px}
.grid{display:grid;grid-template-columns:1fr 420px;gap:16px}
.card{background:#111827;border:1px solid #1f2937;border-radius:12px;padding:16px}
.btn{display:block;width:100%;padding:10px 12px;margin:6px 0;border-radius:8px;border:none;cursor:pointer;font-weight:600;background:#2563eb;color:#fff}
.btn.alt{background:#334155}.btn.ok{background:#16a34a}.btn.warn{background:#ea580c}
select,input{width:100%;padding:8px;border-radius:8px;border:1px solid #334155;background:#0b1220;color:#e5e7eb;margin:6px 0}
.row{display:flex;gap:8px;align-items:center}
.badge{display:inline-block;background:#0b1220;border:1px solid #334155;color:#93c5fd;padding:4px 8px;border-radius:999px;font-size:12px}
.preview{height:420px;background:#000;border-radius:10px;overflow:hidden}
.preview img{width:100%;height:100%;object-fit:contain}
.browser{max-height:180px;overflow:auto;border:1px solid #334155;border-radius:8px;padding:8px;background:#0b1220}
.item{display:flex;gap:8px;align-items:center;background:#0b1220;border:1px solid #1f2937;border-radius:8px;padding:8px;margin:6px 0;cursor:pointer}
.item:hover{background:#0c1426}.small{font-size:12px;color:#94a3b8;margin-left:auto}.up{color:#f59e0b}
.progress{background:#0b1220;border:1px solid #334155;border-radius:999px;height:14px;overflow:hidden}
.bar{background:#22c55e;height:100%;width:0%}
.kv{display:grid;grid-template-columns:auto 1fr;gap:6px;font-size:14px}
.kv div:nth-child(odd){color:#a5b4fc}
.dgrid{display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:12px}
@media(max-width:900px){.grid{grid-template-columns:1fr}}
</style></head>
<body>
<div class="wrap">
  <h2>📸 360° Product Capture</h2>
  <div class="grid">
    <div class="card">
      <div class="row" style="justify-content:space-between">
        <div>Live Preview</div><span id="camBadge" class="badge">Camera: disconnected</span>
      </div>
      <div class="preview"><img id="preview" src="/video_feed" alt="preview"></div>
      <div class="kv" style="margin-top:8px">
        <div>Session:</div><div id="sessState">inactive</div>
        <div>Images:</div><div><span id="imgCount">0</span><span id="imgTargetWrap" style="display:none"> / <span id="imgTarget">0</span></span></div>
        <div>Rate:</div><div><span id="rateTxt">0</span>/min</div>
        <div>Elapsed:</div><div id="elapsedTxt">0s</div>
        <div id="remRow" style="display:none">Remaining:</div><div id="remainTxt" style="display:none">0s</div>
      </div>
      <div class="progress" style="margin-top:8px" id="progWrap"><div class="bar" id="progBar"></div></div>
      <div style="margin-top:8px;font-size:12px;color:#9ca3af">Last error: <span id="lastErr">-</span></div>

      <h3 style="margin-top:16px">Diagnostics</h3>
       <div class="dgrid" id="diag">
         <div>Connected:</div><div id="d_connected">false</div>
         <div>Index:</div><div id="d_index">-</div>
         <div>Width × Height:</div><div id="d_wh">-</div>
         <div>FPS:</div><div id="d_fps">-</div>
         <div>Last frame age:</div><div id="d_age">-</div>
         <div>Save queue:</div><div id="d_q">-</div>
         <div>Preview FPS:</div><div id="d_pfps">10</div>
         <div>Preview enc avg (ms):</div><div id="d_pavg">-</div>
         <div>Write avg (ms):</div><div id="d_wavg">-</div>
       </div>
       <div class="row" style="gap:8px;margin-top:8px">
         <input id="inp_pf" type="number" min="5" max="30" placeholder="Preview FPS">
         <input id="inp_qp" type="number" min="40" max="95" placeholder="Preview Q">
         <input id="inp_qc" type="number" min="80" max="100" placeholder="Capture Q">
         <input id="inp_pw" type="number" min="320" max="1920" placeholder="Preview max width">
       </div>
       <button class="btn alt" onclick="applyPerf()">⚙️ Apply Perf Settings</button>
       <button class="btn alt" onclick="refreshDiag()">🔧 Refresh Diagnostics</button>

      <button class="btn warn" onclick="capture()">📸 Capture Image</button>
    </div>

    <div class="card">
      <h3>Camera</h3>
      <button class="btn alt" onclick="scan()">🔍 Scan Cameras</button>
      <select id="camSelect"></select>
      <button class="btn ok" onclick="connectCam()">🔌 Connect</button>

      <h3 style="margin-top:12px">Storage</h3>
      <button class="btn alt" onclick="loadStorage()">🔄 Refresh Storage</button>
      <select id="storageSelect"></select>
      <button class="btn ok" onclick="selectStorage()">📁 Use Selected</button>
      <div class="row"><input id="manualPath" placeholder="Or paste a path e.g. /Volumes/MyHDD/Captures"><button class="btn" style="width:auto" onclick="useManual()">Set</button></div>
      <div class="row"><input id="currentPath" readonly><button class="btn" style="width:auto" onclick="setToCurrent()">Use</button></div>
      <div class="browser" id="browser"></div>
      <div class="row"><input id="newFolder" placeholder="New folder name"><button class="btn" style="width:auto" onclick="mkfolder()">Create</button></div>

      <h3 style="margin-top:12px">Automated Session</h3>
      <input id="productName" placeholder="Product Name (folder will be created)">
      <select id="rate"><option value="12">12/min</option><option value="24" selected>24/min</option><option value="60">60/min</option><option value="120">120/min</option><option value="180">180/min</option></select>
      <input id="dur" type="number" placeholder="Duration (minutes, optional)" min="1" max="600">
      <div class="row"><button id="startBtn" class="btn ok" onclick="start()">▶ Start</button><button id="stopBtn" class="btn alt" onclick="stop()" disabled>⏹ Stop</button></div>
      <h3 style="margin-top:12px">Camera Reset</h3>
      <button class="btn alt" onclick="hardReset()">♻ Hard Reset Camera</button>
    </div>
  </div>
</div>
<script>
async function jget(u){try{const r=await fetch(u,{cache:'no-store'});return r.json()}catch(e){const m=(e&&e.message)||'';if(m.includes('ERR_ABORTED')||(e&&e.name==='AbortError'))return {};console.error('GET failed',u,e);return {}}}
async function jpost(u,b){try{const r=await fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b||{}),cache:'no-store'});return r.json()}catch(e){const m=(e&&e.message)||'';if(m.includes('ERR_ABORTED')||(e&&e.name==='AbortError'))return {success:false,message:'Request aborted'};console.error('POST failed',u,e);return {success:false,message:'Network error'}}}

let currentPath = "";
let statusBusy = false;
let sessionBusy = false;

async function init(){
  await loadStorage();
  await statusTick();
  setInterval(statusTick, 1500);
  setInterval(sessionTick, 1000);
  setInterval(refreshDiag, 2000);
}
async function statusTick(){
  if(statusBusy) return; statusBusy = true;
  const s = await jget('/api/status');
  document.getElementById('camBadge').textContent = s.camera_connected ? 'Camera: connected' : 'Camera: disconnected';
  document.getElementById('lastErr').textContent = s.last_error || '-';
  if(!currentPath && s.current_folder){ currentPath=s.current_folder; await loadFolder(currentPath); }
  statusBusy = false;
}
async function scan(){
  const r = await jget('/api/camera/scan'); const sel=document.getElementById('camSelect'); sel.innerHTML="";
  if(r.success && r.cameras.length){ r.cameras.forEach(c=>{const o=document.createElement('option');o.value=c.index;o.textContent=c.name;sel.appendChild(o)}) }
  else { const o=document.createElement('option');o.value="";o.textContent="No cameras found";sel.appendChild(o) }
}
async function connectCam(){
  const val = document.getElementById('camSelect').value || 0;
  const r = await jpost('/api/camera/init', {camera_index: parseInt(val)});
  alert(r.message || (r.success?'Connected':'Failed')); await statusTick();
}
async function hardReset(){
  const r = await jpost('/api/camera/hard_reset', {});
  alert(r.success ? 'Camera hard reset OK' : ('Reset failed: '+(r.message||'')));
  await statusTick(); await refreshDiag();
}
async function capture(){
  const r = await jpost('/api/capture', {}); alert(r.success?('Captured:\\n'+r.message):('Failed:\\n'+r.message)); await loadFolder(currentPath);
}
async function loadStorage(){
  const list = await jget('/api/storage'); const sel=document.getElementById('storageSelect'); sel.innerHTML="";
  list.forEach(d=>{const o=document.createElement('option');o.value=d.mountpoint;o.textContent=`${d.device} (${d.free_gb} GB free) — ${d.mountpoint}`;sel.appendChild(o)})
}
async function selectStorage(){
  const mp = document.getElementById('storageSelect').value; if(!mp) return;
  const r = await jpost('/api/storage/select', {path: mp});
  if(r.success){ currentPath=r.path; document.getElementById('currentPath').value=currentPath; await loadFolder(currentPath); } else alert('Failed: '+r.message)
}
async function useManual(){
  const p=document.getElementById('manualPath').value.trim(); if(!p) return;
  const r = await jpost('/api/storage/select', {path: p});
  if(r.success){ currentPath=r.path; document.getElementById('currentPath').value=currentPath; await loadFolder(currentPath); } else alert('Failed: '+r.message)
}
async function setToCurrent(){
  const p=document.getElementById('currentPath').value.trim(); if(!p) return;
  const r = await jpost('/api/storage/select', {path: p}); if(r.success){ currentPath=r.path; await loadFolder(currentPath); } else alert('Failed: '+r.message)
}
async function loadFolder(path){
  const r = await jget('/api/folder?path='+encodeURIComponent(path||currentPath||""));
  currentPath = r.path || currentPath; document.getElementById('currentPath').value = currentPath;
  const box=document.getElementById('browser'); box.innerHTML="";
  if(r.parent){ const up=document.createElement('div'); up.className='item'; up.innerHTML='<span class="up">⬆️ .. (Up)</span>'; up.onclick=()=>loadFolder(r.parent); box.appendChild(up); }
  if(r.contents && r.contents.length){
    r.contents.forEach(it=>{ const div=document.createElement('div'); div.className='item';
      div.innerHTML = `<span>${it.is_dir?'📁':'🖼️'}</span><span>${it.name}</span><span class="small">${it.is_dir?'Folder':(Math.round(it.size/1024)+' KB')}</span>`;
      if(it.is_dir){ div.onclick=()=>loadFolder(it.path) } box.appendChild(div);
    })
  }else{ const p=document.createElement('div');p.className='item';p.textContent='(empty)';box.appendChild(p) }
}
async function start(){
  const rate = parseInt(document.getElementById('rate').value);
  const durv = document.getElementById('dur').value.trim();
  const product = document.getElementById('productName').value.trim();

  // If camera is disconnected, try one reconnect using selected index
  const status = await jget('/api/status');
  if(!status.camera_connected){
    const sel = document.getElementById('camSelect');
    const idx = sel && sel.value ? parseInt(sel.value) : 0;
    const rec = await jpost('/api/camera/reconnect', {camera_index: idx});
    if(!rec.success){
      alert('Camera reconnect failed. Please Scan → Connect first.');
      return;
    }
  }

  const payload = {rate}; if(durv) payload.duration = parseInt(durv); if(product) payload.product_name = product;
  const r = await jpost('/api/session/start', payload);
  if(r.success){
    document.getElementById('startBtn').disabled=true; document.getElementById('stopBtn').disabled=false;
    const rateTxt = rate+"/min"; const durTxt = durv? (" for "+parseInt(durv)+" min") : "";
    alert('Session started at '+rateTxt+durTxt);
    if(r.product_dir){ currentPath=r.product_dir; document.getElementById('currentPath').value=currentPath; await loadFolder(currentPath); alert('Saving to:\\n'+r.product_dir); }
  }else{
    alert('Failed to start: ' + (r.message||'')); return;
  }
  sessionTick();
}
async function stop(){
  const r = await jpost('/api/session/stop', {}); document.getElementById('startBtn').disabled=false; document.getElementById('stopBtn').disabled=true;
  alert(r.message||'Stopped');
  sessionTick(); await loadFolder(currentPath);
}
async function sessionTick(){
  if(sessionBusy) return; sessionBusy = true;
  const s = await jget('/api/session/status');
  document.getElementById('sessState').textContent = s.active? 'Active' : 'Inactive';
  document.getElementById('imgCount').textContent = s.captures||0;
  document.getElementById('rateTxt').textContent = s.rate||0;
  document.getElementById('elapsedTxt').textContent = (s.elapsed!=null)? (s.elapsed+'s'):'0s';

  const targetWrap = document.getElementById('imgTargetWrap');
  const imgTarget = document.getElementById('imgTarget');
  const remRow = document.getElementById('remRow');
  const remainTxt = document.getElementById('remainTxt');
  const progWrap = document.getElementById('progWrap');
  const progBar  = document.getElementById('progBar');

  if(s.expected_total!=null){
    targetWrap.style.display='inline';
    imgTarget.textContent = s.expected_total;
    remRow.style.display = 'block';
    remainTxt.style.display = 'block';
    remainTxt.textContent = (s.remaining!=null)? (s.remaining+'s'):'0s';
    progWrap.style.display = 'block';
    const pct = (s.percent!=null)? s.percent : 0;
    progBar.style.width = pct + '%';
  }else{
    targetWrap.style.display='none';
    remRow.style.display='none';
    remainTxt.style.display='none';
    progWrap.style.display='none';
    progBar.style.width='0%';
  }
  sessionBusy = false;
}
  async function refreshDiag(){
    const d = await jget('/api/camera/health');
    document.getElementById('d_connected').textContent = d.connected;
    document.getElementById('d_index').textContent = d.index ?? '-';
    document.getElementById('d_wh').textContent = (d.width||'-')+' × '+(d.height||'-');
    document.getElementById('d_fps').textContent = d.fps ?? '-';
    document.getElementById('d_age').textContent = (d.last_ok_age_s!=null)? (d.last_ok_age_s+'s'):'-';
    document.getElementById('d_q').textContent = d.save_queue_len ?? '-';
    document.getElementById('d_pfps').textContent = d.preview_fps ?? '-';
    const pa = document.getElementById('d_pavg'); if(pa) pa.textContent = (d.preview_avg_ms!=null)? d.preview_avg_ms : '-';
    const wa = document.getElementById('d_wavg'); if(wa) wa.textContent = (d.write_avg_ms!=null)? d.write_avg_ms : '-';
    if(d.last_error){ document.getElementById('lastErr').textContent = d.last_error; }
    // Prefill perf inputs
    const pf = document.getElementById('inp_pf'); if(pf && d.preview_fps!=null) pf.value = d.preview_fps;
    const qp = document.getElementById('inp_qp'); if(qp && d.jpeg_quality_preview!=null) qp.value = d.jpeg_quality_preview;
    const qc = document.getElementById('inp_qc'); if(qc && d.jpeg_quality_capture!=null) qc.value = d.jpeg_quality_capture;
    const pw = document.getElementById('inp_pw'); if(pw && d.preview_max_width!=null) pw.value = d.preview_max_width;
  }
  async function applyPerf(){
    const pf = parseInt(document.getElementById('inp_pf').value||system.preview_fps||12);
    const qp = parseInt(document.getElementById('inp_qp').value||65);
    const qc = parseInt(document.getElementById('inp_qc').value||90);
    const pw = parseInt(document.getElementById('inp_pw').value||960);
    const r = await jpost('/api/perf/set', {preview_fps: pf, jpeg_quality_preview: qp, jpeg_quality_capture: qc, preview_max_width: pw});
    alert(r.success? 'Perf updated' : ('Failed: '+(r.error||r.message||'')));
    await refreshDiag();
  }
init();
</script>
</body></html>
"""

# ---------------- Routes ----------------
@app.route("/")
def index():
    return HTML

@app.route("/video_feed")
def video_feed():
    # Limit concurrent preview clients to protect CPU/sockets
    if system.preview_clients >= system.max_preview_clients:
        return Response("Too many preview clients", status=429)

    def gen():
        system.preview_clients += 1
        try:
            boundary = b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"
            while True:
                with system.preview_lock:
                    chunk = system.preview_jpeg
                if chunk:
                    yield boundary + chunk + b"\r\n"
                time.sleep(1.0 / max(1, system.preview_fps))
        except GeneratorExit:
            pass
        except Exception:
            pass
        finally:
            system.preview_clients = max(0, system.preview_clients - 1)
            gc.collect()  # encourage socket/fd cleanup

    return Response(gen(), mimetype="multipart/x-mixed-replace; boundary=frame")

# ---- Camera APIs ----
@app.route("/api/camera/scan")
def api_camera_scan():
    try:
        cams = system.scan_cameras(max_index=12)
        return jsonify({"success": True, "cameras": cams})
    except Exception as e:
        return jsonify({"success": False, "message": str(e), "cameras": []})

@app.route("/api/camera/init", methods=["POST"])
def api_camera_init():
    data = request.get_json() or {}
    idx = int(data.get("camera_index", 0))
    ok = system.start_reader(idx)
    return jsonify({"success": ok, "message": "Camera initialized" if ok else "Failed to initialize camera"})

@app.route("/api/camera/reconnect", methods=["POST"])
def api_camera_reconnect():
    data = request.get_json() or {}
    idx = int(data.get("camera_index", system.camera_index or 0))
    ok = system.start_reader(idx)
    return jsonify({"success": ok, "message": "Reconnected" if ok else "Reconnect failed"})

@app.route("/api/camera/hard_reset", methods=["POST"])
def api_camera_hard_reset():
    try:
        idx = system.camera_index or 0
        if system.cap:
            try: system.cap.release()
            except Exception: pass
        time.sleep(0.2)
        system.cap = system._open_camera(idx)
        system.last_open_ts = time.time()
        system.last_ok_ts = system.last_open_ts
        ok = bool(system.cap and system.cap.isOpened())
        return jsonify({"success": ok, "message": "OK" if ok else "Failed to reopen"})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)})

@app.route("/api/camera/health")
def api_camera_health():
    caps = {}
    try:
        connected = bool(system.cap and system.cap.isOpened())
        width = int(system.cap.get(cv2.CAP_PROP_FRAME_WIDTH)) if connected else 0
        height = int(system.cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) if connected else 0
        fps = int(system.cap.get(cv2.CAP_PROP_FPS)) if connected else 0
        age = round(time.time() - system.last_ok_ts, 3) if system.last_ok_ts else None
        caps = {
            "connected": connected,
            "index": system.camera_index,
            "width": width,
            "height": height,
            "fps": fps,
            "last_ok_age_s": age,
            "save_queue_len": len(system.save_q),
            "preview_fps": system.preview_fps,
            "last_error": system.last_error,
            "jpeg_quality_preview": system.jpeg_quality_preview,
            "jpeg_quality_capture": system.jpeg_quality_capture,
            "preview_max_width": system.preview_max_width,
            "turbojpeg": bool(system.turbojpeg),
            "preview_avg_ms": round(system.preview_encode_ms_avg, 2),
            "preview_last_ms": round(system.preview_encode_ms_last, 2),
            "write_avg_ms": round(system.saver_write_ms_avg, 2),
            "write_last_ms": round(system.saver_write_ms_last, 2),
        }
    except Exception as e:
        caps = {"connected": False, "error": str(e)}
    return jsonify(caps)

# ---- Perf config ----
@app.route('/api/perf/set', methods=['POST'])
def api_perf_set():
    try:
        data = request.get_json(silent=True) or {}
        qprev = int(data.get('jpeg_quality_preview', system.jpeg_quality_preview))
        qcap = int(data.get('jpeg_quality_capture', system.jpeg_quality_capture))
        fps = int(data.get('preview_fps', system.preview_fps))
        maxw = int(data.get('preview_max_width', system.preview_max_width))
        system.jpeg_quality_preview = max(40, min(95, qprev))
        system.jpeg_quality_capture = max(80, min(100, qcap))
        system.preview_fps = max(5, min(30, fps))
        system.preview_max_width = max(320, min(1920, maxw))
        return jsonify({
            "success": True,
            "config": {
                "jpeg_quality_preview": system.jpeg_quality_preview,
                "jpeg_quality_capture": system.jpeg_quality_capture,
                "preview_fps": system.preview_fps,
                "preview_max_width": system.preview_max_width,
            }
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 400

# ---- Capture ----
@app.route("/api/capture", methods=["POST"])
def api_capture():
    ok, msg = system.capture_image()
    return jsonify({"success": ok, "message": msg})

# ---- Storage ----
@app.route("/api/storage")
def api_storage():
    return jsonify(system.get_storage_devices())

@app.route("/api/storage/select", methods=["POST"])
def api_storage_select():
    data = request.get_json() or {}
    path = data.get("path") or data.get("mountpoint")
    if not path:
        return jsonify({"success": False, "message": "No path provided"})
    ok, p = system.set_storage_location(path)
    return jsonify({"success": ok, "path": p if ok else None, "message": "OK" if ok else p})

@app.route("/api/folder")
def api_folder():
    folder = request.args.get("path", system.current_folder)
    return jsonify(system.list_folder(folder))

@app.route("/api/folder/create", methods=["POST"])
def api_folder_create():
    data = request.get_json() or {}
    base = data.get("path", system.current_folder)
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"success": False, "message": "Invalid folder name"})
    try:
        p = Path(base).expanduser().resolve() / name
        p.mkdir(parents=True, exist_ok=True)
        return jsonify({"success": True, "message": str(p)})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)})

# ---- Session ----
@app.route("/api/session/start", methods=["POST"])
def api_session_start():
    data = request.get_json() or {}
    rate = data.get("rate", 24)
    duration = data.get("duration")
    product = data.get("product_name")
    ok, msg, prod_dir = system.start_session(rate, duration, product)
    return jsonify({"success": ok, "message": msg, "product_dir": prod_dir})

@app.route("/api/session/stop", methods=["POST"])
def api_session_stop():
    ok, msg = system.stop_session()
    return jsonify({"success": ok, "message": msg})

@app.route("/api/session/status")
def api_session_status():
    return jsonify(system.session_status())

# ---- Status ----
@app.route("/api/status")
def api_status():
    cam_ok = False
    try:
        cam_ok = system.cap is not None and system.cap.isOpened()
    except Exception:
        cam_ok = False
    return jsonify({
        "camera_connected": cam_ok,
        "current_folder": system.current_folder,
        "capture_count": system.total_captures,
        "session_time": (int(time.monotonic() - system.session_start_mono) if system.session_start_mono else 0),
        "last_error": system.last_error
    })

if __name__ == "__main__":
    log_info("Starting 360° Product Capture System…")
    # Support overriding port via CLI arg or PORT env
    import os, argparse
    parser = argparse.ArgumentParser(description="Run Lightweight Capture App")
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", 5001)), help="Port to bind (default 5001)")
    args, _ = parser.parse_known_args()
    # For long runs, avoid Flask debug reloader spawning extra processes
    app.run(host="0.0.0.0", port=args.port, debug=False, threaded=True)
