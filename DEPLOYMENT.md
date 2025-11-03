# Deployment Guide

This app is a full-stack Node + React (Vite) application that serves the built client from the same Express server.

It uses:
- Vite (client) output to `dist/public`
- esbuild for server bundle to `dist/index.js`
- PostgreSQL (Neon/Render/Railway) via `DATABASE_URL`
- Socket.IO for realtime + WebRTC signaling

## Prerequisites
- Provision a Postgres database (Neon, Render, Railway, Supabase, etc.)
- Set `DATABASE_URL` and `SESSION_SECRET`
- Run schema to DB: `npm run db:push` (Drizzle)

## Environment Variables
Copy `.env.example` to `.env` and fill values for local dev. For deployment, set env vars in your platform.

Required:
- `DATABASE_URL` – Postgres connection string (use SSL if required)

Recommended:
- `SESSION_SECRET` – any long random string

Optional:
- `PORT` – your platform will inject; default is `5000`

## Build
```
npm ci
npm run build
```

This produces:
- `dist/public` (client)
- `dist/index.js` (server entry)

## Run locally (production mode)
```
# after build
node dist/index.js
```

## Docker
A production Dockerfile is included.

Build and run locally:
```
docker build -t realtime-chat-app .
docker run --rm -p 5000:5000 \
  -e DATABASE_URL="postgres://user:pass@host:5432/db?sslmode=require" \
  -e SESSION_SECRET="your-secret" \
  realtime-chat-app
```

## Deploy on Render (Docker)
1. Push your repo to GitHub
2. In Render, create a new Web Service from this repo
3. Choose Docker, leave Dockerfile default
4. Set environment variables:
   - `DATABASE_URL`
   - `SESSION_SECRET`
5. Save and Deploy

## Deploy on Railway (Docker)
1. Push your repo to GitHub
2. In Railway, create a New Project → Deploy from Repo
3. It will detect Dockerfile automatically
4. Add environment variables
5. Deploy

## Database Schema (Drizzle)
If your platform supports a build step with services env:
- Add a deploy command or one-time run: `npm run db:push`

Alternatively, run locally with the same `DATABASE_URL` to provision tables once.

## Notes
- The server now respects `PORT` env for PaaS compatibility
- Client and server are served from the same origin, so no extra CORS config is needed in production
- WebSocket (Socket.IO) works on the same origin
