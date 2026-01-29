const pool = require('../config/db');

/**
 * Bu skript student_discounts jadvaliga group_id ustunini qo'shadi
 * va constraint'larni o'rnatadi.
 */
async function addGroupIdToDiscounts() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('📝 student_discounts jadvaliga group_id ustunini qo\'shish...');
    
    // 1. group_id ustunini qo'shish (NULL bo'lishi mumkin, keyin update qilamiz)
    await client.query(`
      ALTER TABLE student_discounts 
      ADD COLUMN IF NOT EXISTS group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE
    `);
    console.log('✅ group_id ustuni qo\'shildi');
    
    // 2. Mavjud chegirmalarni birinchi guruhga bog'lash (agar student_groups da mavjud bo'lsa)
    const updateResult = await client.query(`
      UPDATE student_discounts sd
      SET group_id = (
        SELECT sg.group_id 
        FROM student_groups sg 
        WHERE sg.student_id = sd.student_id 
          AND sg.status = 'active'
        ORDER BY sg.joined_at ASC
        LIMIT 1
      )
      WHERE sd.group_id IS NULL
    `);
    console.log(`✅ ${updateResult.rowCount} ta chegirma yangilandi`);
    
    // 3. Dublikatlarni o'chirish
    const deleteResult = await client.query(`
      DELETE FROM student_discounts sd1
      WHERE EXISTS (
        SELECT 1 FROM student_discounts sd2
        WHERE sd1.student_id = sd2.student_id
          AND sd1.group_id = sd2.group_id
          AND sd1.is_active = sd2.is_active
          AND sd1.is_active = true
          AND sd1.start_month = sd2.start_month
          AND COALESCE(sd1.end_month, '') = COALESCE(sd2.end_month, '')
          AND sd1.id > sd2.id
      )
    `);
    console.log(`✅ ${deleteResult.rowCount} ta dublikat chegirma o'chirildi`);
    
    // 4. UNIQUE constraint qo'shish
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'unique_student_group_discount'
        ) THEN
          ALTER TABLE student_discounts
          ADD CONSTRAINT unique_student_group_discount
          UNIQUE (student_id, group_id, start_month, end_month);
        END IF;
      END $$;
    `);
    console.log('✅ UNIQUE constraint qo\'shildi');
    
    // 4. Index qo'shish
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_student_discounts_group
      ON student_discounts(student_id, group_id, is_active)
    `);
    console.log('✅ Index yaratildi');
    
    // 5. Tekshirish - natijalarni ko'rsatish
    const checkResult = await client.query(`
      SELECT 
        COUNT(*) as total_discounts,
        COUNT(group_id) as with_group_id,
        COUNT(*) FILTER (WHERE group_id IS NULL) as without_group_id
      FROM student_discounts
    `);
    
    console.log('\n📊 Natija:');
    console.log(`  Jami chegirmalar: ${checkResult.rows[0].total_discounts}`);
    console.log(`  group_id bilan: ${checkResult.rows[0].with_group_id}`);
    console.log(`  group_id yo'q: ${checkResult.rows[0].without_group_id}`);
    
    await client.query('COMMIT');
    console.log('\n✅ Migratsiya muvaffaqiyatli bajarildi!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Xatolik:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Skriptni ishga tushirish
if (require.main === module) {
  addGroupIdToDiscounts()
    .then(() => {
      console.log('✅ Tugadi');
      process.exit(0);
    })
    .catch(err => {
      console.error('❌ Xatolik:', err);
      process.exit(1);
    });
}

module.exports = { addGroupIdToDiscounts };
