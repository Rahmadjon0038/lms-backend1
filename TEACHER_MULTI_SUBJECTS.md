# Teacher ko'p fanlar tizimi (Multi-Subject Teachers)

## O'zgarishlar

### 1. Yangi jadval: `teacher_subjects`
Teacherlar va fanlar orasida many-to-many bog'lanish uchun:

```sql
CREATE TABLE teacher_subjects (
    id SERIAL PRIMARY KEY,
    teacher_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    subject_id INTEGER REFERENCES subjects(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_primary BOOLEAN DEFAULT FALSE,
    UNIQUE(teacher_id, subject_id)
);
```

### 2. Teacher registratsiyasi o'zgargan

#### Eski format:
```json
{
    "subject_id": 1,
    "name": "Ali", 
    ...
}
```

#### Yangi format:
```json
{
    "subject_ids": [1, 2, 3],
    "primary_subject_id": 1,
    "name": "Ali",
    ...
}
```

### 3. Yangi API endpoints

#### Teacher fanlarini boshqarish:
- `GET /api/users/teachers/:teacherId/subjects` - Teacher fanlarini ko'rish
- `POST /api/users/teachers/:teacherId/subjects` - Teacher-ga fan qo'shish
- `DELETE /api/users/teachers/:teacherId/subjects/:subjectId` - Teacher-dan fan olib tashlash  
- `PUT /api/users/teachers/:teacherId/subjects/primary` - Asosiy fanini o'zgartirish

#### Fan bo'yicha teacherlar:
- `GET /api/subjects/:subjectId/teachers` - Fan bo'yicha teacherlar
- `GET /api/users/subjects/:subjectId/teachers` - Alternativ route

### 4. API Response o'zgarishlar

#### Teacher list (`GET /api/users/teachers`):
```json
{
    "teachers": [{
        "id": 1,
        "name": "Ali",
        "subjects": [
            {
                "id": 1,
                "name": "Matematik", 
                "is_primary": true
            },
            {
                "id": 2,
                "name": "Fizika",
                "is_primary": false  
            }
        ],
        "subjects_count": 2,
        "primary_subject": {
            "id": 1,
            "name": "Matematik"
        },
        "subjects_list": "Matematik, Fizika"
    }]
}
```

#### Group list (`GET /api/groups`):
```json
{
    "groups": [{
        "id": 1,
        "teacher_subjects": [
            {"id": 1, "name": "Matematik", "is_primary": true},
            {"id": 2, "name": "Fizika", "is_primary": false}
        ],
        "teacher_subjects_count": 2,
        "primary_subject": {"id": 1, "name": "Matematik"}
    }]
}
```

### 5. Validation o'zgarishlar

#### Guruh yaratishda:
Teacher tanlangan fanni o'qitishini tekshirish:
```javascript
// Agar teacher_id=1 va subject_id=3 bo'lsa,
// teacher bu fanni o'qitadimi yo'qmi tekshiriladi
```

#### Teacher registratsiyasi:
- `subject_ids` array bo'lishi shart (kamida 1 ta element)
- `primary_subject_id` `subject_ids` ichida bo'lishi kerak

### 6. Migration

Eski tizimdan yangi tizimga avtomatik o'tish:
1. `teacher_subjects` jadvali yaratiladi
2. Mavjud teacherlarning `subject_id` ma'lumotlari yangi jadvalga ko'chiriladi
3. Eski `subject_id` va `subject` ustunlari saqlanadi (backward compatibility)

### 7. Foydalanish misollari

#### 1. Teacher yaratish:
```bash
curl -X POST http://localhost:5000/api/users/register-teacher \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "name": "Ali",
    "surname": "Karimov",
    "username": "ali_multi",
    "password": "password123", 
    "subject_ids": [1, 2, 3],
    "primary_subject_id": 1
  }'
```

#### 2. Teacher-ga fan qo'shish:
```bash
curl -X POST http://localhost:5000/api/users/teachers/1/subjects \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "subject_id": 4,
    "is_primary": false
  }'
```

#### 3. Fan bo'yicha teacherlar:
```bash
curl http://localhost:5000/api/subjects/1/teachers \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 8. Database Migration Script

```sql
-- Migration eski ma'lumotlar uchun
INSERT INTO teacher_subjects (teacher_id, subject_id, is_primary)
SELECT id, subject_id, true 
FROM users 
WHERE role = 'teacher' AND subject_id IS NOT NULL
ON CONFLICT (teacher_id, subject_id) DO NOTHING;
```

## Test qilish

1. Serverni ishga tushiring: `npm run dev`
2. Fanlar yarating: SQL yoki API orqali
3. Teacher yarating yangi format bilan
4. Teacher fanlarini boshqaring
5. Guruh yarating va validation ishlashini tekshiring

## Backward Compatibility

Eski tizim bilan muammo yo'q:
- Eski `subject_id` ustuni saqlanadi
- API responselar yangi va eski ma'lumotlarni o'z ichiga oladi
- Migration avtomatik bajariladi