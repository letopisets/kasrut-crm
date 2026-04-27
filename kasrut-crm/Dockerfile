# syntax=docker/dockerfile:1

FROM node:22-alpine AS build

WORKDIR /app/kasrut-crm

COPY kasrut-crm/package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

COPY kasrut-crm/ ./

ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
RUN npx vite build

FROM nginx:1.27-alpine

COPY docker/nginx/spa.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/kasrut-crm/dist /usr/share/nginx/html

EXPOSE 80
