#!/usr/bin/env python3
"""
Stable360 (Production-Grade)
----------------------------
A long-running, crash-resistant 360° product capture service designed for
multi-hour / multi-day uptime. Key design differences vs OpenCV approach:

1) FFmpeg-managed camera ingest (no cv2.VideoCapture):
   - Uses platform-specific capture backends (avfoundation/dshow/v4l2).
   - Streams MJPEG frames to stdout with low-latency flags.
   - If frames stall, a watchdog kills & reboots FFmpeg cleanly.

2) Multi-process-like isolation via subprocess + watchdog:
   - The web/API server never holds the camera handle.
   - Automatic hard-restarts on drift, and on fixed cadence (e.g., every 30 min).

3) Lock-free latest-frame ring (single-slot) + fan-out:
   - Only the newest JPEG is kept; readers never block producers.
   - Preview endpoint serves a controlled FPS (defaults to 10) to protect CPU.

4) Async disk writer queue for captures with drop-oldest policy.
   - Prevents disk I/O hiccups from stalling the pipeline.

5) FastAPI + Uvicorn HTTP server (production-ready under gunicorn/uvicorn workers).

6) Minimal dependencies (FastAPI, uvicorn, psutil). FFmpeg must be installed.

Features:
- Live MJPEG preview (/video_feed) with client limit and backpressure
- Storage selection + lightweight folder browser
- Automated capture sessions (rate per minute, optional duration, product folder)
- Global CSV session log + per-session captures.csv + session_meta.json
- Health endpoint exposing stall timers, queue length, ffmpeg PID/state
- Camera scanning helpers for macOS (avfoundation) and Windows (dshow)

Run:
  python stable360_production.py --port 5001

Recommended production run (Linux example):
  pip install fastapi uvicorn[standard] psutil
  # Make sure ffmpeg is installed
  uvicorn stable360_production:app --host 0.0.0.0 --port 5001 --workers 1 --timeout-keep-alive 30

NOTE: Set the camera input in config (CAM_INPUT) or via /api/camera/init.
- macOS example: CAM_INPUT = 'avfoundation:0'   # default audio off; video device 0
- Windows example: CAM_INPUT = 'dshow:video=USB2.0 HD UVC WebCam'
- Linux example:   CAM_INPUT = 'v4l2:/dev/video0'

"""
import os, sys, re, time, json, csv, threading, signal, atexit, subprocess, queue, platform, argparse
from pathlib import Path
from datetime import datetime
from typing import Optional, Tuple, List

import psutil
from fastapi import FastAPI, Response, Request
from fastapi.responses import JSONResponse, PlainTextResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import StreamingResponse

# -------------------- Config --------------------
APP_HOME = Path.home() / ".360photo"
LOG_DIR = APP_HOME / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)
PRODUCT_LOG_CSV = LOG_DIR / "product_log.csv"
DEFAULT_CAPTURE_ROOT = Path.home() / "360Photo" / "captures"
DEFAULT_CAPTURE_ROOT.mkdir(parents=True, exist_ok=True)

# Camera ingest defaults
PREVIEW_FPS = 10  # fan-out preview FPS
MAX_PREVIEW_CLIENTS = 6
HARD_RESTART_SECONDS = 1800  # 30 minutes cadence restart of FFmpeg
STALL_SECS = 3.0             # if no frame for this long -> restart FFmpeg

# Initial camera input (can be overridden via API)
# macOS:   'avfoundation:0' (list with ffmpeg -f avfoundation -list_devices true -i "")
# Windows: 'dshow:video=YOUR DEVICE NAME'
# Linux:   'v4l2:/dev/video0'
CAM_INPUT = None  # autodetect or set via API

# Suggested FFmpeg options per backend
FFMPEG_COMMON = [
    "-loglevel", "error",
    "-fflags", "nobuffer",
    "-an",
    "-r", "30",                # match common camera FPS on macOS
    "-vf", "scale=1280:-2",    # consistent preview size
    "-q:v", "5",               # MJPEG quality (lower is better)
    "-pix_fmt", "yuvj422p",    # ensure encoder-friendly JPEG pixel format
    "-vcodec", "mjpeg",         # explicitly encode MJPEG
    "-f", "image2pipe", "-"    # write JPEG frames to stdout via image2pipe
]

