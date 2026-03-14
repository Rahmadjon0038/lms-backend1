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
