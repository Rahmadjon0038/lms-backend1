const pool = require('../config/db');
const bcrypt = require('bcryptjs');

const createAdmin = async () => {
  try {
    // Avval admin borligini tekshiramiz
    const existingAdmin = await pool.query(
      "SELECT * FROM users WHERE username = $1",
      ['admin']
    );

    if (existingAdmin.rows.length > 0) {
      console.log("⚠️  'admin' username bilan foydalanuvchi allaqachon mavjud!");
      console.log("Mavjud admin:", {
        id: existingAdmin.rows[0].id,
        name: existingAdmin.rows[0].name,
        username: existingAdmin.rows[0].username,
        role: existingAdmin.rows[0].role
      });
      process.exit(0);
    }

    // Parolni hashlash
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('admin123', salt);

    // Admin yaratish
    const result = await pool.query(
      `INSERT INTO users (name, surname, username, password, role, status) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING id, name, surname, username, role`,
      ['Admin', 'Adminov', 'admin', hashedPassword, 'admin', 'active']
    );

    console.log("✅ Admin muvaffaqiyatli yaratildi!");
    console.log("📋 Admin ma'lumotlari:");
    console.log("   Username: admin");
    console.log("   Password: admin123");
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
