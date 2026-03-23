# Rasxodlar bo'limi: Admin ismi ko'rsatish + ism bo'yicha filter

Quyidagi o'zgarishlar backendda qilindi. Frontendda moslashtirish kerak.

## 1. Rasxodlar ro'yxati API

Endpoint: `GET /api/expenses`

Query params:
- `month` (majburiy emas, default: joriy oy, format: `YYYY-MM`)
- `admin_name` (ixtiyoriy) — admin ismi/familiyasi bo'yicha qisman filter. Misol: `Ali`, `Valiyev`, `Ali Valiyev`.

Misol:
```
GET /api/expenses?month=2026-03&admin_name=Ali
```

### Response item yangi maydonlar
Har bir rasxod obyekti endi quyidagilarni ham qaytaradi:
- `created_by` (admin id)
- `admin_name`
- `admin_surname`
- `admin_full_name` ("Ism Familiya")

Misol item:
```json
{
  "id": 12,
  "reason": "Kantselyariya",
  "amount": 150000,
  "expense_date": "2026-03-22",
  "month": "2026-03",
  "created_at": "2026-03-22T08:12:45.123Z",
  "created_by": 5,
  "admin_name": "Ali",
  "admin_surname": "Valiyev",
  "admin_full_name": "Ali Valiyev"
}
```

## 2. Frontend UI o'zgarishlari

1. Rasxodlar jadvalida yangi ustun qo'shing:
- Sarlavha: `Kim yozdi` (yoki `Admin`)
- Qiymat: `admin_full_name` (fallback: `admin_name + ' ' + admin_surname`)

2. Filter qo'shing (Select):
- Filter `select` ko'rinishida bo'ladi (adminlar ro'yxati).
- Tanlangan admin bo'yicha rasxodlar ro'yxati darhol yangilanadi.
- `admin_name` query param sifatida yuboriladi (masalan: `Ali Valiyev`).
- Qisman moslik ishlaydi, shuning uchun to'liq ism yuborish ham, qisman yuborish ham ishlaydi.

## 3. Muhim eslatma

`GET /api/expenses` endpointi `admin_name` filterini ishlatadi, lekin **agar admin_name bo'sh bo'lsa** filter qo'llanmaydi (hammasini qaytaradi).
