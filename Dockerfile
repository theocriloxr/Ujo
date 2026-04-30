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

# By default, use production environment
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "start"]
