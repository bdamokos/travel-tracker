#!/bin/bash

echo "🚀 Starting Map Functionality Integration Tests"
echo "=============================================="

# Allow overriding the server base URL (defaults to the embed/public dev server port).
BASE_URL="${TEST_API_BASE_URL:-http://localhost:3002}"
export TEST_API_BASE_URL="$BASE_URL"

# Check if dev server is running
echo "📡 Checking if dev server is running..."
if curl -s "$BASE_URL/api/health" > /dev/null; then
    echo "✅ Dev server is running at $BASE_URL"
else
    echo "❌ Dev server is not running at $BASE_URL"
    echo "Please start the dev server with: bun run dev (or set TEST_API_BASE_URL)"
    exit 1
fi

# Run the integration tests
echo ""
echo "🧪 Running integration tests..."
echo "================================"

# Run jest with specific test file and verbose output
bun test src/app/__tests__/integration/map-functionality.test.ts --verbose --no-cache

echo ""
echo "🏁 Integration tests completed"
