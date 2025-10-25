#!/bin/bash

# ==============================================================================
# Travel Tracker Deployment Script with macOS Keychain Integration
# ==============================================================================
#
# This script deploys the Travel Tracker application to a remote Raspberry Pi
# using SSH. It integrates with macOS Keychain to securely store and retrieve
# SSH passwords.
#
# KEYCHAIN INTEGRATION:
# --------------------
# 1. First Run: The script will try to retrieve the password from Keychain. 
#    If it doesn't exist, it will:
#    - Prompt you to enter the password manually
#    - Ask if you want to store it in Keychain for future use
#    - If you say yes, it stores the password securely
#
# 2. Subsequent Runs: The script will automatically retrieve the password 
#    from Keychain without any prompts
#
# 3. Authorization: The first time you store or access a password in Keychain, 
#    macOS will prompt you to authorize terminal access. You can choose to 
#    "Always Allow" so it won't prompt again.
#
# BENEFITS:
# ---------
# - Security: Password is encrypted and stored securely in Keychain
# - Convenience: No need to type password every time
# - Control: You control when to store/update the password
# - Fallback: Still works if Keychain access fails
#
# MANUAL KEYCHAIN MANAGEMENT:
# ---------------------------
# Store password manually:
#   security add-generic-password -a "pi@192.168.1.100" -s "travel-tracker-deploy" -w
#
# View stored password (will prompt for authorization):
#   security find-generic-password -a "pi@192.168.1.100" -s "travel-tracker-deploy" -w
#
# Delete stored password:
#   security delete-generic-password -a "pi@192.168.1.100" -s "travel-tracker-deploy"
#
# USAGE:
# ------
# Build, push, and deploy:  ./deploy.sh
# Deploy only:              ./deploy.sh --deploy-only
#                          ./deploy.sh -d
# Follow logs:              ./deploy.sh --follow-logs
#                          ./deploy.sh -f
# Combined:                 ./deploy.sh -d -f
#
# ==============================================================================

# Exit on error
set -e

# Change to deploy directory
cd "$(dirname "$0")"

# Load environment variables
if [ -f .env ]; then
    set -a
    source .env
    set +a
fi

# Configuration
PI_HOST=${PI_HOST:-}
PI_USER=${PI_USER:-pi}
DEPLOY_PATH=${DEPLOY_PATH:-/home/${PI_USER}/travel-tracker}
KEYCHAIN_SERVICE="travel-tracker-deploy"
KEYCHAIN_ACCOUNT="$PI_USER@$PI_HOST"

# Default flag values
FOLLOW_LOGS=false
DEPLOY_ONLY=false

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -f|--follow-logs)
                FOLLOW_LOGS=true
                shift
                ;;
            -d|--deploy-only)
                DEPLOY_ONLY=true
                shift
                ;;
            -h|--help)
                echo "Usage: $0 [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  -f, --follow-logs    Follow container logs after deployment"
                echo "  -d, --deploy-only    Skip build and push, deploy only"
                echo "  -h, --help          Show this help message"
                echo ""
                echo "Examples:"
                echo "  $0                  Build, push, and deploy"
                echo "  $0 -f               Build, push, deploy, and follow logs"
                echo "  $0 -d               Deploy only (skip build and push)"
                echo "  $0 -d -f            Deploy only and follow logs"
                echo ""
                echo "Configuration:"
                echo "  Set PI_HOST, PI_USER, and DEPLOY_PATH in .env file"
                echo "  Set REGISTRY_HOST, IMAGE_NAME, IMAGE_TAG for build/push"
                exit 0
                ;;
            *)
                echo "Unknown option: $1"
                echo "Use -h or --help for usage information"
                exit 1
                ;;
        esac
    done
}

