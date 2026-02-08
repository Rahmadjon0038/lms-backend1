# Password Recovery and Change Password API

This guide explains exactly which APIs to use for password reset and password change.

## 1. Admin side: get student recovery keys

### Endpoint
`GET /api/students/all`

### Auth
- Required
- Admin token only

### What to read in response
Each student item now includes:
- `recovery_key`

Example item (short):
```json
{
  "id": 12,
  "name": "Ali",
  "surname": "Valiyev",
  "recovery_key": "RK-A1B2C3D4"
}
```

Admin can give this key to the student when needed.

### Teacher recovery keys
Teachers list API also returns the same field:

`GET /api/users/teachers`

Each teacher item now includes:
- `recovery_key`

Also, when admin creates a teacher via `POST /api/users/register-teacher`, response includes:
- `recovery_key`

---

## 2. Forgot password (user uses username + recovery key)

### Endpoint
`POST /api/users/forgot-password/reset-with-key`

### Auth
- Not required

### Request body
```json
{
  "username": "student01",
  "recovery_key": "RK-A1B2C3D4",
  "new_password": "NewStrongPass123"
}
```

### Success behavior
- Password is updated.
- Old recovery key is burned (cannot be reused).
- New recovery key is generated automatically and returned.

### Success response
```json
{
  "success": true,
  "message": "Parol muvaffaqiyatli tiklandi. Eski recovery key endi ishlamaydi.",
  "data": {
    "recovery_key": "RK-NEWKEY99"
  }
}
```

Important:
- Student must save the new returned key.
- Next reset requires this new key.

---

## 3. Change password (logged-in user)

### Endpoint
`POST /api/users/change-password`

### Auth
- Required (Bearer token)

### Request body
```json
{
  "username": "student01",
  "old_password": "OldPass123",
  "new_password": "NewPass456"
}
```

Notes:
- `username` is optional, but if sent it must match the logged-in user.
- `old_password` must be correct.

### Success response
```json
{
  "success": true,
  "message": "Parol muvaffaqiyatli yangilandi"
}
```

---

## 4. Frontend flow recommendation

1. Login page has `Forgot password?` button.
2. User enters `username + recovery_key + new_password`.
3. Call `POST /api/users/forgot-password/reset-with-key`.
4. Store/show returned `data.recovery_key` safely (replace old one).
5. For normal password update inside profile/settings use `POST /api/users/change-password`.
