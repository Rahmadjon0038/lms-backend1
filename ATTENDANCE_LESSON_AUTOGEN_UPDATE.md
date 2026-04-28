# Attendance: oylik dars auto-generatsiya yangilanishi

## Muammo
Davomat bo‘limida guruh ichidagi darslar oy oxirigacha to‘liq yaratilmay qolardi (masalan 30-kun bo‘sh qolishi).

Asosiy sabab: backend auto-generatsiyada oyiga darslar soni uchun limit qo‘yilgan edi (ilgari `12`, keyin `60`).
Haftasiga 3 kun dars bo‘ladigan guruhlarda ayrim oylarda (masalan 2026-04 Tue/Thu/Sat) darslar soni `13` bo‘lib, oxirgi dars(lar) yaratilmay qolardi.

## Backend o‘zgarishlar
- `controllers/attendanceController.js`: `autoGenerateLessonsForMonth` endi oy uchun limit ishlatmaydi.
  - Schedule bo‘yicha oyning `monthStart..monthEnd` oralig‘idagi barcha mos keladigan kunlar uchun darslar yaratiladi.
  - Duplikat darslar `ON CONFLICT (group_id, date, start_time) DO NOTHING` bilan oldi olinadi.

- `controllers/attendanceController.js`: `POST /api/attendance/groups/:group_id/lessons/regenerate` endpointiga `append_only` parametri qo‘shildi.
  - `append_only: true` bo‘lsa, mavjud lesson/attendance yozuvlari o‘chirilmaydi, faqat yetishmayotgan darslar qo‘shiladi.

- `controllers/groupController.js`: schedule o‘zgarganda default `schedule_effective_from` endi bugun emas, ertangi sana bo‘ladi va o‘tgan sanaga qo‘yish bloklanadi.

## Qanday ishlatish (tavsiya)
### 1) Eski darslarni o‘chirmasdan oy oxirigacha to‘ldirish
`POST /api/attendance/groups/:group_id/lessons/regenerate`

Body:
```json
{
  "month": "2026-04",
  "from_date": "2026-04-01",
  "append_only": true
}
```

### 2) Schedule doimiy o‘zgarsa
- `PATCH /api/groups/:id` orqali `schedule` bilan birga `schedule_effective_from` ni kelajak sanaga qo‘ying.
- Kerak bo‘lsa, yuqoridagi `append_only` rejimi bilan oy ichini to‘ldiring.

## Frontend ta’siri
- Majburiy frontend o‘zgarishi yo‘q: darslar ko‘proq (12+ bo‘lishi) normal holat.
- Agar UI’da “oyiga maksimal 12 ta dars” degan matn/cheklov bo‘lsa, uni olib tashlash yoki yangilash kerak.

