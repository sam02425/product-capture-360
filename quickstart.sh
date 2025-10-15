#!/bin/bash

# 360° Product Capture System - Quick Start Script
# One command setup and launch

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Banner
echo -e "${BLUE}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                                                              ║"
echo "║        360° PRODUCT IMAGE CAPTURE SYSTEM                     ║"
echo "║        Quick Start Installation                              ║"
echo "║                                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check Python
echo -e "${BOLD}Checking Python installation...${NC}"
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}❌ Python 3 is not installed${NC}"
    echo "Please install Python 3.8 or higher from https://www.python.org/"
    exit 1
fi

PYTHON_VERSION=$(python3 --version | cut -d' ' -f2 | cut -d'.' -f1,2)
echo -e "${GREEN}✅ Python $PYTHON_VERSION detected${NC}"

# Check for UV
echo ""
echo -e "${BOLD}Checking for UV package manager...${NC}"
if command -v uv &> /dev/null; then
    echo -e "${GREEN}✅ UV already installed${NC}"
    USE_UV=true
else
    echo -e "${YELLOW}⚠️  UV not found${NC}"
    echo -e "${BLUE}UV is 10-100x faster than pip for package installation${NC}"
    read -p "Install UV? (recommended) [Y/n]: " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
        echo -e "${BOLD}Installing UV...${NC}"
        curl -LsSf https://astral.sh/uv/install.sh | sh

        # Source the UV environment
        export PATH="$HOME/.cargo/bin:$PATH"

        if command -v uv &> /dev/null; then
            echo -e "${GREEN}✅ UV installed successfully${NC}"
            USE_UV=true
        else
            echo -e "${YELLOW}⚠️  UV installation completed, but not in PATH yet${NC}"
            echo -e "${YELLOW}   You may need to restart your terminal or run:${NC}"
            echo -e "${YELLOW}   source \$HOME/.cargo/env${NC}"
            echo ""
            echo -e "${BLUE}Falling back to pip for now...${NC}"
            USE_UV=false
        fi
    else
        echo -e "${BLUE}Using pip instead...${NC}"
        USE_UV=false
    fi
fi

# Create directories
echo ""
echo -e "${BOLD}Creating project directories...${NC}"
mkdir -p captures logs backups
echo -e "${GREEN}✅ Directories created${NC}"

# Install dependencies
echo ""
echo -e "${BOLD}Installing dependencies...${NC}"
if [ "$USE_UV" = true ]; then
    echo -e "${BLUE}Using UV (fast mode)...${NC}"
    uv sync
else
    echo -e "${BLUE}Using pip...${NC}"
    if [ ! -d ".venv" ]; then
        python3 -m venv .venv
    fi
    source .venv/bin/activate
    pip install -e . -q
fi
echo -e "${GREEN}✅ Dependencies installed${NC}"

# Check cameras
echo ""
echo -e "${BOLD}Checking for cameras...${NC}"
if [ "$USE_UV" = true ]; then
    CAMERA_CHECK=$(uv run python3 -c "import cv2; print(sum([cv2.VideoCapture(i).isOpened() for i in range(5)]))" 2>/dev/null)
else
    source .venv/bin/activate
    CAMERA_CHECK=$(python3 -c "import cv2; print(sum([cv2.VideoCapture(i).isOpened() for i in range(5)]))" 2>/dev/null)
fi

if [ "$CAMERA_CHECK" -gt 0 ]; then
    echo -e "${GREEN}✅ Found $CAMERA_CHECK camera(s)${NC}"
else
    echo -e "${YELLOW}⚠️  No cameras detected${NC}"
    echo "   Make sure cameras are connected and try 'Detect Cameras' in the app"
fi

# Final info
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}${BOLD}✅ Installation Complete!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${BOLD}🚀 Quick Start Commands:${NC}"
echo ""
if [ "$USE_UV" = true ]; then
    echo -e "  ${BLUE}uv run streamlit run app.py${NC}          # Start the app"
    echo -e "  ${BLUE}uv add <package>${NC}                     # Install new package"
    echo -e "  ${BLUE}uv sync --upgrade${NC}                    # Update packages"
else
    echo -e "  ${BLUE}source .venv/bin/activate${NC}            # Activate environment"
    echo -e "  ${BLUE}streamlit run app.py${NC}                 # Start the app"
    echo -e "  ${BLUE}pip install <package>${NC}                # Install new package"
fi
echo ""
echo -e "${BOLD}📚 Or use Makefile:${NC}"
echo -e "  ${BLUE}make run${NC}                               # Start the app"
echo -e "  ${BLUE}make help${NC}                              # Show all commands"
echo ""
echo -e "${BOLD}🌐 App will be available at:${NC}"
echo -e "  ${BLUE}http://localhost:8501${NC}"
echo ""
echo -e "${BOLD}💡 Tip:${NC} Press Ctrl+C to stop the app"
echo ""

# Ask to launch
read -p "Launch the application now? [Y/n]: " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
    echo ""
    echo -e "${GREEN}🚀 Launching application...${NC}"
    echo ""
    if [ "$USE_UV" = true ]; then
        uv run streamlit run app.py
    else
        source .venv/bin/activate
        streamlit run app.py
    fi
else
    echo ""
    echo -e "${YELLOW}Setup complete! Run manually when ready.${NC}"
    echo ""
fi