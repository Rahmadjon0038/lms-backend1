# Teacher registratsiyasi subject_id bilan

## O'zgartirililgan funksionallik

### 1. Database o'zgarishlari:
- `users` jadvaliga `subject_id` ustuni qo'shildi
- `subject_id` `subjects` jadvaliga foreign key bog'lanadi
- Eski `subject` VARCHAR ustuni ham saqlanadi (compatibility uchun)

### 2. Yangi endpoint:
```
GET /api/subjects/for-teacher
```
Teacher registratsiyasidan oldin mavjud fanlarni ko'rish uchun

### 3. O'zgartirilgan teacher registratsiyasi:

#### Eski format (subject nomi bilan):
```json
{
  "subject": "It"  // ❌ Deprecated
}
```

#### Yangi format (subject_id bilan):
```json
{
  "subject_id": 1  // ✅ Tavsiya etiladi
}
```

## API Foydalanish

### 1-qadam: Mavjud fanlarni ko'rish
```bash
curl -X GET http://localhost:5000/api/subjects/for-teacher
```

**Javob:**
```json
{
  "success": true,
  "message": "Teacher registratsiyasi uchun mavjud fanlar",
  "subjects": [
    {
      "id": 1,
      "name": "Ingliz tili",
      "teachers_count": 2,
      "description": "Ingliz tili fani (2 ta teacher)"
    },
    {
      "id": 2,
      "name": "IT",
      "teachers_count": 0,
      "description": "IT fani (0 ta teacher)"
    }
  ]
}
```

### 2-qadam: Teacher registratsiya qilish
```bash
curl -X POST http://localhost:5000/api/users/register-teacher \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Rahmadjon",
    "surname": "Abdullayev", 
    "username": "Rahmadjon",
    "password": "123456",
    "phone": "+999897212038",
    "phone2": "+998912345678",
    "subject_id": 2,
    "startDate": "2025-01-05",
    "certificate": "Web Development Certificate",
    "age": 28,
    "has_experience": true,
    "experience_years": 3,
    "experience_place": "IT Academy, Google",
    "available_times": "09:00-18:00",
    "work_days_hours": "Dushanba-Juma: 09:00-18:00, Shanba: 09:00-13:00"
  }'
```

**Javob:**
```json
{
  "message": "Teacher muvaffaqiyatli yaratildi",
  "teacher": {
    "id": 15,
    "name": "Rahmadjon",
    "surname": "Abdullayev",
    "username": "Rahmadjon",
    "role": "teacher",
    "subject_id": 2,
    "subject": "IT",
    "start_date": "2025-01-05T00:00:00.000Z",
    // ... boshqa ma'lumotlar
  },
  "subject": {
    "id": 2,
    "name": "IT"
  }
}
```

## Afzalliklari:

1. **Ma'lumotlar tutashuvchanligi**: Teacher aniq subject_id ga bog'lanadi
2. **Xato minimal**: Mavjud bo'lmagan fan nomlarini kiritish mumkin emas  
3. **Masshtablilik**: Bir fanda bir nechta teacher bo'lishi mumkin
4. **Reporting oson**: Fan bo'yicha teacher va guruhlarni hisoblash aniq
5. **Relational integrity**: Database foreign key constraint lar bilan himoyalangan

## Eskiy versiya bilan compatibility:

Agar `subject_id` berilmasa, eski `subject` maydonini ishlatishda davom etadi (backward compatibility).