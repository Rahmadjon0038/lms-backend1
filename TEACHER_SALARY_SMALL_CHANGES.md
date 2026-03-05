# Teacher Salary Small Changes (Frontend)

## Qilingan 2 ta o'zgarish

1. Teacher statusi o'zgarsa ham oylik jadvaldan yo'qolmaydi
- Oldin ro'yxatda faqat `status = active` teacherlar chiqardi.
- Endi `inactive/blocked` bo'lsa ham teacher salary ro'yxatda ko'rinadi.
- Frontend tomonda qo'shimcha ish shart emas, mavjud ro'yxat endpointini ishlatish kifoya.

2. Oy yopilgandan keyin ham qayta payout qilish mumkin
- Agar oy yopilgandan keyin talabalardan yana pul tushsa, teacherga yana to'lov qilish mumkin.
- Buning uchun yangi payout endpointlar qo'shildi.

---

## Yangi endpointlar

### 1) Payout yaratish
`POST /api/teacher-salary/payouts`

Body:
```json
{
  "teacher_id": 12,
  "month_name": "2026-03",
  "description": "close dan keyingi qo'shimcha payout"
}
```

`amount` yuborish shart emas. Yuborilmasa tizim `final_salary` (mavjud yig'ilgan summa) ni to'liq payout qiladi.

### 2) Payout history olish
`GET /api/teacher-salary/payouts?teacher_id=12&month_name=2026-03`

---

## Frontend nima qilishi kerak

1. Oylik detail oynasida `summary.final_salary` ni "hozir beriladigan summa" sifatida ishlating.
2. `can_payout=true` bo'lsa "Berish" tugmasini aktiv qiling.
3. `is_closed=true` bo'lsa ham payout tugmasini o'chirmang.
4. Payoutdan keyin quyidagilarni refresh qiling:
- `GET /api/teacher-salary/months/:month/teachers/:teacher_id`
- `GET /api/teacher-salary/payouts?teacher_id=...&month_name=...`
5. Agar backend `available_balance` qaytarsa, shu qiymatni foydalanuvchiga ko'rsating.

---

## Qo'shimcha maydonlar (summary)
- `total_payouts`: shu oy teacherga berilgan to'lovlar yig'indisi.
- `extra_after_close`: oy yopilgandan keyin qo'shilgan qo'shimcha hisob.
- `can_payout_after_close`: yopilgan oy bo'lsa ham qayta payout mumkinligini bildiradi.
