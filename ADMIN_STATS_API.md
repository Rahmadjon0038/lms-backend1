# Admin Statistics API (Yangi)

Bu hujjat `admin` (boshqaruvchi) dashboardi uchun minimal va yangilangan statistikalarni tushuntiradi.

Cheklov:
- Admin `umumiy talabalar soni` ni ko'rmaydi.
- Admin `umumiy tushum summasi` ni ko'rmaydi.

## 1. Auth
Har requestda JWT bo'lishi kerak:

```http
Authorization: Bearer <token>
```

## 2. Endpointlar

1. `GET /api/dashboard/stats/daily`
2. `GET /api/dashboard/stats/monthly`
3. `GET /api/dashboard/stats/overview`
4. `GET /api/dashboard/debtors` (ixtiyoriy, alohida jadval uchun)

---

## 3. Kunlik statistika

`GET /api/dashboard/stats/daily`

### Query
- `from` (optional, `YYYY-MM-DD`) - default: bugundan 6 kun oldin
- `to` (optional, `YYYY-MM-DD`) - default: bugun

Cheklov:
- maksimal `92` kun

### Qaytadigan asosiy ko'rsatkichlar (`data.summary`)
- `payments_count` (To'lovlar soni)
- `new_students_count` (Yangi talabalar)
- `expenses_count` (Rasxodlar soni)
- `expenses_amount` (Rasxod summasi)

### Chart
`data.chart`
- `labels` (kunlar)
- `series.payments_count`
- `series.new_students_count`
- `series.expenses_count`
- `series.expenses_amount`

---

## 4. Oylik statistika

`GET /api/dashboard/stats/monthly`

### Query
- `from_month` (optional, `YYYY-MM`) - default: joriy yil boshi
- `to_month` (optional, `YYYY-MM`) - default: joriy oy

Cheklov:
- maksimal `24` oy

### Qaytadigan asosiy ko'rsatkichlar

`data.current_month`:
- `payments_count` (To'lovlar soni)
- `new_students_count` (Yangi talabalar)
- `expenses_count` (Rasxodlar soni)
- `expenses_amount` (Rasxod summasi)
- `debtors_count` (Qarzdorlar soni)
- `debt_amount` (Joriy oy qarz summasi)

`data.summary` (tanlangan interval yig'indisi):
- `payments_count`
- `new_students_count`
- `expenses_count`
- `expenses_amount`
- `debtors_count`
- `debt_amount`

### Chart
`data.chart`
- `labels` (oylar)
- `series.payments_count`
- `series.new_students_count`
- `series.expenses_count`
- `series.expenses_amount`
- `series.debtors_count`
- `series.debt_amount`

### To'lov status taqsimoti (har oy)
`data.payment_status_distribution`
- `month` (hisoblangan oy: `to_month`)
- `total_transactions`
- `items`:
  - `status = paid`, `label = To'langan`, `count`, `percentage`
  - `status = partial`, `label = Qisman to'langan`, `count`, `percentage`
  - `status = unpaid`, `label = To'lanmagan`, `count`, `percentage`
- `chart.labels = ['paid', 'partial', 'unpaid']`
- `chart.series.count`
- `chart.series.percentage`

---

## 5. Umumiy statistika

`GET /api/dashboard/stats/overview`

Bu endpoint endi faqat quyidagilarni qaytaradi:

### `data.overall`
- `active_teachers_count` (markazdagi faol teacherlar soni)
- `active_groups_count` (faol guruhlar soni)
- `subjects_count` (fanlar soni)

### `data.charts.admissions_monthly_last_12`
- `labels` (oxirgi 12 oy)
- `series.admissions_count` (qabul trendi chart uchun)

---

## 6. Frontend oqimi

Dashboard ochilganda:
1. `GET /api/dashboard/stats/overview`
2. `GET /api/dashboard/stats/daily`
3. `GET /api/dashboard/stats/monthly`

Filter o'zgarganda:
- sana filteri o'zgarsa: `daily`
- oy filteri o'zgarsa: `monthly`

---

## 7. Xatoliklar

- `400` - date/month format noto'g'ri yoki interval juda katta
- `401/403` - token/role xatosi
- `500` - server xatoligi
