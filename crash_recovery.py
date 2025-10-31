#!/usr/bin/env python3
"""
Crash Recovery System for Flask Application
Monitors and automatically restarts the application if it crashes
"""

import subprocess
import time
import sys
import os
import signal
import logging
from pathlib import Path

class CrashRecoverySystem:
    def __init__(self, app_script="lightweight_capture_app.py", max_restarts=5, restart_delay=5):
        self.app_script = app_script
        self.max_restarts = max_restarts
        self.restart_delay = restart_delay
        self.restart_count = 0
        self.process = None
        self.running = True
        
        # Setup logging
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(levelname)s - %(message)s',
            handlers=[
                logging.FileHandler('crash_recovery.log'),
                logging.StreamHandler()
            ]
        )
        self.logger = logging.getLogger(__name__)
        
        # Register signal handlers for graceful shutdown
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)
    
    def _signal_handler(self, signum, frame):
        """Handle shutdown signals gracefully"""
        self.logger.info(f"Received signal {signum}, shutting down...")
        self.running = False
        if self.process:
            try:
                self.process.terminate()
                self.process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.process.kill()
            except Exception as e:
                self.logger.error(f"Error terminating process: {e}")
    
    def start_application(self):
        """Start the Flask application"""
        try:
            self.logger.info(f"Starting application: {self.app_script}")
            self.process = subprocess.Popen(
                [sys.executable, self.app_script],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                cwd=os.path.dirname(os.path.abspath(__file__))
            )
            return True
        except Exception as e:
            self.logger.error(f"Failed to start application: {e}")
            return False
    
    def is_application_running(self):
        """Check if the application is still running"""
        if not self.process:
            return False
        
        poll_result = self.process.poll()
        return poll_result is None
    
    def get_exit_code(self):
        """Get the exit code of the crashed process"""
        if self.process:
            return self.process.poll()
        return None
    
    def restart_application(self):
        """Restart the application after a crash"""
        if self.restart_count >= self.max_restarts:
            self.logger.error(f"Maximum restart attempts ({self.max_restarts}) reached. Giving up.")
            return False
        
        self.restart_count += 1
        exit_code = self.get_exit_code()
        self.logger.warning(f"Application crashed with exit code {exit_code}. Restart attempt {self.restart_count}/{self.max_restarts}")
        
        # Clean up the old process
        if self.process:
            try:
                self.process.terminate()
                self.process.wait(timeout=5)
            except:
                pass
            self.process = None
        
        # Wait before restarting
        self.logger.info(f"Waiting {self.restart_delay} seconds before restart...")
        time.sleep(self.restart_delay)
        
        # Start the application again
        return self.start_application()
    
    def monitor(self):
        """Main monitoring loop"""
        self.logger.info("Starting crash recovery monitoring...")
        
        # Initial start
        if not self.start_application():
            self.logger.error("Failed to start application initially")
            return False
        
        # Monitoring loop
        while self.running:
            try:
                if not self.is_application_running():
                    if self.running:  # Only restart if we're not shutting down
                        if not self.restart_application():
                            break
                    else:
                        break
                
                # Check every 5 seconds
                time.sleep(5)
                
            except KeyboardInterrupt:
                self.logger.info("Monitoring interrupted by user")
                break
            except Exception as e:
                self.logger.error(f"Error in monitoring loop: {e}")
                time.sleep(5)
        
        # Cleanup
        if self.process and self.is_application_running():
            self.logger.info("Shutting down application...")
            try:
                self.process.terminate()
                self.process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.process.kill()
            except Exception as e:
                self.logger.error(f"Error during shutdown: {e}")
        
        self.logger.info("Crash recovery monitoring stopped")
        return True

def main():
    """Main entry point"""
    recovery_system = CrashRecoverySystem()
    try:
        recovery_system.monitor()
    except Exception as e:
        logging.error(f"Fatal error in crash recovery system: {e}")
        return 1
    return 0

if __name__ == "__main__":
    sys.exit(main())