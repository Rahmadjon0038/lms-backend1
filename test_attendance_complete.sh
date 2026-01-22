#!/bin/bash

echo "🧪 ATTENDANCE API FULL TEST"
echo "============================"

# 1. Login qilib token olish
echo "1️⃣ LOGIN QILISH..."
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:5001/api/users/login \
  -H "Content-Type: application/json" \
  -d '{"username": "Astrocoder", "password": "123"}')

# Token ajratib olish  
TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "❌ Login xato!"
  exit 1
fi

echo "✅ Token olindi!"

# 2. Guruh 41 uchun monthly attendance olish (before)
echo -e "\n2️⃣ GURUH 41 UCHUN MONTHLY ATTENDANCE (BEFORE):"
curl -s -X GET "http://localhost:5001/api/attendance/groups/41/monthly?month=2026-01" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" | jq '.data.students[] | "\(.name) \(.surname): \(.attendance)"'

# 3. Attendance saqlash - Jasur va Mirjalol ni "keldi" qilish
echo -e "\n3️⃣ ATTENDANCE SAQLASH (Jasur=keldi, Mirjalol=keldi):"
SAVE_RESPONSE=$(curl -s -X POST "http://localhost:5001/api/attendance/save" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "lesson_id": 7,
    "attendance_data": [
      {"student_id": 36, "status": "keldi"},
      {"student_id": 34, "status": "keldi"}, 
      {"student_id": 23, "status": "keldi"}
    ]
  }')

echo "$SAVE_RESPONSE" | jq .

# 4. Guruh 41 uchun monthly attendance olish (after)
echo -e "\n4️⃣ GURUH 41 UCHUN MONTHLY ATTENDANCE (AFTER):"
curl -s -X GET "http://localhost:5001/api/attendance/groups/41/monthly?month=2026-01" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" | jq '.data.students[] | "\(.name) \(.surname): \(.attendance)"'

echo -e "\n✅ TEST TUGADI!"