# Super Admin: Admin Management Frontend Guide

Bu hujjat super admin uchun **admin yaratish**, **adminlar ro'yxatini ko'rish**, **holatini o'zgartirish** va **oyma-oy oylik berish/yangilash** funksiyalarini frontendda qilish bo'yicha yo'l-yo'riq beradi.

## 1) Admin yaratish

**Endpoint**
`POST /api/users/register-admin`

**Auth**
`Bearer <super_admin_access_token>`

**Body**
```json
{
  "name": "Aziz",
  "surname": "Karimov",
  "username": "admin01",
  "password": "admin123",
  "phone": "+998901234567",
  "phone2": "+998912345678"
}
```

**Response (201)**
```json
{
  "success": true,
  "message": "Admin muvaffaqiyatli yaratildi",
  "admin": {
    "id": 12,
    "name": "Aziz",
    "surname": "Karimov",
    "username": "admin01",
    "role": "admin",
    "phone": "+998901234567",
    "phone2": "+998912345678",
    "status": "active",
    "created_at": "2026-03-25T10:20:30.000Z"
  },
  "recovery_key": "RK-AB12CD34"
}
```

Frontendda `recovery_key` ni ko'rsatib, admin uchun saqlab qo'yish imkonini bering (parol tiklash uchun kerak bo'ladi).

## 2) Adminlar ro'yxatini ko'rish

**Endpoint**
`GET /api/users/admins`

**Auth**
`Bearer <super_admin_access_token>`

**Query paramlar**
- `status`: `active` | `terminated` | `on_leave`
- `month_name`: `YYYY-MM` (berilsa, shu oy uchun oylik ma'lumot ham qaytadi)

**Misol**
`GET /api/users/admins?status=active&month_name=2026-03`

**Response (200)**
```json
{
  "success": true,
  "data": [
    {
      "id": 12,
      "name": "Aziz",
      "surname": "Karimov",
      "username": "admin01",
      "phone": "+998901234567",
      "phone2": "",
      "status": "active",
      "terminationDate": null,
      "createdAt": "2026-03-01",
      "recovery_key": "RK-AB12CD34",
      "salary": {
        "month_name": "2026-03",
        "amount": 2500000,
        "description": "Mart oyi oyligi",
        "updated_at": "2026-03-25"
      }
    }
  ]
}
```

UI tavsiyasi:
- Adminlar jadvalida status filter va `month_name` filter bo'lsin.
- `month_name` tanlanganda, jadvalda **oylik** ustunlari ko'rsatiladi.

## 3) Admin holatini o'zgartirish

**Endpoint**
`PATCH /api/users/admins/:adminId/status`

**Auth**
`Bearer <super_admin_access_token>`

**Body**
```json
{
  "status": "terminated",
  "terminationDate": "2026-03-25"
}
```

`status` qiymatlari:
- `active`
- `terminated`
- `on_leave`

**Response (200)**
```json
{
  "success": true,
  "message": "Admin holati yangilandi",
  "admin": {
    "id": 12,
    "name": "Aziz",
    "surname": "Karimov",
    "status": "terminated",
    "terminationDate": "2026-03-25"
  }
}
```

Frontendda status o'zgarganda admin ro'yxatini qayta refresh qiling.

## 4) Adminlarga oyma-oy oylik berish yoki yangilash

**Endpoint**
`POST /api/admin-salary/pay`

**Auth**
`Bearer <super_admin_access_token>`

**Body**
```json
{
  "admin_id": 12,
  "month_name": "2026-03",
  "amount": 2500000,
  "description": "Mart oyi oyligi"
}
```

Agar shu admin va shu oy uchun oylik mavjud bo'lsa, **yangilanadi** (`action = updated`). Aks holda yangi yozuv yaratiladi (`action = created`).

**Response (201/200)**
```json
{
  "success": true,
  "message": "Admin oyligi saqlandi",
  "action": "created",
  "salary": {
    "id": 5,
    "admin_id": 12,
    "month_name": "2026-03",
    "amount": 2500000,
    "description": "Mart oyi oyligi",
    "created_by": 1,
    "updated_by": 1,
    "created_at": "2026-03-25T10:30:00.000Z",
    "updated_at": "2026-03-25T10:30:00.000Z"
  }
}
```

UI tavsiyasi:
- Admin ro'yxatida har bir admin uchun “Oylik berish” modal/forma bo'lsin.
- Agar `month_name` va admin bo'yicha mavjud oylik bo'lsa, forma **edit** rejimida ochilsin.

## 5) Admin oyliklari ro'yxati (alohida sahifa uchun)

**Endpoint**
`GET /api/admin-salary`

**Auth**
`Bearer <super_admin_access_token>`

**Query paramlar**
- `admin_id` (ixtiyoriy)
- `month_name` (ixtiyoriy, format: `YYYY-MM`)

**Misol**
`GET /api/admin-salary?month_name=2026-03`

**Response (200)**
```json
{
  "success": true,
  "data": [
    {
      "id": 5,
      "admin_id": 12,
      "name": "Aziz",
      "surname": "Karimov",
      "username": "admin01",
      "status": "active",
      "month_name": "2026-03",
      "amount": 2500000,
      "description": "Mart oyi oyligi",
      "created_by": 1,
      "updated_by": 1,
      "created_at": "2026-03-25T10:30:00.000Z",
      "updated_at": "2026-03-25T10:30:00.000Z"
    }
  ]
}
```

## UX qisqa checklist
- `Admin Create` formasi: name, surname, username, password, phone, phone2.
- `Admin List` sahifasi: status filter + month filter.
- `Status update` action: terminate/on_leave/active.
- `Salary` modal: month_name (YYYY-MM), amount, description.
- Har bir actiondan keyin ro'yxat refresh.

