// Swagger muammosini chetlab o'tish uchun oddiy server
const express = require('express');
const cors = require('cors');
const { pool } = require('./config/db');

const app = express();

app.use(cors());
app.use(express.json());

// Test uchun payment controller import
const { getMonthlyPayments } = require('./controllers/paymentController');
const { loginStudent } = require('./controllers/userController');

// Login endpoint
app.post('/api/users/login', loginStudent);

// Payment endpoint
app.get('/api/payments/monthly-payments', async (req, res) => {
    // Mock middleware
    req.user = { role: 'admin', id: 1, name: 'Admin' };
    
    await getMonthlyPayments(req, res);
});

const PORT = 5002;

app.listen(PORT, () => {
    console.log(`Test server ${PORT}-portda ishlamoqda...`);
});