# Attendance (Davomat) API Documentation

## Umumiy Ma'lumot

Professional davomat tizimi - studentlarning oylik davomatini kuzatish uchun API.

### Asosiy Xususiyatlar:
- Teacher o'z guruhlarining davomatini boshqaradi
- Admin barcha guruhlar davomatini ko'radi
- Oylik davomat: har kun uchun 1 (kelgan) yoki 0 (kelmagan)
- Avtomatik foiz hisoblanadi
- Ko'p dars qoldirayotgan studentlarni aniqlash
- To'liq statistika va hisobotlar

## API Endpoints

**7 ta Professional API:**

1. Teacher Guruhlari - `GET /api/attendance/teacher/groups`
2. Guruh Davomati - `GET /api/attendance/group/{group_id}`
3. Davomat Yangilash - `PUT /api/attendance/student/{student_id}`
4. Davomat Statistikasi - `GET /api/attendance/stats`
5. Yomon Davomat - `GET /api/attendance/poor-attendance`
6. Guruhlar Davomati - `GET /api/attendance/all-groups`
7. **🔥 Barcha Studentlar** - `GET /api/attendance/all-students` *(Admin super tool)*

### 1. Teacher Guruhlari (`GET /api/attendance/teacher/groups`)
**Kimlar ishlatishi mumkin:** Teacher only

O'qituvchi o'z guruhlarini ko'radi:
```bash
curl -H "Authorization: Bearer TEACHER_TOKEN" \
  http://localhost:5000/api/attendance/teacher/groups
```

**Response:**
```json
{
  "success": true,
  "message": "O'qituvchi guruhlari",
  "teacher_id": 3,
  "groups": [
    {
      "group_id": 1,
      "group_name": "Matematika - Boshlang'ich",
      "subject_name": "Matematika",
      "students_count": 15
    }
  ]
}
```

