# Admin Statistics API

Bu hujjat yangi admin statistika APIlari uchun frontend qo'llanma.
Eski `GET /api/dashboard/stats` endpoint olib tashlangan.

## 1. Auth
Har requestda JWT:

```http
Authorization: Bearer <token>
```

## 2. Yangi endpointlar

1. `GET /api/dashboard/stats/daily`
2. `GET /api/dashboard/stats/monthly`

Qo'shimcha mavjud:
- `GET /api/dashboard/debtors`
- `GET /api/dashboard/super-admin`

---

## 3. Kunlik statistika

`GET /api/dashboard/stats/daily`

### Query
- `from` (optional, `YYYY-MM-DD`) - default: bugundan 6 kun oldin
- `to` (optional, `YYYY-MM-DD`) - default: bugun

Cheklov:
- Maksimal interval: `92` kun

### Response
```json
{
  "success": true,
  "data": {
    "period": {
      "from": "2026-02-01",
      "to": "2026-02-08",
      "days": 8
    },
    "summary": {
      "total_payments_count": 45,
      "total_payments_amount": 12450000,
      "total_new_students": 9,
      "total_lessons": 18,
      "total_attendance_marks": 420
    },
    "chart": {
      "labels": ["2026-02-01", "2026-02-02"],
      "series": {
        "payments_amount": [1200000, 850000],
        "payments_count": [4, 3],
        "new_students_count": [1, 0],
        "lessons_count": [2, 3]
      }
    },
    "points": [
      {
        "date": "2026-02-01",
        "payments_count": 4,
        "payments_amount": 1200000,
        "new_students_count": 1,
        "lessons_count": 2,
        "attendance_marks_count": 40
      }
    ]
  }
}
```

### Frontend ishlatish
- Chart x-o'qi: `chart.labels`
- Chart y-series: `chart.series.*`
- Jadval/list uchun: `points`
- KPI cardlar uchun: `summary`

---

## 4. Oylik statistika

`GET /api/dashboard/stats/monthly`

### Query
- `from_month` (optional, `YYYY-MM`) - default: joriy yil boshidan
- `to_month` (optional, `YYYY-MM`) - default: joriy oy

Cheklov:
- Maksimal interval: `24` oy

### Response
```json
{
  "success": true,
  "data": {
    "period": {
      "from_month": "2026-01",
      "to_month": "2026-06",
      "months": 6
    },
    "summary": {
      "total_payments_count": 320,
      "total_payments_amount": 96500000,
      "total_new_students": 55,
      "total_lessons": 146,
      "total_attendance_marks": 3480
    },
    "chart": {
      "labels": ["2026-01", "2026-02"],
      "series": {
        "payments_amount": [17500000, 16200000],
        "payments_count": [60, 54],
        "new_students_count": [12, 10],
        "lessons_count": [22, 24]
      }
    },
    "points": [
      {
        "month": "2026-01",
        "payments_count": 60,
        "payments_amount": 17500000,
        "new_students_count": 12,
        "lessons_count": 22,
        "attendance_marks_count": 510
      }
    ]
  }
}
```

### Frontend ishlatish
- Oylik bar/line chart: `chart.labels + chart.series`
- Oylik table: `points`
- Total KPI: `summary`

---

## 5. Xatoliklar

1. `400` - noto'g'ri filter format
- `from`/`to` noto'g'ri sana
- `from_month`/`to_month` noto'g'ri oy

2. `400` - interval juda katta
- daily > 92 kun
- monthly > 24 oy

3. `500` - server yoki query xatoligi

---

## 6. Frontend tavsiya

1. Dashboard ochilganda default chaqiring:
- `GET /api/dashboard/stats/daily`
- `GET /api/dashboard/stats/monthly`

2. Sana filter o'zgarsa:
- faqat `daily` endpointni qayta chaqiring

3. Oy filter o'zgarsa:
- faqat `monthly` endpointni qayta chaqiring

4. Chart component mapping:
- `labels = data.chart.labels`
- `series = data.chart.series`
