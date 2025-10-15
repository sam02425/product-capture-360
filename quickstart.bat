@echo off
REM 360° Product Capture System - Windows Quick Start
REM One command setup and launch for Windows

setlocal enabledelayedexpansion

color 0B
echo ================================================================
echo.
echo        360 PRODUCT IMAGE CAPTURE SYSTEM
echo        Quick Start Installation for Windows
echo.
echo ================================================================
echo.

REM Check Python
echo [1/5] Checking Python installation...
python --version >nul 2>&1
if errorlevel 1 (
    color 0C
    echo [ERROR] Python is not installed or not in PATH
    echo.
    echo Please install Python 3.8 or higher from:
    echo https://www.python.org/downloads/
    echo.
    echo Make sure to check "Add Python to PATH" during installation
    pause
    exit /b 1
)

for /f "tokens=2" %%i in ('python --version 2^>^&1') do set PYTHON_VERSION=%%i
echo [OK] Python %PYTHON_VERSION% detected
echo.

REM Check for UV
echo [2/5] Checking for UV package manager...
uv --version >nul 2>&1
if errorlevel 1 (
    echo [WARNING] UV not found
    echo UV is 10-100x faster than pip for package installation
    echo.
    set /p INSTALL_UV="Install UV? (recommended) [Y/n]: "
    if /i "!INSTALL_UV!"=="Y" goto install_uv
    if /i "!INSTALL_UV!"=="" goto install_uv
    goto use_pip
) else (
    echo [OK] UV already installed
    set USE_UV=1
    goto create_dirs
)

:install_uv
echo.
echo Installing UV...
powershell -Command "irm https://astral.sh/uv/install.ps1 | iex"
if errorlevel 1 (
    echo [WARNING] UV installation failed, falling back to pip
    goto use_pip
)
echo [OK] UV installed successfully
set USE_UV=1
goto create_dirs

:use_pip
echo Using pip instead...
set USE_UV=0

:create_dirs
REM Create directories
echo.
echo [3/5] Creating project directories...
if not exist "captures" mkdir captures
if not exist "logs" mkdir logs
if not exist "backups" mkdir backups
echo [OK] Directories created
echo.

REM Install dependencies
echo [4/5] Installing dependencies...
if !USE_UV! equ 1 (
    echo Using UV ^(fast mode^)...
    uv sync
    if errorlevel 1 (
        echo [WARNING] UV sync failed, trying pip...
        goto pip_install
    )
    echo [OK] Dependencies installed with UV
) else (
    :pip_install
    if not exist ".venv" (
        echo Creating virtual environment...
        python -m venv .venv
    )
    call .venv\Scripts\activate.bat
    echo Installing with pip...
    pip install -e . -q
    if errorlevel 1 (
        echo [ERROR] Failed to install dependencies
        pause
        exit /b 1
    )
    echo [OK] Dependencies installed with pip
)
echo.

REM Check cameras
echo [5/5] Checking for cameras...
if !USE_UV! equ 1 (
    for /f %%i in ('uv run python -c "import cv2; print(sum([cv2.VideoCapture(i).isOpened() for i in range(5)]))" 2^>nul') do set CAMERAS=%%i
) else (
    call .venv\Scripts\activate.bat
    for /f %%i in ('python -c "import cv2; print(sum([cv2.VideoCapture(i).isOpened() for i in range(5)]))" 2^>nul') do set CAMERAS=%%i
)

if defined CAMERAS (
    if !CAMERAS! gtr 0 (
        echo [OK] Found !CAMERAS! camera^(s^)
    ) else (
        echo [WARNING] No cameras detected
        echo Make sure cameras are connected and try 'Detect Cameras' in the app
    )
) else (
    echo [WARNING] Could not check cameras
)
echo.

REM Final info
color 0A
echo ================================================================
echo [SUCCESS] Installation Complete!
echo ================================================================
echo.
echo Quick Start Commands:
echo.
if !USE_UV! equ 1 (
    echo   uv run streamlit run app.py          - Start the app
    echo   uv add ^<package^>                     - Install new package
    echo   uv sync --upgrade                    - Update packages
) else (
    echo   .venv\Scripts\activate.bat           - Activate environment
    echo   streamlit run app.py                 - Start the app
    echo   pip install ^<package^>                - Install new package
)
echo.
echo App will be available at:
echo   http://localhost:8501
echo.
echo Tip: Press Ctrl+C to stop the app
echo.

REM Ask to launch
set /p LAUNCH="Launch the application now? [Y/n]: "
if /i "!LAUNCH!"=="Y" goto launch
if /i "!LAUNCH!"=="" goto launch
goto end

:launch
echo.
color 0B
echo Launching application...
echo.
if !USE_UV! equ 1 (
    uv run streamlit run app.py
) else (
    call .venv\Scripts\activate.bat
    streamlit run app.py
)
goto end

:end
echo.
echo Setup complete! Run manually when ready.
pause