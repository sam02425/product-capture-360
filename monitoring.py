#!/usr/bin/env python3
"""
Production-grade monitoring and metrics collection for Product Capture System
"""

import time
import threading
import psutil
import json
from datetime import datetime, timedelta
from collections import defaultdict, deque
from dataclasses import dataclass, asdict
from typing import Dict, List, Optional, Any
from pathlib import Path

from logging_config import get_logger

@dataclass
class SystemMetrics:
    """System performance metrics"""
    timestamp: str
    cpu_percent: float
    memory_percent: float
    memory_used_mb: float
    memory_available_mb: float
    disk_usage_percent: float
    disk_free_gb: float
    camera_active: bool
    session_active: bool
    capture_count: int
    error_count: int
    uptime_seconds: float

@dataclass
class ErrorMetrics:
    """Error tracking metrics"""
    timestamp: str
    error_type: str
    error_code: str
    message: str
    context: Dict[str, Any]
    severity: str
    resolved: bool = False

class HealthMonitor:
    """System health monitoring and alerting"""
    
    def __init__(self, alert_thresholds: Optional[Dict] = None):
        self.logger = get_logger()
        self.start_time = time.time()
        self.metrics_history = deque(maxlen=1000)  # Keep last 1000 metrics
        self.error_history = deque(maxlen=500)     # Keep last 500 errors
        self.alert_thresholds = alert_thresholds or self._default_thresholds()
        self.monitoring_active = False
        self.monitoring_thread = None
        self.lock = threading.Lock()
        
        # Error rate tracking
        self.error_counts = defaultdict(int)
        self.error_rate_window = deque(maxlen=60)  # 1-minute window
        
        # Performance tracking
        self.response_times = deque(maxlen=100)
        self.api_call_counts = defaultdict(int)
        
        self.logger.logger.info("HealthMonitor initialized")
    
    def _default_thresholds(self) -> Dict:
        """Default alert thresholds"""
        return {
            'cpu_percent': 80.0,
            'memory_percent': 85.0,
            'disk_usage_percent': 90.0,
            'error_rate_per_minute': 10,
            'response_time_ms': 5000,
            'consecutive_errors': 5
        }
    
    def start_monitoring(self, interval: float = 30.0):
        """Start continuous monitoring"""
        if self.monitoring_active:
            self.logger.logger.warning("Monitoring already active")
            return
        
        self.monitoring_active = True
        self.monitoring_thread = threading.Thread(
            target=self._monitoring_loop,
            args=(interval,),
            daemon=True
        )
        self.monitoring_thread.start()
        self.logger.logger.info(f"Health monitoring started with {interval}s interval")
    
    def stop_monitoring(self):
        """Stop monitoring"""
        self.monitoring_active = False
        if self.monitoring_thread and self.monitoring_thread.is_alive():
            self.monitoring_thread.join(timeout=5)
        self.logger.logger.info("Health monitoring stopped")
    
    def _monitoring_loop(self, interval: float):
        """Main monitoring loop"""
        while self.monitoring_active:
            try:
                metrics = self.collect_system_metrics()
                self.check_alerts(metrics)
                time.sleep(interval)
            except Exception as e:
                self.logger.log_error(e, {'operation': 'monitoring_loop'})
                time.sleep(interval)
    
    def collect_system_metrics(self, capture_system=None) -> SystemMetrics:
        """Collect current system metrics"""
        try:
            # System metrics
            cpu_percent = psutil.cpu_percent(interval=1)
            memory = psutil.virtual_memory()
            disk = psutil.disk_usage('/')
            
            # Application metrics
            camera_active = False
            session_active = False
            capture_count = 0
            
            if capture_system:
                camera_active = capture_system.camera is not None and capture_system.camera.isOpened()
                session_active = capture_system.session_active
                capture_count = capture_system.capture_count
            
            # Error count from recent history
            recent_errors = sum(1 for error in self.error_history 
                              if datetime.fromisoformat(error.timestamp) > 
                              datetime.now() - timedelta(minutes=5))
            
            metrics = SystemMetrics(
                timestamp=datetime.utcnow().isoformat(),
                cpu_percent=cpu_percent,
                memory_percent=memory.percent,
                memory_used_mb=memory.used / (1024 * 1024),
                memory_available_mb=memory.available / (1024 * 1024),
                disk_usage_percent=disk.used / disk.total * 100,
                disk_free_gb=disk.free / (1024 * 1024 * 1024),
                camera_active=camera_active,
                session_active=session_active,
                capture_count=capture_count,
                error_count=recent_errors,
                uptime_seconds=time.time() - self.start_time
            )
            
            with self.lock:
                self.metrics_history.append(metrics)
            
            # Log performance metrics
            self.logger.performance_logger.info("System metrics collected", extra={
                'metrics': asdict(metrics)
            })
            
            return metrics
            
        except Exception as e:
            self.logger.log_error(e, {'operation': 'collect_system_metrics'})
            raise
    
    def record_error(self, error_type: str, error_code: str, message: str, 
                    context: Dict[str, Any], severity: str = 'ERROR'):
        """Record an error for monitoring"""
        error_metric = ErrorMetrics(
            timestamp=datetime.utcnow().isoformat(),
            error_type=error_type,
            error_code=error_code,
            message=message,
            context=context,
            severity=severity
        )
        
        with self.lock:
            self.error_history.append(error_metric)
            self.error_counts[error_type] += 1
            self.error_rate_window.append(time.time())
        
        # Log error for monitoring
        self.logger.logger.error(f"Error recorded: {error_type}", extra={
            'error_metrics': asdict(error_metric)
        })
    
    def record_api_call(self, endpoint: str, response_time_ms: float, status_code: int):
        """Record API call metrics"""
        with self.lock:
            self.api_call_counts[endpoint] += 1
            self.response_times.append(response_time_ms)
        
        # Log API performance
        self.logger.performance_logger.info("API call recorded", extra={
            'endpoint': endpoint,
            'response_time_ms': response_time_ms,
            'status_code': status_code
        })
    
    def check_alerts(self, metrics: SystemMetrics):
        """Check for alert conditions"""
        alerts = []
        
        # CPU usage alert
        if metrics.cpu_percent > self.alert_thresholds['cpu_percent']:
            alerts.append({
                'type': 'HIGH_CPU_USAGE',
                'severity': 'WARNING',
                'message': f'CPU usage at {metrics.cpu_percent:.1f}%',
                'threshold': self.alert_thresholds['cpu_percent']
            })
        
        # Memory usage alert
        if metrics.memory_percent > self.alert_thresholds['memory_percent']:
            alerts.append({
                'type': 'HIGH_MEMORY_USAGE',
                'severity': 'WARNING',
                'message': f'Memory usage at {metrics.memory_percent:.1f}%',
                'threshold': self.alert_thresholds['memory_percent']
            })
        
        # Disk usage alert
        if metrics.disk_usage_percent > self.alert_thresholds['disk_usage_percent']:
            alerts.append({
                'type': 'HIGH_DISK_USAGE',
                'severity': 'CRITICAL',
                'message': f'Disk usage at {metrics.disk_usage_percent:.1f}%',
                'threshold': self.alert_thresholds['disk_usage_percent']
            })
        
        # Error rate alert
        current_time = time.time()
        recent_errors = sum(1 for t in self.error_rate_window 
                           if current_time - t < 60)  # Last minute
        
        if recent_errors > self.alert_thresholds['error_rate_per_minute']:
            alerts.append({
                'type': 'HIGH_ERROR_RATE',
                'severity': 'CRITICAL',
                'message': f'{recent_errors} errors in the last minute',
                'threshold': self.alert_thresholds['error_rate_per_minute']
            })
        
        # Response time alert
        if self.response_times:
            avg_response_time = sum(self.response_times) / len(self.response_times)
            if avg_response_time > self.alert_thresholds['response_time_ms']:
                alerts.append({
                    'type': 'SLOW_RESPONSE_TIME',
                    'severity': 'WARNING',
                    'message': f'Average response time: {avg_response_time:.1f}ms',
                    'threshold': self.alert_thresholds['response_time_ms']
                })
        
        # Send alerts
        for alert in alerts:
            self._send_alert(alert)
    
    def _send_alert(self, alert: Dict):
        """Send alert (log for now, could be extended to email/webhook)"""
        self.logger.logger.warning(f"ALERT: {alert['type']}", extra={
            'alert': alert
        })
    
    def get_health_status(self) -> Dict[str, Any]:
        """Get current health status"""
        with self.lock:
            latest_metrics = self.metrics_history[-1] if self.metrics_history else None
            recent_errors = list(self.error_history)[-10:]  # Last 10 errors
        
        if not latest_metrics:
            return {'status': 'UNKNOWN', 'message': 'No metrics available'}
        
        # Determine overall health status
        status = 'HEALTHY'
        issues = []
        
        if latest_metrics.cpu_percent > self.alert_thresholds['cpu_percent']:
            status = 'WARNING'
            issues.append(f'High CPU usage: {latest_metrics.cpu_percent:.1f}%')
        
        if latest_metrics.memory_percent > self.alert_thresholds['memory_percent']:
            status = 'WARNING'
            issues.append(f'High memory usage: {latest_metrics.memory_percent:.1f}%')
        
        if latest_metrics.disk_usage_percent > self.alert_thresholds['disk_usage_percent']:
            status = 'CRITICAL'
            issues.append(f'High disk usage: {latest_metrics.disk_usage_percent:.1f}%')
        
        if latest_metrics.error_count > 5:
            status = 'WARNING'
            issues.append(f'Recent errors: {latest_metrics.error_count}')
        
        return {
            'status': status,
            'timestamp': datetime.utcnow().isoformat(),
            'uptime_hours': latest_metrics.uptime_seconds / 3600,
            'issues': issues,
            'metrics': asdict(latest_metrics),
            'recent_errors': [asdict(error) for error in recent_errors],
            'error_summary': dict(self.error_counts),
            'api_call_summary': dict(self.api_call_counts)
        }
    
    def export_metrics(self, filepath: str, hours: int = 24):
        """Export metrics to JSON file"""
        try:
            cutoff_time = datetime.now() - timedelta(hours=hours)
            
            with self.lock:
                filtered_metrics = [
                    asdict(metric) for metric in self.metrics_history
                    if datetime.fromisoformat(metric.timestamp) > cutoff_time
                ]
                
                filtered_errors = [
                    asdict(error) for error in self.error_history
                    if datetime.fromisoformat(error.timestamp) > cutoff_time
                ]
            
            export_data = {
                'export_timestamp': datetime.utcnow().isoformat(),
                'period_hours': hours,
                'metrics_count': len(filtered_metrics),
                'errors_count': len(filtered_errors),
                'metrics': filtered_metrics,
                'errors': filtered_errors,
                'summary': {
                    'error_counts': dict(self.error_counts),
                    'api_call_counts': dict(self.api_call_counts),
                    'alert_thresholds': self.alert_thresholds
                }
            }
            
            Path(filepath).parent.mkdir(parents=True, exist_ok=True)
            with open(filepath, 'w') as f:
                json.dump(export_data, f, indent=2)
            
            self.logger.logger.info(f"Metrics exported to {filepath}")
            return True
            
        except Exception as e:
            self.logger.log_error(e, {'operation': 'export_metrics', 'filepath': filepath})
            return False

# Global health monitor instance
health_monitor = HealthMonitor()