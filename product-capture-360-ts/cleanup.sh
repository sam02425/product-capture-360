#!/bin/bash

# Cleanup script - Remove unnecessary documentation and organize files

echo "🧹 Starting cleanup..."
echo ""

# Create archive directory for old docs
mkdir -p .archive/old_docs

# Keep only essential documentation
KEEP_DOCS=(
  "README.md"
  "LIGHTNING_FAST_CAPTURE.md"
  "PRODUCT_FOLDER_ORGANIZATION.md"
  "ZOMBIE_PROCESS_PREVENTION.md"
  "OPTIMIZATION_SUMMARY.md"
)

echo "📚 Archiving outdated documentation..."

# Archive all .md files except the ones we want to keep
for file in *.md; do
  should_keep=false
  for keep in "${KEEP_DOCS[@]}"; do
    if [ "$file" = "$keep" ]; then
      should_keep=true
      break
    fi
  done

  if [ "$should_keep" = false ]; then
    mv "$file" .archive/old_docs/
    echo "   Archived: $file"
  fi
done

echo ""
echo "✅ Cleanup complete!"
echo ""
echo "📁 Kept essential documentation:"
for doc in "${KEEP_DOCS[@]}"; do
  if [ -f "$doc" ]; then
    size=$(ls -lh "$doc" | awk '{print $5}')
    echo "   ✓ $doc ($size)"
  fi
done

echo ""
echo "📦 Archived documentation: .archive/old_docs/ ($(ls .archive/old_docs/*.md 2>/dev/null | wc -l | tr -d ' ') files)"
echo ""
echo "💡 You can delete .archive/ directory if you don't need old docs"
