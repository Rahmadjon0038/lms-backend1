# YANGI ATTENDANCE API QANDAY ISHLAYDI

## Asosiy API Endpointlar:

### 1. Guruhlar ro'yxatini olish
```
GET /api/attendance/groups
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Math Group A",
      "subject_name": "Matematika",
      "teacher_name": "Ahmadov Alisher",
      "students_count": 15
    }
  ]
}
```

### 2. Bugungi kun uchun dars yaratish yoki ochish (New Attendance tugmasi)
```
POST /api/attendance/lesson/{group_id}
Authorization: Bearer <token>
```

**Response (dars mavjud bo'lmasa - yangi yaratiladi):**
```json
{
  "success": true,
  "data": {
    "id": 123,
    "group_id": 1,
    "date": "2026-01-20",
    "students": [
      {
        "student_id": 45,
        "name": "Ali",
        "surname": "Karimov",
        "status": "absent"
      },
      {
        "student_id": 46,
        "name": "Fatima",
        "surname": "Usmanova",
        "status": "absent"
      }
    ]
  }
}
```

**Response (dars allaqachon mavjud bo'lsa):**
```json
{
  "success": true,
  "data": {
    "id": 123,
    "group_id": 1,
    "date": "2026-01-20",
    "students": [
      {
        "student_id": 45,
        "name": "Ali",
        "surname": "Karimov",
        "status": "present"
      },
      {
        "student_id": 46,
        "name": "Fatima",
        "surname": "Usmanova",
        "status": "absent"
      }
    ]
  }
}
```

### 3. Davomat ma'lumotlarini saqlash
```
PUT /api/attendance/save
Authorization: Bearer <token>
Content-Type: application/json

{
  "lesson_id": 123,
  "attendance_data": [
    {
      "student_id": 45,
      "status": "present"
    },
    {
      "student_id": 46,
      "status": "absent"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Davomat muvaffaqiyatli saqlandi"
}
```

## Frontend uchun workflow:

1. **Attendance sahifasiga kirish** → `GET /api/attendance/groups` chaqirib guruhlar ro'yxatini ko'rsatish

2. **Guruh tanlash** → Foydalanuvchi guruhni tanlaydi

3. **"New Attendance" tugmasi** → `POST /api/attendance/lesson/{group_id}` chaqirish
   - Agar bugun dars bo'lmagan bo'lsa: yangi dars va barcha studentlar "absent" bilan yaratiladi
   - Agar bugun dars mavjud bo'lsa: mavjud dars ochiladi

4. **Students ro'yxati ko'rsatish** → API javobidagi students arrayni ko'rsatish

5. **Teacher davomat belgilaydi** → Kelganlarni "present" qilib belgilaydi

6. **"Save" tugmasi** → `PUT /api/attendance/save` chaqirib ma'lumotlarni saqlash

## Muhim xususiyatlar:

- ✅ Har guruh uchun bir kunda faqat bitta dars (lesson) bo'ladi
- ✅ Attendance faqat lesson orqali bog'lanadi, student yoki group ichida emas  
- ✅ Barcha studentlar dastlab "absent" bo'ladi
- ✅ Teacher faqat kelganlarni "present" qilib belgilaydi
- ✅ Dars va attendance alohida jadvallarda saqlanadi

## Ma'lumotlar bazasi strukturasi:

### lessons table:
- id (SERIAL PRIMARY KEY)
- group_id (FK to groups.id)
- date (DATE)
- created_at, updated_at

### attendance table:
- id (SERIAL PRIMARY KEY) 
- lesson_id (FK to lessons.id)
- student_id (FK to users.id)
- status ('present' | 'absent')
- created_at, updated_at