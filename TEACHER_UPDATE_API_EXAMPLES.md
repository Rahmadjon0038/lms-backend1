# Teacher API Test Misollari

## 1. Teacher yaratish (POST /api/users/register-teacher)

```json
{
  "name": "Alijon",
  "surname": "Murodov", 
  "username": "teacher_alijon",
  "password": "parol123",
  "phone": "+998901234567",
  "phone2": "+998912345678",
  "subject_ids": [1, 2, 3],
  "startDate": "2025-01-05",
  "certificate": "Web Development Certificate",
  "age": 28,
  "has_experience": true,
  "experience_years": 3,
  "experience_place": "IT Academy, Google", 
  "available_times": "09:00-18:00",
  "work_days_hours": "Dushanba-Juma: 09:00-18:00, Shanba: 09:00-13:00"
}
```

## 2. Teacher to'liq yangilash (PUT /api/users/teachers/{teacherId})

```json
{
  "name": "Alijon Yangi",
  "surname": "Murodov",
  "username": "teacher_alijon_new",
  "password": "yangi_parol123",
  "phone": "+998901234567",
  "phone2": "+998912345678", 
  "subject_ids": [1, 4, 5],
  "certificate": "Advanced Web Development Certificate",
  "age": 29,
  "has_experience": true,
  "experience_years": 4,
  "experience_place": "IT Academy, Google, Microsoft",
  "available_times": "08:00-17:00",
  "work_days_hours": "Dushanba-Juma: 08:00-17:00"
}
```

## 3. Teacher qisman yangilash (PATCH /api/users/teachers/{teacherId})

### Faqat fanlarni yangilash:
```json
{
  "subject_ids": [2, 3, 6]
}
```

### Faqat shaxsiy ma'lumotlarni yangilash:
```json
{
  "name": "Yangi Ism", 
  "age": 30,
  "phone": "+998901111111"
}
```

### Fan va ma'lumotlarni birga yangilash:
```json
{
  "name": "To'liq Yangi Ism",
  "subject_ids": [1, 7],
  "certificate": "Master's Certificate",
  "experience_years": 5
}
```

## 4. Response formati

Barcha update operatsiyalari quyidagi formatda javob qaytaradi:

```json
{
  "message": "Teacher ma'lumotlari muvaffaqiyatli yangilandi",
  "teacher": {
    "id": 1,
    "name": "Alijon",
    "surname": "Murodov",
    "username": "teacher_alijon",
    "phone": "+998901234567",
    // ... boshqa ma'lumotlar
  },
  "subjects": [
    {
      "id": 1,
      "name": "Matematik",
      "assigned_at": "2026-01-18T..."
    },
    {
      "id": 2, 
      "name": "Fizika",
      "assigned_at": "2026-01-18T..."
    }
  ],
  "subjects_count": 2
}
```

## 5. Validation qoidalari

- `subject_ids` array bo'lishi shart
- Barcha `subject_ids` mavjud fanlar bo'lishi kerak
- Username unique bo'lishi shart (o'zidan tashqari)
- Eski fanlar to'liq almashtiriladi (yangi ro'yxat bilan)