# Function to get password from keychain or prompt for it
get_password() {
    echo "🔐 Retrieving SSH password from Keychain..."
    
    # Try to get password from keychain
    PASSWORD=$(security find-generic-password -a "$KEYCHAIN_ACCOUNT" -s "$KEYCHAIN_SERVICE" -w 2>/dev/null || echo "")
    
    if [ -z "$PASSWORD" ]; then
        echo "❌ Password not found in Keychain."
        echo
        echo "💡 To store your password in Keychain manually, run this command:"
        echo "   security add-generic-password -a \"$KEYCHAIN_ACCOUNT\" -s \"$KEYCHAIN_SERVICE\" -w"
        echo "   (This will prompt you securely for the password)"
        echo
        prompt_for_password
        
        # Ask if user wants to store password in keychain
        echo
        echo -n "Would you like to store this password in Keychain for future use? (y/n): "
        read -r store_password
        if [[ "$store_password" =~ ^[Yy]$ ]]; then
            echo "🔐 Storing password in Keychain..."
            if security add-generic-password -a "$KEYCHAIN_ACCOUNT" -s "$KEYCHAIN_SERVICE" -w "$PASSWORD" 2>/dev/null; then
                echo "✅ Password stored successfully in Keychain."
            else
                echo "⚠️  Failed to store password in Keychain, but continuing with deployment."
            fi
        fi
    else
        echo "✅ Password retrieved from Keychain."
        # Test the password before proceeding
        if ! test_ssh_connection; then
            echo "❌ Keychain password appears to be incorrect."
            echo "🔄 Please enter the correct password:"
            prompt_for_password
            
            # Suggest updating keychain
            echo
            echo "💡 To update your Keychain with the correct password, run:"
            echo "   security delete-generic-password -a \"$KEYCHAIN_ACCOUNT\" -s \"$KEYCHAIN_SERVICE\""
            echo "   security add-generic-password -a \"$KEYCHAIN_ACCOUNT\" -s \"$KEYCHAIN_SERVICE\" -w"
        fi
    fi
}

# Function to prompt for password
prompt_for_password() {
    echo -n "Enter your SSH password for $PI_USER@$PI_HOST: "
    read -s PASSWORD
    echo
    
    # Test the password
    if ! test_ssh_connection; then
        echo "❌ SSH connection failed. Please check your password and try again."
        exit 1
    fi
}

# Function to test SSH connection
test_ssh_connection() {
    echo "🔑 Testing SSH connection..."
    
    # Check if sshpass is available
    if ! command -v sshpass &> /dev/null; then
        echo "❌ sshpass is not installed. Please install it:"
        echo "   On macOS: brew install sshpass"
        echo "   On Ubuntu/Debian: sudo apt-get install sshpass"
        return 1
    fi
    
    if sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 $PI_USER@$PI_HOST "echo 'SSH connection successful'" >/dev/null 2>&1; then
        echo "✅ SSH connection test successful."
        return 0
    else
        return 1
    fi
}

# Function to run SSH commands with password
run_ssh() {
    sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no $PI_USER@$PI_HOST "$1"
}

# Function to run SCP with password
run_scp() {
    sshpass -p "$PASSWORD" scp -o StrictHostKeyChecking=no "$@"
}

# Function to follow logs
follow_logs() {
    echo "📋 Attaching to container logs..."
    echo "💡 Press Ctrl+C to exit log following"
    echo ""
    
    # Use -t flag for interactive terminal to properly handle Ctrl+C
    sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no -t $PI_USER@$PI_HOST "cd $DEPLOY_PATH && docker-compose -f docker-compose.prod.yml logs -f"
}

# Validate configuration
validate_config() {
    if [ -z "$PI_HOST" ]; then
        echo "❌ Error: PI_HOST not set in .env file"
        echo "Please set PI_HOST=your.pi.ip.address in .env"
        echo ""
        echo "Example .env file:"
        echo "PI_HOST=192.168.1.100"
        echo "PI_USER=pi"
        echo "DEPLOY_PATH=/home/pi/travel-tracker"
        exit 1
    fi
    
    echo "📋 Deployment Configuration:"
    echo "   Host: $PI_HOST"
    echo "   User: $PI_USER"
    echo "   Path: $DEPLOY_PATH"
    echo ""
}

# Parse command line arguments
parse_args "$@"

