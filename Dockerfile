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

# Copy built artifacts and package files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json* ./

# Install production dependencies only
RUN npm ci --only=production --no-audit --no-fund || npm install --only=production --no-audit --no-fund

# Expose port (Render/Railway/Heroku set PORT env var)
EXPOSE 5000

# Start server
CMD ["node", "dist/index.js"]
