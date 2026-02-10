# Profil ma'lumotlarini tahrirlash (Profile Update)

## Endpoint

`PATCH /api/users/profile`

## Auth

`Authorization: Bearer <access_token>` majburiy.

## Nima yangilanadi

Quyidagi maydonlarni yuborish mumkin:

- `username` (string)
- `name` (string)
- `surname` (string)
- `phone` (string)
- `phone2` (string)
- `father_name` (string)
- `father_phone` (string)
- `address` (string)
- `age` (integer)
- `certificate` (string)
- `has_experience` (boolean)
- `experience_years` (integer)
- `experience_place` (string)
- `available_times` (string)
- `work_days_hours` (string)

Eslatma:
- `username` yangilanadi, lekin bo'sh bo'lmasligi va boshqa userda band bo'lmasligi kerak.
- `password`, `role`, `status` kabi maydonlar bu endpoint orqali yangilanmaydi.
- Kamida bitta ruxsat etilgan maydon yuborilishi kerak.

## Request namunasi

```bash
curl -X PATCH http://localhost:5000/api/users/profile \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "username": "ali777new",
    "name": "Ali",
    "surname": "Valiyev",
    "phone": "+998901234567",
    "address": "Toshkent, Chilonzor",
    "age": 21
  }'
```

## 200 (Success) javob namunasi

```json
{
  "success": true,
  "message": "Profil ma'lumotlari yangilandi",
  "updated_fields": ["username", "name", "surname", "phone", "address", "age"],
  "user": {
    "id": 7,
    "name": "Ali",
    "surname": "Valiyev",
    "username": "ali777new",
    "role": "student",
    "status": "active",
    "phone": "+998901234567",
    "phone2": null,
    "father_name": null,
    "father_phone": null,
    "address": "Toshkent, Chilonzor",
    "age": 21,
    "certificate": null,
    "has_experience": false,
    "experience_years": null,
    "experience_place": null,
    "available_times": null,
    "work_days_hours": null,
    "created_at": "2026-02-10T10:20:30.000Z"
  }
}
```

## 400 (Validation xato) misollar

- `age` butun son bo'lmasa.
- `has_experience` boolean bo'lmasa.
- `username` bo'sh yoki band bo'lsa.
- Ruxsat etilmagan maydon yuborilsa (`password`, va h.k.).

## 401

Token yo'q yoki noto'g'ri bo'lsa qaytadi.
