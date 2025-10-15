#!/usr/bin/env python3
"""
360° Product Capture System - Modern UV-Compatible Launcher
Supports both UV and pip package managers with automatic detection
"""

import os
import sys
import subprocess
import platform
import shutil
from pathlib import Path

class Colors:
    """ANSI color codes for pretty terminal output"""
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    END = '\033[0m'
    BOLD = '\033[1m'

def print_colored(message, color=Colors.GREEN):
    """Print colored message"""
    print(f"{color}{message}{Colors.END}")

def print_banner():
    """Print application banner"""
    banner = f"""
{Colors.BLUE}╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║        360° PRODUCT IMAGE CAPTURE SYSTEM                     ║
║        Professional Image Capture for AI Training            ║
║                                                              ║
║        Version: 1.0.0  |  Package Manager: UV/pip            ║
║        Status: Production Ready                              ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝{Colors.END}
    """
    print(banner)

def check_python_version():
    """Ensure Python version is compatible"""
    version = sys.version_info
    if version.major < 3 or (version.major == 3 and version.minor < 8):
        print_colored("❌ Error: Python 3.8 or higher is required", Colors.RED)
        print(f"   Current version: {version.major}.{version.minor}.{version.micro}")
        print("\n   Download Python from: https://www.python.org/downloads/")
        sys.exit(1)
    print_colored(f"✅ Python version: {version.major}.{version.minor}.{version.micro}")

def check_uv_installed():
    """Check if UV is installed"""
    return shutil.which("uv") is not None

def install_uv():
    """Install UV package manager"""
    print_colored("\n📦 UV not found. Installing UV...", Colors.YELLOW)

    system = platform.system()

    try:
        if system in ["Linux", "Darwin"]:  # Linux or macOS
            print("   Using curl installer...")
            subprocess.run(
                "curl -LsSf https://astral.sh/uv/install.sh | sh",
                shell=True,
                check=True
            )
        elif system == "Windows":
            print("   Using PowerShell installer...")
            subprocess.run(
                "powershell -c \"irm https://astral.sh/uv/install.ps1 | iex\"",
                shell=True,
                check=True
            )
        else:
            print_colored("❌ Unsupported operating system", Colors.RED)
            return False

        print_colored("✅ UV installed successfully!", Colors.GREEN)
        print_colored("   Note: You may need to restart your terminal", Colors.YELLOW)
        return True

    except subprocess.CalledProcessError:
        print_colored("❌ Failed to install UV automatically", Colors.RED)
        print("\n💡 Manual installation:")
        print("   Visit: https://github.com/astral-sh/uv")
        print("   Or use pip: pip install uv")
        return False

def setup_uv_environment():
    """Setup project using UV"""
    print_colored("\n🚀 Setting up project with UV...", Colors.BLUE)

    try:
        # Create virtual environment with UV
        print("   Creating virtual environment...")
        subprocess.run(["uv", "venv"], check=True)
        print_colored("✅ Virtual environment created", Colors.GREEN)

        # Sync dependencies
        print("   Installing dependencies from pyproject.toml...")
        subprocess.run(["uv", "sync"], check=True)
        print_colored("✅ Dependencies installed", Colors.GREEN)

        return True

    except subprocess.CalledProcessError as e:
        print_colored(f"❌ UV setup failed: {e}", Colors.RED)
        return False

def setup_pip_environment():
    """Fallback: Setup project using traditional pip"""
    print_colored("\n📦 Setting up project with pip...", Colors.YELLOW)

    # Create venv
    venv_path = Path(".venv")
    if not venv_path.exists():
        print("   Creating virtual environment...")
        try:
            subprocess.run([sys.executable, "-m", "venv", ".venv"], check=True)
            print_colored("✅ Virtual environment created", Colors.GREEN)
        except subprocess.CalledProcessError:
            print_colored("❌ Failed to create virtual environment", Colors.RED)
            return False

    # Install dependencies
    pip_cmd = get_pip_command()

    print("   Installing dependencies from pyproject.toml...")
    try:
        subprocess.run([pip_cmd, "install", "-e", "."], check=True)
        print_colored("✅ Dependencies installed", Colors.GREEN)
        return True
    except subprocess.CalledProcessError:
        print_colored("❌ Failed to install dependencies", Colors.RED)
        return False

def get_pip_command():
    """Get the correct pip command"""
    if platform.system() == "Windows":
        return str(Path(".venv") / "Scripts" / "pip.exe")
    else:
        return str(Path(".venv") / "bin" / "pip")

def get_python_command(use_uv=True):
    """Get the correct python command"""
    if use_uv and check_uv_installed():
        return "uv"

    if platform.system() == "Windows":
        return str(Path(".venv") / "Scripts" / "python.exe")
    else:
        return str(Path(".venv") / "bin" / "python")

def check_cameras():
    """Quick camera detection"""
    print_colored("\n🔍 Checking for cameras...", Colors.BLUE)
    try:
        import cv2
        cameras_found = []
        for i in range(5):
            cap = cv2.VideoCapture(i)
            if cap.isOpened():
                cameras_found.append(i)
                cap.release()

        if cameras_found:
            print_colored(f"✅ Found {len(cameras_found)} camera(s): {cameras_found}", Colors.GREEN)
        else:
            print_colored("⚠️  No cameras detected!", Colors.YELLOW)
            print("   Make sure cameras are connected and try running 'Detect Cameras' in the app")

        return len(cameras_found) > 0
    except ImportError:
        print_colored("⚠️  OpenCV not yet installed, skipping camera check", Colors.YELLOW)
        return True

