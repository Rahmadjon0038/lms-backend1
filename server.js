const express = require('express');
const pool = require('./config/db'); // Baza ulanishini chaqirish
require('dotenv').config();
const { swaggerUi, specs } = require('./config/swagger');
const cors = require('cors')
const app = express();

// Middleware: JSON formatdagi ma'lumotlarni qabul qilish
app.use(express.json());
app.use(cors())
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));
console.log('swagger. => http://localhost:5000/api-docs/')


// Oddiy test yo'nalishi
app.get('/', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW()');
        res.json({ 
            status: "Server ishlayapti", 
            currentTime: result.rows[0].now 
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Baza bilan ulanishda xato!");
    }
});


// Serverni portga ulash
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server ${PORT}-portda ishga tushdi...`);
});