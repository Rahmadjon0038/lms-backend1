const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const createAdmin = async () => {
  try {
    const username = 'admin';
    const plainPassword = process.env.ADMIN_PASSWORD || `Admin-${crypto.randomBytes(4).toString('hex')}`;

    // Avval admin borligini tekshiramiz
    const existingAdmin = await pool.query(
      "SELECT id, name, surname, username, role FROM users WHERE username = $1",
      [username]
    );

    if (existingAdmin.rows.length > 0) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(plainPassword, salt);

      await pool.query(
        `UPDATE users
         SET password = $1,
             role = 'admin',
             status = 'active'
         WHERE username = $2`,
        [hashedPassword, username]
      );

      console.log("✅ Mavjud admin paroli yangilandi!");
      console.log("📋 Login ma'lumotlari:");
      console.log("   Username:", username);
      console.log("   Password:", plainPassword);
      console.log("   Role: admin");
      console.log("   Admin ID:", existingAdmin.rows[0].id);
      process.exit(0);
    }

    // Parolni hashlash
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(plainPassword, salt);

    // Admin yaratish
    const result = await pool.query(
      `INSERT INTO users (name, surname, username, password, role, status) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING id, name, surname, username, role`,
      ['Admin', 'Adminov', username, hashedPassword, 'admin', 'active']
    );

    console.log("✅ Admin muvaffaqiyatli yaratildi!");
    console.log("📋 Login ma'lumotlari:");
    console.log("   Username:", username);
    console.log("   Password:", plainPassword);
    console.log("   Role: admin");
    console.log("   ID:", result.rows[0].id);
    console.log("\n⚠️  MUHIM: Keyin parolni o'zgartiring!");

    process.exit(0);
  } catch (error) {
    console.error("❌ Xatolik:", error.message);
    process.exit(1);
  }
};

createAdmin();
