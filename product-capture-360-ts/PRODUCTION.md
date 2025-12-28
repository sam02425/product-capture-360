# Production Deployment Guide

## Production-Grade Features

This application includes enterprise-grade features for production deployment:

### ✅ Security & Stability
- **Rate Limiting**: 100 requests/minute per IP
- **Request Validation**: JSON Schema validation on all critical endpoints
- **Error Handling**: Comprehensive error middleware with safe error messages
- **Graceful Shutdown**: SIGTERM/SIGINT handlers for clean shutdowns
- **Structured Logging**: Production-ready logging with pino

### ✅ Monitoring & Health
- **Health Check Endpoint**: `GET /health`
- **Request ID Tracking**: Unique request IDs for log correlation
- **Performance Metrics**: Request timing and camera status monitoring
- **Trust Proxy**: Configured for reverse proxy deployments

### ✅ Production Build
- TypeScript compilation to optimized JavaScript
- Production-only dependencies (devDependencies excluded)
- Environment-based configuration

---

## Quick Production Deployment

### 1. Build for Production

```bash
# Build TypeScript to JavaScript
npm run build

# Or build + prune dev dependencies
npm run build:prod
```

This creates optimized code in the `dist/` folder.

### 2. Start Production Server

```bash
# Start with production environment
npm run start:prod
```

Or manually:
```bash
NODE_ENV=production node dist/server.js
```

### 3. Environment Variables

Create a `.env` file or set these in your environment:

```bash
# Server Configuration
PORT=5002
HOST=0.0.0.0
NODE_ENV=production

# Logging
LOG_LEVEL=info  # Options: trace, debug, info, warn, error, fatal

# Optional: Rate Limiting
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=60000  # milliseconds
```

---

## Production Checklist

### Pre-Deployment

- [ ] Run `npm run build` - verify no TypeScript errors
- [ ] Test all critical endpoints with validation
- [ ] Verify camera detection works in production environment
- [ ] Test rate limiting with load testing tool
- [ ] Check error handling returns safe messages (no stack traces)

### Deployment

- [ ] Set `NODE_ENV=production`
- [ ] Configure reverse proxy (nginx/Apache) if needed
- [ ] Set up process manager (PM2/systemd)
- [ ] Configure firewall rules
- [ ] Set up SSL/TLS certificates
- [ ] Configure log rotation

### Post-Deployment

- [ ] Monitor `/health` endpoint
- [ ] Check application logs for errors
- [ ] Verify rate limiting is active
- [ ] Test graceful shutdown behavior
- [ ] Monitor memory usage and performance

---

## Process Management with PM2

### Install PM2
```bash
npm install -g pm2
```

### Start Application
```bash
# Build first
npm run build

# Start with PM2
pm2 start dist/server.js --name "product-capture-360" -i max

# Enable startup script
pm2 startup
pm2 save
```

### Monitor Application
```bash
# View logs
pm2 logs product-capture-360

# Monitor metrics
pm2 monit

# Restart application
pm2 restart product-capture-360

# Stop application
pm2 stop product-capture-360
```

---

## Reverse Proxy (nginx)

Example nginx configuration:

```nginx
upstream product_capture {
    server 127.0.0.1:5002;
}

server {
    listen 80;
    server_name your-domain.com;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    location / {
        proxy_pass http://product_capture;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Increase timeout for long-running pipeline operations
        proxy_read_timeout 600s;
        proxy_connect_timeout 600s;
        proxy_send_timeout 600s;
    }

    # Video feed streaming
    location /video_feed {
        proxy_pass http://product_capture;
        proxy_buffering off;
        proxy_cache off;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

---

## API Endpoints

### Health Check
```bash
curl http://localhost:5002/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2025-12-27T23:00:00.000Z",
  "uptime": 3600,
  "camera": { "connected": true },
  "storage": { "configured": true }
}
```

### Rate Limit Testing
```bash
# This will be rate limited after 100 requests/minute
for i in {1..120}; do
  curl -w "\n" http://localhost:5002/api/camera/scan
done
```

### Request Validation Testing
```bash
# Valid request
curl -X POST http://localhost:5002/api/pipeline/quick \
  -H "Content-Type: application/json" \
  -d '{
    "product_folder": "/path/to/images",
    "product_name": "test_product",
    "background_images": ["/path/to/bg.jpg"]
  }'

# Invalid request (missing required field) - will return 400
curl -X POST http://localhost:5002/api/pipeline/quick \
  -H "Content-Type: application/json" \
  -d '{
    "product_folder": "/path/to/images"
  }'
