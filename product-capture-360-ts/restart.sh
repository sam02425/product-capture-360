#!/bin/bash

# Restart script for Product Capture 360 server
# This script kills any old servers and camera processes, then starts fresh

echo "🔄 Restarting Product Capture 360 server..."

# Kill any existing server processes
pkill -f "node dist/server.js" 2>/dev/null && echo "✅ Killed old server processes" || echo "ℹ️  No old server processes found"

# Kill any zombie FFmpeg camera processes
pkill -f "ffmpeg.*avfoundation" 2>/dev/null && echo "✅ Killed zombie FFmpeg processes" || echo "ℹ️  No zombie FFmpeg processes found"

# Wait for processes to die
sleep 1

# Build latest code
echo "🔨 Building latest code..."
npm run build

# Start server
echo "🚀 Starting server..."
npm start