### 2. Guruh Davomati (`GET /api/attendance/group/{group_id}`)
**Kimlar ishlatishi mumkin:** Teacher (o'z guruhlari), Admin (barcha guruhlar)

Guruh studentlarining davomat ma'lumotlari:
```bash
curl -H "Authorization: Bearer TOKEN" \
  "http://localhost:5000/api/attendance/group/1?month_name=2026-01"
```

**Response:**
```json
{
  "success": true,
  "message": "Guruh davomat ma'lumotlari",
  "month": "2026-01",
  "group": {
    "id": 1,
    "group_name": "Matematika - Boshlang'ich",
    "subject_name": "Matematika",
    "teacher_name": "Alijon Valiyev"
  },
  "students": [
    {
      "student_id": 5,
      "student_name": "Akmal Karimov",
      "phone": "+998901234567",
      "phone2": "+998907654321",
      "father_name": "Karim Akramov",
      "father_phone": "+998909876543",
      "address": "Toshkent, Chilonzor",
      "daily_records": "[1,1,0,1,1,1,0,1,1,1,0,0,1,1,1,1,1,0,1,1,1,0,1,1,1,1,1,1,0,1,1]",
      "total_classes": 20,
      "attended_classes": 24,
      "attendance_percentage": 80.00,
      "last_update": "2026-01-15T10:30:00.000Z"
    }
  ]
}
```

### 3. Davomat Yangilash (`PUT /api/attendance/student/{student_id}`)
**Kimlar ishlatishi mumkin:** Teacher (o'z guruh studentlari), Admin (barcha studentlar)

Student davomatini yangilash:
```bash
curl -X PUT \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "month_name": "2026-01", 
    "daily_records": [1,1,0,1,1,1,0,1,1,1,0,0,1,1,1,1,1,0,1,1,1,0,1,1,1,1,1,1,0,1,1],
    "total_classes": 20
  }' \
  http://localhost:5000/api/attendance/student/5
```

**daily_records tushuntirish:**
- Array uzunligi = oyning kunlari soni (28-31)
- `1` = student kelgan
- `0` = student kelmagan
- Index 0 = 1-kun, Index 1 = 2-kun, ...

### 4. Davomat Statistikasi (`GET /api/attendance/stats`)
**Kimlar ishlatishi mumkin:** Admin only

Umumiy statistika:
```bash
curl -H "Authorization: Bearer ADMIN_TOKEN" \
  "http://localhost:5000/api/attendance/stats?month_name=2026-01&group_id=1"
```

### 5. Yomon Davomat Studentlar (`GET /api/attendance/poor-attendance`)
**Kimlar ishlatishi mumkin:** Admin only

Ko'p dars qoldirayotgan studentlar:
```bash
curl -H "Authorization: Bearer ADMIN_TOKEN" \
  "http://localhost:5000/api/attendance/poor-attendance?month_name=2026-01&threshold=60"
```

Bu 60% dan kam davomat qilayotgan studentlarni qaytaradi.

6. **Barcha Guruhlar Davomati** (`GET /api/attendance/all-groups`)
**Kimlar ishlatishi mumkin:** Admin only

Barcha guruhlarning davomat statistikasi:
```bash
curl -H "Authorization: Bearer ADMIN_TOKEN" \
  "http://localhost:5000/api/attendance/all-groups?month_name=2026-01"
```

### 7. Barcha Studentlar Davomati (`GET /api/attendance/all-students`)
**Kimlar ishlatishi mumkin:** Admin only

**Eng muhim API** - Admin barcha studentlarni ko'radi va filterlar bilan qidirib topadi:

```bash
# Barcha studentlar
curl -H "Authorization: Bearer ADMIN_TOKEN" \
  "http://localhost:5000/api/attendance/all-students?month_name=2026-01"

# Subject bo'yicha filter
curl -H "Authorization: Bearer ADMIN_TOKEN" \
  "http://localhost:5000/api/attendance/all-students?month_name=2026-01&subject_id=1"

# Teacher bo'yicha filter  
curl -H "Authorization: Bearer ADMIN_TOKEN" \
  "http://localhost:5000/api/attendance/all-students?month_name=2026-01&teacher_id=3"

# Search (ism, telefon)
curl -H "Authorization: Bearer ADMIN_TOKEN" \
  "http://localhost:5000/api/attendance/all-students?month_name=2026-01&search=Akmal"

# Kombinatsiya
curl -H "Authorization: Bearer ADMIN_TOKEN" \
  "http://localhost:5000/api/attendance/all-students?month_name=2026-01&subject_id=1&teacher_id=3&search=991234567"
```

**Response:**
```json
{
  "success": true,
  "message": "Barcha studentlar davomat ma'lumotlari",
  "month": "2026-01",
  "summary": {
    "total_students": 150,
    "students_with_attendance": 145,
    "average_percentage": 78.5,
    "good_attendance": 120,
    "poor_attendance": 15
  },
  "filters": {
    "subject_id": 1,
    "teacher_id": null,
    "search": null
  },
  "count": 25,
  "students": [
    {
      "student_id": 5,
      "student_name": "Akmal Karimov", 
      "phone": "+998901234567",
      "phone2": "+998907654321",
      "father_name": "Karim Akramov",
      "father_phone": "+998909876543",
      "address": "Toshkent, Chilonzor",
      "group_name": "Matematika - Boshlang'ich",
      "subject_name": "Matematika",
      "teacher_name": "Alijon Valiyev",
      "daily_records": "[1,1,0,1,1,1,0,1,1,1,0,0,1,1,1]",
      "total_classes": 12,
      "attended_classes": 9,
      "attendance_percentage": 75.00
    }
  ]
}
```

## Database Schema

```sql
CREATE TABLE attendance (
  id SERIAL PRIMARY KEY,
  student_id INTEGER REFERENCES users(id),
  group_id INTEGER REFERENCES groups(id),
  teacher_id INTEGER REFERENCES users(id),
  month_name VARCHAR(20) NOT NULL, -- '2026-01'
  daily_records JSON DEFAULT '[]', -- [1,0,1,1,0,...]
  total_classes INTEGER DEFAULT 0, -- Jami darslar soni
  attended_classes INTEGER DEFAULT 0, -- Qatnashgan darslar
  attendance_percentage DECIMAL(5, 2) DEFAULT 0, -- Foiz
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER REFERENCES users(id),
  UNIQUE(student_id, month_name)
);
```

## Avtomatik Hisoblash

Trigger avtomatik ravishda:
- `daily_records` dan `attended_classes` ni hisoblaydi
- `attended_classes / total_classes * 100` dan foizni hisoblaydi
- `updated_at` ni yangilaydi

## Xavfsizlik

- Teacher faqat o'z guruhlarini ko'radi va boshqaradi
- Admin barcha guruhlarni ko'radi va boshqaradi
- JWT token required
- Role-based access control

## Frontend uchun Tavsiyalar

### Teacher Interface:
1. **Guruhlar sahifasi** - teacher guruhlarini ko'rsatish
2. **Guruh davomati** - calendar view bilan
3. **Kunlik belgilash** - checkbox/toggle bilan
4. **Foiz ko'rsatkichi** - progress bar bilan

### Admin Interface:
1. **Dashboard** - umumiy statistika
2. **Barcha Studentlar** - `/all-students` API bilan super search
3. **Guruhlar ro'yxati** - har guruh foizi bilan  
4. **Problem studentlar** - qizil rangli alert bilan
5. **Quick Edit** - inline davomat editing
6. **Advanced Filters** - subject + teacher + search
7. **Hisobotlar** - chart.js bilan

### Calendar Integration:
```javascript
// Misol: daily_records ni calendar da ko'rsatish
const dailyRecords = [1,1,0,1,1,1,0,1,1,1,0,0,1,1,1];
const calendar = dailyRecords.map((day, index) => ({
  date: new Date(2026, 0, index + 1),
  present: day === 1,
  class: day === 1 ? 'present' : 'absent'
}));
```

Bu professional davomat tizimi barcha zamonaviy talablarni qondiradi va kengaytirish uchun tayyor.