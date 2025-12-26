const express = require('express');
const pool = require('./config/db'); // Baza ulanishini chaqirish
require('dotenv').config();
const { swaggerUi, specs } = require('./config/swagger');
const cors = require('cors');
const { createUserTable } = require('./models/userModel'); // Jadval yaratish funksiyasini chaqirish

const app = express();

// Middleware: JSON formatdagi ma'lumotlarni qabul qilish
app.use(express.json());
app.use(cors());
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

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

const userRoute = require('./routes/userRoutes');
const groupRoute = require('./routes/groupRoutes');
const { createGroupTables } = require('./models/groupModel');

// Middleware-lar ostidan qo'shing
app.use('/api/users', userRoute);


app.use('/api/groups',groupRoute );




// Serverni portga ulash va jadvalni yaratish
const PORT = process.env.PORT || 5000;

app.listen(PORT, async () => {
    console.log(`Server ${PORT}-portda ishga tushdi...`);
    console.log(`Swagger: http://localhost:${PORT}/api-docs/`);
    
    // Server yonganda jadvalni tekshirish va yaratish
    try {
        await createUserTable();
        await createGroupTables();
    } catch (error) {
        console.error("Dastlabki sozlashda xatolik:", error);
    }
});