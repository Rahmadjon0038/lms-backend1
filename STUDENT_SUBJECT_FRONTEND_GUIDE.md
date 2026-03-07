# Student qabulida fan tanlash va jadvalda ko'rsatish (Frontend guide)

## 1) Yangi student formasi
- Formaga `Fan` select qo'shing (`subject_id`), `required` bo'lsin.
- Select optionlarni backenddan oling:
  - `GET /api/subjects/for-teacher` (public)
  - yoki admin paneldan ishlatilsa `GET /api/subjects` (token bilan)
- Submit paytida `POST /api/users/register` ga `subject_id` ni yuborish majburiy.

Minimal payload:
```json
{
  "name": "Ali",
  "surname": "Valiyev",
  "username": "ali777",
  "password": "parol123",
  "phone": "+998901234567",
  "subject_id": 2
}
```

Agar `subject_id` yuborilmasa backend `400` qaytaradi.

## 2) Studentlar jadvali
`GET /api/students/all` javobida endi student darajasida quyidagi maydonlar bor:
- `registered_subject_id`
- `registered_subject_name`

UI qoidasi:
- Talaba guruhga kirmagan bo'lsa ham `registered_subject_name` ustunda ko'rsating.
- Agar `groups` bo'sh bo'lsa, status ustunida `Guruhga biriktirilmagan` deb chiqaring.

## 3) Filter (ixtiyoriy, lekin tavsiya)
- Studentlar ro'yxatini fan bo'yicha filtrlash uchun:
  - `GET /api/students/all?subject_id=<id>`
- Bu filter endi:
  - guruh faniga,
  - yoki student qabul paytida tanlangan fanga
  mos studentlarni qaytaradi.

## 4) Eslatma
- Group ichidagi fan (`groups[].subject_name`) va qabuldagi fan (`registered_subject_name`) ayrim holatlarda farq qilishi mumkin.
- Talaba hali guruhsiz bo'lsa, asosiy ko'rsatiladigan qiymat `registered_subject_name` bo'ladi.
