const pool = require('../config/db');

// O'qituvchilar maosh jadvallari
const createTeacherSalaryTables = async () => {
    try {
        // Teacher salary settings jadvali - O'qituvchi maosh sozlamalari
        await pool.query(`
            CREATE TABLE IF NOT EXISTS teacher_salary_settings (
                id SERIAL PRIMARY KEY,
                teacher_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                base_percentage DECIMAL(5,2) DEFAULT 50.00, -- Asosiy foiz (studentlardan tushgan pulldan)
                bonus_percentage DECIMAL(5,2) DEFAULT 0.00, -- Qo'shimcha foiz (tajriba, sifat uchun)
                experience_months INTEGER DEFAULT 0, -- Necha oy ishlagan
                experience_bonus_threshold INTEGER DEFAULT 6, -- Qo'shimcha foiz qancha oydan keyin
                experience_bonus_rate DECIMAL(5,2) DEFAULT 5.00, -- Tajriba uchun qo'shimcha foiz
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(teacher_id)
            );
        `);

        // Teacher advances jadvali - O'qituvchi avanslari
        await pool.query(`
            CREATE TABLE IF NOT EXISTS teacher_advances (
                id SERIAL PRIMARY KEY,
                teacher_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                amount DECIMAL(12,2) NOT NULL,
                month_name VARCHAR(7) NOT NULL, -- YYYY-MM
                description TEXT,
                created_by INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Teacher monthly salaries jadvali - O'qituvchi oylik maoshlari
        await pool.query(`
            CREATE TABLE IF NOT EXISTS teacher_monthly_salaries (
                id SERIAL PRIMARY KEY,
                teacher_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                month_name VARCHAR(7) NOT NULL, -- YYYY-MM
                total_student_payments DECIMAL(12,2) DEFAULT 0, -- Studentlardan tushgan jami
                base_salary DECIMAL(12,2) DEFAULT 0, -- Asosiy maosh
                experience_bonus DECIMAL(12,2) DEFAULT 0, -- Tajriba bonusi
                other_bonuses DECIMAL(12,2) DEFAULT 0, -- Boshqa bonuslar
                total_earned DECIMAL(12,2) DEFAULT 0, -- Jami ishlagan
                total_advances DECIMAL(12,2) DEFAULT 0, -- Jami avanslar
                final_salary DECIMAL(12,2) DEFAULT 0, -- Final maosh (earned - advances)
                debt_from_previous DECIMAL(12,2) DEFAULT 0, -- O'tgan oydan qolgan qarz
                is_paid BOOLEAN DEFAULT false,
                payment_date TIMESTAMP,
                calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(teacher_id, month_name)
            );
        `);

        // Teacher salary payments jadvali - O'qituvchi maosh to'lovlari
        await pool.query(`
            CREATE TABLE IF NOT EXISTS teacher_salary_payments (
                id SERIAL PRIMARY KEY,
                teacher_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                monthly_salary_id INTEGER REFERENCES teacher_monthly_salaries(id) ON DELETE CASCADE,
                amount DECIMAL(12,2) NOT NULL,
                payment_type VARCHAR(20) DEFAULT 'salary', -- 'salary', 'advance', 'bonus'
                description TEXT,
                created_by INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log("✅ O'qituvchi maosh jadvallari yaratildi.");
        
    } catch (err) {
        console.error("❌ O'qituvchi maosh jadvallari yaratishda xato:", err.message);
        throw err;
    }
};

module.exports = { createTeacherSalaryTables };