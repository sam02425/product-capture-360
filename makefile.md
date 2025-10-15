.PHONY: help install install-uv install-pip run test clean format lint docker-build docker-run

# Default target
help:
	@echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	@echo "  360° Product Capture System - Make Commands"
	@echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	@echo ""
	@echo "Setup Commands:"
	@echo "  make install-uv      Install UV and setup project (recommended)"
	@echo "  make install-pip     Setup project with pip (fallback)"
	@echo "  make install         Auto-detect and install (UV preferred)"
	@echo ""
	@echo "Run Commands:"
	@echo "  make run             Start the application"
	@echo "  make run-network     Start with network access"
	@echo "  make dev             Start with auto-reload for development"
	@echo ""
	@echo "Development:"
	@echo "  make format          Format code with black"
	@echo "  make lint            Run linters (ruff)"
	@echo "  make test            Run tests"
	@echo "  make clean           Remove cache and temp files"
	@echo ""
	@echo "Optional Features:"
	@echo "  make install-enhanced  Install with AI features"
	@echo "  make install-cloud     Install with cloud storage"
	@echo "  make install-all       Install everything"
	@echo ""
	@echo "Docker:"
	@echo "  make docker-build    Build Docker image"
	@echo "  make docker-run      Run in Docker container"
	@echo ""
	@echo "Maintenance:"
	@echo "  make update          Update all dependencies"
	@echo "  make backup          Backup capture data"
	@echo "  make logs            View application logs"
	@echo ""

# Check if UV is installed
check-uv:
	@command -v uv >/dev/null 2>&1 || { echo "UV not found. Installing..."; curl -LsSf https://astral.sh/uv/install.sh | sh; }

# Install with UV (recommended)
install-uv: check-uv
	@echo "Installing with UV (fast!)..."
	uv sync
	@echo "✅ Installation complete!"

# Install with pip (fallback)
install-pip:
	@echo "Installing with pip..."
	python -m venv .venv
	.venv/bin/pip install -e .
	@echo "✅ Installation complete!"

# Auto-detect and install
install:
	@command -v uv >/dev/null 2>&1 && $(MAKE) install-uv || $(MAKE) install-pip

# Install with enhanced features (AI models, background removal)
install-enhanced: check-uv
	uv sync --extra enhanced

# Install with cloud storage support
install-cloud: check-uv
	uv sync --extra cloud

# Install all features
install-all: check-uv
	uv sync --extra all

# Run application
run:
	@command -v uv >/dev/null 2>&1 && uv run streamlit run app.py || .venv/bin/streamlit run app.py

# Run with network access (accessible from other devices)
run-network:
	@command -v uv >/dev/null 2>&1 && \
		uv run streamlit run app.py --server.address 0.0.0.0 || \
		.venv/bin/streamlit run app.py --server.address 0.0.0.0

# Run in development mode (auto-reload)
dev:
	@command -v uv >/dev/null 2>&1 && \
		uv run streamlit run app.py --server.runOnSave true || \
		.venv/bin/streamlit run app.py --server.runOnSave true

# Format code with black
format:
	@command -v uv >/dev/null 2>&1 && uv run black . || .venv/bin/black .

# Lint code with ruff
lint:
	@command -v uv >/dev/null 2>&1 && uv run ruff check . || .venv/bin/ruff check .

# Run tests
test:
	@command -v uv >/dev/null 2>&1 && uv run pytest || .venv/bin/pytest

# Update dependencies
update:
	@command -v uv >/dev/null 2>&1 && uv sync --upgrade || pip install -U -e .

# Clean cache and temporary files
clean:
	@echo "Cleaning cache and temporary files..."
	@find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	@find . -type d -name "*.egg-info" -exec rm -rf {} + 2>/dev/null || true
	@find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
	@find . -type d -name ".ruff_cache" -exec rm -rf {} + 2>/dev/null || true
	@rm -rf .mypy_cache build dist || true
	@echo "✅ Cleanup complete!"

# Deep clean (including venv)
clean-all: clean
	@echo "Removing virtual environment..."
	@rm -rf .venv venv || true
	@rm -f uv.lock || true
	@echo "✅ Deep cleanup complete!"

# Backup capture data
backup:
	@echo "Creating backup of captures..."
	@mkdir -p backups
	@tar -czf backups/captures_backup_$$(date +%Y%m%d_%H%M%S).tar.gz captures/
	@echo "✅ Backup created in backups/"

# View application logs
logs:
	@tail -f logs/capture_system.log 2>/dev/null || echo "No logs found. Run the app first."

# Docker build
docker-build:
	docker build -t product-capture-360:latest .
	@echo "✅ Docker image built successfully!"

# Docker run
docker-run:
	docker run -p 8501:8501 --device=/dev/video0 --device=/dev/video1 --device=/dev/video2 product-capture-360:latest

# Show project info
info:
	@echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	@echo "  Project Information"
	@echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	@echo "Name:        360° Product Capture System"
	@echo "Version:     1.0.0"
	@echo "Python:      $$(python --version 2>&1)"
	@command -v uv >/dev/null 2>&1 && echo "UV:          $$(uv --version)" || echo "UV:          Not installed"
	@echo "Status:      Production Ready"
	@echo ""

# Quick start (install and run)
quickstart: install
	@echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	@echo "  🚀 Starting application..."
	@echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	$(MAKE) run

# Setup development environment
dev-setup: install-all
	@command -v uv >/dev/null 2>&1 && uv sync --extra dev || pip install -e ".[dev]"
	@echo "✅ Development environment ready!"
	@echo ""
	@echo "Installed tools:"
	@echo "  - black (code formatter)"
	@echo "  - ruff (linter)"
	@echo "  - mypy (type checker)"
	@echo "  - pytest (testing)"