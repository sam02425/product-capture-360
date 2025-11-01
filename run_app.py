#!/usr/bin/env python3
"""
Startup script for 360° Product Capture System
Handles dependency installation and launches the app
"""

import os
import sys
import subprocess
from pathlib import Path

def check_dependencies():
    """Check if all dependencies are installed"""
    try:
        import flask
        import flask_cors
        import cv2
        import PIL
        import psutil
        return True
    except ImportError as e:
        print(f"Missing dependency: {e}")
        return False

def install_dependencies():
    """Install required dependencies"""
    print("Installing dependencies...")
    requirements_file = Path(__file__).parent / "requirements_fixed.txt"

    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", str(requirements_file)])
        print("✅ Dependencies installed successfully!")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ Failed to install dependencies: {e}")
        return False

def run_app():
    """Run the main application"""
    app_file = Path(__file__).parent / "lightweight_capture_app_fixed.py"

    print("\n" + "="*60)
    print("🚀 Starting 360° Product Capture System")
    print("="*60)
    print("\nAccess the application at:")
    print("  📍 http://localhost:5000")
    print("  📍 http://127.0.0.1:5000")
    print("\nPress Ctrl+C to stop the server\n")
    print("="*60 + "\n")

    try:
        subprocess.run([sys.executable, str(app_file)])
    except KeyboardInterrupt:
        print("\n\n👋 Application stopped by user")
    except Exception as e:
        print(f"\n❌ Error running application: {e}")

def main():
    print("=" * 60)
    print("360° PRODUCT CAPTURE SYSTEM - STARTUP")
    print("=" * 60)

    # Check Python version
    if sys.version_info < (3, 7):
        print("❌ Python 3.7 or higher is required")
        sys.exit(1)

    print(f"✅ Python {sys.version.split()[0]} detected")

    # Check dependencies
    if not check_dependencies():
        print("\n⚠️  Some dependencies are missing")
        response = input("Install dependencies now? (y/n): ").lower().strip()

        if response == 'y':
            if not install_dependencies():
                print("\n❌ Failed to install dependencies. Please install manually:")
                print("   pip install -r requirements_fixed.txt")
                sys.exit(1)
        else:
            print("\n❌ Cannot run without dependencies. Please install:")
            print("   pip install -r requirements_fixed.txt")
            sys.exit(1)
    else:
        print("✅ All dependencies are installed")

    # Run the application
    run_app()

if __name__ == "__main__":
    main()