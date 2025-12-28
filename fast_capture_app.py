#!/usr/bin/env python3
import os, cv2, time, psutil, threading, sys, atexit, platform, re, csv, json, gc
import numpy as np
from datetime import datetime
from pathlib import Path
from collections import deque
from logging.handlers import RotatingFileHandler
from concurrent.futures import ThreadPoolExecutor
from flask import Flask, Response, request, jsonify
from flask_cors import CORS
import logging

try:
    from turbojpeg import TurboJPEG
    _jpeg = TurboJPEG()
except Exception:
    _jpeg = None

try:
    cv2.setNumThreads(1)
except Exception:
    pass

if platform.system() == "Windows":
    os.environ.setdefault("OPENCV_VIDEOIO_PRIORITY_MSMF", "0")

APP_HOME = Path.home() / ".360photo"
LOG_DIR = APP_HOME / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)
PRODUCT_LOG_CSV = LOG_DIR / "product_log.csv"

logger = logging.getLogger("capture-app-fast")
logger.setLevel(logging.INFO)
fmt = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")
ch = logging.StreamHandler(sys.stdout)
ch.setLevel(logging.INFO)
ch.setFormatter(fmt)
logger.addHandler(ch)
fh = RotatingFileHandler(LOG_DIR / "app_fast.log", maxBytes=10_000_000, backupCount=5)
fh.setLevel(logging.INFO)
fh.setFormatter(fmt)
logger.addHandler(fh)

def ts_now():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

def iso_now():
    return datetime.now().isoformat(timespec="seconds")

def sanitize(name: str) -> str:
    name = name.strip()
    name = re.sub(r"\s+", "-", name)
    name = re.sub(r"[^A-Za-z0-9._\\-]", "", name)
    name = re.sub(r"-{2,}", "-", name)
    return name[:128] if name else "Product"

if not PRODUCT_LOG_CSV.exists():
    with PRODUCT_LOG_CSV.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["session_id","product","start_time","end_time","images","rate_per_min","duration_s","output_dir"])

app = Flask(__name__)
CORS(app)