# -------------------- Utilities --------------------
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

# Ensure global log header
if not PRODUCT_LOG_CSV.exists():
    with PRODUCT_LOG_CSV.open("w", newline="") as f:
        csv.writer(f).writerow(["session_id","product","start_time","end_time","images","rate_per_min","duration_s","output_dir"])

# -------------------- FrameBuffer (single-slot latest) --------------------
class LatestJPEG:
    def __init__(self):
        self._lock = threading.Lock()
        self._buf: Optional[bytes] = None
        self._ts: float = 0.0

    def update(self, jpg: bytes):
        with self._lock:
            self._buf = jpg
            self._ts = time.time()

    def get(self) -> Tuple[Optional[bytes], float]:
        with self._lock:
            return (self._buf, self._ts)

latest = LatestJPEG()

# -------------------- FFmpeg Camera Worker --------------------
class FFmpegWorker:
    def __init__(self):
        self.proc: Optional[subprocess.Popen] = None
        self.thread: Optional[threading.Thread] = None
        self.stop_evt = threading.Event()
        self.last_frame_ts = 0.0
        self.last_boot_ts = 0.0
        self.input_spec = CAM_INPUT  # set later
        self.preview_clients = 0

    def build_cmd(self, input_spec: str) -> List[str]:
        system = platform.system()
        if input_spec is None:
            # Try to guess a sensible default
            if system == "Darwin":
                input_spec = "avfoundation:0"
            elif system == "Windows":
                input_spec = "dshow:video=0"  # may be replaced via API
            else:
                input_spec = "v4l2:/dev/video0"

        if ":" not in input_spec:
            raise ValueError("input_spec must look like 'avfoundation:0', 'v4l2:/dev/video0', or 'dshow:video=NAME'")

        backend, dev = input_spec.split(":", 1)
        cmd = ["ffmpeg", "-hide_banner"]
        if backend == "avfoundation":
            # Use avfoundation with a commonly supported pixel format (nv12) on macOS
            cmd += [
                "-f", "avfoundation",
                "-pixel_format", "nv12",
                "-framerate", "30",
                "-video_size", "1280x720",
                "-i", dev,
            ]
        elif backend == "dshow":
            cmd += ["-f", "dshow", "-i", dev]
        elif backend == "v4l2":
            cmd += ["-f", "v4l2", "-framerate", "25", "-thread_queue_size", "64", "-i", dev]
        else:
            raise ValueError(f"Unsupported backend: {backend}")
        cmd += FFMPEG_COMMON
        return cmd

    def start(self, input_spec: Optional[str] = None):
        if input_spec:
            self.input_spec = input_spec
        cmd = self.build_cmd(self.input_spec)
        self.stop()
        self.stop_evt.clear()
        self.proc = subprocess.Popen(
            cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, bufsize=0
        )
        self.last_boot_ts = time.time()
        self.thread = threading.Thread(target=self._reader, name="FFmpegReader", daemon=True)
        self.thread.start()

        # Separate thread to consume stderr (avoid blocking)
        threading.Thread(target=self._drain_stderr, name="FFmpegErr", daemon=True).start()

    def _drain_stderr(self):
        if not self.proc or not self.proc.stderr:
            return
        log_path = LOG_DIR / "ffmpeg_preview.log"
        try:
            with log_path.open("ab") as lf:
                lf.write(f"\n--- ffmpeg stderr (pid={self.proc.pid}) ---\n".encode())
                for _line in iter(self.proc.stderr.readline, b""):
                    try:
                        lf.write(_line)
                    except Exception:
                        # Best-effort logging; ignore write errors
                        pass
        except Exception:
            # If logging fails, silently continue
            pass

    def _reader(self):
        # Parse concatenated MJPEG stream by scanning JPEG SOI/EOI markers
        # Restart on stalls or periodic cadence
        data = b""
        SOI = b"\xff\xd8"
        EOI = b"\xff\xd9"
        while not self.stop_evt.is_set():
            try:
                # Periodic restart (hard restart cadence)
                if (time.time() - self.last_boot_ts) > HARD_RESTART_SECONDS:
                    self.restart("periodic")
                    data = b""

                if not self.proc or not self.proc.stdout:
                    time.sleep(0.05)
                    continue

                chunk = self.proc.stdout.read(4096)
                if not chunk:
                    # If process died, restart
                    r = self.proc.poll() if self.proc else None
                    if r is not None:
                        self.restart(f"proc_exit_{r}")
                        data = b""
                        continue
                    # No data but process alive: mild wait
                    time.sleep(0.005)
                    continue

                data += chunk
                # Scan for complete JPEG
                while True:
                    i = data.find(SOI)
                    if i < 0:
                        data = data[-1_000:]  # keep tail to catch split SOI
                        break
                    j = data.find(EOI, i+2)
                    if j < 0:
                        # not complete yet; keep tail from SOI onwards
                        data = data[i:]
                        break
                    frame = data[i:j+2]
                    data = data[j+2:]
                    if frame:
                        latest.update(frame)
                        self.last_frame_ts = time.time()
                        break  # throttle to one frame per outer chunk

                # Stall detection
                if self.last_frame_ts and (time.time() - self.last_frame_ts) > STALL_SECS:
                    self.restart("stall")
                    data = b""
            except Exception:
                self.restart("exception")
                data = b""

    def restart(self, reason: str):
        try:
            self.stop_internal()
        finally:
            try:
                self.start(self.input_spec)
            except Exception:
                time.sleep(0.5)
                # Try once more minimal delay
                try:
                    self.start(self.input_spec)
                except Exception:
                    pass

    def stop_internal(self):
        if self.proc:
            try:
                self.proc.kill()
            except Exception:
                pass
        self.proc = None
        self.last_boot_ts = time.time()

    def stop(self):
        self.stop_evt.set()
        if self.proc:
            try: self.proc.kill()
            except Exception: pass
        self.proc = None

