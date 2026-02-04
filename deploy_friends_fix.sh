#!/bin/bash

# 🚀 QUICK FIX: Deploy Friends Page Fix
# Run này để áp dụng fix cho trang /admin/chat/friends

echo "🔧 ===== DEPLOYING FRIENDS PAGE FIX ====="
echo ""

# Step 1: Backup
echo "📦 Backing up database..."
drush sql:dump --result-file=backup-$(date +%s).sql
echo "✅ Backup created"
echo ""

# Step 2: Update database
echo "🔄 Updating database schema..."
drush updatedb -y
drush entity:updates -y
echo "✅ Database updated"
echo ""

# Step 3: Grant permissions
echo "🔐 Setting up admin permissions..."
drush role:perm:add administrator "moderate chat" || echo "⚠️ Already set"
drush role:perm:add administrator "administer chat" || echo "⚠️ Already set"
echo "✅ Permissions granted"
echo ""

# Step 4: Clear cache
echo "🗑️  Clearing cache..."
drush cache:rebuild
echo "✅ Cache cleared"
echo ""

# Step 5: Verify setup
echo "✅ Verifying setup..."
echo ""
echo "Checking tables..."
TABLE_COUNT=$(drush sql:query "
SELECT COUNT(*) FROM information_schema.TABLES 
WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME LIKE 'chat_%';
" | tail -1)
echo "   Found $TABLE_COUNT chat tables ✅"
echo ""

echo "Checking permissions..."
PERM_COUNT=$(drush sql:query "
SELECT COUNT(*) FROM role__permissions 
WHERE entity_id='administrator' AND permissions LIKE '%chat%';
" | tail -1)
echo "   Found $PERM_COUNT chat permissions ✅"
echo ""

echo "✅ ===== DEPLOYMENT COMPLETE ====="
echo ""
echo "📝 Next steps:"
echo "1. Test the fix:"
echo "   - Login as User A"
echo "   - Send friend request to User B"
echo "   - Logout & Login as User B"
echo "   - Accept the request"
echo "   - Logout & Login as Admin"
echo "   - Go to /admin/chat/friends"
echo "   - Should see the friendship! ✅"
echo ""
echo "2. Check logs if issues:"
echo "   - drush watchdog:show --type=chat_api --limit=10"
echo "   - /admin/reports/dblog"
echo ""
echo "3. For more info:"
echo "   - FRIENDS_PAGE_FIX.md"
echo "   - FRIENDS_TROUBLESHOOTING.md"
