const db = require('../config/db');

/**
 * MONTHLY SNAPSHOT JADVALINI YARATISH
 * 
 * Bu jadval har oylik ma'lumotlarni snapshot sifatida saqlaydi
 * Shunda har bir oy uchun alohida ma'lumot bazasi mavjud bo'ladi
 */

const createMonthlySnapshotTable = async () => {
  try {
    console.log('📋 Monthly snapshot jadvalini yaratyapmiz...');

    // 1. Asosiy snapshot jadval
    const createSnapshotTable = `
      CREATE TABLE IF NOT EXISTS monthly_snapshots (
        id SERIAL PRIMARY KEY,
        month VARCHAR(7) NOT NULL, -- YYYY-MM format
        student_id INTEGER NOT NULL,
        group_id INTEGER NOT NULL,
        
        -- Student ma'lumotlari (o'sha oyda)
        student_name VARCHAR(100),
        student_surname VARCHAR(100),
        student_phone VARCHAR(20),
        student_father_name VARCHAR(100),
        student_father_phone VARCHAR(20),
        
        -- Guruh ma'lumotlari (o'sha oyda)
        group_name VARCHAR(100),
        group_price DECIMAL(10,2),
        subject_name VARCHAR(100),
        teacher_name VARCHAR(100),
        
        -- Status ma'lumotlari
        monthly_status VARCHAR(20) DEFAULT 'active', -- 'active', 'stopped', 'finished'
        payment_status VARCHAR(20) DEFAULT 'unpaid', -- 'paid', 'partial', 'unpaid', 'inactive'
        
        -- To'lov ma'lumotlari
        required_amount DECIMAL(10,2) DEFAULT 0,
        paid_amount DECIMAL(10,2) DEFAULT 0,
        debt_amount DECIMAL(10,2) DEFAULT 0,
        last_payment_date TIMESTAMP,
        
        -- Davomat ma'lumotlari
        total_lessons INTEGER DEFAULT 0,
        attended_lessons INTEGER DEFAULT 0,
        attendance_percentage DECIMAL(5,2) DEFAULT 0,
        
        -- Sana ma'lumotlari
        snapshot_created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        snapshot_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        UNIQUE(month, student_id, group_id)
      );
    `;

    await db.query(createSnapshotTable);
    console.log('✅ monthly_snapshots jadvali yaratildi');

    // 2. Indekslar
    const createIndexes = [
      'CREATE INDEX IF NOT EXISTS idx_monthly_snapshots_month ON monthly_snapshots(month)',
      'CREATE INDEX IF NOT EXISTS idx_monthly_snapshots_student ON monthly_snapshots(student_id)',
      'CREATE INDEX IF NOT EXISTS idx_monthly_snapshots_group ON monthly_snapshots(group_id)',
      'CREATE INDEX IF NOT EXISTS idx_monthly_snapshots_status ON monthly_snapshots(monthly_status)',
      'CREATE INDEX IF NOT EXISTS idx_monthly_snapshots_payment_status ON monthly_snapshots(payment_status)',
    ];

    for (const indexQuery of createIndexes) {
      await db.query(indexQuery);
    }
    console.log('✅ Indekslar yaratildi');

    // 3. Updated_at trigger
    const createTrigger = `
      CREATE OR REPLACE FUNCTION update_snapshot_timestamp()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.snapshot_updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trigger_update_snapshot_timestamp ON monthly_snapshots;
      CREATE TRIGGER trigger_update_snapshot_timestamp
        BEFORE UPDATE ON monthly_snapshots
        FOR EACH ROW
        EXECUTE FUNCTION update_snapshot_timestamp();
    `;

    await db.query(createTrigger);
    console.log('✅ Updated_at trigger yaratildi');

    console.log('🎉 Monthly snapshot tizimi muvaffaqiyatli yaratildi!');
    
  } catch (error) {
    console.error('❌ Xatolik yuz berdi:', error);
    throw error;
  }
};

// Agar script to'g'ridan-to'g'ri ishga tushirilsa
if (require.main === module) {
  createMonthlySnapshotTable()
    .then(() => {
      console.log('✅ Script tugadi');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script xatoligi:', error);
      process.exit(1);
    });
}

module.exports = { createMonthlySnapshotTable };