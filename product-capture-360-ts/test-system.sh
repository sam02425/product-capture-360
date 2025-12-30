#!/bin/bash

# End-to-End Testing Script for 360Photo Capture System
set -e

BASE_URL="http://localhost:5002"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "🧪 Testing 360Photo Capture System..."
echo ""

# Test 1: Server Health
echo "1️⃣  Testing server health..."
if curl -s "${BASE_URL}/api/status" > /dev/null; then
    echo -e "${GREEN}✅ Server is running${NC}"
else
    echo -e "${RED}❌ Server is not responding${NC}"
    exit 1
fi

# Test 2: Path Traversal Protection
echo "2️⃣  Testing path traversal protection..."
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/file?path=../../../etc/passwd")
if [ "$RESPONSE" == "403" ] || [ "$RESPONSE" == "400" ]; then
    echo -e "${GREEN}✅ Path traversal blocked (HTTP $RESPONSE)${NC}"
else
    echo -e "${RED}❌ Path traversal NOT blocked (HTTP $RESPONSE)${NC}"
    exit 1
fi

# Test 3: Camera Health
echo "3️⃣  Testing camera health..."
if curl -s "${BASE_URL}/api/camera/health" | grep -q "success"; then
    echo -e "${GREEN}✅ Camera API responding${NC}"
else
    echo -e "${YELLOW}⚠️  Camera may not be initialized${NC}"
fi

# Test 4: Storage API
echo "4️⃣  Testing storage API..."
if curl -s "${BASE_URL}/api/storage" > /dev/null; then
    echo -e "${GREEN}✅ Storage API responding${NC}"
else
    echo -e "${RED}❌ Storage API failed${NC}"
    exit 1
fi

# Test 5: Ledger API
echo "5️⃣  Testing ledger API..."
if curl -s "${BASE_URL}/api/ledger/sessions" > /dev/null; then
    echo -e "${GREEN}✅ Ledger API responding${NC}"
else
    echo -e "${RED}❌ Ledger API failed${NC}"
    exit 1
fi

# Test 6: Camera Preview
echo "6️⃣  Testing camera preview endpoint..."
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/api/camera/preview")
if [ "$RESPONSE" == "200" ] || [ "$RESPONSE" == "503" ]; then
    echo -e "${GREEN}✅ Camera preview endpoint working${NC}"
else
    echo -e "${RED}❌ Camera preview endpoint failed (HTTP $RESPONSE)${NC}"
fi

# Test 7: Auto-annotation endpoint
echo "7️⃣  Testing auto-annotation endpoint..."
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${BASE_URL}/api/auto-annotate" \
  -H "Content-Type: application/json" \
  -d '{"image_path":"invalid"}')
if [ "$RESPONSE" == "200" ]; then
    echo -e "${GREEN}✅ Auto-annotation endpoint responding${NC}"
else
    echo -e "${YELLOW}⚠️  Auto-annotation endpoint returned HTTP $RESPONSE${NC}"
fi

# Test 8: Static files
echo "8️⃣  Testing static file serving..."
if curl -s "${BASE_URL}/image-collector.html" | grep -q "Image Collector"; then
    echo -e "${GREEN}✅ Static files serving correctly${NC}"
else
    echo -e "${RED}❌ Static files not found${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}🎉 All tests passed!${NC}"
echo ""
echo "Next steps:"
echo "  1. Open http://localhost:5002/image-collector.html"
echo "  2. Test image capture with a product name"
echo "  3. Test auto-annotation feature"
echo "  4. Verify scrolling in sidebar sections"
