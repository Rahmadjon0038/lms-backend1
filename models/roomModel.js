const pool = require('../config/db');

// Xonalar jadvalini yaratish
const createRoomTable = async () => {
  const queryText = `
    CREATE TABLE IF NOT EXISTS rooms (
      id SERIAL PRIMARY KEY,
      room_number VARCHAR(50) UNIQUE NOT NULL,
      capacity INTEGER NOT NULL,
      has_projector BOOLEAN DEFAULT false,
      description TEXT,
      is_available BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  try {
    await pool.query(queryText);
    console.log("✅ 'rooms' jadvali tayyor.");
    
    // Eski jadvallarga yangi ustunlarni qo'shish (agar mavjud bo'lmasa)
    try {
      await pool.query(`
        DO $$ 
        BEGIN 
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='rooms' AND column_name='has_projector') THEN
            ALTER TABLE rooms ADD COLUMN has_projector BOOLEAN DEFAULT false;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='rooms' AND column_name='capacity') THEN
            ALTER TABLE rooms ADD COLUMN capacity INTEGER;
          END IF;
        END $$;
      `);
      console.log("✅ 'rooms' jadvaliga has_projector va capacity ustunlari qo'shildi.");
    } catch (alterErr) {
      console.log("⚠️ Rooms ustunlari qo'shishda xatolik (balki mavjud):", alterErr.message);
    }
  } catch (err) {
    console.error("❌ Rooms jadvalini yaratishda xatolik:", err.message);
  }
};

// Xona qo'shish
const createRoom = async (roomData) => {
  const { room_number, capacity, has_projector, description } = roomData;
  
  const query = `
    INSERT INTO rooms (room_number, capacity, has_projector, description)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `;
  
  const values = [room_number, capacity, has_projector || false, description || null];
  
  const result = await pool.query(query, values);
  return result.rows[0];
};

// Barcha xonalarni olish
const getAllRooms = async (filters = {}) => {
  let query = `SELECT id, room_number, capacity, has_projector, description, is_available, created_at 
               FROM rooms WHERE 1=1`;
  const values = [];
  let paramCount = 1;

  if (filters.is_available !== undefined) {
    query += ` AND is_available = $${paramCount}`;
    values.push(filters.is_available);
    paramCount++;
  }

  if (filters.has_projector !== undefined) {
    query += ` AND has_projector = $${paramCount}`;
    values.push(filters.has_projector);
    paramCount++;
  }

  query += ` ORDER BY CAST(room_number AS INTEGER)`;

  const result = await pool.query(query, values);
  return result.rows;
};

// Bitta xonani ID bo'yicha olish
const getRoomById = async (id) => {
  const result = await pool.query(
    'SELECT id, room_number, capacity, has_projector, description, is_available, created_at FROM rooms WHERE id = $1', 
    [id]
  );
  return result.rows[0];
};

// Xonani room_number bo'yicha olish
const getRoomByNumber = async (room_number) => {
  const result = await pool.query(
    'SELECT id, room_number, capacity, has_projector, description, is_available FROM rooms WHERE room_number = $1', 
    [room_number]
  );
  return result.rows[0];
};

// Xonani yangilash
const updateRoom = async (id, roomData) => {
  const fields = [];
  const values = [];
  let paramCount = 1;

  const allowedFields = ['room_number', 'capacity', 'has_projector', 'description', 'is_available'];
  
  allowedFields.forEach(field => {
    if (roomData[field] !== undefined) {
      fields.push(`${field} = $${paramCount}`);
      values.push(roomData[field]);
      paramCount++;
    }
  });

  if (fields.length === 0) {
    throw new Error("Yangilanishi kerak bo'lgan maydon topilmadi");
  }

  values.push(id);
  const query = `UPDATE rooms SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`;
  
  const result = await pool.query(query, values);
  return result.rows[0];
};

// Xonani o'chirish
const deleteRoom = async (id) => {
  const result = await pool.query('DELETE FROM rooms WHERE id = $1 RETURNING *', [id]);
  return result.rows[0];
};

// Xona schedule bo'yicha band yoki yo'qligini tekshirish
const checkRoomAvailability = async (roomId, schedule, excludeGroupId = null) => {
  if (!roomId || !schedule || !schedule.days || !schedule.time) {
    return { isAvailable: true };
  }

  let query = `
    SELECT g.id, g.name, g.schedule, g.status
    FROM groups g
    WHERE g.room_id = $1
    AND (g.status = 'active' OR g.status = 'draft')
    AND g.schedule IS NOT NULL
  `;

  const params = [roomId];

  if (excludeGroupId) {
    query += ` AND g.id != $2`;
    params.push(excludeGroupId);
  }

  const result = await pool.query(query, params);

  // Vaqt to'qnashuvini tekshirish
  for (const group of result.rows) {
    const groupSchedule = group.schedule;
    
    // Kunlar to'qnashuvini tekshirish
    const hasDayOverlap = schedule.days.some(day => groupSchedule.days.includes(day));
    
    if (hasDayOverlap) {
      // Vaqt to'qnashuvini tekshirish
      if (isTimeOverlap(schedule.time, groupSchedule.time)) {
        return {
          isAvailable: false,
          conflictGroup: {
            id: group.id,
            name: group.name,
            schedule: groupSchedule
          }
        };
      }
    }
  }

  return { isAvailable: true };
};

// Vaqt formatini parse qilish
const parseTimeRange = (timeStr) => {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const parts = timeStr.split('-');
  if (parts.length !== 2) return null;
  return {
    start: parts[0].trim(),
    end: parts[1].trim()
  };
};

// Vaqt to'qnashuvini tekshirish
const isTimeOverlap = (time1, time2) => {
  const t1 = parseTimeRange(time1);
  const t2 = parseTimeRange(time2);
  
  if (!t1 || !t2) return false;
  
  const timeToMinutes = (timeStr) => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  };
  
  const start1 = timeToMinutes(t1.start);
  const end1 = timeToMinutes(t1.end);
  const start2 = timeToMinutes(t2.start);
  const end2 = timeToMinutes(t2.end);
  
  return (start1 < end2 && start2 < end1);
};

module.exports = {
  createRoomTable,
  createRoom,
  getAllRooms,
  getRoomById,
  getRoomByNumber,
  updateRoom,
  deleteRoom,
  checkRoomAvailability
};