def create_directories():
    """Create necessary directories"""
    dirs = ["captures", "logs", "backups"]
    for d in dirs:
        Path(d).mkdir(exist_ok=True)
    print_colored("✅ Directories ready", Colors.GREEN)

def run_app_uv():
    """Launch the Streamlit application using UV"""
    print_colored("\n" + "="*60, Colors.BLUE)
    print_colored("🚀 Starting 360° Product Capture System with UV...", Colors.BOLD)
    print_colored("="*60, Colors.BLUE)

    try:
        subprocess.run([
            "uv", "run", "streamlit", "run", "app.py",
            "--server.headless", "false",
            "--browser.gatherUsageStats", "false"
        ])
    except KeyboardInterrupt:
        print_colored("\n\n👋 Application stopped by user", Colors.YELLOW)
    except Exception as e:
        print_colored(f"\n❌ Error running application: {e}", Colors.RED)

def run_app_pip():
    """Launch the Streamlit application using traditional method"""
    print_colored("\n" + "="*60, Colors.BLUE)
    print_colored("🚀 Starting 360° Product Capture System...", Colors.BOLD)
    print_colored("="*60, Colors.BLUE)

    python_cmd = get_python_command(use_uv=False)

    try:
        subprocess.run([
            python_cmd, "-m", "streamlit", "run", "app.py",
            "--server.headless", "false",
            "--browser.gatherUsageStats", "false"
        ])
    except KeyboardInterrupt:
        print_colored("\n\n👋 Application stopped by user", Colors.YELLOW)
    except Exception as e:
        print_colored(f"\n❌ Error running application: {e}", Colors.RED)

def print_usage_info(using_uv=True):
    """Print usage information"""
    print_colored("\n💡 Usage Tips:", Colors.BLUE)

    if using_uv:
        print("""
    Quick Commands (UV):
    - Start app:          uv run streamlit run app.py
    - Install new package: uv add <package-name>
    - Update packages:    uv sync --upgrade
    - Run tests:          uv run pytest
    - Format code:        uv run black .

    Install optional features:
    - Enhanced features:  uv sync --extra enhanced
    - Cloud storage:      uv sync --extra cloud
    - All features:       uv sync --extra all
        """)
    else:
        print("""
    Quick Commands (pip):
    - Start app:          python app.py
    - Install package:    pip install <package-name>
    - Update packages:    pip install -U -e .

    Install optional features:
    - Enhanced features:  pip install -e ".[enhanced]"
    - Cloud storage:      pip install -e ".[cloud]"
    - All features:       pip install -e ".[all]"
        """)

    print_colored("\n🌐 App Information:", Colors.BLUE)
    print("""
    - Default URL:  http://localhost:8501
    - Stop app:     Press Ctrl+C in this terminal
    - New session:  Refresh browser or restart app
    - Output:       captures/ directory
    """)

def main():
    """Main launcher function"""
    print_banner()

    # Step 1: Check Python version
    print_colored("Step 1: Checking Python version...", Colors.BOLD)
    check_python_version()

    # Step 2: Check for UV
    print_colored("\nStep 2: Checking package manager...", Colors.BOLD)
    has_uv = check_uv_installed()

    if has_uv:
        print_colored("✅ UV package manager detected (fast!)", Colors.GREEN)
        use_uv = True
    else:
        print_colored("⚠️  UV not found - falling back to pip", Colors.YELLOW)
        print_colored("   For 10-100x faster installs, consider installing UV:", Colors.YELLOW)
        print_colored("   https://github.com/astral-sh/uv\n", Colors.BLUE)

        # Ask user if they want to install UV
        try:
            response = input("   Install UV now? (y/n): ").lower().strip()
            if response == 'y':
                if install_uv():
                    has_uv = True
                    use_uv = True
                else:
                    use_uv = False
            else:
                use_uv = False
        except KeyboardInterrupt:
            print("\n")
            use_uv = False

    # Step 3: Setup environment
    print_colored("\nStep 3: Setting up environment...", Colors.BOLD)

    if use_uv:
        if not setup_uv_environment():
            print_colored("\n⚠️  UV setup failed, trying pip fallback...", Colors.YELLOW)
            if not setup_pip_environment():
                print_colored("❌ Setup failed", Colors.RED)
                sys.exit(1)
            use_uv = False
    else:
        if not setup_pip_environment():
            print_colored("❌ Setup failed", Colors.RED)
            sys.exit(1)

    # Step 4: Create directories
    print_colored("\nStep 4: Creating directories...", Colors.BOLD)
    create_directories()

    # Step 5: Check cameras
    print_colored("\nStep 5: Camera detection...", Colors.BOLD)
    check_cameras()

    # Step 6: Print usage info
    print_usage_info(using_uv=use_uv)

    # Step 7: Launch application
    print_colored("\n" + "="*60, Colors.GREEN)
    print_colored("✅ All checks passed! Ready to launch", Colors.GREEN)
    print_colored("="*60, Colors.GREEN)

    try:
        input("\nPress ENTER to launch the application...")
    except KeyboardInterrupt:
        print("\n")
        sys.exit(0)

    if use_uv:
        run_app_uv()
    else:
        run_app_pip()

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print_colored("\n\n👋 Setup cancelled by user", Colors.YELLOW)
        sys.exit(0)
    except Exception as e:
        print_colored(f"\n❌ Unexpected error: {e}", Colors.RED)
        print("\n💡 Please check the documentation or report this issue")
        sys.exit(1)