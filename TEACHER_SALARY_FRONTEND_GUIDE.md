# Teacher Salary Frontend Guide (V3)

## Maqsad
Bu hujjat frontend uchun teacher oylik oynasidagi yangi biznes-qoidalarni tushuntiradi.

Yangi versiyada:
- Teacher statusi o'zgarsa ham oy jadvalidan yo'qolmaydi.
- Oy ichida teacher almashtirilsa, har bir teacher o'zining `worked_days` (ishlagan kun) bilan ko'rinadi.
- Oylik `close` qilingandan keyin ham yangi tushum bo'lsa yana payout qilish mumkin.
- Manual qo'shimcha summa kiritib oylikka qo'shish mumkin.
- O'tgan oylardan qolgan to'lanmagan qoldiq joriy oyda eslatib turiladi.

---

## Muhim endpointlar
Base: `/api/teacher-salary`

1. `GET /months/:month_name/teachers`
- Admin uchun oydagi barcha teacher summary ro'yxati.
- `month_name` formati: `YYYY-MM`.

2. `GET /months/:month_name/teachers/:teacher_id`
- Bitta teacher bo'yicha batafsil summary.

3. `POST /months/:month_name/teachers/:teacher_id/close`
- Oyni yopish (snapshot freeze nuqtasi).
- Eslatma: close qilingandan keyin ham payout davom etadi.

4. `POST /advances`
- Avans kiritish (faqat oy yopilmagan bo'lsa).
- Body:
```json
{
  "teacher_id": 12,
  "month_name": "2026-03",
  "amount": 500000,
  "description": "oldindan"
}
```

5. `POST /manual-adjustments`
- Oylikdan tashqari qo'shimcha summa.
- Body:
```json
{
  "teacher_id": 12,
  "month_name": "2026-03",
  "amount": 200000,
  "include_in_salary": true,
  "description": "bonus"
}
```

6. `GET /manual-adjustments?month_name=YYYY-MM&teacher_id=...`
- Manual adjustment tarixini olish.

7. `POST /payouts`
- Teacherga pul berish (oy yopilgan bo'lsa ham mumkin).
- Body:
```json
{
  "teacher_id": 12,
  "month_name": "2026-03",
  "amount": 350000,
  "description": "2-qism to'lov"
}
```

8. `GET /payouts?month_name=YYYY-MM&teacher_id=...`
- Payout tarixini olish.

---

## Summary response'dagi yangi maydonlar
`GET /months/:month/teachers/:teacher_id` va ro'yxat endpointida asosiy maydonlar:

- `worked_days`: teacher shu oyda nechta kun dars bergani.
- `groups_taught`: nechta guruhda dars bergani.
- `total_collected`: shu oydagi teacherga tegishli tushum.
- `expected_salary`: foiz bo'yicha hisoblangan summa.
- `carry_from_previous`: oldingi oylardan qolgan to'lanmagan qoldiq.
- `manual_adjustments.included_total`: oylikka qo'shilgan manual summa.
- `manual_adjustments.excluded_total`: faqat ma'lumot uchun kiritilgan (oylikka qo'shilmaydi).
- `gross_salary`: `expected + carry_from_previous + manual_included`.
- `total_advances`: avanslar yig'indisi.
- `net_salary`: `gross_salary - total_advances`.
- `total_payouts`: shu oy bo'yicha berilgan pullar yig'indisi.
- `final_salary` (yoki `balance`): hozir to'lanishi kerak qolgan summa.
- `previous_unpaid_total`: oldingi oylardan qolgan qarzdorlik yig'indisi.
- `previous_unpaid_months`: qaysi oyda qancha qolganini list.
- `is_closed`, `closed_at`: oy yopilgan status.
- `close_balance`: oy yopilgan vaqtdagi balance snapshot.
- `post_close_generated`: oy yopilgandan keyin qayta yig'ilgan qo'shimcha summa.

---

## Frontend oqimi

1. Oylik jadval ekrani
- Sahifa ochilganda: `GET /months/:month/teachers`.
- Jadval ustunlari:
  - Teacher
  - Worked days
  - Total collected
  - Expected
  - Carry from previous
  - Manual included
  - Advances
  - Payouts
  - Balance (`final_salary`)
  - Closed status
  - Post-close generated

2. Teacher detail drawer/modal
- `GET /months/:month/teachers/:teacher_id`
- Shu joyda 3 ta blokni alohida ko'rsating:
  - `GET /advances`
  - `GET /manual-adjustments`
  - `GET /payouts`

3. Payout tugmasi
- `final_salary > 0` bo'lsa aktiv.
- Submitdan keyin teacher summary va payout history ni refresh qiling.

4. Close oy tugmasi
- `POST /months/:month/teachers/:teacher_id/close`.
- Close qilingach:
  - `is_closed=true` ko'rsating.
  - Lekin payout tugmasini o'chirmang (yangi tushum bo'lishi mumkin).

5. Oldingi oy qoldig'i eslatmasi
- Agar `previous_unpaid_total > 0` bo'lsa badge/banner chiqaring.
- Tooltip/modalda `previous_unpaid_months` ni ko'rsating.

---

## Validatsiya va UX
- Barcha summalar musbat son bo'lishi kerak.
- `month_name` har doim `YYYY-MM` formatda yuborilsin.
- Payout summasi `final_salary` dan katta yuborilsa backend 400 qaytaradi.
- `POST` amallardan keyin tegishli listlar refresh qilinsin.
- Money format: `uz-UZ` locale bilan formatlash tavsiya.

---

## Orqaga moslik
- Eski endpointlar saqlangan.
- `simple-list` endpoint ham mavjud, lekin `students` maydoni endi bo'sh array qaytishi mumkin (`[]`).
- Yangi UI uchun asosiy manba sifatida `GET /months/:month/teachers` dan foydalaning.

