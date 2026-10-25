FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY server.js ./
COPY src/config/serviceRoutes.js ./src/config/serviceRoutes.js
COPY src/utils/roomAmenities.js ./src/utils/roomAmenities.js
COPY src/utils/marketStatus.js ./src/utils/marketStatus.js
COPY src/utils/marketConfigFields.js ./src/utils/marketConfigFields.js
COPY services ./services
COPY router ./router
COPY Database ./Database
COPY middleware ./middleware

EXPOSE 4001 4002 4003 4004 4005 4006 4007 4008 4009 4010

CMD ["node", "server.js"]
