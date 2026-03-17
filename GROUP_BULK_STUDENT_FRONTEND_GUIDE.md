# Guruhga talabalarni bulk boshqarish (Frontend guide)

Quyidagi yangi imkoniyatlar qo'shildi:
- Bir nechta talabani birdan guruhga qo'shish
- Bir nechta talabani birdan guruhdan chiqarish
- Bir nechta talabani birdan boshqa guruhga o'tkazish

## 1) Bulk qo'shish
Endpoint:
`POST /api/groups/admin/bulk-join-students`

Body:
```json
{
  "group_id": 12,
  "student_ids": [101, 102, 103, 104]
}
```

Natija (`200`):
- `summary.requested` - yuborilgan studentlar soni
- `summary.added` - muvaffaqiyatli qo'shilganlar
- `summary.skipped` - allaqachon guruhda bo'lganlar
- `summary.failed` - xatolik bo'lganlar (masalan, student topilmadi yoki `active` emas)

## 2) Bulk chiqarish
Endpoint:
`DELETE /api/groups/:group_id/remove-students`

Body:
```json
{
  "student_ids": [101, 102, 103]
}
```

Natija (`200`):
- `summary.removed` - guruhdan chiqarilganlar
- `summary.skipped` - bu guruhda bo'lmaganlar

Eslatma:
- `DELETE` so'rovida body yuborish kerak.
- `axios` ishlatsangiz: `axios.delete(url, { data: { student_ids } })`

## 3) Bulk guruh almashtirish
Endpoint:
`POST /api/groups/change-students-group`

Body (asosiy):
```json
{
  "new_group_id": 20,
  "student_ids": [101, 102, 103]
}
```

