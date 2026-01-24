# Student Guruh Status Boshqaruvi - Yangilanish

## Muammo
Ilgari student bitta `status` ga ega edi va u barcha guruhlarga ta'sir qilardi. Masalan:
- Student A "Python asoslari" va "JavaScript" guruhlarida o'qiyotgan edi
- Agar u "Python asoslari"ni bitirsa va uning statusini `graduated` ga o'zgartirsak
- U avtomatik ravishda "JavaScript" guruhidan ham `graduated` bo'lib qolardi

## Yechim
Endi student guruh-specific statusga ega:
- `student_groups` jadvalidagi `status` ustuni to'liq ishlatilmoqda
- Har bir guruh uchun alohida status: `active`, `stopped`, `finished`

## Yangi Funksiyalar

### 1. Guruh uchun status o'zgartirish
```
PATCH /api/students/:student_id/groups/:group_id/status
```

**Body:**
```json
{
  "status": "finished"  // active | stopped | finished
}
```

**Misol:**
```bash
curl -X PATCH http://localhost:5000/api/students/15/groups/3/status \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "finished"}'
```

### 2. Student guruhlarini ko'rish
```
GET /api/students/:student_id/groups
```

**Response misoli:**
```json
{
  "success": true,
  "student": {
    "id": 15,
    "name": "Alisher",
    "surname": "Valiyev"
  },
  "groups": [
    {
      "group_status": "finished",
      "group_name": "Python asoslari", 
      "left_at": "2026-01-24T10:30:00.000Z"
    },
    {
      "group_status": "active",
      "group_name": "JavaScript pro",
      "left_at": null
    }
  ],
  "total_groups": 2,
  "active_groups": 1,
  "finished_groups": 1
}
```

## Statuslar Tavsifi

### Guruh uchun statuslar (`student_groups.status`)
- **`active`** - Hozir o'qimoqda
- **`stopped`** - Vaqtincha to'xtatdi (qaytishi mumkin)
- **`finished`** - Guruhni bitirdi

### Eski global status (`users.status`) 
Hali ham mavjud, lekin faqat juda muhim holatlar uchun ishlatiladi:
- **`active`** - Faol student  
- **`blocked`** - Bloklangan (barcha guruhlardan)
- **`terminated`** - Butunlay chiqarilgan

## Tizimning Afzalliklari

1. **Moslashuvchanlik:** Student bir guruhni bitirishi boshqa guruhlarga ta'sir qilmaydi
2. **Tarix:** `left_at` sanasi orqali qachon bitirgan/tark etganini bilish mumkin
3. **Hisobot:** Har bir guruh uchun alohida statistika
4. **Boshqaruv:** Admin har bir guruh uchun alohida qaror qabul qilishi mumkin

## Misollar

### Holat 1: Student bitta guruhni bitirdi
- Alisher "Python asoslari"ni bitirdi → faqat shu guruhga `finished` status
- U "JavaScript pro"da hali `active` holat

### Holat 2: Student vaqtincha to'xtatdi
- Alisher "JavaScript pro"ni vaqtincha to'xtatdi → `stopped` status
- Keyin qaytganida `active` ga qaytarish mumkin

### Holat 3: Student bloklandi (global)
- Admin Alisherning global statusini `blocked` ga o'zgartirdi
- Bu barcha guruhlarga ta'sir qiladi
- Lekin har bir guruh uchun alohida `stopped` yoki `finished` qo'yish mumkin