const pool = require('../config/db');

/**
 * Attendance jadvalini yangi formatga migratsiya qilish
 * - daily_records JSON to JSONB (object format)
 * - UNIQUE constraint (student_id, month_name) -> (student_id, group_id, month_name)
 */

async function migrateAttendanceTable() {
    const client = await pool.connect();
    
    try {
        console.log('🔄 Attendance jadvali migratsiyasi boshlanmoqda...');
        
        // 1. Eski UNIQUE constraint'ni olib tashlash
        await client.query(`
            DO $$ 
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM pg_constraint 
                    WHERE conname = 'attendance_student_id_month_name_key'
                ) THEN
                    ALTER TABLE attendance DROP CONSTRAINT attendance_student_id_month_name_key;
                    RAISE NOTICE 'Eski UNIQUE constraint olib tashlandi';
                END IF;
            END $$;
        `);
        
        // 2. daily_records ustunini JSONB ga o'zgartirish
        await client.query(`
            DO $$ 
            BEGIN
                ALTER TABLE attendance ALTER COLUMN daily_records TYPE JSONB USING daily_records::jsonb;
                RAISE NOTICE 'daily_records ustuni JSONB formatiga o''zgartirildi';
            END $$;
        `);
        
        // 3. Yangi UNIQUE constraint qo'shish
        await client.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint 
                    WHERE conname = 'attendance_student_id_group_id_month_name_key'
                ) THEN
                    ALTER TABLE attendance ADD CONSTRAINT attendance_student_id_group_id_month_name_key 
                    UNIQUE (student_id, group_id, month_name);
                    RAISE NOTICE 'Yangi UNIQUE constraint qo''shildi';
                END IF;
            END $$;
        `);
        
        // 4. Eski array formatdagi daily_records'ni yangi object formatiga o'zgartirish
        const oldRecords = await client.query(`
            SELECT id, daily_records, month_name 
            FROM attendance 
            WHERE jsonb_typeof(daily_records) = 'array'
        `);
        
        console.log(`📊 ${oldRecords.rows.length} ta eski format davomat topildi`);
        
        for (let record of oldRecords.rows) {
            const dailyArray = record.daily_records;
            const monthName = record.month_name;
            
            // Array'ni object'ga o'zgartirish
            const dailyObject = {};
            const [year, month] = monthName.split('-').map(Number);
            const daysInMonth = new Date(year, month, 0).getDate();
            
            for (let day = 1; day <= daysInMonth && day <= dailyArray.length; day++) {
                const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const value = dailyArray[day - 1];
                dailyObject[dateStr] = value === 1 ? 1 : value === 0 ? 0 : null;
            }
            
            await client.query(
                'UPDATE attendance SET daily_records = $1 WHERE id = $2',
                [JSON.stringify(dailyObject), record.id]
            );
        }
        
        console.log('✅ Davomat jadvali muvaffaqiyatli yangilandi!');
        console.log('✅ daily_records endi object formatida: {"2026-01-15": 1, "2026-01-17": 0}');
        
        // 5. Trigger funksiyasini qayta yaratish (JSONB object format uchun)
        await client.query(`
            CREATE OR REPLACE FUNCTION update_attendance_percentage()
            RETURNS TRIGGER AS $$
            BEGIN
              -- Daily records dan attended_classes ni hisoblash
              -- daily_records is JSONB object like {"2024-01-01": 1, "2024-01-02": 0}
              IF NEW.daily_records IS NOT NULL THEN
                SELECT COUNT(*) INTO NEW.attended_classes 
                FROM jsonb_each(NEW.daily_records) AS record
                WHERE record.value::TEXT::INTEGER = 1;
              ELSE
                NEW.attended_classes = 0;
              END IF;
              
              -- Total classes dan percentage hisoblash
              IF NEW.total_classes > 0 THEN
                NEW.attendance_percentage = (NEW.attended_classes::DECIMAL / NEW.total_classes) * 100;
              ELSE
                NEW.attendance_percentage = 0;
              END IF;
              
              NEW.updated_at = CURRENT_TIMESTAMP;
              RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `);
        
        console.log('✅ Attendance trigger funksiyasi yangilandi (JSONB object formatiga mos)');
        
    } catch (err) {
        console.error('❌ Migratsiya xatoligi:', err.message);
        throw err;
    } finally {
        client.release();
    }
}

// Agar to'g'ridan-to'g'ri ishga tushirilsa
if (require.main === module) {
    migrateAttendanceTable()
        .then(() => {
            console.log('✅ Migration yakunlandi');
            process.exit(0);
        })
        .catch(err => {
            console.error('❌ Migration xatosi:', err);
            process.exit(1);
        });
}

module.exports = { migrateAttendanceTable };
