const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'LMS API Documentation',
      version: '1.0.0',
      description: 'LMS loyihasi uchun backend API hujjatlari',
    },
    servers: [
      {
        url: 'http://localhost:5000',
        description: 'Local server',
      },
    ],
  },
  // API yo'llari qayerda yozilganini ko'rsatamiz
  apis: ['./routers/*.js', './server.js'], 
};

const specs = swaggerJsdoc(options);

module.exports = { swaggerUi, specs };