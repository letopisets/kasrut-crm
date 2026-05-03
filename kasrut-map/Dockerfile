# syntax=docker/dockerfile:1

FROM node:22-alpine AS build

WORKDIR /app/kasrut-map

COPY kasrut-map/package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

COPY kasrut-map/ ./

ARG VITE_API_URL=/api
ARG VITE_APPLE_REDIRECT_URI=/
ARG VITE_SENTRY_DSN=
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_APPLE_REDIRECT_URI=$VITE_APPLE_REDIRECT_URI
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN
RUN npm run build

FROM nginx:1.27-alpine

COPY docker/nginx/spa.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/kasrut-map/dist /usr/share/nginx/html

EXPOSE 80