class FastCaptureSystem:
    def __init__(self):
        self.cap = None
        self.camera_index = 0
        self.reader_thread = None
        self.reader_stop = threading.Event()
        self.frame_lock = threading.Lock()
        self.latest_frame = None
        self.preview_width = 1280
        self.preview_height = 720
        self.request_fps = 30
        self.last_ok_ts = 0.0
        self.last_error = ""
        self.hard_reopen_every_s = 600.0
        self.last_open_ts = time.perf_counter()
        self.preview_fps = 10
        self.preview_jpeg = b""
        self.preview_lock = threading.Lock()
        self.preview_stop = threading.Event()
        self.preview_thread = threading.Thread(target=self._preview_loop, name="PreviewEncoder", daemon=True)
        self.preview_thread.start()
        try:
            img = np.zeros((1,1,3), dtype=np.uint8)
            ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 60])
            self.tiny_jpeg = buf.tobytes() if ok else b"\xff\xd8\xff\xd9"
        except Exception:
            self.tiny_jpeg = b"\xff\xd8\xff\xd9"
        self.max_preview_clients = 4
        self.preview_clients = 0
        self.jpeg_quality_capture = 85
        self.save_q = deque(maxlen=500)
        self.saver_stop = threading.Event()
        self.saver_workers = max(2, os.cpu_count() or 2)
        self.saver_pool = ThreadPoolExecutor(max_workers=min(4, self.saver_workers))
        self.current_folder = str(Path.home() / "360Photo" / "captures")
        Path(self.current_folder).mkdir(parents=True, exist_ok=True)
        self.session_active = False
        self.session_thread = None
        self.session_stop = threading.Event()
        self.session_rate = 24
        self.session_duration_s = None
        self.session_start_time = None
        self.session_captures = 0
        self.session_output_dir = None
        self.session_product_name = None
        self.session_id = None
        self.total_captures = 0
        self.session_lock = threading.Lock()
        self.metrics = {
            "reconnects": 0,
            "stall_events": 0,
            "frozen_events": 0,
            "save_queue_len": 0,
            "avg_write_ms": 0.0,
            "p95_write_ms": 0.0,
            "capture_jitter_ms_avg": 0.0,
            "capture_jitter_ms_p95": 0.0,
            "missed_deadlines": 0,
        }
        self._write_latencies = deque(maxlen=512)
        self._capture_jitter = deque(maxlen=1024)
        atexit.register(self.cleanup)

    def cleanup(self):
        self.preview_stop.set()
        try:
            if self.preview_thread and self.preview_thread.is_alive():
                self.preview_thread.join(timeout=2)
        except Exception:
            pass
        self.reader_stop.set()
        try:
            if self.reader_thread and self.reader_thread.is_alive():
                self.reader_thread.join(timeout=2)
        except Exception:
            pass
        try:
            self.saver_pool.shutdown(wait=False, cancel_futures=True)
        except Exception:
            pass
        if self.cap:
            try:
                self.cap.release()
            except Exception:
                pass
            self.cap = None

    def _apply_params(self, cap):
        try:
            cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*'MJPG'))
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.preview_width)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.preview_height)
            cap.set(cv2.CAP_PROP_FPS, self.request_fps)
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            for _ in range(3):
                cap.grab()
        except Exception:
            pass

    def _try_open(self, index, backend):
        fourccs = [cv2.VideoWriter_fourcc(*'MJPG'), cv2.VideoWriter_fourcc(*'YUYV')]
        resolutions = [(1280, 720), (640, 480)]
        fps_candidates = [25, 30]
        for fourcc in fourccs:
            for (w, h) in resolutions:
                for fps in fps_candidates:
                    cap = cv2.VideoCapture(index, backend)
                    if not cap or not cap.isOpened():
                        if cap:
                            cap.release()
                        continue
                    try:
                        cap.set(cv2.CAP_PROP_FOURCC, fourcc)
                        cap.set(cv2.CAP_PROP_FRAME_WIDTH, w)
                        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, h)
                        cap.set(cv2.CAP_PROP_FPS, fps)
                        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                        for _ in range(2):
                            cap.grab()
                        ret, frame = cap.retrieve()
                        if ret and frame is not None and frame.size:
                            self.request_fps = fps
                            return cap
                    except Exception:
                        pass
                    cap.release()
        return None

    def scan_cameras(self, max_index=12):
        if platform.system() == "Darwin":
            backends = [cv2.CAP_AVFOUNDATION, cv2.CAP_ANY, cv2.CAP_GSTREAMER]
        elif platform.system() == "Windows":
            backends = [cv2.CAP_MSMF, cv2.CAP_DSHOW, cv2.CAP_ANY, cv2.CAP_GSTREAMER]
        else:
            backends = [cv2.CAP_V4L2, cv2.CAP_ANY, cv2.CAP_GSTREAMER]
        out = []
        try:
            if self.cap and self.cap.isOpened():
                w = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                h = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                out.append({"index": self.camera_index, "name": f"Camera {self.camera_index} ({w}x{h})"})
        except Exception:
            pass
        for i in range(max_index):
            opened = False
            for be in backends:
                cap = self._try_open(i, be)
                if cap:
                    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                    out.append({"index": i, "name": f"Camera {i} ({w}x{h})"})
                    cap.release()
                    opened = True
                    break
            if not opened:
                try:
                    cap2 = cv2.VideoCapture(i)
                    if cap2 and cap2.isOpened():
                        out.append({"index": i, "name": f"Camera {i}"})
                    if cap2:
                        cap2.release()
                except Exception:
                    pass
        logger.info(f"Camera scan: found {len(out)} device(s)")
        return out

    def _open_camera(self, index):
        if platform.system() == "Darwin":
            backends = [cv2.CAP_GSTREAMER, cv2.CAP_AVFOUNDATION, cv2.CAP_ANY]
        elif platform.system() == "Windows":
            backends = [cv2.CAP_GSTREAMER, cv2.CAP_MSMF, cv2.CAP_DSHOW, cv2.CAP_ANY]
        else:
            backends = [cv2.CAP_GSTREAMER, cv2.CAP_V4L2, cv2.CAP_ANY]
        for be in backends:
            cap = self._try_open(index, be)
            if cap:
                self.camera_index = index
                self._apply_params(cap)
                self.last_open_ts = time.perf_counter()
                return cap
        return None

    def start_reader(self, index=0):
        if self.cap and self.cap.isOpened() and self.reader_thread and self.reader_thread.is_alive() and self.camera_index == index:
            return True
        self.stop_reader()
        self.cap = self._open_camera(index)
        if not self.cap:
            self.last_error = f"Failed to open camera {index}"
            return False
        for _ in range(5):
            self.cap.grab()
        self.reader_stop.clear()
        self.reader_thread = threading.Thread(target=self._reader_loop, name="CameraReader", daemon=True)
        self.reader_thread.start()
        return True

    def stop_reader(self):
        if self.reader_thread and self.reader_thread.is_alive():
            self.reader_stop.set()
            self.reader_thread.join(timeout=2)
        self.reader_thread = None
        self.reader_stop.clear()

    def _is_bad(self, frame):
        if frame is None or frame.size == 0:
            return True
        if frame.ndim != 3 or frame.shape[0] < 120 or frame.shape[1] < 160:
            return True
        if np.max(frame) == np.min(frame):
            return True
        return False

    def _reader_loop(self):
        stall_limit = 1.0
        backoff = 0.25
        last_sum = None
        while not self.reader_stop.is_set():
            try:
                now = time.perf_counter()
                if self.cap and self.cap.isOpened() and (now - self.last_open_ts) > self.hard_reopen_every_s:
                    try:
                        self.cap.release()
                    except Exception:
                        pass
                    time.sleep(0.2)
                    self.cap = self._open_camera(self.camera_index)
                    self.last_open_ts = time.perf_counter()
                    self.last_ok_ts = self.last_open_ts
                if not self.cap or not self.cap.isOpened():
                    time.sleep(backoff)
                    continue
                if not self.cap.grab():
                    if (now - self.last_ok_ts) > stall_limit:
                        self.metrics["stall_events"] += 1
                        try:
                            self.cap.release()
                        except Exception:
                            pass
                        time.sleep(backoff)
                        self.cap = self._open_camera(self.camera_index)
                        self.last_open_ts = time.perf_counter()
                        self.last_ok_ts = self.last_open_ts
                        self.metrics["reconnects"] += 1
                        backoff = min(1.0, backoff * 1.5)
                    else:
                        time.sleep(0.005)
                    continue
                ret, frame = self.cap.retrieve()
                if not ret or self._is_bad(frame):
                    if (now - self.last_ok_ts) > stall_limit:
                        self.metrics["stall_events"] += 1
                        try:
                            self.cap.release()
                        except Exception:
                            pass
                        time.sleep(backoff)
                        self.cap = self._open_camera(self.camera_index)
                        self.last_open_ts = time.perf_counter()
                        self.last_ok_ts = self.last_open_ts
                        self.metrics["reconnects"] += 1
                        backoff = min(1.0, backoff * 1.5)
                    else:
                        time.sleep(0.005)
                    continue
                s = int(frame.sum())
                if last_sum is not None and s == last_sum and (now - self.last_ok_ts) > stall_limit:
                    self.metrics["frozen_events"] += 1
                    try:
                        self.cap.release()
                    except Exception:
                        pass
                    time.sleep(backoff)
                    self.cap = self._open_camera(self.camera_index)
                    self.last_open_ts = time.perf_counter()
                    self.last_ok_ts = self.last_open_ts
                    continue
                last_sum = s
                with self.frame_lock:
                    self.latest_frame = frame
                self.last_ok_ts = now
                backoff = 0.25
            except Exception as e:
                self.last_error = f"Reader error: {e}"
                time.sleep(0.02)

    def get_latest_frame(self):
        with self.frame_lock:
            return None if self.latest_frame is None else self.latest_frame.copy()

    def wait_for_frame(self, timeout=5.0):
        end = time.perf_counter() + float(timeout)
        while time.perf_counter() < end:
            fr = self.get_latest_frame()
            if fr is not None:
                return True
            time.sleep(0.02)
        return False

    def _preview_loop(self):
        interval = 1.0 / float(self.preview_fps)
        while not self.preview_stop.is_set():
            frame = self.get_latest_frame()
            if frame is not None and not self._is_bad(frame):
                try:
                    ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 60])
                    if ok:
                        with self.preview_lock:
                            self.preview_jpeg = buf.tobytes()
                except Exception as e:
                    self.last_error = f"preview encode error: {e}"
            time.sleep(interval)

    def _save_opencv(self, fpath, frame):
        t0 = time.perf_counter()
        cv2.imwrite(str(fpath), frame, [cv2.IMWRITE_JPEG_QUALITY, int(self.jpeg_quality_capture)])
        t1 = time.perf_counter()
        self._write_latencies.append((t1 - t0) * 1000.0)

    def _save_turbo(self, fpath, frame):
        t0 = time.perf_counter()
        buf = _jpeg.encode(frame, quality=int(self.jpeg_quality_capture))
        with open(str(fpath), "wb") as f:
            f.write(buf)
        t1 = time.perf_counter()
        self._write_latencies.append((t1 - t0) * 1000.0)

    def _enqueue_save(self, outdir, fname, frame):
        if len(self.save_q) >= self.save_q.maxlen:
            self.save_q.popleft()
        self.save_q.append((outdir, fname, frame))
        self.metrics["save_queue_len"] = len(self.save_q)
        item = self.save_q.popleft()
        fpath = Path(item[0]) / item[1]
        if _jpeg is not None:
            self.saver_pool.submit(self._save_turbo, fpath, item[2])
        else:
            self.saver_pool.submit(self._save_opencv, fpath, item[2])

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

    def capture_image(self):
        frame = self.get_latest_frame()
        if frame is None:
            self.wait_for_frame(timeout=1.0)
            frame = self.get_latest_frame()
        if frame is None and self.cap and self.cap.isOpened():
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
            self._enqueue_save(str(outdir), fname, frame.copy())
            self.total_captures += 1
            if self.session_active and self.session_output_dir:
                self._write_manifest_entry(outdir, fname)
            return True, str(outdir / fname)
        except Exception as e:
            self.last_error = str(e)
            return False, self.last_error

    def _resolve_save_dir(self):
        return self.session_output_dir if (self.session_active and self.session_output_dir) else self.current_folder

    def get_storage_devices(self):
        devs = []
        try:
            for part in psutil.disk_partitions(all=True):
                mp = part.mountpoint
                try:
                    u = psutil.disk_usage(mp)
                except Exception:
                    continue
                if platform.system() == "Darwin" and mp in ["/", "/System", "/private/var/vm"]:
                    continue
                devs.append({
                    "device": part.device or mp,
                    "mountpoint": mp,
                    "fstype": part.fstype or "",
                    "total": u.total,
                    "used": u.used,
                    "free": u.free,
                    "percent": round(u.used/u.total*100, 1),
                    "free_gb": round(u.free/1024**3, 2),
                })
        except Exception:
            pass
        try:
            home = str(Path.home())
            u = psutil.disk_usage(home)
            devs.insert(0, {
                "device": "User Home",
                "mountpoint": home,
                "fstype": "User",
                "total": u.total,
                "used": u.used,
                "free": u.free,
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
            return True, self.current_folder
        except Exception as e:
            self.last_error = str(e)
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
        except Exception:
            pass

    def start_session(self, rate, duration_minutes=None, product_name=None):
        with self.session_lock:
            if self.session_active:
                return False, "Session already active", None
            if not (self.cap and self.cap.isOpened()):
                if not self.start_reader(self.camera_index or 0):
                    return False, "Camera not available. Please scan & connect.", None
            if not self.wait_for_frame(timeout=3.0):
                self.stop_reader()
                if not self.start_reader(self.camera_index or 0) or not self.wait_for_frame(timeout=3.0):
                    return False, "Camera connected but no frames arriving (permissions/cable/port).", None
            try:
                rate = int(rate)
            except Exception:
                rate = 24
            rate = max(1, min(300, rate))
            self.session_rate = rate
            self.session_duration_s = (duration_minutes * 60) if duration_minutes else None
            self.session_start_time = time.perf_counter()
            self.session_captures = 0
            self.session_id = datetime.now().strftime("%Y%m%d-%H%M%S")
            self.session_product_name = (product_name or "").strip()
            product_dir = None
            if self.session_product_name:
                safe = sanitize(self.session_product_name)
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
        self.session_output_dir = None
        self.session_product_name = None
        self.session_id = None
        return True, msg

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

    def _session_worker(self):
        interval = 60.0 / float(self.session_rate)
        next_t = time.perf_counter()
        while not self.session_stop.is_set():
            if self.session_duration_s and (time.perf_counter() - self.session_start_time >= self.session_duration_s):
                break
            start = time.perf_counter()
            ok, _ = self.capture_image()
            end = time.perf_counter()
            jitter = (end - start) * 1000.0
            self._capture_jitter.append(jitter)
            if ok:
                with self.session_lock:
                    self.session_captures += 1
            next_t += interval
            delay = max(0.0005, next_t - time.perf_counter())
            time.sleep(delay)
        with self.session_lock:
            self.session_active = False

    def session_status(self):
        with self.session_lock:
            elapsed = int(time.perf_counter() - (self.session_start_time or time.perf_counter())) if self.session_active else 0
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

    def compute_metrics(self):
        wr = list(self._write_latencies)
        jr = list(self._capture_jitter)
        if wr:
            avg = sum(wr)/len(wr)
            p95 = sorted(wr)[int(0.95*len(wr))-1]
            self.metrics["avg_write_ms"] = round(avg, 2)
            self.metrics["p95_write_ms"] = round(p95, 2)
        if jr:
            avg = sum(jr)/len(jr)
            p95 = sorted(jr)[int(0.95*len(jr))-1]
            self.metrics["capture_jitter_ms_avg"] = round(avg, 2)
            self.metrics["capture_jitter_ms_p95"] = round(p95, 2)
        age = round(time.perf_counter() - self.last_ok_ts, 3) if self.last_ok_ts else None
        return {
            "connected": bool(self.cap and self.cap.isOpened()),
            "index": self.camera_index,
            "width": int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH)) if (self.cap and self.cap.isOpened()) else 0,
            "height": int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) if (self.cap and self.cap.isOpened()) else 0,
            "fps": int(self.cap.get(cv2.CAP_PROP_FPS)) if (self.cap and self.cap.isOpened()) else 0,
            "last_ok_age_s": age,
            "save_queue_len": len(self.save_q),
            "preview_fps": self.preview_fps,
            "last_error": self.last_error,
            "metrics": self.metrics,
        }

