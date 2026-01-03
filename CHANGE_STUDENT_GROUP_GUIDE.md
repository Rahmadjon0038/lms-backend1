# Student Guruhini O'zgartirish - Qo'llanma

## 📌 Endpoint

```
POST /api/groups/change-student-group
```

**Auth:** Admin faqat (Bearer Token)

---

## 📝 Request

### Body:
```json
{
  "student_id": 5,
  "new_group_id": 3
}
```

### Parametrlar:
- `student_id` (integer, majburiy) - O'tkaziladigan student ID
- `new_group_id` (integer, majburiy) - Yangi guruh ID

---

## ✅ Response (Muvaffaqiyatli)

**Status:** 200 OK

```json
{
  "success": true,
  "message": "Ali Valiyev guruhdan guruhga ko'chirildi",
  "previous_group": {
    "id": 2,
    "name": "English Beginner A1"
  },
  "new_group": {
    "id": 3,
    "name": "Python Advanced",
    "teacher_name": "Jasur Nazarov"
  },
  "updated_student": {
    "id": 5,
    "name": "Ali",
    "surname": "Valiyev",
    "group_id": 3,
    "group_name": "Python Advanced",
    "teacher_id": 8,
    "teacher_name": "Jasur Nazarov"
  }
}
```

---

## ❌ Xato Holatlari

### 1. Student topilmadi
**Status:** 404 Not Found
```json
{
  "message": "Student topilmadi"
}
```

### 2. Yangi guruh topilmadi
**Status:** 404 Not Found
```json
{
  "message": "Yangi guruh topilmadi"
}
```

### 3. Guruh faol emas
**Status:** 400 Bad Request
```json
{
  "message": "Yangi guruh faol emas (bloklangan)"
}
```

### 4. Parametrlar to'liq emas
**Status:** 400 Bad Request
```json
{
  "message": "student_id va new_group_id majburiy"
}
```

---

## 🔄 Nima sodir bo'ladi?

1. ✅ Student eski guruhdan o'chiriladi (`student_groups` jadvalidam)
2. ✅ Yangi guruhga qo'shiladi
3. ✅ `users` jadvalidagi ma'lumotlar avtomatik yangilanadi:
   - `group_id` → yangi guruh ID
   - `group_name` → yangi guruh nomi
   - `teacher_id` → yangi teacher ID
   - `teacher_name` → yangi teacher ismi

---

## 💡 Foydalanish Misollar

### Misol 1: Studentni boshqa guruhga o'tkazish

**Scenario:** Ali Valiyev English Beginner guruhidan Python Advanced guruhiga o'tmoqchi.

**Request:**
```bash
curl -X POST http://localhost:5000/api/groups/change-student-group \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "student_id": 5,
    "new_group_id": 3
  }'
```

### Misol 2: Swagger orqali

1. `http://localhost:5000/api-docs` ga kiring
2. "Groups" bo'limini oching
3. `POST /api/groups/change-student-group` ni toping
4. "Try it out" bosing
5. Ma'lumotlarni kiriting va "Execute" bosing

---

## ⚠️ Muhim Eslatmalar

1. **Faqat Admin** - Bu endpoint faqat admin role uchun
2. **Guruh faol bo'lishi kerak** - Bloklangan guruhga o'tkazib bo'lmaydi
3. **Eski ma'lumotlar saqlanmaydi** - Student eski guruh ma'lumotlari o'chiriladi
4. **Konflikt yo'q** - Agar student allaqachon yangi guruhda bo'lsa, xato bermaydi
5. **Cascade delete** - Student o'chirilsa, barcha guruh ma'lumotlari ham o'chadi

---

## 🔗 Bog'liq Endpointlar

| Endpoint | Tavsif |
|----------|--------|
| `POST /api/groups/admin/join-student` | Studentni guruhga qo'shish |
| `DELETE /api/groups/:group_id/remove/:student_id` | Studentni guruhdan chiqarish |
| `GET /api/groups/my-group` | Student o'z guruhini ko'rish |
| `GET /api/groups/:id` | Guruh ma'lumotlari va a'zolar |

---

## ✨ Swagger Dokumentatsiya

To'liq API dokumentatsiya:
```
http://localhost:5000/api-docs
```

Groups → `POST /api/groups/change-student-group`
