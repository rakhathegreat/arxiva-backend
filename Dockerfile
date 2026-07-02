FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000

COPY package*.json ./
RUN npm install --omit=dev

COPY prisma ./prisma
COPY src ./src
COPY app.js ./
COPY .env ./

RUN npx prisma generate

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && node prisma/seeder.js && npm start"]
