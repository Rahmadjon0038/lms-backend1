const pool = require('./config/db');

// Simplified getMonthlyPayments for debugging
const testMonthlyPayments = async () => {
  const month = '2024-01';
  const role = 'admin';
  
  try {
    // Test CTE with template literals like in paymentController
    const cteQuery = `
      WITH student_discounts_calc AS (
        SELECT 
          sg.student_id,
          sg.group_id,
          g.price as original_price,
          COALESCE(SUM(
            CASE 
              WHEN sd.discount_type = 'percent' THEN (g.price * sd.discount_value / 100)
              WHEN sd.discount_type = 'amount' THEN sd.discount_value
              ELSE 0
            END
          ), 0) as total_discount_amount
        FROM student_groups sg
        JOIN groups g ON sg.group_id = g.id
        LEFT JOIN student_discounts sd ON sg.student_id = sd.student_id AND sg.group_id = sd.group_id 
          AND sd.is_active = true
          AND (sd.start_month IS NULL OR $\${role === 'teacher' ? 2 : 1} >= sd.start_month)
          AND (sd.end_month IS NULL OR $\${role === 'teacher' ? 2 : 1} <= sd.end_month)
        WHERE sg.status IN ('active', 'stopped', 'finished')
          AND g.status = 'active' 
          AND g.class_status = 'started'
        GROUP BY sg.student_id, sg.group_id, g.price
      )
      SELECT * FROM student_discounts_calc LIMIT 5
    `;
    
    console.log('Testing CTE query...');
    const result = await pool.query(cteQuery, [month]);
    console.log('✅ CTE query works');
    console.log('Rows:', result.rows.length);
    console.log('Sample:', result.rows[0]);
    
    process.exit(0);
  } catch (err) {
    console.error('❌ CTE Error:', err.message);
    console.error('Position:', err.position);
    console.error('Code:', err.code);
    process.exit(1);
  }
};

testMonthlyPayments();