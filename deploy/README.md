# Travel Tracker - Raspberry Pi Deployment

This setup provides two separate interfaces for your Travel Tracker app:

- **Admin Interface**: Protected by Cloudflare authentication
- **Embed Interface**: Public interface for embedding on third-party sites

## Prerequisites

- Docker and Docker Compose installed on your Raspberry Pi
- Local Docker registry running on your Pi
- Cloudflare tunnels configured

## Quick Start

1. **Configure environment variables:**
   ```bash
   cp env.example .env
   # Edit .env with your specific settings
   ```

2. **Build and push to your registry:**
   ```bash
   cd deploy
   chmod +x build-and-push.sh
   ./build-and-push.sh
   ```

3. **Deploy on your Pi:**
   ```bash
   cd deploy  # if not already in deploy directory
   chmod +x deploy.sh
   ./deploy.sh
   ```

## Configuration

### Environment Variables (.env)

```bash
# Your Pi's IP address where the registry is running
REGISTRY_HOST=192.168.1.100

# Ports for the two interfaces (choose unused ports)
ADMIN_PORT=3001  # Admin interface
EMBED_PORT=3002  # Public embed interface

# Where to store persistent data on your Pi
DATA_PATH=~/travel-tracker/data
```

### Cloudflare Tunnel Configuration

For your Cloudflare tunnels, configure:

#### Admin Interface (Protected)
```yaml
tunnel: your-tunnel-id
credentials-file: /path/to/credentials.json

ingress:
  - hostname: admin.yourdomain.com
    service: http://localhost:3001
    originRequest:
      access:
        required: true
        teamName: your-team
```

#### Embed Interface (Public)
```yaml
tunnel: your-tunnel-id
credentials-file: /path/to/credentials.json

ingress:
  - hostname: maps.yourdomain.com
    service: http://localhost:3002
    originRequest:
      httpHostHeader: maps.yourdomain.com
```

## Usage

### Admin Interface
- **URL**: `https://admin.yourdomain.com` (via Cloudflare tunnel)
- **Local**: `http://localhost:3001`
- **Protected**: By Cloudflare Access authentication
- **Purpose**: Full admin functionality

### Embed Interface
- **URL**: `https://maps.yourdomain.com` (via Cloudflare tunnel)
- **Local**: `http://localhost:3002`
- **Public**: No authentication required
- **Purpose**: Embeddable maps for third-party sites

### Embedding Maps

To embed a map on a third-party site:

```html
<iframe 
  src="https://maps.yourdomain.com/embed/[map-id]" 
  width="800" 
  height="600" 
  frameborder="0">
</iframe>
```

## Data Persistence

- Data is stored in `~/travel-tracker/data` on your Pi
- This directory is mounted as a volume in both containers
- Both interfaces share the same data

## Maintenance

### Update Deployment
```bash
# Build new image
./build-and-push.sh

# Deploy update
./deploy.sh
```

### View Logs
```bash
# Admin interface logs
docker logs travel-tracker-admin

# Embed interface logs
docker logs travel-tracker-embed

# Follow logs
docker logs -f travel-tracker-admin
```

### Backup Data
```bash
# Backup the data directory
tar -czf travel-tracker-backup-$(date +%Y%m%d).tar.gz ~/travel-tracker/data
```

### Stop Services
```bash
docker-compose -f docker-compose.prod.yml down
```

### Restart Services
```bash
docker-compose -f docker-compose.prod.yml restart
```

## Security Considerations

1. **Admin Interface**: Always keep behind Cloudflare Access authentication
2. **Embed Interface**: Consider rate limiting if needed
3. **Data Directory**: Stored in your home directory (`~/travel-tracker/data`)
4. **Registry Access**: Keep your Docker registry on a private network

## Troubleshooting

### Container Won't Start
```bash
# Check container logs
docker logs travel-tracker-admin
docker logs travel-tracker-embed

# Check if ports are in use
sudo netstat -tulpn | grep :3001
sudo netstat -tulpn | grep :3002
```

### Data Not Persisting
```bash
# Check data directory permissions
ls -la ~/travel-tracker/
# No sudo needed since it's in your home directory
```

### Registry Connection Issues
```bash
# Test registry connection
curl http://YOUR_PI_IP:5000/v2/_catalog

# Check if image exists in registry
curl http://YOUR_PI_IP:5000/v2/travel-tracker/tags/list
```

## Architecture

```
┌─────────────────┐    ┌─────────────────┐
│  Cloudflare     │    │  Cloudflare     │
│  Tunnel         │    │  Tunnel         │
│  (admin domain) │    │  (maps domain)  │
└─────┬───────────┘    └─────┬───────────┘
      │                      │
      │ :3001                │ :3002
      ▼                      ▼
┌─────────────────┐    ┌─────────────────┐
│ Admin Container │    │ Embed Container │
│ (Protected)     │    │ (Public)        │
└─────┬───────────┘    └─────┬───────────┘
      │                      │
      └──────┬─────────────────┘
             ▼
    ┌─────────────────┐
    │ Shared Data     │
    │ ~/travel-       │
    │ tracker/data    │
    └─────────────────┘
``` 