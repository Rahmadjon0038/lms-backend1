const db = require('../config/db');

const createGroupMonthlySettingsTable = async () => {
  try {
    // 1. Group monthly settings jadvalini yaratish
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS group_monthly_settings (
        id SERIAL PRIMARY KEY,
        group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        month VARCHAR(7) NOT NULL, -- YYYY-MM format
        
        -- O'sha oy uchun group snapshot
        name_for_month VARCHAR(255) NOT NULL,
        price_for_month DECIMAL(12,2) NOT NULL,
        teacher_id_for_month INTEGER REFERENCES users(id),
        subject_id_for_month INTEGER REFERENCES subjects(id),
        status_for_month VARCHAR(20) DEFAULT 'active',
        class_status_for_month VARCHAR(20) DEFAULT 'started',
        
        -- Meta ma'lumotlar
        created_at TIMESTAMP DEFAULT NOW(),
        created_by INTEGER REFERENCES users(id),
        
        -- Har group+month faqat bir marta bo'lsin
        UNIQUE(group_id, month)
      );
    `;

    await db.query(createTableQuery);

    // 2. Index qo'shish
    const indexQueries = [
      `CREATE INDEX IF NOT EXISTS idx_group_monthly_group_month 
       ON group_monthly_settings(group_id, month);`,
      
      `CREATE INDEX IF NOT EXISTS idx_group_monthly_month 
       ON group_monthly_settings(month);`,
       
      `CREATE INDEX IF NOT EXISTS idx_group_monthly_teacher 
       ON group_monthly_settings(teacher_id_for_month);`
    ];

    for (const indexQuery of indexQueries) {
      await db.query(indexQuery);
    }

    console.log('✅ group_monthly_settings jadval va indexlar yaratildi');

    // 3. Hozirgi oy uchun barcha faol guruhlar snapshot ni yaratish
    const currentMonth = new Date().toISOString().slice(0, 7);
    
    const snapshotQuery = `
      INSERT INTO group_monthly_settings 
      (group_id, month, name_for_month, price_for_month, teacher_id_for_month, 
       subject_id_for_month, status_for_month, class_status_for_month, created_at)
      SELECT 
        g.id,
        $1 as month,
        g.name,
        g.price,
        g.teacher_id,
        g.subject_id,
        g.status,
        g.class_status,
        NOW()
      FROM groups g
      WHERE g.status = 'active'
      ON CONFLICT (group_id, month) DO NOTHING
    `;

    const result = await db.query(snapshotQuery, [currentMonth]);
    
    console.log(`✅ ${currentMonth} oy uchun ${result.rowCount} guruh snapshot yaratildi`);

  } catch (error) {
    console.error('❌ Xatolik:', error.message);
  }
};

// Script ishga tushirish
if (require.main === module) {
  createGroupMonthlySettingsTable()
    .then(() => {
      console.log('✅ Barcha operatsiyalar tugallandi');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Script xatoligi:', error);
      process.exit(1);
    });
}

module.exports = createGroupMonthlySettingsTable;