system = FastCaptureSystem()

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
        <div>Avg write ms:</div><div id="d_wavg">-</div>
        <div>P95 write ms:</div><div id="d_wp95">-</div>
        <div>Jitter avg ms:</div><div id="d_javg">-</div>
        <div>Jitter p95 ms:</div><div id="d_jp95">-</div>
        <div>Reconnects:</div><div id="d_reco">-</div>
      </div>
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
  <script src="/static/app.js"></script>
  </body></html>
  """

@app.route("/")
def index():
    return HTML

SIMPLE_HTML = """<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"/><title>360° Product Capture (Simple)</title></head><body style=\"background:#0f172a;color:#e5e7eb;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial\">
<div style=\"max-width:800px;margin:0 auto;padding:16px\">
<h2>📸 360° Product Capture (Simple)</h2>
<div><span id=\"camBadge\">Camera: disconnected</span></div>
<div style=\"margin:8px 0\">
  <button onclick=\"scan()\">Scan Cameras</button>
  <select id=\"camSelect\"></select>
  <button onclick=\"connectCam()\">Connect</button>
</div>
<div style=\"margin:8px 0\">
  <button onclick=\"refreshDiag()\">Refresh Diagnostics</button>
  <div id=\"diag\"></div>
</div>
<div style=\"margin:8px 0\">
  <img id=\"preview\" src=\"/video_feed\" style=\"max-width:100%\"/>