camera = FFmpegWorker()

# -------------------- Async Saver --------------------
class DiskSaver:
    def __init__(self):
        self.q: "queue.Queue[Tuple[str,str,bytes]]" = queue.Queue(maxsize=1000)
        self.stop_evt = threading.Event()
        self.t = threading.Thread(target=self._run, name="DiskSaver", daemon=True)
        self.t.start()

    def enqueue(self, outdir: str, fname: str, jpg: bytes):
        try:
            self.q.put_nowait((outdir, fname, jpg))
        except queue.Full:
            # drop-oldest: drain one and push
            try:
                self.q.get_nowait()
            except Exception:
                pass
            try:
                self.q.put_nowait((outdir, fname, jpg))
            except Exception:
                pass

    def _run(self):
        while not self.stop_evt.is_set():
            try:
                outdir, fname, jpg = self.q.get(timeout=0.1)
            except queue.Empty:
                continue
            try:
                p = Path(outdir)
                p.mkdir(parents=True, exist_ok=True)
                with open(p / fname, "wb") as f:
                    f.write(jpg)
            except Exception:
                pass

saver = DiskSaver()

# -------------------- Session Manager --------------------
class Session:
    def __init__(self):
        self.active = False
        self.rate_per_min = 24
        self.duration_s: Optional[int] = None
        self.start_ts: Optional[float] = None
        self.captures = 0
        self.product_name: Optional[str] = None
        self.session_id: Optional[str] = None
        self.output_dir: Optional[str] = None
        self.stop_evt = threading.Event()
        self.t: Optional[threading.Thread] = None
        self.lock = threading.Lock()

    def _write_meta(self, outdir: Path):
        meta = {
            "session_id": self.session_id,
            "product": self.product_name or "",
            "rate_per_min": self.rate_per_min,
            "start_time_iso": iso_now(),
            "duration_seconds": self.duration_s,
            "created_at": ts_now(),
        }
        (outdir / "session_meta.json").write_text(json.dumps(meta, indent=2))

    def _append_global_log(self, end_iso: str):
        try:
            with PRODUCT_LOG_CSV.open("a", newline="") as f:
                csv.writer(f).writerow([
                    self.session_id or "",
                    self.product_name or "",
                    datetime.fromtimestamp(self.start_ts).isoformat(timespec="seconds") if self.start_ts else "",
                    end_iso,
                    self.captures,
                    self.rate_per_min,
                    self.duration_s or "",
                    self.output_dir or DEFAULT_CAPTURE_ROOT
                ])
        except Exception:
            pass

    def start(self, rate: int, duration_min: Optional[int], product: Optional[str]):
        with self.lock:
            if self.active:
                return False, "Session already active", None

            self.rate_per_min = max(1, min(300, int(rate or 24)))
            self.duration_s = (int(duration_min) * 60) if duration_min else None
            self.start_ts = time.time()
            self.captures = 0
            self.product_name = (product or "").strip()
            self.session_id = datetime.now().strftime("%Y%m%d-%H%M%S")

            if self.product_name:
                safe = sanitize(self.product_name)
                out = Path(DEFAULT_CAPTURE_ROOT) / safe
                if out.exists():
                    stamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
                    out = Path(DEFAULT_CAPTURE_ROOT) / f"{safe}_{stamp}"
                out.mkdir(parents=True, exist_ok=True)
                self.output_dir = str(out)
                self._write_meta(out)
            else:
                self.output_dir = str(DEFAULT_CAPTURE_ROOT)

            self.stop_evt.clear()
            self.active = True
            self.t = threading.Thread(target=self._run, name="SessionWorker", daemon=True)
            self.t.start()
            return True, f"Session started at {self.rate_per_min}/min", (self.output_dir if self.product_name else None)

    def _run(self):
        interval = 60.0 / float(self.rate_per_min)
        next_t = time.time()
        while not self.stop_evt.is_set():
            if self.duration_s and (time.time() - self.start_ts >= self.duration_s):
                break
            jpg, _ = latest.get()
            if jpg:
                ts_str = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]
                fname = f"capture_{self.captures:06d}_{ts_str}.jpg"
                saver.enqueue(self.output_dir, fname, jpg)
                self.captures += 1
            next_t += interval
            time.sleep(max(0.001, next_t - time.time()))
        self.active = False
        self._append_global_log(iso_now())

    def stop(self):
        with self.lock:
            if not self.active:
                return False, "No active session"
            self.stop_evt.set()
            if self.t and self.t.is_alive():
                self.t.join(timeout=2)
            self.active = False
            msg = f"Session stopped. Captured {self.captures} images."
            return True, msg

    def status(self):
        with self.lock:
            elapsed = int(time.time() - (self.start_ts or time.time())) if self.active else 0
            expected_total = None
            remaining = None
            percent = None
            if self.duration_s:
                remaining = max(0, int(self.duration_s - elapsed)) if self.active else 0
                expected_total = int((self.duration_s / 60.0) * self.rate_per_min)
                if expected_total > 0:
                    percent = min(100, int((self.captures / expected_total) * 100))
            return {
                "active": self.active,
                "captures": self.captures,
                "elapsed": elapsed,
                "rate": self.rate_per_min,
                "duration": self.duration_s,
                "remaining": remaining,
                "expected_total": expected_total,
                "percent": percent,
                "session_output_dir": self.output_dir,
            }

