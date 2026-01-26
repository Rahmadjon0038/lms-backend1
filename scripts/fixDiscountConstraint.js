const pool = require('../config/db');

/**
 * student_discounts jadvalida start_month ni NOT NULL qilish
 * Bu ON CONFLICT bilan ishlashi uchun kerak
 */
(async () => {
  try {
    console.log('🔄 student_discounts jadvalini tuzatmoqda...\n');

    // 1. Avval NULL qiymatlarni joriy oyga o'zgartirish
    const currentMonth = new Date().toISOString().slice(0, 7);
    const nullUpdate = await pool.query(`
      UPDATE student_discounts 
      SET start_month = $1 
      WHERE start_month IS NULL
    `, [currentMonth]);
    console.log(`✅ ${nullUpdate.rowCount} ta NULL start_month qiymati "${currentMonth}" ga o'zgartirildi`);

    // 2. start_month ni NOT NULL qilish
    await pool.query(`
      ALTER TABLE student_discounts 
      ALTER COLUMN start_month SET NOT NULL
    `);
    console.log('✅ start_month endi NOT NULL');

    // 3. end_month ham joriy oy bilan to'ldirish
    const endUpdate = await pool.query(`
      UPDATE student_discounts 
      SET end_month = start_month 
      WHERE end_month IS NULL
    `);
    console.log(`✅ ${endUpdate.rowCount} ta NULL end_month qiymati start_month ga o'zgartirildi`);

    console.log('\n✅ Jadval muvaffaqiyatli tuzatildi!');
    console.log('Endi chegirma berish ishlaydi.');
    
    process.exit(0);
  } catch(e) { 
    console.error('❌ Xatolik:', e.message); 
    process.exit(1); 
  }
})();
