# syntax=docker/dockerfile:1
FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY backend/package.json backend/package-lock.json ./backend/
COPY frontend/package.json frontend/package-lock.json ./frontend/

RUN npm ci --prefix backend && npm ci --prefix frontend

COPY . .

RUN npm run db:generate --prefix backend && npm run build --prefix frontend

RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=3005
ENV DATABASE_URL=file:/app/data/ujo_os_v2.db

EXPOSE 3005

CMD ["npm", "start", "--prefix", "backend"]