</div>
<script src=\"/static/app.js\"></script>
</div></body></html>"""

@app.route("/simple")
def simple_index():
    return SIMPLE_HTML

@app.route("/video_feed")
def video_feed():
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
                else:
                    yield boundary + system.tiny_jpeg + b"\r\n"
                time.sleep(1.0 / max(1, system.preview_fps))
        except GeneratorExit:
            pass
        except Exception:
            pass
        finally:
            system.preview_clients = max(0, system.preview_clients - 1)
            gc.collect()
    return Response(gen(), mimetype="multipart/x-mixed-replace; boundary=frame")

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
            try:
                system.cap.release()
            except Exception:
                pass
        time.sleep(0.2)
        system.cap = system._open_camera(idx)
        system.last_open_ts = time.perf_counter()
        system.last_ok_ts = system.last_open_ts
        ok = bool(system.cap and system.cap.isOpened())
        return jsonify({"success": ok, "message": "OK" if ok else "Failed to reopen"})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)})

@app.route("/api/camera/health")
def api_camera_health():
    try:
        return jsonify(system.compute_metrics())
    except Exception as e:
        return jsonify({"connected": False, "error": str(e)})

@app.route("/api/capture", methods=["POST"])
def api_capture():
    ok, msg = system.capture_image()
    return jsonify({"success": ok, "message": msg})

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
        "session_time": int((time.perf_counter() - system.session_start_time)) if system.session_start_time else 0,
        "last_error": system.last_error
    })

APP_JS = """ (function(){ console.log('app.js loaded successfully'); 
var currentPath='';
function jget(u,cb){fetch(u).then(function(r){return r.json()}).then(cb).catch(function(e){console.error(e)})}
function jpost(u,b,cb){fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b||{})}).then(function(r){return r.json()}).then(cb).catch(function(e){console.error(e)})}
function init(){loadStorage(function(){statusTick(function(){setInterval(function(){statusTick()},1500);setInterval(function(){sessionTick()},500);setInterval(function(){refreshDiag()},2000)})})}
function statusTick(cb){jget('/api/status',function(s){var badge=document.getElementById('camBadge');if(badge){badge.textContent=s.camera_connected?'Camera: connected':'Camera: disconnected'}var le=document.getElementById('lastErr');if(le){le.textContent=s.last_error||'-'}if(!currentPath&&s.current_folder){currentPath=s.current_folder;loadFolder(currentPath)}if(cb)cb()})}
function scan(){jget('/api/camera/scan',function(r){var sel=document.getElementById('camSelect');if(!sel) return;sel.innerHTML='';if(r.success&&r.cameras&&r.cameras.length){for(var i=0;i<r.cameras.length;i++){var c=r.cameras[i];var o=document.createElement('option');o.value=c.index;o.textContent=c.name;sel.appendChild(o)}sel.selectedIndex=0}else{var o=document.createElement('option');o.value='';o.textContent='No cameras found';sel.appendChild(o)}})} console.log('scan function defined');
function connectCam(){var val=(document.getElementById('camSelect')||{}).value||0;jpost('/api/camera/init',{camera_index:parseInt(val)},function(r){alert(r.message||(r.success?'Connected':'Failed'));statusTick()})}
function hardReset(){jpost('/api/camera/hard_reset',{},function(r){alert(r.success?'Camera hard reset OK':('Reset failed: '+(r.message||'')));statusTick();refreshDiag()})}
function capture(){jpost('/api/capture',{},function(r){alert(r.success?('Captured:\n'+r.message):('Failed:\n'+r.message));loadFolder(currentPath)})}
function loadStorage(cb){jget('/api/storage',function(list){var sel=document.getElementById('storageSelect');if(!sel) return;sel.innerHTML='';for(var i=0;i<list.length;i++){var d=list[i];var o=document.createElement('option');o.value=d.mountpoint;o.textContent=d.device+' ('+d.free_gb+' GB free) - '+d.mountpoint;sel.appendChild(o)}if(cb)cb()})}
function selectStorage(){var mp=(document.getElementById('storageSelect')||{}).value;if(!mp) return;jpost('/api/storage/select',{path:mp},function(r){if(r.success){currentPath=r.path;var cp=document.getElementById('currentPath');if(cp) cp.value=currentPath;loadFolder(currentPath)}else alert('Failed: '+r.message)})}
function useManual(){var p=(document.getElementById('manualPath')||{}).value||'';p=p.trim();if(!p) return;jpost('/api/storage/select',{path:p},function(r){if(r.success){currentPath=r.path;var cp=document.getElementById('currentPath');if(cp) cp.value=currentPath;loadFolder(currentPath)}else alert('Failed: '+r.message)})}
function setToCurrent(){var p=(document.getElementById('currentPath')||{}).value||'';p=p.trim();if(!p) return;jpost('/api/storage/select',{path:p},function(r){if(r.success){currentPath=r.path;loadFolder(currentPath)}else alert('Failed: '+r.message)})}
function loadFolder(path){jget('/api/folder?path='+encodeURIComponent(path||currentPath||''),function(r){currentPath=r.path||currentPath;var cp=document.getElementById('currentPath');if(cp) cp.value=currentPath;var box=document.getElementById('browser');if(!box) return;box.innerHTML='';if(r.parent){var up=document.createElement('div');up.className='item';up.innerHTML='<span class="up">⬆️ .. (Up)</span>';up.onclick=function(){loadFolder(r.parent)};box.appendChild(up)}if(r.contents&&r.contents.length){for(var i=0;i<r.contents.length;i++){var it=r.contents[i];var div=document.createElement('div');div.className='item';div.innerHTML='<span>'+(it.is_dir?'📁':'🖼️')+'</span><span>'+it.name+'</span><span class="small">'+(it.is_dir?'Folder':(Math.round(it.size/1024)+' KB'))+'</span>';if(it.is_dir){(function(p){div.onclick=function(){loadFolder(p)}})(it.path)}box.appendChild(div)}}else{var pe=document.createElement('div');pe.className='item';pe.textContent='(empty)';box.appendChild(pe)}})}
function start(){var rate=parseInt((document.getElementById('rate')||{}).value||'0');var durv=(document.getElementById('dur')||{}).value||'';var product=(document.getElementById('productName')||{}).value||'';product=product.trim();jget('/api/status',function(status){if(!status.camera_connected){var sel=document.getElementById('camSelect');var idx=sel&&sel.value?parseInt(sel.value):0;jpost('/api/camera/reconnect',{camera_index:idx},function(rec){if(!rec.success){alert('Camera reconnect failed. Please Scan → Connect first.');return} doStart(rate,durv,product)})}else{doStart(rate,durv,product)}})}
function doStart(rate,durv,product){var payload={rate:rate};if(durv) payload.duration=parseInt(durv);if(product) payload.product_name=product;jpost('/api/session/start',payload,function(r){if(r.success){var sb=document.getElementById('startBtn');var xb=document.getElementById('stopBtn');if(sb) sb.disabled=true;if(xb) xb.disabled=false;if(r.product_dir){currentPath=r.product_dir;var cp=document.getElementById('currentPath');if(cp) cp.value=currentPath;loadFolder(currentPath);alert('Saving to:\n'+r.product_dir)}}else{alert('Failed to start: '+(r.message||''));return}sessionTick()})}
function stop(){jpost('/api/session/stop',{},function(r){var sb=document.getElementById('startBtn');var xb=document.getElementById('stopBtn');if(sb) sb.disabled=false;if(xb) xb.disabled=true;alert(r.message||'Stopped');sessionTick();loadFolder(currentPath)})}
function sessionTick(){jget('/api/session/status',function(s){var st=document.getElementById('sessState');if(st) st.textContent=s.active?'Active':'Inactive';var ic=document.getElementById('imgCount');if(ic) ic.textContent=s.captures||0;var rt=document.getElementById('rateTxt');if(rt) rt.textContent=s.rate||0;var et=document.getElementById('elapsedTxt');if(et) et.textContent=(s.elapsed!=null)?(s.elapsed+'s'):'0s';var targetWrap=document.getElementById('imgTargetWrap');var imgTarget=document.getElementById('imgTarget');var remRow=document.getElementById('remRow');var remainTxt=document.getElementById('remainTxt');var progWrap=document.getElementById('progWrap');var progBar=document.getElementById('progBar');if(s.expected_total!=null){if(targetWrap) targetWrap.style.display='inline';if(imgTarget) imgTarget.textContent=s.expected_total;if(remRow) remRow.style.display='block';if(remainTxt){remainTxt.style.display='block';remainTxt.textContent=(s.remaining!=null)?(s.remaining+'s'):'0s'}if(progWrap) progWrap.style.display='block';var pct=(s.percent!=null)?s.percent:0;if(progBar) progBar.style.width=pct+'%'}else{if(targetWrap) targetWrap.style.display='none';if(remRow) remRow.style.display='none';if(remainTxt) remainTxt.style.display='none';if(progWrap) progWrap.style.display='none';if(progBar) progBar.style.width='0%'}})}
function refreshDiag(){jget('/api/camera/health',function(d){var dc=document.getElementById('d_connected');if(dc) dc.textContent=d.connected;var di=document.getElementById('d_index');if(di) di.textContent=(d.index!=null)?d.index:'-';var dw=document.getElementById('d_wh');if(dw) dw.textContent=(d.width||'-')+' x '+(d.height||'-');var df=document.getElementById('d_fps');if(df) df.textContent=(d.fps!=null)?d.fps:'-';var da=document.getElementById('d_age');if(da) da.textContent=(d.last_ok_age_s!=null)?(d.last_ok_age_s+'s'):'-';var dq=document.getElementById('d_q');if(dq) dq.textContent=(d.save_queue_len!=null)?d.save_queue_len:'-';var dp=document.getElementById('d_pfps');if(dp) dp.textContent=(d.preview_fps!=null)?d.preview_fps:'-';var le=document.getElementById('lastErr');if(d.last_error&&le) le.textContent=d.last_error;var m=d.metrics||{};var wavg=document.getElementById('d_wavg');if(wavg) wavg.textContent=(m.avg_write_ms!=null)?m.avg_write_ms:'-';var wp95=document.getElementById('d_wp95');if(wp95) wp95.textContent=(m.p95_write_ms!=null)?m.p95_write_ms:'-';var javg=document.getElementById('d_javg');if(javg) javg.textContent=(m.capture_jitter_ms_avg!=null)?m.capture_jitter_ms_avg:'-';var jp95=document.getElementById('d_jp95');if(jp95) jp95.textContent=(m.capture_jitter_ms_p95!=null)?m.capture_jitter_ms_p95:'-';var reco=document.getElementById('d_reco');if(reco) reco.textContent=(m.reconnects!=null)?m.reconnects:'-'})}
function mkfolder(){var base=(document.getElementById('currentPath')||{}).value||currentPath;var name=(document.getElementById('newFolder')||{}).value||'';name=name.trim();if(!name) {alert('Invalid folder name');return}jpost('/api/folder/create',{path:base,name:name},function(r){alert(r.message||'OK');loadFolder(base)})}
window.jget=jget;window.jpost=jpost;window.init=init;window.statusTick=statusTick;window.scan=scan; console.log('window.scan assigned');window.connectCam=connectCam;window.hardReset=hardReset;window.capture=capture;window.loadStorage=loadStorage;window.selectStorage=selectStorage;window.useManual=useManual;window.setToCurrent=setToCurrent;window.loadFolder=loadFolder;window.start=start;window.stop=stop;window.sessionTick=sessionTick;window.refreshDiag=refreshDiag;window.mkfolder=mkfolder;
document.addEventListener('DOMContentLoaded',function(){init()});
})();
"""

@app.route('/static/app.js')
def static_app_js():
    return Response(APP_JS, mimetype='application/javascript')

@app.route('/favicon.ico')
def favicon():
    return Response(b'', mimetype='image/x-icon')

if __name__ == "__main__":
    logger.info("Starting Fast 360° Product Capture System…")
    app.run(host="0.0.0.0", port=5001, debug=False, threaded=True)