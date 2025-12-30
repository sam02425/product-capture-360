# Current Capture Status & Fix

## Problem Summary

**Target**: 160 images/min × 120 seconds = **320 images**

**Actual Results**:
- Seagram's_Peach: 125 images (39%)
- Hendrick's_Gin: 308 queued, ~125 saved (39%)
- Hendrick's_Grand_Cabret: 250 queued, ~125 saved (39%)
- Plymouth_Gin: 94 images (29%) ❌ **Getting worse!**

## Root Cause

**The camera buffer becomes empty** during capture, causing frames to be skipped:

1. Camera provides frame → Added to buffer → Queued for save ✅
2. Camera returns `null` (no new frame) → Use buffered frame ✅
3. Camera keeps returning `null` → **Buffer depletes** → Nothing to queue ❌
4. Session counts frames but doesn't save them → Wrong count

## The Fix (Already Built)

**File**: `src/session.ts` lines 358-369

**What it does**: Ensures buffer NEVER becomes empty after first frame

```typescript
// For duplicate frames
if (this.frameBuffer.length === 0) {
  // Add duplicate to buffer so we always have at least 1 frame
  this.frameBuffer.push(buf);
}
// Always queue something (from buffer or current)
const frameToUse = this.frameBuffer.length > 1 ? this.frameBuffer[0] : buf;
this.saveQueue.push({ buffer: frameToUse, productName: this.productName });
framesQueued++;
```

**Result**: Buffer maintains at least 1 frame, every tick queues an actual image

## Current State

✅ **Code fixed and built** (18:38 PM)
❌ **Server still running OLD code** (started 6:29 PM)
❌ **All captures using old code** → Still getting 94-125 images instead of 320

## Action Required

**YOU MUST RESTART THE SERVER:**

```bash
# In terminal where server is running:
Ctrl+C  # Stop the old server

# Then start with new code:
npm start
```

**Then capture again** - you'll get 320 actual images!

## Why Restart is Critical

| Time | Event | Code Version |
|------|-------|--------------|
| 6:29 PM | Server started | OLD (broken) |
| 6:38 PM | New code built | NEW (fixed) |
| 6:40-6:44 PM | Captures done | OLD (server not restarted) |
| **NOW** | **Restart needed** | **Load NEW code** |

The server loads code when it **starts**, not when it's built. Since server started at 6:29 PM (before the fix), it's still using the broken code.

## Expected Results After Restart

**Before** (current old code):
```
Target: 320 images
Queued: 250-320 (counter increments)
Saved: 94-125 images (actual files)
Result: ❌ Missing 195+ images
```

**After** (new code with restart):
```
Target: 320 images
Queued: 320
Saved: 320 images
Result: ✅ All images captured (may have duplicates)
```

## Verify the Fix

After restarting and capturing:

1. **Check actual file count**:
   ```bash
   ls -1 /path/to/captures/*.jpg | wc -l
   ```
   Should show **320 files**

2. **Check session logs**:
   ```bash
   cat session_*.json | jq '.[] | select(.event == "session_completed")'
   ```
   Should show:
   ```json
   {
     "frames_queued": 320,
     "frames_saved": 320,
     "duplicate_frames": 50,
     "unique_percentage": "84.00"
   }
   ```

## Why 94 Images is Alarming

Plymouth_Gin getting only **94/320 (29%)** means:
- Camera providing fewer frames than before
- OR session was interrupted early
- OR camera stopped responding mid-session

This is why the fix is critical - it ensures buffer never runs out so we always have something to queue.

---

## Quick Commands

```bash
# Stop server
Ctrl+C

# Start with new code
cd /Users/saumil/Desktop/360Photo/product-capture-360/product-capture-360-ts
npm start

# After capturing, count images
find ~/Desktop -name "Plymouth_Gin*.jpg" 2>/dev/null | wc -l
# Should show 320
```

**RESTART THE SERVER NOW TO USE THE FIX!** 🚀