session = Session()

# -------------------- API Server --------------------
app = FastAPI(title="Stable360", version="1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

# Graceful shutdown
@app.on_event("shutdown")
def _shutdown():
    try:
        session.stop()
    except Exception:
        pass
    try:
        camera.stop()
    except Exception:
        pass

# ------------ Helpers ------------
def scan_avfoundation() -> List[str]:
    # macOS: ffmpeg -f avfoundation -list_devices true -i ""
    try:
        p = subprocess.run(["ffmpeg", "-f", "avfoundation", "-list_devices", "true", "-i", ""], capture_output=True, text=True)
        out = p.stderr.splitlines()
        in_video = False
        devices: List[str] = []
        for line in out:
            if "AVFoundation video devices" in line:
                in_video = True
                continue
            if "AVFoundation audio devices" in line:
                in_video = False
                continue
            if in_video:
                m = re.search(r"\[(\d+)\]\s+(.*)", line)
                if m:
                    idx, name = m.group(1), m.group(2)
                    # Exclude screen capture pseudo devices
                    if "Capture screen" in name:
                        continue
                    devices.append(f"{idx}: {name}")
        return devices
    except Exception:
        return []

def scan_dshow() -> List[str]:
    try:
        p = subprocess.run(["ffmpeg", "-list_devices", "true", "-f", "dshow", "-i", "dummy"], capture_output=True, text=True)
        out = p.stderr
        devs = re.findall(r"\"([^\"]+)\"\s*\(video\)", out)
        return devs
    except Exception:
        return []

# ------------ Routes ------------
@app.get("/api/camera/scan")
def api_camera_scan():
    system = platform.system()
    if system == "Darwin":
        return {"success": True, "backend": "avfoundation", "devices": scan_avfoundation()}
    elif system == "Windows":
        return {"success": True, "backend": "dshow", "devices": scan_dshow()}
    else:
        # Linux: list /dev/video*
        devs = sorted([p.name for p in Path("/dev").glob("video*")]) if Path("/dev").exists() else []
        return {"success": True, "backend": "v4l2", "devices": devs}

@app.post("/api/camera/init")
async def api_camera_init(req: Request):
    body = await req.json()
    backend = body.get("backend")
    device = body.get("device")  # e.g., "0" for avfoundation, "video=NAME" for dshow, "/dev/video0" for v4l2
    if not backend or not device:
        return JSONResponse({"success": False, "message": "backend and device required"}, status_code=400)
    if backend == "avfoundation":
        input_spec = f"avfoundation:{device}"
    elif backend == "dshow":
        input_spec = f"dshow:{device if device.startswith('video=') else 'video='+device}"
    elif backend == "v4l2":
        input_spec = f"v4l2:{device if device.startswith('/dev/') else '/dev/'+device}"
    else:
        return JSONResponse({"success": False, "message": f"Unsupported backend {backend}"}, status_code=400)

    try:
        camera.start(input_spec)
        return {"success": True, "message": "Camera started", "input": input_spec}
    except Exception as e:
        return {"success": False, "message": str(e)}

@app.post("/api/camera/hard_reset")
def api_camera_hard_reset():
    try:
        camera.restart("manual")
        return {"success": True}
    except Exception as e:
        return {"success": False, "message": str(e)}

@app.get("/api/camera/health")
def api_camera_health():
    jpg, ts = latest.get()
    age = None if ts == 0 else round(time.time() - ts, 3)
    pid = camera.proc.pid if camera.proc else None
    return {
        "backend_input": camera.input_spec,
        "ffmpeg_pid": pid,
        "last_frame_age_s": age,
        "hard_restart_s": HARD_RESTART_SECONDS,
        "stall_s": STALL_SECS,
        "preview_clients": camera.preview_clients,
        "queue_size": saver.q.qsize(),
    }

# Live preview (multipart MJPEG)
@app.get("/video_feed")
async def video_feed():
    if camera.preview_clients >= MAX_PREVIEW_CLIENTS:
        return PlainTextResponse("Too many preview clients", status_code=429)

    boundary = b"--frame"

    def gen():
        camera.preview_clients += 1
        try:
            while True:
                jpg, ts = latest.get()
                if not jpg:
                    time.sleep(0.02)
                    continue
                yield boundary + b"\r\n" + b"Content-Type: image/jpeg\r\n\r\n" + jpg + b"\r\n"
                time.sleep(1.0 / PREVIEW_FPS)
        except GeneratorExit:
            pass
        except Exception:
            pass
        finally:
            camera.preview_clients = max(0, camera.preview_clients - 1)

    return StreamingResponse(gen(), media_type="multipart/x-mixed-replace; boundary=frame")

# Capture now (single)
@app.post("/api/capture")
async def api_capture():
    jpg, _ = latest.get()
    if not jpg:
        return {"success": False, "message": "No frame available"}
    ts_str = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]
    fname = f"capture_{ts_str}.jpg"
    outdir = str(DEFAULT_CAPTURE_ROOT)
    saver.enqueue(outdir, fname, jpg)
    return {"success": True, "message": str(Path(outdir)/fname)}

