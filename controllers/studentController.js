// 2. Mavjud userni student qilish va guruhga biriktirish
exports.makeUserStudent = async (req, res) => {
  const { user_id, group_id } = req.body;
  if (!user_id) return res.status(400).json({ message: "user_id majburiy" });
  try {
    // 1. Guruh ma'lumotlarini olish (price, teacher_id)
    let groupInfo = null;
    if (group_id) {
      const groupRes = await pool.query("SELECT price, teacher_id FROM groups WHERE id = $1", [group_id]);
      if (groupRes.rows.length === 0) return res.status(404).json({ message: "Guruh topilmadi" });
      groupInfo = groupRes.rows[0];
    }
    // 2. Userni student qilish (role, required_amount, teacher_id yangilash)
    if (groupInfo) {
      await pool.query(
        "UPDATE users SET role = 'student', required_amount = $2, teacher_id = $3 WHERE id = $1",
        [user_id, groupInfo.price, groupInfo.teacher_id]
      );
    } else {
      await pool.query(
        "UPDATE users SET role = 'student' WHERE id = $1",
        [user_id]
      );
    }
    // 3. Guruhga biriktirish (agar group_id berilgan bo'lsa)
    let groupResult = null;
    if (group_id) {
      // Student_groups jadvalida borligini tekshirish
      const exists = await pool.query(
        "SELECT 1 FROM student_groups WHERE student_id = $1 AND group_id = $2",
        [user_id, group_id]
      );
      if (exists.rows.length === 0) {
        groupResult = await pool.query(
          "INSERT INTO student_groups (student_id, group_id, status) VALUES ($1, $2, 'active') RETURNING *",
          [user_id, group_id]
        );
      }
    }
    res.json({ success: true, message: "User student qilindi", group: groupResult ? groupResult.rows[0] : null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
const pool = require('../config/db');

// 1. Yangi studentni user sifatida yaratish va guruhga biriktirish
exports.createStudent = async (req, res) => {
  const { name, surname, username, password, phone, group_id } = req.body;
  
  try {
    // Avval User jadvaliga student sifatida qo'shamiz
    const userRes = await pool.query(
      "INSERT INTO users (name, surname, username, password, role, phone) VALUES ($1, $2, $3, $4, 'student', $5) RETURNING id",
      [name, surname, username, password, phone]
    );
    const studentId = userRes.rows[0].id;

    // Agar guruh ID berilgan bo'lsa, student_groups jadvaliga bog'laymiz
    if (group_id) {
      await pool.query(
        "INSERT INTO student_groups (student_id, group_id, status) VALUES ($1, $2, 'active')",
        [studentId, group_id]
      );
    }

    res.status(201).json({ message: "Student muvaffaqiyatli yaratildi", studentId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// 3. Studentlarni oy, teacher, group bo'yicha filter qilish
exports.getAllStudents = async (req, res) => {
  const { month, teacher_id, group_id } = req.query;
  const currentYear = new Date().getFullYear();
  let filters = [];
  let params = [];
  let joinPayments = '';
  let paymentMonthFilter = '';
  let paramIdx = 1;

  // Teacher filter
  if (teacher_id) {
    filters.push(`g.teacher_id = $${paramIdx++}`);
    params.push(teacher_id);
  }
  // Group filter
  if (group_id) {
    filters.push(`g.id = $${paramIdx++}`);
    params.push(group_id);
  }
  // Month filter (for payments)
  if (month && month !== 'all') {
    joinPayments = 'LEFT JOIN payments p ON u.id = p.student_id AND p.group_id = g.id';
    paymentMonthFilter = `AND EXTRACT(MONTH FROM p.created_at) = $${paramIdx++} AND EXTRACT(YEAR FROM p.created_at) = $${paramIdx++}`;
    params.push(month, currentYear);
  } else {
    joinPayments = 'LEFT JOIN payments p ON u.id = p.student_id AND p.group_id = g.id';
  }

  const whereClause = filters.length > 0 ? 'AND ' + filters.join(' AND ') : '';

  const queryText = `
    SELECT 
      u.id, u.name, u.surname, u.phone, u.phone2, u.created_at as registration_date,
      g.name as group_name,
      s.name as subject_name,
      s.price as required_amount,
      t.name || ' ' || t.surname as teacher_name,
      COALESCE(SUM(p.amount), 0) as paid_amount
    FROM users u
    LEFT JOIN student_groups sg ON u.id = sg.student_id
    LEFT JOIN groups g ON sg.group_id = g.id
    LEFT JOIN subjects s ON g.subject_id = s.id
    LEFT JOIN users t ON g.teacher_id = t.id
    ${joinPayments}
    WHERE u.role = 'student' ${whereClause} ${paymentMonthFilter}
    GROUP BY u.id, g.name, s.name, s.price, t.name, t.surname, sg.status
    ORDER BY u.created_at DESC;
  `;
  try {
    const result = await pool.query(queryText, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};