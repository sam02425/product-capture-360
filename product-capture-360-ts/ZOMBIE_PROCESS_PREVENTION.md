# Zombie Process Prevention System

## Problem

The system was accumulating zombie processes over time:
- **Node server processes**: Multiple `node dist/server.js` instances running simultaneously
- **FFmpeg camera processes**: Multiple `ffmpeg -f avfoundation` instances competing for camera access

This caused:
- Camera unable to provide fresh frames (multiple processes accessing same camera)
- High CPU usage (multiple servers processing simultaneously)
- Session start failures ("Camera not receiving frames")

## Solution: Three-Layer Defense

We've implemented **three layers of zombie process cleanup** to ensure a clean environment:

### Layer 1: Server Startup Cleanup ([server.ts:621-653](src/server.ts#L621-L653))

**When**: Every time the server starts

**What it does**:
```typescript
// Before starting server
execSync('ps aux | grep "node dist/server.js" | grep -v grep');
// Kill each old server process (except current)
process.kill(pid, 'SIGTERM');
```

**Result**: Only ONE server process runs at a time

### Layer 2: Session Start Cleanup ([session.ts:219-267](src/session.ts#L219-L267))

**When**: Before every capture session starts

**What it does**:
```typescript
// Kill zombie FFmpeg camera processes
execSync('pkill -9 -f "ffmpeg.*avfoundation"');

// Kill zombie Node server processes
const currentPid = process.pid;
// Kill all except current process
process.kill(pid, 'SIGKILL');

// Wait 500ms for cleanup
```

**Result**: Clean camera access and no competing servers

### Layer 3: Camera Stop Cleanup ([camera.ts:163-185](src/camera.ts#L163-L185))

**When**: When stopping camera or before starting new camera session

**What it does**:
```typescript
// Kill current FFmpeg instance
this.ffmpeg.kill('SIGTERM');

// Kill any zombie FFmpeg camera processes
execSync('pkill -f "ffmpeg.*avfoundation"');

// Wait 500ms for cleanup
await new Promise(resolve => setTimeout(resolve, 500));
```

**Result**: Camera is fully released and ready for next session

## Restart Script ([restart.sh](restart.sh))

Convenience script that does full cleanup manually:

```bash
./restart.sh
```

**What it does**:
1. Kills all `node dist/server.js` processes
2. Kills all `ffmpeg.*avfoundation` processes
3. Waits 1 second
4. Builds latest code
5. Starts fresh server

## When Cleanup Happens

| Event | Server Cleanup | FFmpeg Cleanup | Layer |
|-------|---------------|----------------|-------|
| `npm start` | ✅ Auto | ❌ | Layer 1 |
| Session start | ✅ Auto | ✅ Auto | Layer 2 |
| Camera stop | ❌ | ✅ Auto | Layer 3 |
| Camera start | ❌ | ✅ Auto (via stop) | Layer 3 |
| `./restart.sh` | ✅ Manual | ✅ Manual | All |

## How It Prevents Issues

### Before (Without Cleanup)
```
6:29 PM: npm start → Server PID 68163
6:38 PM: npm start → Server PID 5641 (old 68163 still running!)
Camera init → FFmpeg PID 22361
Camera init → FFmpeg PID 29065 (old 22361 still running!)
Camera init → FFmpeg PID 30161 (old ones still running!)
...
Result: 6 servers + 7 FFmpeg processes = chaos
```

### After (With Cleanup)
```
npm start:
  → Kills all old servers (Layer 1)
  → Server PID 82774 (only one!)

Session start:
  → Kills zombie FFmpeg (Layer 2)
  → Kills zombie servers (Layer 2)
  → Camera starts fresh

Camera init:
  → Stops old camera (Layer 3)
  → Kills zombie FFmpeg (Layer 3)
  → Starts new camera

Result: 1 server + 1 FFmpeg = clean environment
```

## Logging

All cleanup actions are logged:

```json
{
  "level": 30,
  "event": "zombie_cleanup",
  "msg": "Killed zombie FFmpeg processes"
}

{
  "level": 30,
  "event": "zombie_cleanup",
  "pid": 68163,
  "msg": "Killed zombie server process: 68163"
}
```

## Why This Matters

**Camera access**: Only ONE FFmpeg process can access the camera properly. Multiple processes cause:
- Null frames (camera can't provide frames)
- High frame age (old stale frames)
- Pre-flight validation failures

**Clean state**: Each session starts with:
- Fresh camera connection
- No competing processes
- Full CPU/memory resources available

## Manual Cleanup (If Needed)

If you ever need to manually clean up:

```bash
# Kill all zombie servers
pkill -f "node dist/server.js"

# Kill all zombie FFmpeg processes
pkill -9 -f "ffmpeg.*avfoundation"

# Or use the restart script
./restart.sh
```

## Summary

✅ **Layer 1**: Server startup kills old servers
✅ **Layer 2**: Session start kills zombies (FFmpeg + servers)
✅ **Layer 3**: Camera operations kill old FFmpeg processes
✅ **Restart script**: Manual full cleanup

**Result**: No more zombie processes, clean camera access, reliable sessions! 🎉
