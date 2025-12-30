# Session Logging System

## Overview

Every capture session now creates a detailed JSON log file that tracks everything that happened during the session.

## Log File Location

**Path**: `{storage_path}/session_{product_name}_{timestamp}.json`

**Example**: `/360Photo_Captures/session_whiskey_bottle_2025-01-29T14-30-25.json`

## Log File Contents

The session log is a JSON array with timestamped events:

```json
[
  {
    "timestamp": "2025-01-29T14:30:25.123Z",
    "event": "session_started",
    "product": "whiskey_bottle",
    "rate_per_minute": 160,
    "duration_seconds": 120,
    "target_images": 320,
    "interval_ms": 375,
    "storage_path": "/360Photo_Captures"
  },
  {
    "timestamp": "2025-01-29T14:30:45.456Z",
    "event": "progress",
    "frames_queued": 50,
    "frames_saved": 45,
    "pending": 5,
    "unique_frames": 48,
    "duplicate_frames": 2,
    "missed_frames": 0,
    "actual_rate": 2.67,
    "target_rate": 2.67,
    "unique_percentage": 96.0
  },
  {
    "timestamp": "2025-01-29T14:32:25.789Z",
    "event": "session_completed",
    "frames_queued": 320,
    "frames_saved": 315,
    "frames_pending": 5,
    "unique_frames": 304,
    "duplicate_frames": 16,
    "missed_frames": 0,
    "unique_percentage": "95.00",
    "actual_duration_ms": 120015,
    "queue_status": [
      { "product": "whiskey_bottle", "size": 102400 },
      { "product": "whiskey_bottle", "size": 102400 },
      { "product": "whiskey_bottle", "size": 102400 },
      { "product": "whiskey_bottle", "size": 102400 },
      { "product": "whiskey_bottle", "size": 102400 }
    ]
  }
]
```

## Event Types

### 1. `session_started`
Logged when capture session begins.

**Fields**:
- `product` - Product name
- `rate_per_minute` - Target capture rate
- `duration_seconds` - Session duration
- `target_images` - Expected number of images
- `interval_ms` - Milliseconds between captures
- `storage_path` - Where images are saved

### 2. `progress`
Logged every 50 frames during capture.

**Fields**:
- `frames_queued` - Total frames queued for saving
- `frames_saved` - Total frames saved to disk
- `pending` - Frames waiting in save queue
- `unique_frames` - Number of unique frames
- `duplicate_frames` - Number of duplicate frames used
- `missed_frames` - Number of frames that couldn't be captured
- `actual_rate` - Current capture rate (per second)
- `target_rate` - Target capture rate (per second)
- `unique_percentage` - Percentage of unique frames

### 3. `frame_missed`
Logged when camera has no frames available.

**Fields**:
- `count` - Total missed frames so far
- `queued` - Total frames queued

### 4. `waiting_for_first_frame`
Logged once at startup if camera hasn't provided first frame yet.

**Fields**:
- `missed_count` - How many ticks waited

### 5. `session_completed`
Logged when session reaches target count or is stopped.

**Fields**:
- `frames_queued` - Total frames queued
- `frames_saved` - Total frames saved
- `frames_pending` - Frames still in queue
- `unique_frames` - Number of unique frames
- `duplicate_frames` - Number of duplicates
- `missed_frames` - Total missed frames
- `unique_percentage` - Percentage unique
- `actual_duration_ms` - Actual session duration
- `queue_status` - Array showing what's still pending

## How to Use

### Check Session Results

```bash
# Find session log for a product
ls /360Photo_Captures/session_whiskey_bottle_*.json

# View entire session
cat /360Photo_Captures/session_whiskey_bottle_2025-01-29T14-30-25.json | jq .

# Check final stats
cat session_whiskey_bottle_*.json | jq '.[] | select(.event == "session_completed")'
```

### Example Output:
```json
{
  "timestamp": "2025-01-29T14:32:25.789Z",
  "event": "session_completed",
  "frames_queued": 320,
  "frames_saved": 315,
  "frames_pending": 5,
  "unique_frames": 304,
  "duplicate_frames": 16,
  "missed_frames": 0,
  "unique_percentage": "95.00",
  "actual_duration_ms": 120015
}
```

### Check for Issues

**Low capture count**:
```bash
# Check if frames were missed
cat session*.json | jq '.[] | select(.event == "frame_missed")'
```

**Low unique percentage**:
```bash
# Check duplicate rate over time
cat session*.json | jq '.[] | select(.event == "progress") | {queued: .frames_queued, unique_pct: .unique_percentage}'
```

**Session didn't complete**:
```bash
# Check last event
cat session*.json | jq '.[-1]'
```

## What the Logs Tell You

### ✅ Good Session
```json
{
  "event": "session_completed",
  "frames_queued": 320,
  "unique_percentage": "95.00",
  "missed_frames": 0
}
```
- Reached target count (320/320)
- High unique percentage (95%)
- No missed frames

### ⚠️ Camera Too Slow
```json
{
  "event": "session_completed",
  "frames_queued": 320,
  "unique_percentage": "78.00",
  "duplicate_frames": 70
}
```
- Reached target count but many duplicates (70/320 = 22%)
- **Action**: Increase camera FPS from 30 to 60

### ❌ Startup Issue
```json
[
  { "event": "session_started", ... },
  { "event": "waiting_for_first_frame", "missed_count": 1 },
  { "event": "frame_missed", "count": 50, "queued": 50 }
]
```
- Camera not providing frames at startup
- **Action**: Check camera connection, restart camera

### ⚠️ Queue Backup
```json
{
  "event": "progress",
  "frames_queued": 100,
  "frames_saved": 60,
  "pending": 40
}
```
- Queue growing faster than saves
- This is normal during capture
- **Action**: Wait for queue to drain after session

## Troubleshooting with Logs

### Problem: Session didn't reach target count

**Check**:
```bash
cat session*.json | jq '.[] | select(.event == "session_completed") | .frames_queued'
```

**If lower than target**:
1. Check for `frame_missed` events
2. Look at `missed_frames` count
3. Review progress logs to see where it stopped

### Problem: Low quality (many duplicates)

**Check**:
```bash
cat session*.json | jq '.[] | select(.event == "progress") | .unique_percentage'
```

**If consistently < 85%**:
- Camera FPS too low for capture rate
- Increase camera FPS or reduce capture rate

### Problem: Images in queue not saving

**Check final queue status**:
```bash
cat session*.json | jq '.[] | select(.event == "session_completed") | .queue_status | length'
```

**If > 0**:
- Queue is still processing (normal)
- Check disk space
- Check file permissions

## Summary

Every session creates a complete log file that shows:
- ✅ **What happened** - Session start, progress, completion
- ✅ **What went wrong** - Missed frames, duplicates
- ✅ **What's pending** - Queue status at completion

**Use these logs to**:
1. Verify session reached target count
2. Check quality (unique %)
3. Diagnose issues (missed frames, duplicates)
4. Monitor queue processing

**Session logs are your debug tool!** 🔍
