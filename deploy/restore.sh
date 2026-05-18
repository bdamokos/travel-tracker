#!/bin/bash

# ==============================================================================
# Travel Tracker Restore Utility with macOS Keychain Integration
# ==============================================================================
#
# This script restores a local backup to the remote Raspberry Pi.
# It uses the same Keychain integration as the deploy script for authentication.
#
# WARNING: This will OVERWRITE data on the remote server.
# A safety backup is created automatically before any data is deleted.
#
# USAGE:
# ------
# Restore specific file:    ./restore.sh backups/data-20241227-120000.tar.gz
# Interactive mode:         ./restore.sh
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
CONTAINER_DATA_GID=${CONTAINER_DATA_GID:-1001}
KEYCHAIN_SERVICE="travel-tracker-deploy"
KEYCHAIN_ACCOUNT="$PI_USER@$PI_HOST"
BACKUPS_DIR=${BACKUPS_DIR:-"${XDG_STATE_HOME:-$HOME/.local/state}/travel-tracker/backups"}

# Function to get password from keychain or prompt for it
get_password() {
    echo "🔐 Retrieving SSH password from Keychain..."
    
    # Try to get password from keychain
    PASSWORD=$(security find-generic-password -a "$KEYCHAIN_ACCOUNT" -s "$KEYCHAIN_SERVICE" -w 2>/dev/null || echo "")
    
    if [ -z "$PASSWORD" ]; then
        echo "❌ Password not found in Keychain."
        echo "Please run ./deploy.sh first to set up your password in Keychain,"
        echo "or enter it manually below."
        echo
        prompt_for_password
    else
        echo "✅ Password retrieved from Keychain."
        # Test the password before proceeding
        if ! test_ssh_connection; then
            echo "❌ Keychain password appears to be incorrect."
            echo "🔄 Please enter the correct password:"
            prompt_for_password
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
    # Check if sshpass is available
    if ! command -v sshpass &> /dev/null; then
        echo "❌ sshpass is not installed. Please install it:"
        echo "   brew install sshpass"
        exit 1
    fi
    
    if sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 $PI_USER@$PI_HOST "echo 'SSH ok'" >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Function to run SSH commands with password
run_ssh() {
    sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no $PI_USER@$PI_HOST "$1"
}

# Validate configuration
if [ -z "$PI_HOST" ]; then
    echo "❌ Error: PI_HOST not set in .env file"
    exit 1
fi

echo "🚀 Starting Travel Tracker Restore Process..."

mkdir -p "$BACKUPS_DIR"
chmod 700 "$BACKUPS_DIR"

# Get password first
get_password

# Select backup file
if [ -n "$1" ]; then
    BACKUP_FILE="$1"
else
    echo "📂 Available backups in $BACKUPS_DIR:"
    echo
    # List backups, sorted by date (newest first), formatting for readability
    # We use ls to get names, then loop to print with number
    files=($(ls -1t "$BACKUPS_DIR"/data-*.tar.gz 2>/dev/null))
    
    if [ ${#files[@]} -eq 0 ]; then
        echo "❌ No backups found in $BACKUPS_DIR"
        exit 1
    fi

    for i in "${!files[@]}"; do
        echo "  [$((i+1))] ${files[$i]}"
    done
    echo
    echo -n "Select backup to restore (1-${#files[@]}): "
    read -r choice
    
    if [[ ! "$choice" =~ ^[0-9]+$ ]] || [ "$choice" -lt 1 ] || [ "$choice" -gt "${#files[@]}" ]; then
        echo "❌ Invalid selection"
        exit 1
    fi
    
    BACKUP_FILE="${files[$((choice-1))]}"
fi

# Verify backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
    echo "❌ Backup file not found: $BACKUP_FILE"
    exit 1
fi

echo
echo "⚠️  WARNING: YOU ARE ABOUT TO RESTORE DIRECTORY DATA"
echo "   Source: $BACKUP_FILE"
echo "   Target: $PI_USER@$PI_HOST"
echo "   Target Path: (Remote Data Directory)"
echo
echo "   This will:"
echo "   1. Stop remote services"
echo "   2. Create a SAFETY BACKUP of current remote data"
echo "   3. WIPE existing remote data"
echo "   4. EXTRACT data from the selected backup"
echo "   5. Restart services"
echo
echo -n "Are you SURE you want to proceed? (type 'RESTORE' to confirm): "
read -r confirm

if [ "$confirm" != "RESTORE" ]; then
    echo "❌ Restore cancelled."
    exit 0
fi

echo
echo "🔄 Connecting to remote server..."

# Stop services
echo "⏹️  Stopping remote services..."
run_ssh "
    cd $DEPLOY_PATH
    docker-compose -f docker-compose.prod.yml down
"

# Get remote data path
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

echo "📍 Remote data path: $REMOTE_DATA_PATH"

# Create safety backup (LOCALLY)
SAFETY_BACKUP_NAME="data-safety-$(date +"%Y%m%d-%H%M%S").tar.gz"
LOCAL_SAFETY_BACKUP="$BACKUPS_DIR/$SAFETY_BACKUP_NAME"

echo "🛡️  Creating safety backup LOCALLY: $LOCAL_SAFETY_BACKUP"

# Use specific tar logic to stream remote data to local file
# Using sudo to ensure we can read all files (even root-owned ones)
REMOTE_DATA_PATH_ESCAPED=$(printf '%q' "$REMOTE_DATA_PATH")
if (umask 077 && sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no $PI_USER@$PI_HOST "echo \"$PASSWORD\" | sudo -S tar -czf - -C $REMOTE_DATA_PATH_ESCAPED ." > "$LOCAL_SAFETY_BACKUP"); then
    chmod 600 "$LOCAL_SAFETY_BACKUP"
    echo "✅ Safety backup saved to $LOCAL_SAFETY_BACKUP"
else
    echo "❌ Failed to download safety backup."
    rm -f "$LOCAL_SAFETY_BACKUP"
    exit 1
fi

# Wipe and Restore
echo "🧹 Wiping existing data (using sudo)..."
# Use sudo with password to ensure permissions
run_ssh "echo \"$PASSWORD\" | sudo -S rm -rf \"$REMOTE_DATA_PATH\"/*"

echo "📦 Uploading backup file..."
TEMP_REMOTE_FILE="/tmp/restore-upload-$(date +%s).tar.gz"

if sshpass -p "$PASSWORD" scp -o StrictHostKeyChecking=no "$BACKUP_FILE" $PI_USER@$PI_HOST:"$TEMP_REMOTE_FILE"; then
    echo "✅ Backup uploaded to $TEMP_REMOTE_FILE"
else
    echo "❌ Failed to upload backup file."
    exit 1
fi

echo "📦 Extracting backup (using sudo)..."
# Extract using sudo from the temp file
if run_ssh "echo \"$PASSWORD\" | sudo -S tar -xzf \"$TEMP_REMOTE_FILE\" -C \"$REMOTE_DATA_PATH\""; then
    echo "✅ Extraction successful."
else
    echo "❌ Extraction failed."
    # Try to clean up anyway
    run_ssh "rm -f \"$TEMP_REMOTE_FILE\""
    exit 1
fi

# Clean up temp file
echo "🧹 Cleaning up temporary file..."
run_ssh "rm -f \"$TEMP_REMOTE_FILE\""

# Fix permissions after restore (users often have permission issues if files are restored as root)
echo "🔧 Fixing permissions..."
OWNER_SPEC_ESCAPED=$(printf '%q' "$PI_USER:$CONTAINER_DATA_GID")
run_ssh "echo \"$PASSWORD\" | sudo -S chown -R $OWNER_SPEC_ESCAPED $REMOTE_DATA_PATH_ESCAPED"
run_ssh "echo \"$PASSWORD\" | sudo -S find $REMOTE_DATA_PATH_ESCAPED -type d -exec chmod 770 {} +"
run_ssh "echo \"$PASSWORD\" | sudo -S find $REMOTE_DATA_PATH_ESCAPED -type f -exec chmod 660 {} +"


echo "✅ Backup restored successfully."

# Restart services
echo "▶️  Restarting services..."
echo "▶️  Restarting services..."
run_ssh "
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
    docker-compose -f docker-compose.prod.yml up -d
"

echo
echo "🎉 Restore Complete!"
echo "   Services should be coming back online."
echo "   Safety backup stored at: $DEPLOY_PATH/$SAFETY_BACKUP_NAME"
