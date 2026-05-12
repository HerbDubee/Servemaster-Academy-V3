#!/bin/bash
set -e

npm install --legacy-peer-deps

echo ""
echo "=== Blog Freshness Check ==="
node scripts/check-blog-freshness.js || {
  echo ""
  echo "⚠  One or more blog articles have stale dateModified values."
  echo "   Update the dateModified field in public/js/content.js for each"
  echo "   article listed above, then re-run: node scripts/check-blog-freshness.js"
  echo ""
  exit 1
}
