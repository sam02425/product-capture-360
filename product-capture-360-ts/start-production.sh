#!/bin/bash

# Production Startup Script for 360Photo Capture System
set -e

echo "🚀 Starting 360Photo Capture System..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js not found. Please install Node.js first.${NC}"
    exit 1
fi

# Check Python3
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}❌ Python3 not found. Please install Python3 first.${NC}"
    exit 1
fi

# Check FFmpeg
if ! command -v ffmpeg &> /dev/null; then
    echo -e "${YELLOW}⚠️  FFmpeg not found. Camera capture may not work.${NC}"
    echo -e "${YELLOW}   Install with: brew install ffmpeg (macOS) or apt-get install ffmpeg (Ubuntu)${NC}"
fi

# Create .env if it doesn't exist
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠️  .env file not found. Copying from .env.example${NC}"
    cp .env.example .env
    echo -e "${GREEN}✅ Created .env file. Please review and update as needed.${NC}"
fi

# Activate Python virtual environment
if [ -d ".venv" ]; then
    echo "🐍 Activating Python virtual environment..."
    source .venv/bin/activate
else
    echo -e "${RED}❌ Virtual environment not found. Run setup first:${NC}"
    echo -e "   uv venv .venv"
    echo -e "   source .venv/bin/activate"
    echo -e "   uv pip install -r requirements.txt"
    exit 1
fi

# Verify Python dependencies
echo "🔍 Checking Python dependencies..."
if ! python3 -c "import ultralytics" 2>/dev/null; then
    echo -e "${YELLOW}⚠️  Installing Python dependencies...${NC}"
    uv pip install -r requirements.txt
fi

# Install Node dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing Node.js dependencies..."
    npm install
fi

# Build TypeScript
echo "🔨 Building TypeScript..."
npm run build

# Kill any existing processes
echo "🧹 Cleaning up old processes..."
pkill -9 -f "dist/server.js" 2>/dev/null || true
pkill -9 -f "ffmpeg.*avfoundation" 2>/dev/null || true

# Start the server
echo -e "${GREEN}✅ All checks passed. Starting server...${NC}"
echo ""
echo "📍 Server will be available at:"
echo "   http://localhost:5002"
echo "   http://0.0.0.0:5002"
echo ""
echo "📊 Image Collector: http://localhost:5002/image-collector.html"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

npm start
