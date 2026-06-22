const bcrypt = require('bcryptjs');
const pool = require('../config/db');

const DEFAULT_PASSWORD = '123456';

async function main() {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, salt);

    const result = await pool.query(
        `UPDATE users
         SET password = $1,
             password_plain = $2,
             password_reset_key_plain = NULL,
             password_reset_key_hash = NULL,
             password_reset_key_rotated_at = NULL
         WHERE role = 'student'
         RETURNING id`
        ,
        [hashedPassword, DEFAULT_PASSWORD]
    );

    console.log(`Updated ${result.rowCount} student passwords to ${DEFAULT_PASSWORD}`);
}

main()
    .catch((err) => {
        console.error('Failed to reset student passwords:', err);
        process.exitCode = 1;
    })
    .finally(async () => {
        try {
            await pool.end();
        } catch (_err) {
            // ignore shutdown errors
        }
    });
