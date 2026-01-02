#!/usr/bin/env python3
import argparse
import json
import os
import sys
from pathlib import Path

import numpy as np
import cv2

try:
    import torch
    from sam2.build_sam import build_sam2
    from sam2.sam2_image_predictor import SAM2ImagePredictor
except Exception as exc:
    print(json.dumps({
        "success": False,
        "error": f"SAM2 not available: {exc}"
    }))
    sys.exit(1)


def mask_to_bbox(mask):
    if mask is None:
        return None
    if mask.ndim == 3:
        mask = mask[0]
    if mask.sum() == 0:
        return None
    rows = np.any(mask, axis=1)
    cols = np.any(mask, axis=0)
    if not rows.any() or not cols.any():
        return None
    y1, y2 = np.where(rows)[0][[0, -1]]
    x1, x2 = np.where(cols)[0][[0, -1]]
    return [int(x1), int(y1), int(x2), int(y2)]


def main():
    parser = argparse.ArgumentParser(description='Refine a bounding box using SAM2 on an image')
    parser.add_argument('--image', required=True, help='Path to image')
    parser.add_argument('--box', required=True, help='Box as x,y,w,h')
    parser.add_argument('--checkpoint', default='checkpoints/sam2_hiera_small.pt', help='SAM2 checkpoint path')
    parser.add_argument('--config', default='sam2_hiera_s.yaml', help='SAM2 config yaml')
    parser.add_argument('--device', default='cpu', help='Device (cpu or cuda)')
    args = parser.parse_args()

    image_path = Path(args.image)
    if not image_path.exists():
        print(json.dumps({"success": False, "error": "Image not found"}))
        sys.exit(1)

    if not os.path.exists(args.checkpoint):
        print(json.dumps({"success": False, "error": "SAM2 checkpoint not found"}))
        sys.exit(1)

    try:
        parts = [float(p) for p in args.box.split(',')]
        if len(parts) != 4:
            raise ValueError()
    except Exception:
        print(json.dumps({"success": False, "error": "Invalid box format"}))
        sys.exit(1)

    x, y, w, h = parts
    x1, y1, x2, y2 = x, y, x + w, y + h

    image_bgr = cv2.imread(str(image_path))
    if image_bgr is None:
        print(json.dumps({"success": False, "error": "Failed to load image"}))
        sys.exit(1)
    image_rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)

    try:
        sam2_model = build_sam2(args.config, args.checkpoint, device=args.device)
        predictor = SAM2ImagePredictor(sam2_model)
        predictor.set_image(image_rgb)

        box = np.array([x1, y1, x2, y2], dtype=np.float32)
        with torch.no_grad():
            masks, scores, _ = predictor.predict(box=box, multimask_output=False)

        if masks is None or len(masks) == 0:
            print(json.dumps({"success": False, "error": "No mask returned from SAM2"}))
            sys.exit(1)

        mask = masks[0]
        bbox_xyxy = mask_to_bbox(mask)
        if bbox_xyxy is None:
            print(json.dumps({"success": False, "error": "Failed to derive bbox from mask"}))
            sys.exit(1)

        x1, y1, x2, y2 = bbox_xyxy
        result = {
            "success": True,
            "bbox": {
                "x": float(x1),
                "y": float(y1),
                "width": float(x2 - x1),
                "height": float(y2 - y1)
            },
            "score": float(scores[0]) if scores is not None and len(scores) > 0 else None
        }
        print(json.dumps(result))
    except Exception as exc:
        print(json.dumps({"success": False, "error": str(exc)}))
        sys.exit(1)


if __name__ == '__main__':
    main()
