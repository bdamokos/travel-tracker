# Travel Tracker - Example Raspberry Pi Deployment

This document provides a detailed example of how to deploy the Travel Tracker application to a Raspberry Pi using Docker, Docker Compose, and Cloudflare Tunnels. This is a specific example and may need to be adapted to your own environment.

This setup provides two separate interfaces for your Travel Tracker app:

- **Admin Interface**: Protected by Cloudflare authentication
- **Embed Interface**: Public interface for embedding on third-party sites

## Prerequisites

- Docker and Docker Compose installed on your Raspberry Pi
- Local Docker registry running on your Pi
- Cloudflare tunnels configured
- **Bun** as the package manager (https://bun.sh/)

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

# If the registry runs on the same Pi, add this so the Pi pulls via loopback
# This avoids TLS requirements for a local HTTP registry
# REGISTRY_PULL_HOST=127.0.0.1

# Ports for the two interfaces (choose unused ports)
ADMIN_PORT=3001  # Admin interface
EMBED_PORT=3002  # Public embed interface

# Where to store persistent data on your Pi
DATA_PATH=~/travel-tracker/data
```

### Cloudflare Tunnel Configuration

Set up two Cloudflare tunnels, one for the admin interface and one for the embed interface.

The admin interface should point to the local port 3001 and you should set up Cloudflare Access for it to make sure only authorized users can access it.

The embed interface should point to the local port 3002.

(The port numbers are set in the .env file)

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

To embed a map on a third-party site use the code snippet found in the admin interface.



## Data Persistence

- Data is stored in `~/travel-tracker/data` on your Pi
- This directory is mounted as a volume in both containers
- Both interfaces share the same data

## Maintenance

### Update Deployment (for local development)
```bash
# Deploy update
./deploy.sh
```

### Update Deployment (for production)

```bash
git pull


./deploy.sh
```

---

## Bun & Docker

- The Dockerfile now uses Bun as the package manager and runtime.
- All dependency management and builds are done with Bun (`bun install`, `bun run build`).
- You no longer need `package-lock.json` or `yarn.lock` files; Bun uses `bun.lockb`.

---

## Security Considerations

1. **Admin Interface**: Always keep behind Cloudflare Access authentication
2. **Embed Interface**: Consider rate limiting if needed
3. **Data Directory**: Stored in your home directory (`~/travel-tracker/data`)
4. **Registry Access**: Keep your Docker registry on a private network. If your
   registry is HTTP-only, Docker requires either:
   - Using loopback (`REGISTRY_PULL_HOST=127.0.0.1`) when pulling on the same Pi, or
   - Configuring Docker Engine on the Pi with an insecure registry entry:
     - Edit `/etc/docker/daemon.json` and add: `{ "insecure-registries": ["<PI_IP>:5010"] }`
     - Then run: `sudo systemctl daemon-reload && sudo systemctl restart docker`


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
