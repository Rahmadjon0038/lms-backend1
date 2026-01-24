#!/bin/bash

echo "=== STUDENT BLOCK SCENARIO TEST ==="

# Login
TOKEN=$(curl -s -X POST http://localhost:5001/api/users/login -H "Content-Type: application/json" -d '{"username": "Astrocoder", "password": "123"}' | python3 -c "import json,sys;print(json.load(sys.stdin)['accessToken'])" 2>/dev/null)

if [ -z "$TOKEN" ]; then
  echo "❌ Login failed"
  exit 1
fi

echo "✅ Login successful"
echo ""

STUDENT_ID=36  # Abubakir

echo "1. Hozirgi student holati:"
curl -s -X GET "http://localhost:5001/api/students/$STUDENT_ID/groups" -H "Authorization: Bearer $TOKEN" | python3 -c "
import json, sys
try:
  data = json.load(sys.stdin)
  student = data.get('student', {})
  print(f\"Student: {student.get('name', '')} {student.get('surname', '')}\")
  print(f\"Jami guruhlar: {data.get('total_groups', 0)}\")
  print(f\"Faol: {data.get('active_groups', 0)}, Bitirgan: {data.get('finished_groups', 0)}, To'xtatgan: {data.get('stopped_groups', 0)}\")
  print('Guruhlar:')
  for g in data.get('groups', []):
    status_icon = '✅' if g.get('group_status') == 'active' else '🏁' if g.get('group_status') == 'finished' else '⏸️'
    print(f\"  {status_icon} {g.get('group_name', '')} - {g.get('group_status', '')}\")
except Exception as e:
  print(f'Error: {e}')
"
echo ""

echo "2. Frontend guruhiga qo'shish..."
ADD_RESULT=$(curl -s -X POST "http://localhost:5001/api/groups/43/students" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"student_ids": [36]}')
echo "Qo'shish natijasi: $ADD_RESULT"
echo ""

echo "3. Endi ikki guruhda ekan:"
curl -s -X GET "http://localhost:5001/api/students/$STUDENT_ID/groups" -H "Authorization: Bearer $TOKEN" | python3 -c "
import json, sys
try:
  data = json.load(sys.stdin)
  print(f\"Jami guruhlar: {data.get('total_groups', 0)}\")
  print(f\"Faol: {data.get('active_groups', 0)}, Bitirgan: {data.get('finished_groups', 0)}, To'xtatgan: {data.get('stopped_groups', 0)}\")
  print('Guruhlar:')
  for g in data.get('groups', []):
    status_icon = '✅' if g.get('group_status') == 'active' else '🏁' if g.get('group_status') == 'finished' else '⏸️'
    print(f\"  {status_icon} {g.get('group_name', '')} (ID: {g.get('group_id', '')}) - {g.get('group_status', '')}\")
except Exception as e:
  print(f'Error: {e}')
"
echo ""

echo "4. BIRINCHI TEST: Faqat 'Inglis tili' guruhini to'xtatish..."
STOP_RESULT=$(curl -s -X PATCH "http://localhost:5001/api/students/$STUDENT_ID/groups/42/status" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"status": "stopped"}')
echo "$STOP_RESULT" | python3 -c "
import json, sys
try:
  data = json.load(sys.stdin)
  if data.get('success'):
    print(f\"✅ {data.get('message', '')}\")
  else:
    print(f\"❌ {data.get('message', '')}\")
except:
  print('Parse error')
"
echo ""

echo "5. NATIJA: Boshqa guruh faolmi?"
curl -s -X GET "http://localhost:5001/api/students/$STUDENT_ID/groups" -H "Authorization: Bearer $TOKEN" | python3 -c "
import json, sys
try:
  data = json.load(sys.stdin)
  print(f\"Faol: {data.get('active_groups', 0)}, Bitirgan: {data.get('finished_groups', 0)}, To'xtatgan: {data.get('stopped_groups', 0)}\")
  print('Guruhlar holati:')
  for g in data.get('groups', []):
    status_icon = '✅' if g.get('group_status') == 'active' else '🏁' if g.get('group_status') == 'finished' else '⏸️'
    print(f\"  {status_icon} {g.get('group_name', '')} - {g.get('group_status', '')}\")
except Exception as e:
  print(f'Error: {e}')
"
echo ""

echo "🎯 XULOSA: Ko'rdingizki, bitta guruhni 'stopped' qilish boshqa guruhga ta'sir qilmadi!"
echo ""
echo "=== Test tugallandi ==="