```

---

## Security Considerations

### 1. File Path Validation
The application accepts file paths from users. Ensure:
- Input paths are validated and sanitized
- Users cannot access files outside allowed directories
- Implement proper access controls

### 2. Rate Limiting
Current settings:
- 100 requests/minute per IP
- localhost (127.0.0.1) is whitelisted
- Adjust `RATE_LIMIT_MAX` for your needs

### 3. CORS Configuration
Currently allows all origins in development. For production:

```typescript
// In src/server.ts
app.register(fastifyCors, {
  origin: ['https://your-domain.com'],
  credentials: true,
});
```

### 4. File Upload Limits
Ensure your reverse proxy and Node.js have appropriate limits:
```bash
# nginx
client_max_body_size 100M;
```

---

## Performance Optimization

### 1. Camera Streaming
- Preview FPS is configurable (default: 15 FPS)
- Higher FPS = more CPU usage
- Adjust based on your hardware

### 2. Pipeline Processing
- CPU-intensive operations run synchronously
- Consider using worker threads for heavy processing
- Monitor memory usage during augmentation

### 3. Log Configuration
```bash
# Production: minimal logging
LOG_LEVEL=warn

# Development: verbose logging
LOG_LEVEL=debug
```

---

## Monitoring & Alerts

### Log Monitoring
```bash
# View recent errors
pm2 logs product-capture-360 --err

# Filter for specific patterns
pm2 logs product-capture-360 | grep "ERROR"
```

### Health Check Monitoring
Set up automated health checks:

```bash
# Cron job example (every 5 minutes)
*/5 * * * * curl -f http://localhost:5002/health || systemctl restart product-capture-360
```

### Metrics to Monitor
- CPU usage (watch for camera operations)
- Memory usage (watch during augmentation)
- Request latency (pipeline operations can be slow)
- Error rate (check logs for patterns)
- Disk space (datasets can be large)

---

## Troubleshooting

### Server Won't Start
```bash
# Check port availability
lsof -i :5002

# Check logs
pm2 logs product-capture-360

# Verify build
npm run build
```

### Camera Not Detected
```bash
# Check FFmpeg installation
ffmpeg -version

# List devices manually
ffmpeg -f avfoundation -list_devices true -i ""

# Check permissions
# macOS: System Preferences → Security & Privacy → Camera
```

### Rate Limiting Too Aggressive
```bash
# Increase limits
RATE_LIMIT_MAX=500 npm run start:prod
```

### Pipeline Timeouts
```bash
# Increase nginx timeout (if using reverse proxy)
proxy_read_timeout 1200s;

# Or increase Node.js timeout
NODE_OPTIONS="--max-old-space-size=4096" npm run start:prod
```

---

## Backup & Recovery

### Important Directories
- `captures/` - Raw product images
- `datasets/` - Generated training datasets
- `.versions/` - Dataset version metadata

### Backup Script
```bash
#!/bin/bash
BACKUP_DIR="/backups/product-capture-360"
DATE=$(date +%Y%m%d_%H%M%S)

tar -czf "$BACKUP_DIR/backup_$DATE.tar.gz" \
  captures/ \
  datasets/ \
  .versions/ \
  public/backgrounds/

# Keep only last 7 days
find "$BACKUP_DIR" -name "backup_*.tar.gz" -mtime +7 -delete
```

---

## Scaling Considerations

### Horizontal Scaling
- Use load balancer with sticky sessions
- Camera access requires direct hardware connection
- Consider separate processing workers

### Vertical Scaling
- CPU: More cores help with FFmpeg operations
- RAM: 4GB minimum, 8GB recommended for large datasets
- GPU: Optional, improves segmentation speed (SAM/rembg)

### Storage Scaling
- Datasets can grow to 10GB+ per product
- Consider S3/object storage for long-term retention
- Implement automated cleanup policies

---

## Deployment Platforms

### Docker (Optional)
```dockerfile
FROM node:20-slim

RUN apt-get update && apt-get install -y ffmpeg python3 python3-pip

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 5002

CMD ["node", "dist/server.js"]
```

### Cloud Deployment
- **AWS EC2**: Use t3.medium or larger
- **DigitalOcean**: CPU-optimized droplets
- **Google Cloud**: e2-standard-2 or larger

**Note**: USB camera access requires physical hardware - cloud deployment may need local camera proxy.

---

## Support & Maintenance

### Regular Maintenance Tasks
- [ ] Weekly: Check logs for errors
- [ ] Weekly: Monitor disk usage
- [ ] Monthly: Update dependencies (`npm audit`)
- [ ] Monthly: Review and archive old datasets
- [ ] Quarterly: Update Node.js version

### Updating the Application
```bash
# Pull latest code
git pull

# Install dependencies
npm install

# Rebuild
npm run build

# Restart with PM2
pm2 restart product-capture-360
```

---

## Performance Benchmarks

### Typical Operation Times
- Camera initialization: 1-2 seconds
- Single image capture: 50-100ms
- Auto-segmentation (120 images): 2-5 minutes
- Augmentation (2000 images): 5-10 minutes
- Dataset export: 30-60 seconds

### Resource Usage
- Idle: 50-100MB RAM
- During capture: 200-300MB RAM
- During pipeline: 500MB-2GB RAM
- Disk: ~50MB per 120 captured images

---

**Ready for production!** 🚀

For issues or questions, check the main [README_COMPLETE.md](README_COMPLETE.md) or [SETUP_GUIDE.md](SETUP_GUIDE.md).
