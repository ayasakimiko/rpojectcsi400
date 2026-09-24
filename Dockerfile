FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY server.js ./
COPY services ./services
COPY router ./router
COPY Database ./Database
COPY middleware ./middleware

EXPOSE 4001 4002 4003 4004 4005 4006

CMD ["node", "server.js"]
