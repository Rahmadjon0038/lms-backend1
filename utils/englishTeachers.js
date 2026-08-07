// Teacher "English o'qituvchisi" hisoblanadi agar:
//  - teacher_subjects jadvalida unga English fani biriktirilgan bo'lsa, YOKI
//  - hozir kamida bitta English guruhi bo'lsa (groups.teacher_id)
// Bu ikkalasining birlashmasi — English manager ko'radigan barcha ro'yxat/hisoblarda
// (teachers-lateness, dashboard, statistika) bir xil son chiqishi uchun shu yagona
// ta'rifdan foydalaniladi.
const getEnglishTeacherClause = (userAlias = 'u') => `
  AND (
    EXISTS (
      SELECT 1
      FROM teacher_subjects ts
      JOIN subjects s ON s.id = ts.subject_id AND s.branch_id = ts.branch_id
      WHERE ts.teacher_id = ${userAlias}.id
        AND ts.branch_id = ${userAlias}.branch_id
        AND (
          LOWER(COALESCE(s.name, '')) LIKE '%english%'
          OR LOWER(COALESCE(s.name, '')) LIKE '%ingliz%'
        )
    )
    OR EXISTS (
      SELECT 1
      FROM groups g
      JOIN subjects gs ON gs.id = g.subject_id AND gs.branch_id = g.branch_id
      WHERE g.teacher_id = ${userAlias}.id
        AND g.branch_id = ${userAlias}.branch_id
        AND (
          LOWER(COALESCE(gs.name, '')) LIKE '%english%'
          OR LOWER(COALESCE(gs.name, '')) LIKE '%ingliz%'
        )
    )
  )
`;

module.exports = { getEnglishTeacherClause };
