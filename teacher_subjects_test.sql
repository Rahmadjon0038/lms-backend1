-- Fanlar va Teacher-Subject bog'lanishini test qilish uchun ma'lumotlar

-- 1. Fanlar yaratish (agar mavjud bo'lmasa)
INSERT INTO subjects (name, description) VALUES 
('Matematik', 'Amaliy matematik va algebra'),
('Fizika', 'Umumiy fizika va mexanika'),
('Ingliz tili', 'Umumiy ingliz tili va grammatika'),
('Informatika', 'Dasturlash va kompyuter savodxonligi'),
('Kimyo', 'Umumiy kimyo va organik kimyo'),
('Tarix', 'O''zbekiston va jahon tarixi'),
('Biologiya', 'Umumiy biologiya va botanika')
ON CONFLICT (name) DO NOTHING;

-- 2. Teacher yaratish (parollar: password123)
-- Bu SQL-da hash qilmayapmiz, backend orqali yaratish kerak
-- Quyidagi ma'lumotlar faqat misol uchun:

/*
Teacher yaratish uchun API calls:

POST /api/users/register-teacher
{
  "name": "Ali",
  "surname": "Karimov", 
  "username": "ali_math",
  "password": "password123",
  "phone": "+998901234567",
  "subject_ids": [1, 2],  // Matematik va Fizika
  "primary_subject_id": 1, // Matematik asosiy fan
  "age": 30,
  "has_experience": true,
  "experience_years": 5,
  "certificate": "Matematik o'qituvchisi sertifikati"
}

POST /api/users/register-teacher  
{
  "name": "Malika",
  "surname": "Tosheva",
  "username": "malika_eng", 
  "password": "password123",
  "phone": "+998912345678",
  "subject_ids": [3, 4],  // Ingliz tili va Informatika
  "primary_subject_id": 3, // Ingliz tili asosiy fan
  "age": 28,
  "has_experience": true,
  "experience_years": 3,
  "certificate": "Ingliz tili o'qituvchisi sertifikati"
}

POST /api/users/register-teacher
{
  "name": "Bobur", 
  "surname": "Rahmonov",
  "username": "bobur_science",
  "password": "password123",
  "phone": "+998923456789",
  "subject_ids": [5, 7, 2],  // Kimyo, Biologiya, Fizika
  "primary_subject_id": 5, // Kimyo asosiy fan
  "age": 35,
  "has_experience": true,
  "experience_years": 8,
  "certificate": "Fan o'qituvchisi sertifikati"
}
*/

-- 3. Teacher fanlarini boshqarish misollari:

/*
1. Teacher-ning fanlarini ko'rish:
GET /api/users/teachers/1/subjects

2. Teacher-ga yangi fan qo'shish:
POST /api/users/teachers/1/subjects
{
  "subject_id": 6,  // Tarix
  "is_primary": false
}

3. Teacher-dan fan olib tashlash:
DELETE /api/users/teachers/1/subjects/2

4. Teacher-ning asosiy fanini o'zgartirish:
PUT /api/users/teachers/1/subjects/primary
{
  "subject_id": 6  // Tarixni asosiy fan qilish
}

5. Fan bo'yicha teacherlarni ko'rish:
GET /api/subjects/1/teachers  // Matematik fani bo'yicha teacherlar
GET /api/users/subjects/1/teachers  // Alternativ route

6. Barcha teacherlarni ko'rish (fanlar bilan):
GET /api/users/teachers

7. Ma'lum fan bo'yicha teacherlarni filter qilish:
GET /api/users/teachers?subject_id=1  // Faqat matematik o'qitadigan teacherlar

8. Guruh yaratishda teacher-subject validation:
POST /api/groups
{
  "name": "Matematik 1-guruh",
  "teacher_id": 1,
  "subject_id": 1,  // Bu teacher matematik o'qitadi, OK
  "price": 350000,
  "status": "draft"
}
*/