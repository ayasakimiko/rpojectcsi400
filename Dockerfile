FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY server.js ./
COPY src/config/serviceRoutes.js ./src/config/serviceRoutes.js
COPY src/utils/roomAmenities.js ./src/utils/roomAmenities.js
COPY src/utils/validators.js ./src/utils/validators.js
COPY src/utils/maintenanceCategories.js ./src/utils/maintenanceCategories.js
COPY src/utils/rentalContract.js ./src/utils/rentalContract.js
COPY services ./services
COPY router ./router
COPY Database ./Database
COPY middleware ./middleware

EXPOSE 4001 4002 4003 4004 4005 4006 4007 4008 4009 4010

CMD ["node", "server.js"]
