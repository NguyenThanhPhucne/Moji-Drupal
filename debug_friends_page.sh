#!/bin/bash

# 📋 DEBUG SCRIPT - Kiểm tra vấn đề trang /admin/chat/friends
# Chạy script này để tìm và sửa lỗi

echo "🔍 ===== CHECKING DRUPAL CHAT FRIENDS PAGE ====="

# 1. Check if module is enabled
echo ""
echo "1️⃣  Checking if chat_api module is enabled..."
drush pm:list | grep chat_api
if [ $? -ne 0 ]; then
  echo "❌ Module chat_api NOT found"
  echo "   → Run: drush pm:enable chat_api"
else
  echo "✅ Module chat_api is enabled"
fi

# 2. Check database tables
echo ""
echo "2️⃣  Checking database tables..."
drush sql:query "
SELECT TABLE_NAME FROM information_schema.TABLES 
WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME LIKE 'chat_%'
ORDER BY TABLE_NAME;
" || echo "❌ Could not query tables"

# 3. Check admin permissions
echo ""
echo "3️⃣  Checking administrator permissions..."
drush sql:query "
SELECT p.permission FROM role__permissions p
WHERE p.entity_id='administrator'
AND p.permissions LIKE '%chat%';
" || echo "⚠️ Could not check permissions"

# 4. Check if there's data in chat_friend table
echo ""
echo "4️⃣  Checking chat_friend table data..."
COUNT=$(drush sql:query "SELECT COUNT(*) as cnt FROM chat_friend;" 2>/dev/null | tail -1)
echo "   Found $COUNT friendships in MySQL"

if [ "$COUNT" -eq 0 ]; then
  echo "   ⚠️ No data in chat_friend table"
  echo "   → This could be the issue!"
fi

# 5. Check MongoDB connection
echo ""
echo "5️⃣  Checking MongoDB connection..."
if command -v mongosh &> /dev/null; then
  MONGO_COUNT=$(mongosh --host localhost:27017 --eval "db.test.friends.countDocuments({})" 2>/dev/null | grep -oE '[0-9]+' | tail -1)
  if [ -z "$MONGO_COUNT" ]; then
    echo "   ⚠️ Could not connect to MongoDB"
  else
    echo "   ✅ MongoDB connected - Found $MONGO_COUNT friendships"
  fi
else
  echo "   ⚠️ mongosh not installed"
fi

# 6. Test the admin page
echo ""
echo "6️⃣  Testing admin page access..."
echo "   → Go to: http://localhost:8000/admin/chat/friends"
echo "   → Check browser console for errors"
echo "   → Check Drupal logs: /admin/reports/dblog"

# 7. Clear cache
echo ""
echo "7️⃣  Clearing Drupal cache..."
drush cache:rebuild
echo "   ✅ Cache cleared"

# 8. Run database updates
echo ""
echo "8️⃣  Running database updates..."
drush updatedb
drush entity:updates
echo "   ✅ Database updates completed"

echo ""
echo "🎯 ===== SUMMARY ====="
echo "Next steps:"
echo "1. Ensure chat_api module is enabled"
echo "2. Make sure MySQL tables exist (chat_friend, chat_friend_request)"
echo "3. Check admin user has 'moderate chat' permission"
echo "4. Test: Accept a friend request and check /admin/chat/friends"
echo "5. If still empty, check Drupal logs: /admin/reports/dblog"
echo ""
echo "👉 For more info, see: FRIENDS_PAGE_FIX.md"
