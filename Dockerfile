FROM node:20-alpine

WORKDIR /app

# Storis videolarini siqish va poster yaratish uchun
RUN apk add --no-cache ffmpeg

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 3001

CMD ["node", "server.js"]
