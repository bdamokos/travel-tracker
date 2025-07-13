#!/bin/bash

echo "🚀 Starting Map Functionality Integration Tests"
echo "=============================================="

# Check if dev server is running
echo "📡 Checking if dev server is running..."
if curl -s http://localhost:3002/api/health > /dev/null; then
    echo "✅ Dev server is running on port 3002"
else
    echo "❌ Dev server is not running on port 3002"
    echo "Please start the dev server with: bun run dev"
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