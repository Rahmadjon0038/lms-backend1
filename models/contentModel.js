const pool = require('../config/db');

// Bosh sahifa kontenti: storis videolar va yangiliklar
const createContentTables = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS stories (
        id SERIAL PRIMARY KEY,
        title VARCHAR(120) DEFAULT '',
        video_path TEXT NOT NULL,
        order_index INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS news (
        id SERIAL PRIMARY KEY,
        tag VARCHAR(60) DEFAULT 'Yangilik',
        title VARCHAR(200) NOT NULL,
        subtitle VARCHAR(300) DEFAULT '',
        body TEXT NOT NULL,
        order_index INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log("✅ 'stories' va 'news' jadvallari tekshirildi/yaratildi.");
  } catch (error) {
    console.error("❌ Kontent jadvallarini yaratishda xato:", error.message);
  }
};

module.exports = { createContentTables };