# Storage listing
@app.get("/api/storage")
def api_storage():
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
    # Always include home
    try:
        home = str(Path.home())
        u = psutil.disk_usage(home)
        devs.insert(0, {
            "device": "User Home","mountpoint": home,"fstype": "User",
            "total": u.total,"used": u.used,"free": u.free,
            "percent": round(u.used/u.total*100, 1),"free_gb": round(u.free/1024**3, 2),
        })
    except Exception:
        pass
    # de-dup
    uniq = {d["mountpoint"]: d for d in devs}
    out = list(uniq.values())
    out.sort(key=lambda x: (-x["free"], x["mountpoint"]))
    return out

@app.post("/api/storage/select")
async def api_storage_select(req: Request):
    body = await req.json()
    path = body.get("path") or body.get("mountpoint")
    if not path:
        return JSONResponse({"success": False, "message": "No path provided"}, status_code=400)
    try:
        p = Path(path).expanduser().resolve()
        p.mkdir(parents=True, exist_ok=True)
        global DEFAULT_CAPTURE_ROOT
        DEFAULT_CAPTURE_ROOT = p
        return {"success": True, "path": str(p)}
    except Exception as e:
        return {"success": False, "message": str(e)}

@app.get("/api/folder")
def api_folder(path: Optional[str] = None):
    base = Path(path or DEFAULT_CAPTURE_ROOT).expanduser().resolve()
    if not base.exists():
        return {"path": str(base), "parent": None, "contents": []}
    parent = str(base.parent) if base != base.parent else None
    rows = []
    for item in sorted(base.iterdir(), key=lambda q: (not q.is_dir(), q.name.lower())):
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
    return {"path": str(base), "parent": parent, "contents": rows}

