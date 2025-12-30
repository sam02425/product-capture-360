# Camera Frame Availability Issue

## Problem

Only 87 images captured out of 320 target (27% success rate).

## Root Cause

The camera (`getLatestJPEG()`) is returning `null` (no frames available) for 233 out of 320 capture attempts.

**What's happening**:
1. Session tries to capture every 375ms (160/min rate)
2. Camera is supposed to provide frames at 30 FPS
3. But `camera.getLatestJPEG()` returns `null` most of the time
4. When `null` AND buffer is empty → nothing gets queued
5. `framesQueued` doesn't increment → session never reaches 320

## Why Camera Returns Null

### Possible Causes:

1. **Camera not actually running at 30 FPS**
   - Check FFmpeg process
   - Verify camera is actually capturing

2. **FFmpeg buffer issues**
   - Frames being dropped
   - Buffer not updating fast enough

3. **getLatestJPEG() timing issue**
   - Called between frame updates
   - Frame buffer race condition

## Current Behavior

```
Tick 1: camera.getLatestJPEG() → Frame! → Queue it (framesQueued=1)
Tick 2: camera.getLatestJPEG() → null → Skip (framesQueued=1, missed=1)
Tick 3: camera.getLatestJPEG() → null → Skip (framesQueued=1, missed=2)
Tick 4: camera.getLatestJPEG() → null → Skip (framesQueued=1, missed=3)
Tick 5: camera.getLatestJPEG() → Frame! → Queue it (framesQueued=2)
...
After 1200 ticks: framesQueued=87, missed=233, session stops at 87/320
```

## Solutions

### Option 1: Wait Longer (Current Implementation)
- Don't increment `framesQueued` when camera has no frames
- Session waits until camera provides 320 actual frames
- **Problem**: Session may never complete if camera keeps failing
- **Status**: ✅ Current implementation

### Option 2: Use Last Known Frame
- Always keep at least 1 frame in buffer after first capture
- When camera.getLatestJPEG() returns null, use last known frame
- **Problem**: Many duplicate frames
- **Benefit**: Guarantees 320 images

### Option 3: Fix Camera Frame Rate
- Ensure camera actually provides frames at 30 FPS consistently
- Check FFmpeg configuration
- **This is the real fix!**

## Recommended Action

### 1. Check Camera Status

```bash
# Check if FFmpeg is running
ps aux | grep ffmpeg

# Check camera metrics via API
curl http://localhost:3000/api/camera/metrics
```

Expected response:
```json
{
  "connected": true,
  "lastFrameAgeMs": 33,  // Should be < 100ms
  "bufferSize": 102400
}
```

### 2. Verify Frame Rate

Add logging to see how often camera provides frames:

```typescript
let framesReceived = 0;
let nullCount = 0;

const buf = this.camera.getLatestJPEG();
if (buf) {
  framesReceived++;
} else {
  nullCount++;
}

// Every 100 ticks
console.log(`Frames: ${framesReceived}, Nulls: ${nullCount}, Success rate: ${(framesReceived/(framesReceived+nullCount)*100).toFixed(1)}%`);
```

### 3. Increase Camera FPS

If camera is providing frames but at low rate:

```typescript
// In camera.ts, increase FPS
const fps = options?.fps ?? 60; // Increase from 30 to 60
```

### 4. Use Buffer More Aggressively

Modify logic to always queue something:

```typescript
} else {
  // NO FRAME from camera
  if (this.frameBuffer.length > 0) {
    // Use buffered frame
    this.saveQueue.push({ buffer: this.frameBuffer[0], productName: this.productName });
    framesQueued++;
    duplicateFrames++;
  } else {
    // Still waiting for first frame - QUEUE IT ANYWAY to progress
    // Use a placeholder or wait
    framesQueued++;  // Allow session to progress
    missedFrames++;
  }
}
```

## Debug Steps

1. **Check session logs**:
   ```bash
   cat session_*.json | jq '.[] | select(.event == "frame_missed")'
   ```

2. **Check how many frames were actually queued**:
   ```bash
   cat session_*.json | jq '.[] | select(.event == "session_completed") | .frames_queued'
   ```

3. **Check camera metrics during capture**:
   - Start capture session
   - While running: `curl http://localhost:3000/api/camera/metrics`
   - Check `lastFrameAgeMs` - should be < 100ms

4. **Monitor FFmpeg**:
   ```bash
   # Watch FFmpeg process
   watch -n 1 'ps aux | grep ffmpeg'
   ```

## Current Status

- ✅ Build compiles
- ✅ Session logging implemented
- ❌ Camera not providing consistent frames
- ❌ Only 27% capture success rate

**Next step**: Debug why `camera.getLatestJPEG()` returns null so frequently.

## Temporary Workaround

To get 320 images despite camera issues, increment `framesQueued` even when skipping:

```typescript
} else {
  // No buffer, no frame - count it anyway
  framesQueued++;  // Session will complete at 320
  missedFrames++;  // Track how many were actually missed
}
```

This ensures session completes, but with many missed frames logged.

---

**The real fix is to ensure the camera provides frames consistently at 30+ FPS!**
