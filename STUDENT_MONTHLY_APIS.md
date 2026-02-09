# Student Oylik APIlar (Davomat + To'lov)

Bu hujjat student paneli uchun 2 ta asosiy API ni tushuntiradi:
1. Oylik davomatni olish
2. Oylik to'lov ma'lumotlarini olish

## 1) Student oylik davomat API

- `GET /api/snapshots/attendance`
- Auth: `Authorization: Bearer <accessToken>`

### Query parametrlari
- `group_id` (majburiy, number)
- `month` (majburiy, `YYYY-MM`)
- `student_id` (student roli uchun ixtiyoriy; berilsa ham faqat o'z `id` bo'lishi mumkin)

### Muhim qoida
- Student boshqa studentning `student_id` sini yuborsa `403` qaytadi.
- Student uchun backend avtomatik ravishda `req.user.id` ni ishlatadi.

### So'rov namunasi
```http
GET /api/snapshots/attendance?group_id=3&month=2026-02
Authorization: Bearer <accessToken>
```

### Muvaffaqiyatli javobdan asosiy maydonlar
- `data.monthly_status`
- `data.attendance_statistics`:
  - `total_lessons`
  - `attended_lessons`
  - `missed_lessons`
  - `attendance_percentage`
- `data.attendance_breakdown`
- `data.daily_attendance` (kunlik kesim)

---

## 2) Student oylik to'lov API

- `GET /api/students/my-payments`
- Auth: `Authorization: Bearer <accessToken>`
- Manba: faqat `monthly_snapshots` (To'lov jadvali) asosida

### Query parametrlari
- `month` (ixtiyoriy, `YYYY-MM`, default: joriy oy)
- `group_id` (ixtiyoriy, number)

### So'rov namunasi
```http
GET /api/students/my-payments?month=2026-02
Authorization: Bearer <accessToken>
```

### Javob strukturasi
- `data.student_id`
- `data.month`
- `data.summary`:
  - `required_amount_total`
  - `paid_amount_total`
  - `discount_amount_total`
  - `debt_amount_total`
  - `transactions_count_total`
- `data.groups` (har bir guruh bo'yicha):
  - `group_id`, `group_name`, `subject_name`, `teacher_name`
  - `required_amount`, `paid_amount`, `discount_amount`, `debt_amount`
  - `payment_status`, `last_payment_date`
  - `transactions_count`, `transactions_total`
- `data.transactions`:
  - `id`, `group_id`, `group_name`
  - `amount`, `payment_method`, `description`, `paid_at`

### Muhim qoida
- Agar so'ralgan oy uchun studentga `monthly_snapshots` yozuvi bo'lmasa:
  - `groups` bo'sh array qaytadi
  - `message`: `YYYY-MM oy uchun To'lov jadvali topilmadi`
- Demak admin snapshot yaratmagan oylar student kabinetida to'lov jadvali ko'rinmaydi.

---

## Frontend ishlatish tartibi

1. Student dashboard ochilganda:
- `GET /api/students/my-groups`
- `GET /api/students/my-payments?month=YYYY-MM`

2. Student guruhni tanlaganda:
- `GET /api/snapshots/attendance?group_id=<group_id>&month=YYYY-MM`
- `GET /api/students/my-payments?month=YYYY-MM&group_id=<group_id>`

3. Oy almashtirilganda:
- Ikkala API ni ham yangi `month` bilan qayta chaqiring.

---

## Xatoliklar

- `400`: noto'g'ri query format (`month`, `group_id`)
- `401`: token yo'q/yaroqsiz
- `403`: student boshqa student ma'lumotini so'rasa
- `404`: student-guruh bog'lanishi topilmasa (davomat uchun)
- `500`: server xatoligi
