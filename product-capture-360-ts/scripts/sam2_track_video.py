#!/usr/bin/env python3
import argparse
import json
import os
import sys
import tempfile
from pathlib import Path

import cv2
import numpy as np

try:
    import torch
    from sam2.build_sam import build_sam2_video_predictor
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


def extract_frames(video_path, output_dir, frame_step):
    cap = cv2.VideoCapture(str(video_path))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    frame_idx = 0
    saved_indices = []
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        if frame_idx % frame_step == 0:
            filename = output_dir / f"{len(saved_indices):06d}.jpg"
            cv2.imwrite(str(filename), frame)
            saved_indices.append(frame_idx)
        frame_idx += 1
    cap.release()
    return total_frames, saved_indices


def main():
    parser = argparse.ArgumentParser(description='Track a single object in video using SAM2')
    parser.add_argument('--video', required=True, help='Path to video')
    parser.add_argument('--box', required=True, help='Init box as x,y,w,h')
    parser.add_argument('--checkpoint', default='checkpoints/sam2_hiera_small.pt', help='SAM2 checkpoint path')
    parser.add_argument('--config', default='sam2_hiera_s.yaml', help='SAM2 config yaml')
    parser.add_argument('--device', default='cpu', help='Device (cpu or cuda)')
    parser.add_argument('--frame-step', type=int, default=1, help='Process every Nth frame')
    parser.add_argument('--init-frame', type=int, default=0, help='Initial frame index (original video)')
    parser.add_argument('--include-masks', action='store_true', help='Include mask bitmaps in output')
    args = parser.parse_args()

    video_path = Path(args.video)
    if not video_path.exists():
        print(json.dumps({"success": False, "error": "Video not found"}))
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

    with tempfile.TemporaryDirectory(prefix='sam2_frames_') as tmp_dir:
        frames_dir = Path(tmp_dir)
        total_frames, extracted_indices = extract_frames(video_path, frames_dir, max(1, args.frame_step))

        if not extracted_indices:
            print(json.dumps({"success": False, "error": "No frames extracted"}))
            sys.exit(1)

        init_idx = args.init_frame // max(1, args.frame_step)
        init_idx = max(0, min(init_idx, len(extracted_indices) - 1))

        predictor = build_sam2_video_predictor(
            args.config,
            args.checkpoint,
            device=args.device
        )

        state = predictor.init_state(
            video_path=str(frames_dir),
            offload_video_to_cpu=True,
            offload_state_to_cpu=False
        )

        box = np.array([x1, y1, x2, y2], dtype=np.float32)
        predictor.add_new_points_or_box(
            inference_state=state,
            frame_idx=init_idx,
            obj_id=1,
            box=box
        )

        frames = []
        with torch.no_grad():
            for out_frame_idx, out_obj_ids, out_mask_logits in predictor.propagate_in_video(state):
                original_frame_idx = extracted_indices[out_frame_idx] if out_frame_idx < len(extracted_indices) else out_frame_idx
                entry = {"frame_idx": int(original_frame_idx), "bbox": None, "tracked": False}
                if len(out_obj_ids) > 0:
                    mask = (out_mask_logits[0] > 0.0).cpu().numpy()
                    bbox = mask_to_bbox(mask)
                    if bbox is not None:
                        entry["bbox"] = bbox
                        entry["tracked"] = True
                    if args.include_masks:
                        entry["mask"] = mask.astype(np.uint8).tolist()
                frames.append(entry)

        result = {
            "success": True,
            "total_frames": int(total_frames),
            "frame_step": int(max(1, args.frame_step)),
            "frames": frames
        }
        print(json.dumps(result))


if __name__ == '__main__':
    main()
