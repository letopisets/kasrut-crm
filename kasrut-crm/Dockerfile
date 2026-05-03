# syntax=docker/dockerfile:1

FROM node:22-alpine AS build

WORKDIR /app/kasrut-crm

COPY kasrut-crm/package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

COPY kasrut-crm/ ./
COPY packages/shared ../packages/shared

ARG VITE_API_URL=/api
ARG VITE_SENTRY_DSN=
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN
RUN npx vite build

FROM nginx:1.27-alpine

COPY docker/nginx/spa.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/kasrut-crm/dist /usr/share/nginx/html

EXPOSE 80
