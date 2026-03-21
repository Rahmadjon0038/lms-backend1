# Attendance Holiday (Dam Olish) Frontend Guide

## Maqsad
Calendar orqali tanlangan sanani `dam olish kuni` qilib belgilash va barcha guruh/fanlar uchun shu kunda darslar holiday bo'lishi.

Backend tarafda `lessons.is_holiday` ishlatiladi va holiday bo'lgan darslar attendance hisoblarida avtomatik hisobdan chiqariladi.

## API

### 1. Dam olish kunini belgilash (global)
`PATCH /api/attendance/holidays`

Body (JSON):
```json
{
  "date": "2026-03-20",
  "is_holiday": true
}
```

Javob (muvaffaqiyatli):
```json
{
  "success": true,
  "data": {
    "date": "2026-03-20",
    "is_holiday": true,
    "updated_lessons": 1
  }
}
```

`is_holiday: false` yuborsangiz holiday bekor qilinadi.

### 2. Holiday sanalar ro'yxati (calendar uchun)
`GET /api/attendance/holidays?month=YYYY-MM`

Javob (muvaffaqiyatli):
```json
{
  "success": true,
  "data": {
    "month": "2026-03",
    "dates": ["2026-03-08", "2026-03-20"]
  }
}
```

### 3. Lessonlar ro'yxati (calendar uchun)
`GET /api/attendance/groups/:group_id/lessons?month=YYYY-MM`

Natijada har bir lesson uchun `is_holiday` qaytadi. Calendar cell rangini yoki belgini shu bo'yicha boshqaring.

### 4. Oylik attendance (jadval uchun)
`GET /api/attendance/groups/:group_id/monthly?month=YYYY-MM`

`attendance_records` ichida har bir lesson uchun `is_holiday` bor. Frontendda:
1. `is_holiday = true` bo'lsa status cell ni "Dam" ko'rsating.
2. U kunlar bo'yicha davomat belgilash tugmasini o'chiring.

### 5. Davomat belgilash
`PUT /api/attendance/lessons/:lesson_id/mark`

Agar lesson holiday bo'lsa backend `409` qaytaradi:
```json
{
  "success": false,
  "message": "Dam olish kuni uchun davomat belgilab bo'lmaydi"
}
```

Frontendda bu xabarni toast/snackbar bilan ko'rsating va status yubormang.

## Frontend Flow (tavsiya)
1. Calendar ichida tanlangan sana uchun `PATCH /api/attendance/holidays` yuboring.
2. Muvaffaqiyatli bo'lsa `GET /api/attendance/holidays?month=...` yoki `GET /groups/:group_id/lessons?month=...` ni qayta chaqiring.
3. `is_holiday` bo'lgan kunlarda `Dam` label/rang ko'rsating va attendance mark qilishni disable qiling.

## Eslatma
- Holiday kalendarda tanlangan sanaga qo'yiladi, o'sha sanada lesson bo'lsa avtomatik `is_holiday=true` bo'ladi.
- Holiday bo'lgan lessonlar attendance statistikalarida hisobga olinmaydi.
