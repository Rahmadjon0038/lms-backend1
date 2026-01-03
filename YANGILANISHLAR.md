# Backend Yangilanishlari

## O'zgarishlar

### 1. **Users Jadvali Yangilandi** (`models/userModel.js`)
Quyidagi ustunlar qo'shildi:
- `group_id` - Student qaysi guruhda ekanligi
- `group_name` - Guruh nomi (masalan: "Inglis tili beginner")
- `teacher_id` - O'qituvchi ID
- `teacher_name` - O'qituvchi ismi va familiyasi
- `required_amount` - Guruhning narxi (to'lov summasi)

### 2. **Student Yaratish** (`controllers/studentController.js` - `createStudent`)
Endi student yaratishda:
- `group_id` yoki `group_code` orqali guruhga qo'shilish mumkin
- Guruh topilsa, avtomatik ravishda student ma'lumotlariga guruh nomi, teacher nomi, va narxi yoziladi
- `phone2` (qo'shimcha telefon) ham qo'shildi

**Misol:**
```json
POST /api/students/create
{
  "name": "Ali",
  "surname": "Valiyev",
  "username": "ali123",
  "password": "parol123",
  "phone": "+998901234567",
  "phone2": "+998912345678",
  "group_code": "GR-A1B2C3"
}
```

### 3. **Mavjud Userni Student Qilish** (`controllers/studentController.js` - `makeUserStudent`)
- `group_id` yoki `group_code` parametrlari qo'shildi
- Student qilinganda guruh ma'lumotlari avtomatik yoziladi

**Misol:**
```json
POST /api/students/make-student
{
  "user_id": 5,
  "group_code": "GR-A1B2C3"
}
```

### 4. **Student Kod Orqali Qo'shilishi** (`controllers/groupController.js` - `studentJoinByCode`)
- Student guruhga qo'shilganda `users` jadvaliga avtomatik guruh ma'lumotlari yoziladi:
  - `group_id`
  - `group_name`
  - `teacher_id`
  - `teacher_name`
  - `required_amount`

**Misol:**
```json
POST /api/groups/join
{
  "unique_code": "GR-A1B2C3"
}
```

### 5. **Admin Studentni Qo'shishi** (`controllers/groupController.js` - `adminAddStudentToGroup`)
- Admin student qo'shganda ham avtomatik guruh ma'lumotlari yoziladi

**Misol:**
```json
POST /api/groups/add-student
{
  "student_id": 5,
  "group_id": 1
}
```

### 6. **Barcha Userlarni Olish** (`controllers/userController.js` - `getAllUsers`)
Endi qaytariladigan ma'lumotlar:
```json
{
  "id": 2,
  "name": "Ali",
  "surname": "Valiyev",
  "username": "ali123",
  "role": "student",
  "status": "active",
  "phone": "+998901234567",
  "phone2": "+998912345678",
  "group_id": 1,
  "group_name": "Inglis tili beginner",
  "teacher_id": 3,
  "teacher_name": "Rahmadjon Abdullayev",
  "required_amount": "500000.00",
  "created_at": "2026-01-03T..."
}
```

## Asosiy Xususiyatlar

✅ **Avtomatik Guruh Ma'lumotlari**: Student guruhga qo'shilganda guruh nomi, teacher nomi va narxi avtomatik yoziladi  
✅ **Kod Orqali Qo'shilish**: `group_code` parametri orqali guruhga qo'shilish mumkin  
✅ **To'liq Ma'lumotlar**: Bitta so'rovda studentning barcha ma'lumotlari (guruh, teacher, narx) olinadi  
✅ **Phone2 Qo'shildi**: Qo'shimcha telefon raqami saqlash imkoniyati

## Serverga O'zgarishlar Kiritish

1. **Serverni to'xtatish**: Agar server ishlab tursa
2. **Bazani yangilash**: Server qayta ishga tushganda jadval avtomatik yangilanadi
3. **Serverni ishga tushirish**: 
```bash
npm run dev
```

## API Endpointlar

### Student Yaratish
- **URL**: `POST /api/students/create`
- **Parametrlar**: `name`, `surname`, `username`, `password`, `phone`, `phone2`, `group_id` yoki `group_code`

### Mavjud Userni Student Qilish
- **URL**: `POST /api/students/make-student`
- **Parametrlar**: `user_id`, `group_id` yoki `group_code`
- **Role**: Admin

### Student Kod Orqali Qo'shilishi
- **URL**: `POST /api/groups/join`
- **Parametrlar**: `unique_code`
- **Auth**: JWT token kerak

### Admin Student Qo'shishi
- **URL**: `POST /api/groups/add-student`
- **Parametrlar**: `student_id`, `group_id`
- **Role**: Admin

### Barcha Userlarni Olish
- **URL**: `GET /api/users/all`
- **Role**: Admin
- **Auth**: JWT token kerak

## Muhim Eslatmalar

⚠️ **Baza Yangilanishi**: Eski bazada yangi ustunlar bo'lmaydi. Serverni qayta ishga tushiring.  
⚠️ **Eski Studentlar**: Mavjud studentlar uchun guruh ma'lumotlari NULL bo'ladi. Ularni qayta guruhga qo'shish kerak.  
⚠️ **Validation**: Barcha endpointlarda xatolik boshqaruvi mavjud.
