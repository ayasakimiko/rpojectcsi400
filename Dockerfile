FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY server.js ./
COPY router ./router
COPY Database ./Database
COPY middleware ./middleware

EXPOSE 4000

CMD ["sh", "-c", "node Database/connection.js && node server.js"]
