#!/bin/bash

# Bu script yangi tizimni test qilish uchun ishlatiladi

echo "=== LMS Student Guruh Status Test ==="
echo ""

# Test ma'lumotlari
STUDENT_ID=36  # Abubakir Abdulayev  
GROUP_ID_1=42  # Inglis tili beginner
GROUP_ID_2=43  # Frontend 1
BASE_URL="http://localhost:5001"

echo "1. Login qilish (Admin sifatida)..."
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/users/login" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "Astrocoder",
    "password": "123"
  }')

TOKEN=$(echo "$LOGIN_RESPONSE" | python3 -c "import json,sys;obj=json.load(sys.stdin);print(obj.get('accessToken',''))" 2>/dev/null)

if [ -z "$TOKEN" ]; then
  echo "❌ Login muvaffaqiyatsiz!"
  echo "Response: $LOGIN_RESPONSE"
  exit 1
fi

echo "✅ Login muvaffaqiyatli. Token: ${TOKEN:0:20}..."
echo ""

echo "2. Studentni ikkinchi guruhga qo'shish..."
ADD_RESPONSE=$(curl -s -X POST "$BASE_URL/api/groups/43/students" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "student_ids": [36]
  }')

echo "Response: $ADD_RESPONSE"
echo ""

echo "3. Student guruhlarini ko'rish..."
GROUPS_RESPONSE=$(curl -s -X GET "$BASE_URL/api/students/$STUDENT_ID/groups" \
  -H "Authorization: Bearer $TOKEN")

echo "Student guruhlar ro'yxati:"
echo "$GROUPS_RESPONSE" | python3 -c "
import json, sys
try:
  data = json.load(sys.stdin)
  print(f\"Student: {data.get('student', {}).get('name', '')} {data.get('student', {}).get('surname', '')}\")
  print(f\"Jami guruhlar: {data.get('total_groups', 0)}\")
  print(f\"Faol: {data.get('active_groups', 0)}, Bitirgan: {data.get('finished_groups', 0)}, To'xtatgan: {data.get('stopped_groups', 0)}\")
  print('\nGuruhlar:')
  for group in data.get('groups', []):
    status_emoji = '✅' if group.get('group_status') == 'active' else '🏁' if group.get('group_status') == 'finished' else '⏸️'
    print(f\"  {status_emoji} {group.get('group_name', '')} ({group.get('group_status', '')}) - {group.get('subject_name', '')}\")
except:
  print('Error parsing JSON')
" 2>/dev/null
echo ""

echo "4. Birinchi guruhni 'finished' holatiga o'zgartirish..."
STATUS_RESPONSE=$(curl -s -X PATCH "$BASE_URL/api/students/$STUDENT_ID/groups/$GROUP_ID_1/status" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "finished"
  }')

echo "Status o'zgartirish natijasi:"
echo "$STATUS_RESPONSE" | python3 -c "
import json, sys
try:
  data = json.load(sys.stdin)
  if data.get('success'):
    print(f\"✅ {data.get('message', '')}\")
    print(f\"Guruh nomi: {data.get('group_name', '')}\")
    print(f\"Eski status: {data.get('previous_status', '')} → Yangi status: {data.get('student_group', {}).get('status', '')}\")
  else:
    print(f\"❌ {data.get('message', '')}\")
except:
  print('Error parsing JSON')
" 2>/dev/null
echo ""

echo "5. Yana student guruhlarini ko'rish (o'zgarishni tekshirish)..."
FINAL_GROUPS_RESPONSE=$(curl -s -X GET "$BASE_URL/api/students/$STUDENT_ID/groups" \
  -H "Authorization: Bearer $TOKEN")

echo "Yangilangan guruhlar ro'yxati:"
echo "$FINAL_GROUPS_RESPONSE" | python3 -c "
import json, sys
try:
  data = json.load(sys.stdin)
  print(f\"Student: {data.get('student', {}).get('name', '')} {data.get('student', {}).get('surname', '')}\")
  print(f\"Jami guruhlar: {data.get('total_groups', 0)}\")
  print(f\"Faol: {data.get('active_groups', 0)}, Bitirgan: {data.get('finished_groups', 0)}, To'xtatgan: {data.get('stopped_groups', 0)}\")
  print('\nGuruhlar:')
  for group in data.get('groups', []):
    status_emoji = '✅' if group.get('group_status') == 'active' else '🏁' if group.get('group_status') == 'finished' else '⏸️'
    left_date = group.get('left_at', '')
    if left_date:
      left_date = f\" (Bitirgan: {left_date[:10]})\"
    print(f\"  {status_emoji} {group.get('group_name', '')} ({group.get('group_status', '')}){left_date} - {group.get('subject_name', '')}\")
except:
  print('Error parsing JSON')
" 2>/dev/null
echo ""

echo "=== Test tugallandi ==="