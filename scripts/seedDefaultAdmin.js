const bcrypt = require('bcryptjs');
const pool = require('../config/db');

// Backend ishga tushganda bitta default admin mavjudligini ta'minlaydi
// va login/parolni terminalda chiqaradi.
const seedDefaultAdmin = async () => {
  const username = process.env.DEFAULT_ADMIN_USERNAME || 'admin';
  const password = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';

  try {
    const existing = await pool.query(
      'SELECT id FROM users WHERE username = $1',
      [username]
    );

    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(password, salt);
    let created = false;

    if (existing.rows.length === 0) {
      await pool.query(
        `INSERT INTO users (name, surname, username, password, password_plain, role, status)
         VALUES ($1, $2, $3, $4, $5, 'admin', 'active')`,
        ['Default', 'Admin', username, hashed, password]
      );
      created = true;
    } else {
      // Mavjud bo'lsa parolni default qiymatga qayta o'rnatamiz — terminalda
      // doim ishlaydigan parol ko'rinishi uchun
      await pool.query(
        `UPDATE users
         SET password = $1, password_plain = $2, role = 'admin', status = 'active'
         WHERE username = $3`,
        [hashed, password, username]
      );
    }

    const line = '─'.repeat(46);
    console.log('\n┌' + line + '┐');
    console.log('  🔐 DEFAULT ADMIN ' + (created ? '(yangi yaratildi)' : '(parol yangilandi)'));
    console.log('  Login:  ' + username);
    console.log('  Parol:  ' + password);
    console.log('└' + line + '┘\n');
  } catch (error) {
    console.error('❌ Default admin yaratishda xatolik:', error.message);
  }
};

module.exports = { seedDefaultAdmin };
