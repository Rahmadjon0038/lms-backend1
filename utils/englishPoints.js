const pool = require('../config/db');

const normalizeMonthKey = (value) => {
  const text = String(value || '').trim();
  if (!text) return '';
  const monthMatch = text.match(/^(\d{4})-(\d{2})$/);
  if (monthMatch) {
    return `${monthMatch[1]}-${monthMatch[2]}`;
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return '';
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
};

const buildMonthFilter = (month) => normalizeMonthKey(month) || new Date().toISOString().slice(0, 7);

const loadMonthlyGroupMemberStats = async ({ groupIds = [], month }) => {
  const normalizedGroupIds = [...new Set(
    (Array.isArray(groupIds) ? groupIds : [groupIds])
      .map((id) => Number.parseInt(id, 10))
      .filter((id) => Number.isInteger(id) && id > 0)
  )];

  if (normalizedGroupIds.length === 0) {
    return [];
  }

  const reportMonth = buildMonthFilter(month);

  const result = await pool.query(
    `
      WITH target_groups AS (
        SELECT UNNEST($1::int[]) AS group_id
      ),
      memberships AS (
        SELECT DISTINCT
          sg.group_id,
          sg.student_id,
          LOWER(COALESCE(s.name, '')) AS subject_name,
          g.name AS group_name
        FROM student_groups sg
        JOIN groups g ON g.id = sg.group_id
        JOIN subjects s ON s.id = g.subject_id
        JOIN target_groups tg ON tg.group_id = sg.group_id
      ),
      event_day_points AS (
        SELECT
          spe.group_id,
          spe.student_id,
          DATE(spe.created_at AT TIME ZONE 'Asia/Tashkent') AS point_day,
          SUM(spe.points)::int AS day_points
        FROM student_point_events spe
        JOIN memberships m
          ON m.group_id = spe.group_id
         AND m.student_id = spe.student_id
        WHERE LOWER(m.subject_name) <> 'english'
          AND spe.month_name = $2
        GROUP BY spe.group_id, spe.student_id, DATE(spe.created_at AT TIME ZONE 'Asia/Tashkent')
      ),
      event_ranked AS (
        SELECT
          group_id,
          student_id,
          point_day,
          day_points,
          SUM(day_points) OVER (PARTITION BY group_id, student_id) AS month_points,
          MAX(point_day) OVER (PARTITION BY group_id, student_id) AS last_point_day,
          ROW_NUMBER() OVER (PARTITION BY group_id, student_id ORDER BY point_day DESC) AS day_order
        FROM event_day_points
      ),
      event_points AS (
        SELECT
          group_id,
          student_id,
          MAX(month_points)::int AS month_points,
          MAX(last_point_day) AS last_point_day,
          SUM(CASE WHEN day_order = 1 THEN day_points ELSE 0 END)::int AS last_day_points
        FROM event_ranked
        GROUP BY group_id, student_id
      ),
      report_day_points AS (
        SELECT
          r.group_id,
          m.student_id,
          r.lesson_date::date AS point_day,
          SUM((row->>'total')::int)::int AS day_points
        FROM teacher_lesson_statistics_reports r
        JOIN memberships m
          ON m.group_id = r.group_id
         AND LOWER(m.subject_name) = 'english'
        JOIN LATERAL jsonb_array_elements(COALESCE(r.report_data->'rows', '[]'::jsonb)) row ON TRUE
        WHERE COALESCE(NULLIF(r.report_month, ''), TO_CHAR(r.lesson_date::date, 'YYYY-MM')) = $2
          AND row->>'student_id' = m.student_id::text
        GROUP BY r.group_id, m.student_id, r.lesson_date::date
      ),
      report_ranked AS (
        SELECT
          group_id,
          student_id,
          point_day,
          day_points,
          SUM(day_points) OVER (PARTITION BY group_id, student_id) AS month_points,
          MAX(point_day) OVER (PARTITION BY group_id, student_id) AS last_point_day,
          ROW_NUMBER() OVER (PARTITION BY group_id, student_id ORDER BY point_day DESC) AS day_order
        FROM report_day_points
      ),
      report_points AS (
        SELECT
          group_id,
          student_id,
          MAX(month_points)::int AS month_points,
          MAX(last_point_day) AS last_point_day,
          SUM(CASE WHEN day_order = 1 THEN day_points ELSE 0 END)::int AS last_day_points
        FROM report_ranked
        GROUP BY group_id, student_id
      )
      SELECT
        m.group_id,
        m.student_id,
        CASE
          WHEN LOWER(m.subject_name) = 'english' THEN COALESCE(rp.month_points, 0)
          ELSE COALESCE(ep.month_points, 0)
        END AS month_points,
        CASE
          WHEN LOWER(m.subject_name) = 'english' THEN rp.last_point_day
          ELSE ep.last_point_day
        END AS last_point_day,
        CASE
          WHEN LOWER(m.subject_name) = 'english' THEN COALESCE(rp.last_day_points, 0)
          ELSE COALESCE(ep.last_day_points, 0)
        END AS last_day_points
      FROM memberships m
      LEFT JOIN report_points rp
        ON rp.group_id = m.group_id
       AND rp.student_id = m.student_id
      LEFT JOIN event_points ep
        ON ep.group_id = m.group_id
       AND ep.student_id = m.student_id
    `,
    [normalizedGroupIds, reportMonth]
  );

  return result.rows.map((row) => ({
    group_id: Number.parseInt(row.group_id, 10),
    student_id: Number.parseInt(row.student_id, 10),
    month_points: Number.parseInt(row.month_points, 10) || 0,
    last_point_day: row.last_point_day || null,
    last_day_points: Number.parseInt(row.last_day_points, 10) || 0,
  }));
};

const loadStudentPointHistoryEntries = async ({ studentId, month, groupId = null }) => {
  const normalizedStudentId = Number.parseInt(studentId, 10);
  const normalizedGroupId = groupId == null ? null : Number.parseInt(groupId, 10);
  if (!Number.isInteger(normalizedStudentId) || normalizedStudentId <= 0) {
    return [];
  }
  if (normalizedGroupId !== null && (!Number.isInteger(normalizedGroupId) || normalizedGroupId <= 0)) {
    return [];
  }

  const isAllTime = String(month || '').trim().toLowerCase() === 'all';
  const monthKey = isAllTime ? null : buildMonthFilter(month);

  const params = [normalizedStudentId];
  const filters = ['m.student_id = $1'];
  if (normalizedGroupId !== null) {
    params.push(normalizedGroupId);
    filters.push(`m.group_id = $${params.length}`);
  }
  const membershipFilter = filters.join(' AND ');

  if (monthKey) {
    params.push(monthKey);
  }

  const monthParamIndex = monthKey ? params.length : null;

  const result = await pool.query(
    `
      WITH memberships AS (
        SELECT
          DISTINCT
          sg.group_id,
          sg.student_id,
          LOWER(COALESCE(s.name, '')) AS subject_name,
          g.name AS group_name
        FROM student_groups sg
        JOIN groups g ON g.id = sg.group_id
        JOIN subjects s ON s.id = g.subject_id
        WHERE ${membershipFilter}
      ),
      event_entries AS (
        SELECT
          spe.id::text AS entry_id,
          spe.student_id,
          spe.group_id,
          COALESCE(m.group_name, g.name, spe.metadata->>'group_name', '') AS group_name,
          spe.lesson_id,
          spe.month_name,
          spe.points,
          spe.source_type,
          spe.title,
          spe.description,
          spe.metadata,
          spe.created_by,
          COALESCE(NULLIF(TRIM(cb.name || ' ' || cb.surname), ''), spe.metadata->>'created_by_name', '') AS created_by_name,
          spe.created_at AT TIME ZONE 'Asia/Tashkent' AS created_at_local,
          TO_CHAR(spe.created_at AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD HH24:MI') AS created_at,
          TO_CHAR(DATE(spe.created_at AT TIME ZONE 'Asia/Tashkent'), 'YYYY-MM-DD') AS day_key,
          TO_CHAR(spe.created_at AT TIME ZONE 'Asia/Tashkent', 'HH24:MI') AS created_time
        FROM student_point_events spe
        JOIN memberships m
          ON m.group_id = spe.group_id
         AND m.student_id = spe.student_id
        LEFT JOIN groups g ON g.id = spe.group_id
        LEFT JOIN users cb ON cb.id = spe.created_by
        WHERE LOWER(m.subject_name) <> 'english'
          AND spe.student_id = $1
          ${monthKey ? `AND spe.month_name = $${monthParamIndex}` : ''}
      ),
      report_entries AS (
        SELECT
          r.id::text AS entry_id,
          m.student_id,
          r.group_id,
          COALESCE(m.group_name, g.name, r.report_data->>'group_name', '') AS group_name,
          r.lesson_id,
          r.report_month AS month_name,
          COALESCE((row->>'total')::int, 0) AS points,
          'report'::text AS source_type,
          COALESCE(r.report_data->>'lesson_label', r.report_data->>'group_name', 'Dars statistikasi') AS title,
          CONCAT(
            'HW ', COALESCE(row->>'homework', '0'),
            ' VOC ', COALESCE(row->>'vocabulary', '0'),
            ' ATT ', COALESCE(row->>'attendance', '0'),
            ' PART ', COALESCE(row->>'participation', '0')
          ) AS description,
          jsonb_build_object(
            'homework', row->>'homework',
            'vocabulary', row->>'vocabulary',
            'attendance', row->>'attendance',
            'participation', row->>'participation',
            'total', row->>'total',
            'percent', row->>'percent',
            'feedback', row->>'feedback'
          ) AS metadata,
          r.created_by,
          COALESCE(NULLIF(TRIM(cb.name || ' ' || cb.surname), ''), r.report_data->>'created_by_name', '') AS created_by_name,
          r.created_at AT TIME ZONE 'Asia/Tashkent' AS created_at_local,
          TO_CHAR(r.created_at AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD HH24:MI') AS created_at,
          TO_CHAR(DATE(r.created_at AT TIME ZONE 'Asia/Tashkent'), 'YYYY-MM-DD') AS day_key,
          TO_CHAR(r.created_at AT TIME ZONE 'Asia/Tashkent', 'HH24:MI') AS created_time
        FROM teacher_lesson_statistics_reports r
        JOIN memberships m
          ON m.group_id = r.group_id
         AND LOWER(m.subject_name) = 'english'
        JOIN LATERAL jsonb_array_elements(COALESCE(r.report_data->'rows', '[]'::jsonb)) row ON TRUE
        LEFT JOIN groups g ON g.id = r.group_id
        LEFT JOIN users cb ON cb.id = r.created_by
        WHERE m.student_id = $1
          AND row->>'student_id' = m.student_id::text
          ${monthKey ? `AND COALESCE(NULLIF(r.report_month, ''), TO_CHAR(r.lesson_date::date, 'YYYY-MM')) = $${monthParamIndex}` : ''}
      )
      SELECT * FROM event_entries
      UNION ALL
      SELECT * FROM report_entries
      ORDER BY created_at_local DESC, entry_id DESC
    `,
    params
  );

  return result.rows.map((row) => ({
    id: Number.parseInt(row.entry_id, 10) || row.entry_id,
    student_id: Number.parseInt(row.student_id, 10),
    group_id: Number.parseInt(row.group_id, 10),
    group_name: row.group_name || '',
    lesson_id: row.lesson_id == null ? null : Number.parseInt(row.lesson_id, 10),
    month_name: row.month_name || '',
    points: Number.parseInt(row.points, 10) || 0,
    source_type: row.source_type || '',
    title: row.title || '',
    description: row.description || '',
    metadata: row.metadata || {},
    created_by: row.created_by == null ? null : Number.parseInt(row.created_by, 10),
    created_by_name: row.created_by_name || '',
    created_at: row.created_at || '',
    day_key: row.day_key || '',
    created_time: row.created_time || '',
  }));
};

module.exports = {
  loadMonthlyGroupMemberStats,
  loadStudentPointHistoryEntries,
};
