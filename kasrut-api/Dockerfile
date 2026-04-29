# syntax=docker/dockerfile:1

# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app/kasrut-api

COPY kasrut-api/package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

COPY kasrut-api/ ./

# prisma generate only reads the schema — placeholder URL is enough
ENV DATABASE_URL="postgresql://x:x@x:5432/x"
RUN npx prisma generate \
 && npm run build \
 && npx tsc -p tsconfig.seed.json

# ── Stage 2: runtime (production deps only) ───────────────────────────────────
FROM node:22-alpine AS runtime

WORKDIR /app/kasrut-api

COPY kasrut-api/package*.json   ./
COPY kasrut-api/prisma          ./prisma
COPY kasrut-api/prisma.config.ts ./

ENV DATABASE_URL="postgresql://x:x@x:5432/x"
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev && npx prisma generate

# Copy compiled application and seed from builder
COPY --from=builder /app/kasrut-api/dist ./dist

COPY docker/api-entrypoint.sh /usr/local/bin/api-entrypoint.sh
RUN chmod +x /usr/local/bin/api-entrypoint.sh

# Run as non-root for container escape mitigation
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN chown -R appuser:appgroup /app/kasrut-api
USER appuser

EXPOSE 3000

ENTRYPOINT ["api-entrypoint.sh"]
CMD ["node", "dist/server.js"]
