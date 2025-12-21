const pool = require('../config/db');

// Jadvalni yaratish funksiyasi
const initUserTable = async () => {
    const queryText = `
    CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role VARCHAR(20) DEFAULT 'student',
        email VARCHAR(100) UNIQUE,
        created_by VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    `;
    try {
        await pool.query(queryText);
        console.log("✅ 'users' jadvali bazada tayyor.");
    } catch (err) {
        console.error("❌ 'users' jadvalini yaratishda xato:", err.message);
    }
};

const createUser = async (userData) => {
    const { username, password, role, email, createdBy } = userData;
    const query = `
        INSERT INTO users (username, password, role, email, created_by) 
        VALUES ($1, $2, $3, $4, $5) 
        RETURNING id, username, role, email, created_by, created_at
    `;
    const values = [username, password, role, email, createdBy];
    const { rows } = await pool.query(query, values);
    return rows[0];
};

const findUserByUsername = async (username) => {
    const query = 'SELECT * FROM users WHERE username = $1';
    const { rows } = await pool.query(query, [username]);
    return rows[0];
};

module.exports = { 
    initUserTable, // Serverga berib yuboramiz
    createUser, 
    findUserByUsername 
};