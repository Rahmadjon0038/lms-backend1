# Teacher Salary Small Changes (Frontend Migration Guide)

Bu hujjat frontend uchun `payout` terminidan `given` terminiga o'tish bo'yicha yakuniy yo'riqnoma.

## Qisqa xulosa
- Backendda `payout` oqimi endi `given` nomi bilan yuradi.
- Oy yopilgandan keyin ham yangi tushum bo'lsa, yana "berildi" qilish mumkin.
- Frontend `payout` so'zini UI, API va state'dan olib tashlashi kerak.
- Teacher oyligi student chegirmasidan mustaqil: hisoblash kursning asl narxidan qilinadi.

## Backendda qilingan o'zgarishlar

### 1) Yangi endpointlar
- `POST /api/teacher-salary/given`
- `GET /api/teacher-salary/given?teacher_id=...&month_name=YYYY-MM`

Body (`POST /given`) misol:
```json
{
  "teacher_id": 12,
  "month_name": "2026-03",
  "description": "2-qism berildi"
}
```

Eslatma:
- `amount` yuborilmaydi.
- "Berildi" tugmasi bosilganda backend `final_salary` ni avtomatik to'liq "berildi" qiladi.

### 2) Eski endpointlar
- `POST /api/teacher-salary/payouts`
- `GET /api/teacher-salary/payouts`

Hozircha backward compatibility uchun ishlaydi, lekin frontend **endi ishlatmasligi kerak**.

### 3) Summary maydonlari yangilandi
Eski -> Yangi
- `total_payouts` -> `total_given`
- `can_payout` -> `can_give`
- `payouts_after_close` -> `given_after_close`
- `extra_after_close` -> `post_close_collected_salary`
- `can_payout_after_close` -> `can_give_after_close`

### 4) Chegirma qoidasi (yangi)
- Teacher salary hisobida `paid_amount` ishlatilmaydi.
- Hisob bazasi: `monthly_snapshots.group_price` (fallback: `required_amount`).
- Ya'ni studentga chegirma berilgan bo'lsa ham teacher oyligi asl kurs narxidan chiqadi.

## Frontend nima qilishi kerak (majburiy migration)

### 1) API chaqiriqlarini almashtirish
- `POST /payouts` -> `POST /given`
- `GET /payouts` -> `GET /given`

### 2) State va typed fieldlarni almashtirish
Quyidagilarni loyihadagi barcha joyda rename qiling:
- `payout` -> `given`
- `payouts` -> `givenList` yoki `givenHistory`
- `total_payouts` -> `total_given`
- `can_payout` -> `can_give`
- `payouts_after_close` -> `given_after_close`

### 3) UI matnlarini yangilash
Quyidagilarni olib tashlang:
- `Payout`
- `Jami payout`
- `Payout history`

O'rniga ishlating:
- `Berildi`
- `Jami berildi`
- `Berilganlar tarixi`

### 4) Tugma va action
- Tugma nomi: `Berildi`
- Tugma aktiv bo'lish sharti: `summary.can_give === true` (yoki `summary.final_salary > 0`)
- `is_closed=true` bo'lsa ham tugma o'chirilmaydi.
- Input bo'lmaydi. Summani qo'lda kiritish olib tashlanadi.

### 5) Refresh oqimi
"Berildi"dan keyin quyidagilarni qayta chaqiring:
- `GET /api/teacher-salary/months/:month/teachers/:teacher_id`
- `GET /api/teacher-salary/given?teacher_id=...&month_name=...`

### 6) Oy yopilgandan keyingi yangi tushum ko'rinishi
Detailda alohida ko'rsating:
- `post_close_collected_salary` -> oy yopilgandan keyin yangi yig'ilgan summa
- `final_salary` -> hozir berilishi mumkin summa

## Frontend uchun tayyor checklist
- [ ] `payout` endpointlaridan foydalanish olib tashlandi
- [ ] Barcha API chaqiriqlar `given` ga o'tdi
- [ ] UI'da `payout` so'zi qolmadi
- [ ] `Jami payout` ustuni `Jami berildi` ga o'zgardi
- [ ] `can_payout` ishlatilmayapti, `can_give` ishlatilmoqda
- [ ] `GET /given` history ishlayapti
- [ ] Close qilingan oyda ham "Berildi" tugmasi ishlayapti
- [ ] "Berildi" oynasida amount input yo'q
- [ ] Berishdan keyin summary + history refresh bo'lyapti

## Muhim
Frontendchi `payout`ni endi yangi kodda ishlatmasin.
Legacy `/payouts` endpoint faqat vaqtinchalik moslik uchun qoldirilgan.