@app.post("/api/folder/create")
async def api_folder_create(req: Request):
    body = await req.json()
    base = body.get("path", str(DEFAULT_CAPTURE_ROOT))
    name = (body.get("name") or "").strip()
    if not name:
        return {"success": False, "message": "Invalid folder name"}
    try:
        p = Path(base).expanduser().resolve() / name
        p.mkdir(parents=True, exist_ok=True)
        return {"success": True, "message": str(p)}
    except Exception as e:
        return {"success": False, "message": str(e)}

# Sessions
@app.post("/api/session/start")
async def api_session_start(req: Request):
    body = await req.json()
    rate = body.get("rate", 24)
    duration = body.get("duration")
    product = body.get("product_name")
    ok, msg, prod_dir = session.start(rate, duration, product)
    return {"success": ok, "message": msg, "product_dir": prod_dir}

@app.post("/api/session/stop")
async def api_session_stop():
    ok, msg = session.stop()
    return {"success": ok, "message": msg}

@app.get("/api/session/status")
async def api_session_status():
    return session.status()

@app.get("/api/status")
async def api_status():
    jpg, ts = latest.get()
    age = None if ts == 0 else round(time.time() - ts, 3)
    return {
        "camera_running": camera.proc is not None,
        "last_frame_age": age,
        "capture_root": str(DEFAULT_CAPTURE_ROOT),
        "queue_size": saver.q.qsize(),
        "last_boot_age": round(time.time() - camera.last_boot_ts, 3) if camera.last_boot_ts else None,
    }

