const pool = require('../config/db');

// Telegram guruhga yuborilgan har bir statistika/uy vazifa xabari shu yerda
// qayd etiladi. Rasm fayli serverda SAQLANMAYDI (xotirada forward qilinadi
// va tashlab yuboriladi) — ammo Telegram o'zi qaytargan `file_id` saqlanadi,
// shu bilan "oylik hisobot" tugmasi bosilganda rasmni serverga qayta
// yuklamasdan, Telegram'ning o'z serveridan qayta yuborish mumkin bo'ladi.
const createTelegramBotTable = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS telegram_bot_messages (
        id SERIAL PRIMARY KEY,
        message_type VARCHAR(20) NOT NULL CHECK (message_type IN ('report', 'homework')),
        lesson_id INTEGER REFERENCES lessons(id) ON DELETE CASCADE,
        teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        teacher_name VARCHAR(255) NOT NULL DEFAULT '',
        group_id INTEGER REFERENCES groups(id) ON DELETE SET NULL,
        group_name VARCHAR(255) NOT NULL DEFAULT '',
        branch_id INTEGER NOT NULL DEFAULT 1,
        chat_id VARCHAR(50) NOT NULL,
        telegram_message_id BIGINT,
        telegram_file_id TEXT,
        caption TEXT NOT NULL DEFAULT '',
        report_month VARCHAR(7) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_telegram_bot_messages_teacher_month
        ON telegram_bot_messages(teacher_id, report_month);
      CREATE INDEX IF NOT EXISTS idx_telegram_bot_messages_lesson
        ON telegram_bot_messages(lesson_id);
    `);

    console.log("✅ 'telegram_bot_messages' jadvali tayyor.");
  } catch (error) {
    console.error("Telegram bot jadvalini yaratishda xatolik:", error);
    throw error;
  }
};

module.exports = { createTelegramBotTable };
