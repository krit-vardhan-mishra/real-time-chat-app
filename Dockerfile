# Multi-stage Dockerfile for real-time-chat-app
# 1) Builder: install deps and build client + server bundle
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

# Copy source
COPY . .

# Build
RUN npm run build

# 2) Runner: minimal runtime image
FROM node:20-alpine AS runner

ENV NODE_ENV=production
WORKDIR /app

# Copy only what's needed to run
COPY --from=builder /app/dist ./dist
COPY package.json ./package.json

# Install production deps only
RUN npm i --omit=dev --no-audit --no-fund

# Expose port (Render/Railway/Heroku set PORT env var)
EXPOSE 5000

# Start server
CMD ["node", "dist/index.js"]
