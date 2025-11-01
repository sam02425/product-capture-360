#!/bin/bash

# 360° Product Capture System - macOS Launcher

echo "======================================================"
echo "     360° PRODUCT CAPTURE SYSTEM"
echo "     Production-Ready Version 2.0"
echo "======================================================"
echo ""

# Check Python 3
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed"
    echo "Please install Python 3 from: https://www.python.org/downloads/"
    exit 1
fi

echo "✅ Python 3 detected: $(python3 --version)"
echo ""

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install dependencies if needed
echo "Checking dependencies..."
pip install -q -r requirements.txt 2>/dev/null || {
    echo "Installing dependencies..."
    pip install -r requirements.txt
}

echo ""
echo "======================================================"
echo "🚀 Starting application..."
echo "======================================================"
echo ""
echo "📍 Access the app at: http://localhost:5000"
echo "📍 Or: http://127.0.0.1:5000"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""
echo "======================================================"
echo ""

# Run the application
python3 lightweight_capture_app_.py

# Deactivate virtual environment on exit
deactivate