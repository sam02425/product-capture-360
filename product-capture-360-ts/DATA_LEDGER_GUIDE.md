# Data Ledger & Logging System 📊

## Overview

Crystal-clear tracking system that records EVERY capture session with complete details - what product, how many images, when it happened, success rates, and more.

## What It Tracks

### 📝 Session Records (Per Capture)
- **Session ID**: Unique identifier for each capture
- **Product Name**: Which product was captured
- **Time**: Start time, end time, duration
- **Settings**: Target rate, duration, expected images
- **Results**: Images queued, saved, failed
- **Quality**: Unique vs duplicate images, missed frames
- **Performance**: Actual capture rate, success rate
- **Storage**: Folder path, file sizes

### 📦 Product Summaries (Aggregated)
- **Total Sessions**: How many times product was captured
- **Total Images**: Total images across all sessions
- **Total Size**: Disk space used by product
- **First/Last Captured**: When first and most recently captured
- **Folder Path**: Where product images are stored

### 📅 Daily Summaries (Aggregated)
- **Date**: Which day
- **Total Sessions**: Sessions that day
- **Total Products**: How many different products
- **Total Images**: Images captured that day
- **Product List**: Which products were captured

## Ledger Storage

All ledger data is stored in `.ledger/` directory:

```
/Volumes/UBUNTU 24_0/360Photo_Captures/
├── .ledger/
│   ├── sessions.jsonl       (Session records - one JSON per line)
│   ├── products.json         (Product summaries)
│   └── daily.json            (Daily summaries)
├── Product_A/
│   ├── Product_A_capture_*.jpg (images)
│   └── session_*.json (session log)
└── Product_B/
    ├── Product_B_capture_*.jpg (images)
    └── session_*.json (session log)
```

### Session Records Format (JSONL)

Each line in `sessions.jsonl` is a complete session record:

```json
{
  "sessionId": "20251230T081530000-abc123",
  "productName": "Hendricks_Gin_750ml",
  "startTime": "2025-12-30T08:15:30.000Z",
  "endTime": "2025-12-30T08:17:30.000Z",
  "durationSeconds": 120,
  "targetRate": 160,
  "targetDuration": 120,
  "targetImages": 320,
  "imagesQueued": 320,
  "imagesSaved": 320,
  "imagesFailed": 0,
  "uniqueImages": 272,
  "duplicateImages": 48,
  "missedFrames": 0,
  "actualRate": 160,
  "successRate": 100,
  "uniqueRate": 85,
  "folderPath": "/Volumes/UBUNTU 24_0/360Photo_Captures/Hendricks_Gin_750ml",
  "totalSizeBytes": 32000000,
  "averageImageSizeBytes": 100000,
  "status": "completed"
}
```

### Product Summary Format

```json
{
  "Hendricks_Gin_750ml": {
    "productName": "Hendricks_Gin_750ml",
    "totalSessions": 5,
    "totalImages": 1600,
    "totalSizeBytes": 160000000,
    "firstCaptured": "2025-12-29T10:00:00.000Z",
    "lastCaptured": "2025-12-30T08:15:30.000Z",
    "folderPath": "/Volumes/UBUNTU 24_0/360Photo_Captures/Hendricks_Gin_750ml"
  }
}
```

### Daily Summary Format

```json
{
  "2025-12-30": {
    "date": "2025-12-30",
    "totalSessions": 15,
    "totalProducts": 12,
    "totalImages": 4800,
    "totalSizeBytes": 480000000,
    "products": ["Hendricks_Gin_750ml", "Plymouth_Gin_750ml", ...]
  }
}
```

## API Endpoints

### 1. Get Ledger Report

Get a formatted text report of all captures:

```bash
# All sessions
curl "http://localhost:5002/api/ledger/report"

# Filter by product
curl "http://localhost:5002/api/ledger/report?product=Hendricks_Gin_750ml"

# Filter by date range
curl "http://localhost:5002/api/ledger/report?start_date=2025-12-29&end_date=2025-12-30"
```

**Response**:
```
═══════════════════════════════════════════════════════════════════════════════
  CAPTURE DATA LEDGER - Crystal Clear Report
═══════════════════════════════════════════════════════════════════════════════

📊 OVERALL SUMMARY
───────────────────────────────────────────────────────────────────────────────
Total Sessions: 50
Total Images: 16,000
Total Size: 1.60 GB
Products: 25

📦 PRODUCT SUMMARIES
───────────────────────────────────────────────────────────────────────────────
Hendricks_Gin_750ml:
  Sessions: 5
  Images: 1,600
  Size: 160.00 MB
  First: 12/29/2025, 10:00:00 AM
  Last: 12/30/2025, 8:15:30 AM

📝 RECENT SESSIONS (Last 10)
───────────────────────────────────────────────────────────────────────────────
✅ Hendricks_Gin_750ml - 20251230T081530000-abc123
  Time: 12/30/2025, 8:15:30 AM
  Target: 320 images @ 160/min for 120s
  Result: 320/320 saved (100.0% success)
  Unique: 272 (85.0%)
  Rate: 160.0/min (target: 160/min)
```

### 2. Get All Sessions

Get raw JSON data of all sessions:

```bash
curl "http://localhost:5002/api/ledger/sessions"
```

**Response**:
```json
{
  "success": true,
  "sessions": [
    {
      "sessionId": "...",
      "productName": "Hendricks_Gin_750ml",
      "startTime": "2025-12-30T08:15:30.000Z",
      ...
    }
  ]
}
```

### 3. Get Product Sessions

Get all sessions for a specific product:

```bash
curl "http://localhost:5002/api/ledger/sessions/Hendricks_Gin_750ml"
```

### 4. Get Product Summaries

Get aggregated stats for all products:

```bash
curl "http://localhost:5002/api/ledger/products"
```

**Response**:
```json
{
  "success": true,
  "products": {
    "Hendricks_Gin_750ml": {
      "productName": "Hendricks_Gin_750ml",
      "totalSessions": 5,
      "totalImages": 1600,
      ...
    }
  }
}
```

### 5. Get Daily Summaries

Get aggregated stats by day:

```bash
curl "http://localhost:5002/api/ledger/daily"
```

### 6. Export to CSV

Export entire ledger to CSV file:

```bash
curl -X POST "http://localhost:5002/api/ledger/export" \
  -H "Content-Type: application/json" \
  -d '{"output_path": "/path/to/export.csv"}'
```

## Automatic Tracking

Ledger automatically tracks EVERY session:

### Session Start
```typescript
// When you start a session:
session.start(160, 120, "Hendricks_Gin_750ml");

// Ledger automatically:
// 1. Creates session record
// 2. Records start time
// 3. Records settings (rate, duration, target)
// 4. Assigns unique session ID
```

### During Capture
```typescript
// Ledger silently tracks in background:
// - No performance impact
// - No delays
// - Crystal-clear records
```

### Session Complete
```typescript
// When session completes:
// Ledger automatically:
// 1. Records end time
// 2. Calculates final stats
// 3. Updates product summary
// 4. Updates daily summary
// 5. Marks session as 'completed'
```

## Data Persistence

### JSONL Format (sessions.jsonl)

Uses JSON Lines format - one JSON object per line:

**Benefits**:
- **Append-only**: New sessions append to end (fast!)
- **Stream-friendly**: Can process line-by-line
- **Crash-safe**: Incomplete writes only affect last line
- **Space-efficient**: No extra formatting overhead

**Example**:
```
{"sessionId":"1","productName":"Product_A",...}
{"sessionId":"2","productName":"Product_B",...}
{"sessionId":"3","productName":"Product_C",...}
```

## Use Cases

### 1. Daily Production Report

```bash
# Get today's captures
today=$(date +%Y-%m-%d)
curl "http://localhost:5002/api/ledger/report?start_date=$today&end_date=$today"
```

### 2. Product Inventory

```bash
# How many images do I have for each product?
curl "http://localhost:5002/api/ledger/products" | jq '.products | to_entries | .[] | {product: .key, images: .value.totalImages}'
```

### 3. Quality Check

```bash
# Which sessions had < 90% success rate?
curl "http://localhost:5002/api/ledger/sessions" | jq '.sessions[] | select(.successRate < 90)'
```

### 4. Storage Analysis

```bash
# Which products use the most storage?
curl "http://localhost:5002/api/ledger/products" | jq '.products | to_entries | sort_by(.value.totalSizeBytes) | reverse | .[0:5]'
```

### 5. Export for Analysis

```bash
# Export to Excel/Sheets
curl -X POST "http://localhost:5002/api/ledger/export" \
  -H "Content-Type: application/json" \
  -d '{"output_path": "/path/to/captures_2025.csv"}'
```

## CSV Export Format

Exported CSV includes all fields:

```csv
Session ID,Product Name,Start Time,End Time,Duration (s),Target Rate,Target Duration,Target Images,Images Queued,Images Saved,Images Failed,Unique Images,Duplicate Images,Missed Frames,Actual Rate,Success Rate (%),Unique Rate (%),Total Size (bytes),Avg Image Size (bytes),Folder Path,Status,Error Message
20251230T081530000-abc123,Hendricks_Gin_750ml,2025-12-30T08:15:30.000Z,2025-12-30T08:17:30.000Z,120,160,120,320,320,320,0,272,48,0,160.00,100.00,85.00,32000000,100000,/Volumes/UBUNTU 24_0/360Photo_Captures/Hendricks_Gin_750ml,completed,
```

## Example Queries

### Find Failed Sessions
```bash
curl "http://localhost:5002/api/ledger/sessions" | jq '.sessions[] | select(.status == "failed")'
```

### Calculate Total Storage
```bash
curl "http://localhost:5002/api/ledger/products" | jq '[.products[].totalSizeBytes] | add'
```

### List Products Captured Today
```bash
today=$(date +%Y-%m-%d)
curl "http://localhost:5002/api/ledger/daily" | jq ".daily[\"$today\"].products"
```

### Average Success Rate
```bash
curl "http://localhost:5002/api/ledger/sessions" | jq '[.sessions[].successRate] | add / length'
```

### Sessions with High Duplicate Rate
```bash
curl "http://localhost:5002/api/ledger/sessions" | jq '.sessions[] | select(.duplicateImages > 50)'
```

## Benefits

✅ **Crystal Clear**: Every session fully documented
✅ **Automatic**: Zero manual tracking needed
✅ **Fast**: Append-only writes, no performance impact
✅ **Queryable**: Full API for custom reports
✅ **Exportable**: CSV export for Excel/Sheets
✅ **Persistent**: Survives crashes and restarts
✅ **Hierarchical**: Session → Product → Daily views
✅ **Time-based**: Track trends over days/weeks/months

## Summary

The Data Ledger provides **crystal-clear tracking** of all your captures:

- **What**: Which product was captured
- **When**: Exact start/end times
- **How Many**: Images queued, saved, failed
- **Quality**: Unique vs duplicates, success rates
- **Where**: Folder paths, file sizes

**All tracked automatically with zero overhead!** 📊✨
