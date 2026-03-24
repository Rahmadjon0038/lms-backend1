# Teacher Salary Frontend Update (Post-Close Payouts)

## Maqsad
Oylik yopilgandan keyin tushgan to'lovlar **alohida** hisoblanadi va oylik balansga aralashmaydi. “Berildi” bosilganda post-close tushumdan **teacher %** bo'yicha hisoblab beradi.

---

## Yangi backend maydonlar
`GET /api/teacher-salary/months/:month/teachers/:teacher_id`
`GET /api/teacher-salary/months/:month/teachers`

Response ichida qo'shimcha maydonlar:
- `post_close_collected_revenue`: oy yopilgandan keyin tushgan yangi tushum (faqat shu qism).
- `post_close_expected_salary`: shu yangi tushumdan foiz bo'yicha hisoblangan summa.
- `post_close_given`: post-close bo'yicha berilgan summa.
- `post_close_available`: post-close bo'yicha hozir berilishi mumkin summa.
- `post_close_can_give`: post-close bo'yicha berish mumkinligi.

Eslatma:
- `final_salary` (yoki `balance`) yopilgan oy balansidir va post-close bilan aralashmaydi.

---

## "Berildi" tugmasi ishlashi
`POST /api/teacher-salary/given`

Qoidalar:
- Oy ochiq bo'lsa: `final_salary` bo'yicha to'liq beriladi (`payout_type=regular`).
- Oy yopiq bo'lsa: **faqat** `post_close_available` bo'yicha to'liq beriladi (`payout_type=post_close`).
- Amount yuborilmaydi (backend mavjud summani to'liq beradi).

---

## "Berilganlar" logi
`GET /api/teacher-salary/given?month_name=YYYY-MM&teacher_id=...`

Har bir yozuvda:
- `payout_type`: `regular` yoki `post_close`
- `salary_percentage`: backenddan keladi (foiz yangilansa frontendda ham yangilanadi)

Frontendda tavsiya:
- `payout_type=post_close` bo'lsa "Post-close berildi" deb ko'rsating.
- `payout_type=regular` bo'lsa "Oylik berildi" deb ko'rsating.

---

## UI/UX Tavsiyasi
1. Summary blokda 2 ta alohida section:
   - Oylik balans:
     - `final_salary`
   - Post-close balans:
     - `post_close_collected_revenue`
     - `post_close_expected_salary`
     - `post_close_given`
     - `post_close_available`
2. "Berildi" tugmasi:
   - Oy ochiq: `final_salary > 0` bo'lsa aktiv.
   - Oy yopiq: `post_close_can_give === true` bo'lsa aktiv.

---

## Backward Compatibility
Eski payout yozuvlarda `payout_type` bo'lmasligi mumkin.
Backend bunday holatda `regular` deb hisoblaydi.

