const bcrypt = require('bcryptjs');
const pool = require('../config/db');

// Backend ishga tushganda bitta default super admin mavjudligini ta'minlaydi
// va login/parolni terminalda chiqaradi.
const seedDefaultSuperAdmin = async () => {
  const username = process.env.DEFAULT_SUPER_ADMIN_USERNAME || 'superadmin';
  const password = process.env.DEFAULT_SUPER_ADMIN_PASSWORD || 'superadmin123';

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
         VALUES ($1, $2, $3, $4, $5, 'super_admin', 'active')`,
        ['Default', 'Super Admin', username, hashed, password]
      );
      created = true;
    } else {
      await pool.query(
        `UPDATE users
         SET password = $1, password_plain = $2, role = 'super_admin', status = 'active'
         WHERE username = $3`,
        [hashed, password, username]
      );
    }

    const line = '─'.repeat(46);
    console.log('\n┌' + line + '┐');
    console.log('  🔐 DEFAULT SUPER ADMIN ' + (created ? '(yangi yaratildi)' : '(parol yangilandi)'));
    console.log('  Login:  ' + username);
    console.log('  Parol:  ' + password);
    console.log('└' + line + '┘\n');
  } catch (error) {
    console.error('❌ Default super admin yaratishda xatolik:', error.message);
  }
};

module.exports = { seedDefaultSuperAdmin };
