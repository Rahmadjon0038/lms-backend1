const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'LMS API Documentation',
      version: '2.0.0',
      description: 'LMS loyihasi uchun backend API hujjatlari - To\'lovlar tizimi va student boshqaruv',
    },
    tags: [
      { name: 'Users', description: 'Foydalanuvchilar registratsiya va login' },
      { name: 'Groups', description: 'Guruhlarni boshqarish' },
      { name: 'Students', description: 'Studentlarni boshqarish' },
      { name: 'Payments', description: 'To\'lovlar tizimi - oylik to\'lovlar, hisobotlar' }
    ],
    servers: [
      {
        url: 'http://localhost:5001',
        description: 'Local server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token kiriting',
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  // API yo'llari qayerda yozilganini ko'rsatamiz
  apis: ['./routes/*.js', './server.js'], 
};

const specs = swaggerJsdoc(options);

module.exports = { swaggerUi, specs };