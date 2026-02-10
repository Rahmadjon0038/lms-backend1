const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT) || 5432,
  options: '-c timezone=Asia/Tashkent',
});

let readyPromise = null;

const waitForDbReady = async () => {
  if (readyPromise) return readyPromise;

  readyPromise = (async () => {
  while (true) {
    try {
      const client = await pool.connect();
      console.log("✅ PostgreSQL bazasiga ulanildi");
      
      // Timezone ni Toshkent vaqtiga o'rnatish
      await client.query("SET timezone = 'Asia/Tashkent'");
      console.log("✅ Timezone Toshkent vaqtiga o'rnatildi");
      
      client.release();
      break;
    } catch (err) {
      console.log("⏳ Postgres hali tayyor emas, 3s kutyapman...");
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  })();

  return readyPromise;
};

waitForDbReady();

module.exports = pool;
module.exports.waitForDbReady = waitForDbReady;
