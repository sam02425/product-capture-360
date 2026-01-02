#!/usr/bin/env python3
import json
import os
import sys

def check():
    info = {
        "python_version": sys.version.split()[0],
        "torch_version": None,
        "ultralytics_version": None,
        "model_files_found": []
    }

    try:
        import torch  # noqa: F401
        info["torch_version"] = torch.__version__
    except Exception as e:
        return {"ok": False, "error": f"torch import failed: {e}", "info": info}

    try:
        import ultralytics  # noqa: F401
        info["ultralytics_version"] = ultralytics.__version__
    except Exception as e:
        return {"ok": False, "error": f"ultralytics import failed: {e}", "info": info}

    # Check for local model weights (do not download)
    candidates = [
        "yolov8n.pt",
        "yolov8s.pt",
        "yolo11n.pt",
        "yolo11s.pt"
    ]
    search_dirs = [
        os.getcwd(),
        os.path.expanduser("~/.cache/ultralytics"),
        os.path.expanduser("~/.cache/torch/hub/checkpoints")
    ]
    found = []
    for d in search_dirs:
        if not os.path.isdir(d):
            continue
        for name in candidates:
            path = os.path.join(d, name)
            if os.path.exists(path):
                found.append(path)
    info["model_files_found"] = found

    return {"ok": True, "info": info}

if __name__ == "__main__":
    result = check()
    print(json.dumps(result))
