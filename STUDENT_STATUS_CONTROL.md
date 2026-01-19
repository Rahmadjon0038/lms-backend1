# Student Status Control - Guruh Boshqaruvi

## ✅ Amalga oshirilgan o'zgarishlar:

### 1. adminAddStudentToGroup funksiyasi
- Student faol bo'lmasa (status != 'active') guruhga qo'shishni taqiqlash
- Batafsil xabar va holat tushuntirish

### 2. changeStudentGroup funksiyasi  
- Student faol bo'lmasa guruhni o'zgartirishni taqiqlash
- Faqat guruhdan chiqarish imkoniyati qoldi

### 3. studentJoinByCode funksiyasi (qo'shimcha)
- Student kod orqali guruhga qo'shilishda ham status tekshiruvi kerak
- Agar bu funksiya mavjud bo'lsa, uni ham o'zgartirish kerak

## Qoidalar:
- Faqat `active` statusdagi studentlar guruhga qo'shilishi mumkin
- Faol bo'lmagan studentlar faqat guruhdan chiqarilishi mumkin  
- Har bir harakat uchun aniq xabar va tushuntirish

## Status ma'nolari:
- active: Faol - guruhga qo'shish/o'zgartirish mumkin
- inactive: To'xtatilgan - taqiqlangan  
- blocked: Bloklangan - taqiqlangan
- studying: O'qimoqda - taqiqlangan
- graduated: Bitirgan - taqiqlangan
- dropped_out: Chiqib ketgan - taqiqlangan