# -------------------- Minimal UI (optional) --------------------
INDEX_HTML = """<!doctype html>
<html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>
<title>Stable360</title>
<style>
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;background:#0f172a;color:#e5e7eb;margin:0}
.wrap{max-width:1100px;margin:0 auto;padding:16px}
.card{background:#111827;border:1px solid #1f2937;border-radius:12px;padding:16px;margin:12px 0}
.btn{display:inline-block;padding:8px 12px;border-radius:8px;border:none;cursor:pointer;font-weight:600;background:#2563eb;color:#fff;margin:4px 6px;}
select,input{padding:8px;border-radius:8px;border:1px solid #334155;background:#0b1220;color:#e5e7eb;margin:6px 0}
.preview{height:420px;background:#000;border-radius:10px;overflow:hidden}
.preview img{width:100%;height:100%;object-fit:contain}
.small{font-size:12px;color:#9ca3af}
</style></head>
<body>
<div class='wrap'>
<h2>🛡️ Stable360 (FFmpeg)</h2>
<div class='card'>
  <div>Live Preview</div>
  <div class='preview'><img id='p' src='/video_feed'></div>
  <div class='small'>Tip: keep only one preview tab open for max stability.</div>
</div>
<div class='card'>
  <h3>Camera</h3>
  <button class='btn' onclick='scan()'>Scan</button>
  <select id='backend'>
    <option value='avfoundation'>avfoundation (macOS)</option>
    <option value='dshow'>dshow (Windows)</option>
    <option value='v4l2'>v4l2 (Linux)</option>
  </select>
  <select id='device'></select>
  <button class='btn' onclick='initCam()'>Init</button>
  <button class='btn' onclick='hardReset()'>Hard Reset</button>
  <pre id='health' class='small'></pre>
</div>
<div class='card'>
  <h3>Storage & Session</h3>
  <div>
    <input id='product' placeholder='Product name (optional)'>
    <select id='rate'>
      <option value='12'>12/min</option>
      <option value='24' selected>24/min</option>
      <option value='60'>60/min</option>
      <option value='120'>120/min</option>
      <option value='180'>180/min</option>
    </select>
    <input id='dur' type='number' placeholder='Duration (minutes optional)' min='1' max='600'>
    <button class='btn' onclick='startSess()'>Start</button>
    <button class='btn' onclick='stopSess()'>Stop</button>
  </div>
  <pre id='sess' class='small'></pre>
</div>
</div>
<script>
async function jget(u){const r=await fetch(u);return r.json()}
async function jpost(u,b){const r=await fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b||{})});return r.json()}
async function scan(){
  const r = await jget('/api/camera/scan');
  document.getElementById('backend').value = r.backend;
  const sel = document.getElementById('device'); sel.innerHTML='';
  const list = Array.isArray(r.devices) ? r.devices : [];
  if (list.length === 0) {
    const o = document.createElement('option'); o.value=''; o.textContent='No cameras found'; sel.appendChild(o);
  } else {
    list.forEach(d=>{const o=document.createElement('option'); o.value=d; o.textContent=d; sel.appendChild(o)});
  }
}
async function initCam(){
  const b = document.getElementById('backend').value;
  let d = document.getElementById('device').value;
  if(!d){alert('Choose a device');return}
  if(b==='avfoundation'){ d = d.split(':')[0]; }
  const r = await jpost('/api/camera/init', {backend:b, device:d});
  alert(r.success?('OK: '+r.input):('Fail: '+r.message));
}
async function hardReset(){
  const r = await jpost('/api/camera/hard_reset', {}); alert(r.success?'Reset OK':('Failed: '+(r.message||'')));
}
async function poll(){
  const h = await jget('/api/camera/health');
  document.getElementById('health').textContent = JSON.stringify(h,null,2);
  const s = await jget('/api/session/status');
  document.getElementById('sess').textContent = JSON.stringify(s,null,2);
}
setInterval(poll, 1500);
window.onload = function(){ try{ scan(); poll(); }catch(e){} };
async function startSess(){
  const rate = parseInt(document.getElementById('rate').value);
  const dur = document.getElementById('dur').value? parseInt(document.getElementById('dur').value): null;
  const prod = document.getElementById('product').value.trim();
  const r = await jpost('/api/session/start', {rate:rate, duration:dur, product_name:prod});
  alert(r.success?('Started'+(r.product_dir?'\\nSaving to '+r.product_dir:'')):'Failed: '+r.message);
}
async function stopSess(){
  const r = await jpost('/api/session/stop', {}); alert(r.message||'Stopped');
}
</script>
</body></html>"""

@app.get("/")
async def index():
    return Response(INDEX_HTML, media_type="text/html")

# -------------------- CLI --------------------
if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=5001)
    parser.add_argument("--input", type=str, default=None, help="Override camera input e.g. avfoundation:0 / dshow:video=NAME / v4l2:/dev/video0")
    args = parser.parse_args()

    if args.input:
        CAM_INPUT = args.input
        camera.input_spec = CAM_INPUT

    # Start ingest immediately if an input is configured
    try:
        camera.start(CAM_INPUT)
    except Exception:
        # Will require init via UI or API
        pass

    import uvicorn
    # Run the FastAPI app defined in this module
    uvicorn.run(app, host="0.0.0.0", port=args.port, reload=False)