Body (aniq bitta source guruhdan ko'chirish):
```json
{
  "from_group_id": 12,
  "new_group_id": 20,
  "student_ids": [101, 102, 103]
}
```

Natija (`200`):
- `summary.moved` - ko'chirilganlar
- `summary.skipped` - allaqachon target guruhda bo'lganlar
- `summary.failed` - topilmagan yoki `active` bo'lmagan studentlar

## 4) Frontend UI tavsiya
- Jadvalda checkbox bilan multi-select qo'shing.
- Headerda `Select all on page` qo'shing.
- Action panel:
  - `Guruhga qo'shish` (target group tanlash)
  - `Guruhdan chiqarish`
  - `Guruhni almashtirish` (source va target group)
- API javobidan keyin natijani 3 bo'limda toast/modalda ko'rsating:
  - `Muvaffaqiyatli`
  - `O'tkazib yuborildi`
  - `Xatolik`

## 5) Minimal state modeli
- `selectedStudentIds: number[]`
- `selectedGroupId: number | null`
- `targetGroupId: number | null`
- `bulkActionLoading: boolean`
- `bulkActionResult: { added?: []; removed?: []; moved?: []; skipped?: []; failed?: [] }`

## 6) Xatolik holatlari
- `400`:
  - `group_id`/`new_group_id` noto'g'ri
  - `student_ids` bo'sh
  - target guruh faol emas yoki bloklangan
  - student `active` holatda emas
- `404`:
  - guruh topilmadi
  - student topilmadi

## 7) Tavsiya etilgan UX oqimi
1. Foydalanuvchi ro'yxatdan studentlarni belgilaydi.
2. Action tanlaydi (`add/remove/change`).
3. Kerak bo'lsa group select ochiladi.
4. Confirm modal ochiladi (`N ta studentga amal bajarilsinmi?`).
5. API chaqiriladi.
6. Natija summary + detail ko'rsatiladi.
7. Student list va group details qayta fetch qilinadi.

## 8) Guruh ma'lumotlarini yangilash (Teacher ham ruxsat)
Endpoint:
`PATCH /api/groups/:id`

Eslatma:
- `admin` va `teacher` ruxsatga ega.
- `teacher` faqat o'z guruhini yangilay oladi.
- `teacher` `teacher_id` ni o'zgartira olmaydi.
- `schedule` o'zgarsa, `schedule_effective_from` (YYYY-MM-DD) ixtiyoriy.

Body (misol):
```json
{
  "name": "Node.js Backend",
  "room_id": 3,
  "price": 1200000,
  "schedule": { "days": ["Mon", "Wed"], "time": "18:00-20:00" },
  "schedule_effective_from": "2026-03-20"
}
```

## 9) Student ma'lumotlarini yangilash (Admin yoki Teacher)
Endpoint:
`PATCH /api/users/students/:studentId`

Body:
```json
{
  "name": "Ali",
  "surname": "Karimov",
  "phone": "+998901234567",
  "phone2": "+998901112233",
  "father_name": "Anvar",
  "father_phone": "+998907778899",
  "address": "Toshkent, Chilonzor",
  "age": 16
}
```

Qoida:
- `teacher` faqat o'z guruhidagi studentni yangilay oladi.
- `username` ni `admin` ham `teacher` ham yangilay oladi.

Xatoliklar:
- `400`: noto'g'ri `studentId`, `age` butun son emas, yoki ruxsat berilmagan maydon yuborildi
- `403`: teacher o'z guruhidagi student emas
- `404`: student topilmadi

---

# Davomatda to'lov ma'lumotlari (Frontend guide)

Maqsad:
Dars ichidagi student ro'yxatida va oylik davomat jadvalida talabaning shu oy uchun to'lagan summasi va qarzdorligini ko'rsatish.

## 1) Dars studentlari ro'yxati
Endpoint:
`GET /api/attendance/lessons/:lesson_id/students`

Yangi fieldlar:
- `paid_amount` (number): shu oy uchun to'langan summa
- `debt_amount` (number): shu oy uchun qolgan qarz

Misol (bitta student):
```json
{
  "attendance_id": 123,
  "student_id": 45,
  "student_name": "Ali Karimov",
  "monthly_status": "active",
  "paid_amount": 600000,
  "debt_amount": 400000
}
```

## 2) Guruhning oylik davomati
Endpoint:
`GET /api/attendance/groups/:group_id/monthly?month=YYYY-MM`

Yangi fieldlar (har bir student objectida):
- `paid_amount` (number)
- `debt_amount` (number)

Misol (bitta student):
```json
{
  "student_id": 45,
  "student_name": "Ali Karimov",
  "monthly_status": "active",
  "paid_amount": 600000,
  "debt_amount": 400000,
  "statistics": {
    "total_attended": 8,
    "total_missed": 2,
    "total_late": 1,
    "total_lessons": 10,
    "attendance_percentage": 80
  }
}
```

## 3) Hisoblash logikasi (backend)
Ma'lumotlar manbasi ketma-ketligi:
- `monthly_snapshots` mavjud bo'lsa, shu yerdan olinadi
- Aks holda `student_payments` ishlatiladi
- Hech biri bo'lmasa, `groups.price` dan qarz hisoblanadi

Formula:
`debt_amount = required_amount - paid_amount`

## 4) UI tavsiyasi
- Dars studentlari jadvalida `To'langan` va `Qarz` ustunlari ko'rsating.
- Oylik davomat jadvalida student ismi yonida yoki alohida ustunlarda ko'rsating.

---

# Dashboard daily stats (Frontend guide)

Endpoint:
`GET /api/dashboard/stats/daily?from=YYYY-MM-DD&to=YYYY-MM-DD`

Mavjud data (o'zgarmaydi):
- `period`, `summary`, `chart`, `points`

Yangi data (qo'shildi):
`data.daily` bo'limi.

## 1) Bugun to'lov qilgan talabalar ro'yhati
Field: `data.daily.payments`

Har bir itemda:
- `payment_id`
- `student_id`
- `name`, `surname`, `username`, `student_status`
- `phone`, `phone2`
- `father_name`, `father_phone`
- `address`, `age`
- `subject`, `subject_id`
- `student_group_id`, `student_group_name`
- `student_teacher_id`, `student_teacher_name`
- `course_status`, `course_start_date`, `course_end_date`
- `group_id`, `group_name`
- `subject_name`
- `teacher_name`
- `amount`
- `payment_method`
- `payment_time` (YYYY-MM-DD HH:mm)

## 2) Bugun to'lov qilingan umumiy summa
Field: `data.daily.payments_total_amount` (number)

## 3) Bugun registratsiya qilingan talabalar ro'yhati
Field: `data.daily.new_students`

Har bir itemda:
- `student_id`
- `name`, `surname`, `username`, `student_status`
- `phone`, `phone2`
- `father_name`, `father_phone`
- `address`, `age`
- `subject`, `subject_id`
- `student_group_id`, `student_group_name`
- `student_teacher_id`, `student_teacher_name`
- `course_status`, `course_start_date`, `course_end_date`
- `created_time` (YYYY-MM-DD HH:mm)

## 4) Sana qoidasi
`data.daily` har doim `to` parametri bo'yicha hisoblanadi.
Masalan: `from=2026-03-10&to=2026-03-17` bo'lsa, `daily` faqat `2026-03-17` kunini qaytaradi.
