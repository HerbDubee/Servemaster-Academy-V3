#!/bin/bash
set -e

npm install --legacy-peer-deps

echo ""
echo "=== Blog Freshness Check ==="
node scripts/check-blog-freshness.js || true