echo "🚀 Starting Travel Tracker deployment process..."

# Validate configuration
validate_config

# Get password from keychain or prompt
get_password

# Build and push Docker image unless deploy-only flag is set
if [ "$DEPLOY_ONLY" = false ]; then
    echo "🔨 Building and pushing Docker image..."
    
    # Check if build script exists
    if [ ! -f "build-and-push.sh" ]; then
        echo "❌ Error: build-and-push.sh not found in deploy directory"
        exit 1
    fi
    
    # Run build and push script
    if ! ./build-and-push.sh; then
        echo "❌ Build and push failed. Aborting deployment."
        exit 1
    fi
    
    
    echo "✅ Build and push completed successfully!"
else
    echo "⏩ Skipping build and push (deploy-only mode)"
fi

echo "📋 Deploying Travel Tracker to $PI_USER@$PI_HOST..."

# Copy deployment files to Pi
echo "📦 Copying deployment files to Pi..."
run_ssh "mkdir -p $DEPLOY_PATH"
run_scp docker-compose.prod.yml .env $PI_USER@$PI_HOST:$DEPLOY_PATH/

# Run deployment commands on Pi
echo "🔄 Running deployment on Pi..."
run_ssh "
    set -e
    cd $DEPLOY_PATH
    
    # Load environment variables
    set -a
    source .env
    set +a
    
    # Default values and expand paths
    DATA_PATH=\${DATA_PATH:-~/travel-tracker/data}
    DATA_PATH=\$(eval echo \$DATA_PATH)

    # Compute image registry host used by docker-compose
    # Prefer REGISTRY_PULL_HOST if set; otherwise fall back to REGISTRY_HOST
    IMAGE_REGISTRY=\${REGISTRY_PULL_HOST:-\$REGISTRY_HOST}
    export IMAGE_REGISTRY
    
    echo \"📁 Setting up Travel Tracker deployment on Pi...\"
    
    # Create data directory if it doesn't exist
    echo \"📁 Creating data directory at \$DATA_PATH...\"
    mkdir -p \$DATA_PATH
    
    # Export DATA_PATH for docker compose
    export DATA_PATH
    
    # Check if docker-compose is available
    if ! command -v docker-compose &> /dev/null; then
        echo \"❌ Error: docker-compose not found on Pi\"
        echo \"Please install docker-compose on your Pi:\"
        echo \"  sudo apt update && sudo apt install docker-compose\"
        exit 1
    fi
    
    # Pull latest image
    echo \"⬇️  Pulling latest image from registry...\"
    docker-compose -f docker-compose.prod.yml pull
    
    # Stop existing containers
    echo \"⏹️  Stopping existing containers...\"
    docker-compose -f docker-compose.prod.yml down
"

# Create local backup of remote data directory
echo "💾 Creating local backup of remote data directory..."
LOCAL_BACKUP_DIR=${LOCAL_BACKUP_DIR:-"$PWD/backups"}
mkdir -p "$LOCAL_BACKUP_DIR"
BACKUP_TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
LOCAL_BACKUP_FILE="$LOCAL_BACKUP_DIR/data-$BACKUP_TIMESTAMP.tar.gz"

