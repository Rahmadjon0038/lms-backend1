# Expenses API (Sodda)

Siz aytgandek eng sodda ko'rinish:
1. Oyni tanlaydi (`month`)
2. `+` bosib rasxod qo'shadi (`reason`, `amount`)
3. Pastda card/list chiqadi
4. Yuqorida 2 ta summa:
- bugungi rasxod summasi
- tanlangan oylik rasxod summasi

## 1. Auth
Har request:

```http
Authorization: Bearer <token>
```

Faqat admin/super_admin.

## 2. Endpointlar

1. `POST /api/expenses`  
Rasxod qo'shish

2. `GET /api/expenses?month=YYYY-MM`  
Tanlangan oy rasxodlari ro'yxati

3. `GET /api/expenses/summary?month=YYYY-MM`  
Bugungi summa + tanlangan oy summasi
4. `PUT /api/expenses/:id`  
Rasxodni yangilash
5. `DELETE /api/expenses/:id`  
Rasxodni o'chirish

---

## 3. Rasxod qo'shish

`POST /api/expenses`

Body:
```json
{
  "reason": "Printer uchun qog'oz",
  "amount": 350000,
  "expense_date": "2026-02-08"
}
```

Eslatma:
- `expense_date` yubormasa, backend bugungi sanani oladi.

Response:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "reason": "Printer uchun qog'oz",
    "amount": 350000,
    "expense_date": "2026-02-08",
    "month": "2026-02",
    "created_at": "..."
  }
}
```

## 4. Oylik list (cardlar uchun)

`GET /api/expenses?month=2026-02`

Response:
```json
{
  "success": true,
  "data": {
    "month": "2026-02",
    "count": 3,
    "items": [
      {
        "id": 12,
        "reason": "Marker",
        "amount": 45000,
        "expense_date": "2026-02-08",
        "month": "2026-02",
        "created_at": "..."
      }
    ]
  }
}
```

## 5. Yuqoridagi 2 ta statistika

`GET /api/expenses/summary?month=2026-02`

Response:
```json
{
  "success": true,
  "data": {
    "today": "2026-02-08",
    "month": "2026-02",
    "today_total_expense": 395000,
    "month_total_expense": 2180000
  }
}
```

---

## 6. Frontend oqim

1. Page ochilganda:
- `GET /api/expenses?month=<selectedMonth>`
- `GET /api/expenses/summary?month=<selectedMonth>`

2. `+` bosib qo'shgandan keyin:
- shu 2 endpointni qayta chaqiring

3. UI:
- Select month -> `month`
- Form -> `reason`, `amount`
- Card list -> `items`
- Top stats -> `today_total_expense`, `month_total_expense`

## 7. Xatoliklar
- `reason majburiy`
- `amount musbat son bo'lishi kerak`
- `expense_date formati YYYY-MM-DD bo'lishi kerak`
- `month formati YYYY-MM bo'lishi kerak`

## 8. Rasxodni yangilash

`PUT /api/expenses/12`

Body (kamida 1 maydon):
```json
{
  "reason": "Internet to'lovi",
  "amount": 480000,
  "expense_date": "2026-02-09"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "id": 12,
    "reason": "Internet to'lovi",
    "amount": 480000,
    "expense_date": "2026-02-09",
    "month": "2026-02",
    "created_at": "..."
  }
}
```

## 9. Rasxodni o'chirish

`DELETE /api/expenses/12`

Response:
```json
{
  "success": true,
  "message": "Rasxod o'chirildi",
  "data": {
    "id": 12,
    "reason": "Internet to'lovi",
    "amount": 480000,
    "expense_date": "2026-02-09",
    "month": "2026-02",
    "created_at": "..."
  }
}
```
