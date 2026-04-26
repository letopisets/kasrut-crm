FROM node:22-alpine

WORKDIR /app/kasrut-api

COPY kasrut-api/package*.json ./
RUN npm ci

COPY kasrut-api/ ./

ENV DATABASE_URL="postgresql://postgres:postgres@postgres:5432/kashrutcrm_db?schema=public"
RUN npx prisma generate && npm run build

COPY docker/api-entrypoint.sh /usr/local/bin/api-entrypoint.sh
RUN chmod +x /usr/local/bin/api-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["api-entrypoint.sh"]
CMD ["node", "dist/server.js"]