# Resolve remote data path
REMOTE_DATA_PATH=$(run_ssh "
    cd $DEPLOY_PATH
    set -a
    source .env
    set +a
    DATA_PATH=\${DATA_PATH:-~/travel-tracker/data}
    DATA_PATH=\$(eval echo \$DATA_PATH)
    printf '%s' \"\$DATA_PATH\"
")
REMOTE_DATA_PATH=$(echo "$REMOTE_DATA_PATH" | tr -d '\r')
if [ -z "$REMOTE_DATA_PATH" ]; then
    echo "❌ Failed to resolve remote data path."
    exit 1
fi

REMOTE_DATA_PATH_ESCAPED=$(printf '%q' "$REMOTE_DATA_PATH")
if sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no $PI_USER@$PI_HOST "tar -czf - -C $REMOTE_DATA_PATH_ESCAPED ." > "$LOCAL_BACKUP_FILE"; then
    echo "✅ Local backup saved to $LOCAL_BACKUP_FILE"
else
    echo "❌ Failed to download remote backup."
    rm -f "$LOCAL_BACKUP_FILE"
    exit 1
fi

# Apply retention policy locally: keep backups from last 7 days and at least the 10 most recent
if command -v gdate &> /dev/null; then
    LIMIT_TIMESTAMP=$(gdate -d '7 days ago' +%s)
elif date -d '7 days ago' +%s >/dev/null 2>&1; then
    LIMIT_TIMESTAMP=$(date -d '7 days ago' +%s)
else
    LIMIT_TIMESTAMP=$(date -v-7d +%s)
fi

if ls "$LOCAL_BACKUP_DIR"/data-*.tar.gz >/dev/null 2>&1; then
    IFS=$'\n' BACKUP_FILES=($(ls -1t "$LOCAL_BACKUP_DIR"/data-*.tar.gz 2>/dev/null))
    unset IFS
    KEEP_COUNT=0
    for BACKUP_FILE in "${BACKUP_FILES[@]}"; do
        [ -f "$BACKUP_FILE" ] || continue
        if stat -f "%m" "$BACKUP_FILE" >/dev/null 2>&1; then
            FILE_TIMESTAMP=$(stat -f "%m" "$BACKUP_FILE")
        else
            FILE_TIMESTAMP=$(stat -c "%Y" "$BACKUP_FILE")
        fi
        KEEP=0
        if [ "$KEEP_COUNT" -lt 10 ]; then
            KEEP=1
        fi
        if [ "$FILE_TIMESTAMP" -ge "$LIMIT_TIMESTAMP" ]; then
            KEEP=1
        fi
        if [ "$KEEP" -eq 0 ]; then
            echo "🗑️  Removing expired backup $BACKUP_FILE"
            rm -f "$BACKUP_FILE"
        fi
        KEEP_COUNT=$((KEEP_COUNT + 1))
    done
fi

echo "📂 Current local backups in $LOCAL_BACKUP_DIR:"
if ! ls -1t "$LOCAL_BACKUP_DIR"; then
    echo "ℹ️  No backups found in $LOCAL_BACKUP_DIR"
fi

# Restart services after local backup
run_ssh "
    set -e
    cd $DEPLOY_PATH
    
    # Reload environment variables
    set -a
    source .env
    set +a
    
    DATA_PATH=\${DATA_PATH:-~/travel-tracker/data}
    DATA_PATH=\$(eval echo \$DATA_PATH)
    export DATA_PATH
    IMAGE_REGISTRY=\${REGISTRY_PULL_HOST:-\$REGISTRY_HOST}
    export IMAGE_REGISTRY
    
    # Start services
    echo \"▶️  Starting services...\"
    docker-compose -f docker-compose.prod.yml up -d
    
    # Show status
    echo \"📊 Deployment completed! Services status:\"
    docker-compose -f docker-compose.prod.yml ps
    
    echo \"\"
    echo \"🌐 Services are running on:\"
    echo \"  Admin Interface: http://\$(hostname -I | awk '{print \$1}'):\${ADMIN_PORT:-3001}\"
    echo \"  Embed Interface: http://\$(hostname -I | awk '{print \$1}'):\${EMBED_PORT:-3002}\"
    echo \"\"
    echo \"💾 Data is persisted at: \$DATA_PATH\"
    # Clean up dangling images on remote machine
    echo \"🧹 Cleaning up dangling Docker images on remote machine...\"
    docker image prune -f
    echo \"✅ Docker cleanup completed\"
    echo \"\"
"

echo ""
echo "✅ Deployment completed successfully!"
echo "🖥️  Services are now running on your Pi at $PI_HOST"

# Follow logs if requested
if [ "$FOLLOW_LOGS" = true ]; then
    echo ""
    follow_logs
else
    # Clear password from memory
    PASSWORD=""
    echo "💡 To follow logs, run: $0 --follow-logs"
fi
