# syntax=docker/dockerfile:1
FROM node:22-alpine

WORKDIR /app

# System dependencies for SQLite and canvas/build tools
RUN apk add --no-cache python3 make g++ 

COPY package*.json ./

RUN npm ci

COPY . .

# Build the frontend and backend 
# React/Vite builds to dist/
RUN npm run build

RUN mkdir -p /app/data && chown -R node:node /app

# By default, use production environment
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1

CMD ["npm", "start"]
