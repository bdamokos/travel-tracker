#!/bin/bash

# Deploy script for Travel Tracker on Raspberry Pi
set -e

# Change to deploy directory
cd "$(dirname "$0")"

# Load environment variables
if [ -f .env ]; then
    set -a
    source .env
    set +a
fi

# Required variables
PI_HOST=${PI_HOST:-}
PI_USER=${PI_USER:-pi}
DEPLOY_PATH=${DEPLOY_PATH:-/home/${PI_USER:-pi}/travel-tracker}

if [ -z "$PI_HOST" ]; then
    echo "Error: PI_HOST not set in .env file"
    echo "Please set PI_HOST=your.pi.ip.address in .env"
    exit 1
fi

echo "Deploying Travel Tracker to $PI_USER@$PI_HOST..."

# Copy deployment files to Pi
echo "Copying deployment files to Pi..."
ssh $PI_USER@$PI_HOST "mkdir -p $DEPLOY_PATH"
scp docker-compose.prod.yml .env $PI_USER@$PI_HOST:$DEPLOY_PATH/

# Run deployment commands on Pi
echo "Running deployment on Pi..."
ssh $PI_USER@$PI_HOST << EOF
    set -e
    cd $DEPLOY_PATH
    
    # Load environment variables
    set -a
    source .env
    set +a
    
    # Default values and expand paths
    DATA_PATH=\${DATA_PATH:-~/travel-tracker/data}
    DATA_PATH=\$(eval echo \$DATA_PATH)
    
    echo "Setting up Travel Tracker deployment on Pi..."
    
    # Create data directory if it doesn't exist
    echo "Creating data directory at \$DATA_PATH..."
    mkdir -p \$DATA_PATH
    
    # Export DATA_PATH for docker compose
    export DATA_PATH
    
    # Check if docker-compose is available
    if ! command -v docker-compose &> /dev/null; then
        echo "Error: docker-compose not found on Pi"
        echo "Please install docker-compose on your Pi:"
        echo "  sudo apt update && sudo apt install docker-compose"
        exit 1
    fi
    
    # Pull latest image
    echo "Pulling latest image from registry..."
    docker-compose -f docker-compose.prod.yml pull
    
    # Stop existing containers
    echo "Stopping existing containers..."
    docker-compose -f docker-compose.prod.yml down
    
    # Start services
    echo "Starting services..."
    docker-compose -f docker-compose.prod.yml up -d
    
    # Show status
    echo "Deployment completed! Services status:"
    docker-compose -f docker-compose.prod.yml ps
    
    echo ""
    echo "Services are running on:"
    echo "  Admin Interface: http://\$(hostname -I | awk '{print \$1}'):\${ADMIN_PORT:-3001}"
    echo "  Embed Interface: http://\$(hostname -I | awk '{print \$1}'):\${EMBED_PORT:-3002}"
    echo ""
    echo "Data is persisted at: \$DATA_PATH"
EOF

echo ""
echo "Deployment completed successfully!"
echo "Services are now running on your Pi at $PI_HOST" 