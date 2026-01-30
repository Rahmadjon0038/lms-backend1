# Dashboard API Qo'llanmasi

## `/api/dashboard/stats` - Admin Dashboard Statistikalari

### Umumiy ma'lumot
Bu endpoint admin uchun uchta turdagi statistikalarni qaytaradi:
1. **Kunlik** - tanlangan kun bo'yicha
2. **Oylik** - tanlangan oy bo'yicha  
3. **Umumiy** - dastur boshidan boshlab jami

### Query parametrlari

| Parametr | Format | Default | Tavsif |
|----------|--------|---------|--------|
| `date` | YYYY-MM-DD | Bugun | Kunlik statistikalar uchun sana |
| `month` | YYYY-MM | Joriy oy | Oylik statistikalar uchun oy |

### So'rov misollari

#### 1. Bugungi statistikalar (default)
```bash
GET /api/dashboard/stats
```

#### 2. Muayyan kun uchun statistikalar
```bash
GET /api/dashboard/stats?date=2026-01-30
```

#### 3. O'tgan oy statistikalari
```bash
GET /api/dashboard/stats?month=2025-12
```

#### 4. Muayyan kun va oy kombinatsiyasi
```bash
GET /api/dashboard/stats?date=2025-12-15&month=2025-12
```

### Javob tuzilmasi

```json
{
  "success": true,
  "message": "Admin dashboard statistikalari muvaffaqiyatli olindi",
  "data": {
    "daily": {
      "date": "2026-01-31",
      "is_today": true,
      "payments": {
        "count": 15,
        "amount": 4500000
      },
      "new_students": {
        "count": 3,
        "list": [
          {
            "id": 125,
            "student_name": "Alisher Karimov",
            "phone": "+998901234567",
            "group_name": "Frontend 101",
            "subject_name": "Web Dasturlash",
            "join_date": "31.01.2026 14:30"
          }
        ]
      },
      "payment_methods": [
        {
          "method": "Naqd",
          "count": 10,
          "total_amount": 3000000
        },
        {
          "method": "Karta",
          "count": 5,
          "total_amount": 1500000
        }
      ]
    },
    "monthly": {
      "month": "2026-01",
      "is_current_month": true,
      "payments": {
        "count": 245,
        "amount": 73500000
      },
      "new_students": 28,
      "debtor_students": 45
    },
    "overall": {
      "total_payments": {
        "count": 1523,
        "amount": 458000000
      },
      "students": {
        "total": 350,
        "active": 320
      },
      "groups": {
        "total": 45,
        "active": 38
      }
    },
    "meta": {
      "generated_at": "2026-01-31T10:30:00.000Z",
      "filters": {
        "selected_date": "2026-01-31",
        "selected_month": "2026-01",
        "today_date": "2026-01-31",
        "current_month": "2026-01"
      }
    }
  }
}
```

### Xususiyatlar

✅ **Yaqinda qo'shilgan talabalar** - kunlik statistikalarda yangi talabalar ro'yxati bilan birga qaytadi  
✅ **Filter tizimi** - istalgan kun va oy bo'yicha statistikalarni ko'rish mumkin  
✅ **Umumiy ko'rinish** - dastur boshidan barcha ma'lumotlar  
❌ **Faol o'qituvchilar** - statistikadan olib tashlandi (shart emas)

### Foydalanish stsenariylari

**1. Bugungi yangi talabalarni ko'rish**
```
GET /api/dashboard/stats
```
➡️ `data.daily.new_students.list` - bugun qo'shilgan talabalar ro'yxati

**2. Kechagi yangi talabalarni ko'rish**
```
GET /api/dashboard/stats?date=2026-01-30
```

**3. Ertangi kun uchun test (rejalashtirish)**
```
GET /api/dashboard/stats?date=2026-02-01
```

**4. O'tgan oy hisoboti**
```
GET /api/dashboard/stats?month=2025-12
```

**5. Umumiy dastur statistikasi**
```
GET /api/dashboard/stats
```
➡️ `data.overall` - barcha vaqt uchun ma'lumotlar

### Autentifikatsiya
Authorization header talab qilinadi:
```
Authorization: Bearer <JWT_TOKEN>
```

Faqat **admin** rolga ega foydalanuvchilar kirish huquqiga ega.
