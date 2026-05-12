#!/bin/bash
set -e

npm install --legacy-peer-deps

# Only run blog freshness steps when blog HTML or the content store changed.
BLOG_FILES_CHANGED=$(git diff --name-only ORIG_HEAD HEAD 2>/dev/null | grep -E '^public/blog/.*\.html$|^public/js/content\.js$' || true)

if [ -n "$BLOG_FILES_CHANGED" ]; then
  echo ""
  echo "=== Blog Freshness Fix ==="
  node scripts/fix-blog-freshness.js || true

  echo ""
  echo "=== Blog Freshness Check ==="
  if node scripts/check-blog-freshness.js; then
    echo "All article dates are current."
  else
    echo "WARNING: Some articles still have stale dates — check output above."
  fi
fi
