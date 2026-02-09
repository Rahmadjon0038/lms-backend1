# Attendance Auto Lesson Guide

Bu hujjat teacher/admin uchun davomat bo'limidagi yangi avtomatlashtirilgan lesson yaratish funksiyasini tushuntiradi.

## 1. Nima o'zgardi

Avval:
- Teacher har darsni qo'lda yaratardi.

Hozir:
- Teacher (yoki admin) guruhning attendance sahifasiga kirganda, tanlangan oy uchun darslar avtomatik yaratiladi.
- Guruh `schedule.days` ga mos kunlar bo'yicha yaratiladi.
- Bir oy uchun maksimal `12` ta dars yaratiladi.

Masalan:
- `schedule.days = ["monday", "wednesday", "friday"]`
- Sahifa ochilganda o'sha oy ichidagi dushanba/chorshanba/juma sanalariga darslar avtomatik qo'shiladi.

---

## 2. Auto-generate ishlaydigan endpoint

`GET /api/attendance/groups/{group_id}/lessons?month=YYYY-MM`

### Muhim
- Endi bu endpoint faqat o'qib bermaydi, balki kerak bo'lsa darslarni ham yaratadi.
- Har chaqiruvda:
  1. Guruh jadvali (`schedule.days`) o'qiladi
  2. Tanlangan oy bo'yicha mos sanalar topiladi
  3. Mavjud lessonlar bilan solishtiriladi
  4. Yetishmayotgan lessonlar yaratiladi (max 12 ta)

### Yangi response maydoni
`data.auto_generated`
- `month`
- `generated_lessons_count`
- `mode` (`schedule_based_max_12`)

---

## 3. Lesson sanasini o'zgartirish

Yangi endpoint qo'shildi:

`PUT /api/attendance/lessons/{lesson_id}/date`

### Body
```json
{
  "date": "2026-02-20"
}
```

### Validatsiya
- `date` formati: `YYYY-MM-DD`
- O'sha guruhda shu sana uchun boshqa lesson bo'lsa xato qaytadi
- Teacher faqat o'z guruhidagi lesson sanasini o'zgartira oladi

### Nima yangilanadi
- `lessons.date` yangilanadi
- O'sha lesson uchun attendance qayta sync qilinadi:
  - mos bo'lmagan student attendance yozuvlari o'chiriladi
  - mos studentlar uchun attendance yaratiladi/yangilanadi
  - `attendance.month` yangi sana oyiga moslanadi

---

## 4. Qo'lda lesson yaratish (eski endpoint)

`POST /api/attendance/lessons`

Bu endpoint saqlanib qolgan, lekin ichki attendance sync mantiqi yaxshilangan.
Ya'ni qo'lda yaratilgan lesson ham avtomatik kabi to'g'ri attendance bilan yaratiladi.

---

## 5. Frontend tavsiya oqimi

1. Teacher guruhga kirganda:
- `GET /api/attendance/groups/{group_id}/lessons?month=YYYY-MM`
- qaytgan `data.lessons` ni render qiling

2. Agar teacher sanani ko'chirsa:
- `PUT /api/attendance/lessons/{lesson_id}/date`
- so'ng yana `GET /api/attendance/groups/{group_id}/lessons?month=YYYY-MM` chaqiring

3. Qo'lda lesson qo'shish tugmasi qolsa:
- `POST /api/attendance/lessons`
- keyin listni qayta oling

---

## 6. Schedule format eslatmasi

Auto-generate `groups.schedule.days` ga qaraydi.
Qabul qilinadigan kun nomlari (lowercase mapping orqali):
- english: `monday ... sunday`
- qisqa: `mon, tue, wed, thu, fri, sat, sun`
- uzbek translit: `dushanba, seshanba, chorshanba, payshanba, juma, shanba, yakshanba`

---

## 7. Xatoliklar

- `400` - noto'g'ri sana formati yoki duplicate lesson date
- `403` - teacher boshqa teacher guruhidagi lessonni tahrirlamoqchi bo'lsa
- `404` - group yoki lesson topilmasa
- `500` - server xatoligi
