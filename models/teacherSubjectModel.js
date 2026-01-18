const pool = require('../config/db');

const createTeacherSubjectTables = async () => {
  const queryText = `
    -- Subjects jadvali
    CREATE TABLE IF NOT EXISTS subjects (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Teachers va Subjects orasidagi Many-to-Many bog'lanish jadvali
    CREATE TABLE IF NOT EXISTS teacher_subjects (
      id SERIAL PRIMARY KEY,
      teacher_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      subject_id INTEGER REFERENCES subjects(id) ON DELETE CASCADE,
      assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(teacher_id, subject_id)
    );

    -- Eski bir fanli systemdan yangi ko'p fanli sistemga o'tish uchun
    CREATE OR REPLACE FUNCTION migrate_teacher_subjects() 
    RETURNS VOID AS $$
    DECLARE
        teacher_record RECORD;
    BEGIN
        -- Mavjud teacherlarning subject_id ma'lumotlarini teacher_subjects jadvaliga ko'chirish
        FOR teacher_record IN 
            SELECT id, subject_id, subject 
            FROM users 
            WHERE role = 'teacher' AND subject_id IS NOT NULL
        LOOP
            -- teacher_subjects jadvaliga yozish (agar mavjud bo'lmasa)
            INSERT INTO teacher_subjects (teacher_id, subject_id)
            VALUES (teacher_record.id, teacher_record.subject_id)
            ON CONFLICT (teacher_id, subject_id) DO NOTHING;
        END LOOP;
        
        RAISE NOTICE 'Teacher subjects migration completed';
    END;
    $$ LANGUAGE plpgsql;
  `;

  try {
    await pool.query(queryText);
    
    // Migration funksiyasini ishga tushirish
    await pool.query('SELECT migrate_teacher_subjects()');
    
    console.log("✅ 'subjects' va 'teacher_subjects' jadvallari yaratildi.");
    console.log("✅ Eski ma'lumotlar yangi tizimga ko'chirildi.");
  } catch (err) {
    console.error("❌ Teacher-Subject jadvallari yaratishda xato:", err.message);
  }
};

// Teacher-ga yangi fan qo'shish (primary concept olib tashlandi)
const addSubjectToTeacher = async (teacherId, subjectId) => {
  try {
    const result = await pool.query(
      `INSERT INTO teacher_subjects (teacher_id, subject_id) 
       VALUES ($1, $2) 
       ON CONFLICT (teacher_id, subject_id) 
       DO NOTHING
       RETURNING *`,
      [teacherId, subjectId]
    );
    return result.rows[0];
  } catch (err) {
    throw new Error(`Fan qo'shishda xato: ${err.message}`);
  }
};

// Teacher-dan fan olib tashlash
const removeSubjectFromTeacher = async (teacherId, subjectId) => {
  try {
    const result = await pool.query(
      'DELETE FROM teacher_subjects WHERE teacher_id = $1 AND subject_id = $2 RETURNING *',
      [teacherId, subjectId]
    );
    return result.rows[0];
  } catch (err) {
    throw new Error(`Fan olib tashlashda xato: ${err.message}`);
  }
};

// Teacher-ning barcha fanlarini olish
const getTeacherSubjects = async (teacherId) => {
  try {
    const result = await pool.query(`
      SELECT s.*, ts.assigned_at
      FROM subjects s
      JOIN teacher_subjects ts ON s.id = ts.subject_id
      WHERE ts.teacher_id = $1
      ORDER BY s.name ASC
    `, [teacherId]);
    return result.rows;
  } catch (err) {
    throw new Error(`Teacher fanlarini olishda xato: ${err.message}`);
  }
};

// Fan bo'yicha teacherlarni olish
const getTeachersBySubject = async (subjectId) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.name, u.surname, u.username, u.phone, 
             ts.assigned_at
      FROM users u
      JOIN teacher_subjects ts ON u.id = ts.teacher_id
      WHERE ts.subject_id = $1 AND u.role = 'teacher'
      ORDER BY u.name ASC
    `, [subjectId]);
    return result.rows;
  } catch (err) {
    throw new Error(`Fan bo'yicha teacherlarni olishda xato: ${err.message}`);
  }
};

module.exports = {
  createTeacherSubjectTables,
  addSubjectToTeacher,
  removeSubjectFromTeacher,
  getTeacherSubjects,
  getTeachersBySubject
};