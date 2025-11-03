# Real-Time Chat App

> Learning the working of WebSocket, WebRTC, and end-to-end encryption.

This project is a full‑stack playground built to learn and demonstrate:
- Bidirectional realtime messaging with WebSocket (Socket.IO)
- Peer‑to‑peer audio/video calling with WebRTC
- End‑to‑end encryption (E2EE) for messages with NaCl (tweetnacl)

It ships as a cohesive Node + React application: the Express server serves the built Vite client in production, and integrates Vite middleware during development.

---

## ✨ Features

- Realtime 1:1 messaging (Socket.IO)
- WebRTC audio/video calls with signaling over Socket.IO
- End‑to‑end encrypted messages (server stores ciphertext only)
- Authentication with username/password (passport‑local + express‑session)
- PostgreSQL persistence with Drizzle ORM
- GraphQL (Apollo Server) for queries/mutations alongside REST for app APIs
- Responsive UI (React 18, TailwindCSS, shadcn/ui, Radix primitives)
- Mobile‑friendly call UI with a compact dropdown
- Single server in production: static client + API + websockets

---

## 🏗️ Architecture at a Glance

- Client: React + Vite (dev), served as static assets from Express in prod
- Server: Express (TypeScript) + Apollo Server (GraphQL) + Socket.IO
- Database: PostgreSQL (Neon/Render/Railway) via `drizzle-orm`
- Auth: `passport-local` with sessions stored in Postgres
- Encryption: `tweetnacl` (NaCl `box`) on the client; server never decrypts

```text
client/ (Vite) ──► dist/public  ┐
server/ (Express/TS) ───────────┴─► dist/index.js (single runtime)
```

Key files:
- `server/index.ts` — app entry (uses PORT env, serves static in prod)
- `server/routes.ts` — REST endpoints (conversations, messages, users, keys)
- `server/socket.ts` — Socket.IO events (messaging + WebRTC signaling)
- `server/vite.ts` — dev server integration; static serve in prod
- `shared/schema.ts` — Drizzle schema for users/conversations/messages
- `client/src` — React app (chat UI, hooks, WebRTC, encryption helpers)

---

## 🔐 How E2E Encryption Works (High Level)

- Each client holds an identity key pair (NaCl `box.keyPair`).
- The client uploads only its public key to the server (`/api/user/public-key`).
- When sending a message, the client encrypts the plaintext using:
	- Recipient’s public key (fetched/cached as needed)
	- Sender’s secret key
	- A fresh per‑message nonce
- The encrypted payload (ciphertext + nonce + metadata) is serialized and stored as the message `content`.
- The server routes and persists only ciphertext. Decryption happens on the recipient’s device using their secret key.

This keeps message contents inaccessible to the server (E2EE).

---

## 📡 WebSocket & WebRTC Signaling

Socket.IO rooms are used for both conversations and per‑user routing.

Selected events:
- Auth / Presence: `authenticate`, `user_online`, `user_offline`, `online_users`
- Messaging: `join_conversation`, `leave_conversation`, `send_message`, `mark_as_read`, `typing`
- WebRTC signaling: `call_user` (offer), `answer_call` (answer), `reject_call`, `ice_candidate`, `end_call`

The server only relays signaling messages; the actual media flows peer‑to‑peer.

---

## 🧰 Tech Stack

- Frontend: React 18, Vite, TailwindCSS, shadcn/ui, Radix UI, lucide‑react
- Backend: Express, Apollo Server, Socket.IO, passport, express‑session
- Data: PostgreSQL, Drizzle ORM
- Crypto: tweetnacl, tweetnacl‑util
- Tooling: TypeScript, esbuild, tsx, drizzle‑kit

---

## 🚀 Getting Started

### 1) Prerequisites
- Node.js 20+
- A PostgreSQL connection string (Neon/Render/Railway/etc.)

### 2) Install & Configure

```powershell
# from repository root
npm ci
Copy-Item .env.example .env
# Edit .env and set DATABASE_URL and SESSION_SECRET
```

### 3) Provision the Database (Drizzle)

```powershell
# Uses DATABASE_URL
npm run db:push
```

### 4) Run in Development

```powershell
npm run dev
# Opens the server on http://localhost:5000 with Vite middleware for the client
```

### 5) Build for Production

```powershell
npm run build
# Produces dist/public (client) and dist/index.js (server)
```

### 6) Start in Production Mode (locally)

```powershell
# Windows PowerShell example
$env:NODE_ENV = "production"
node dist/index.js
```

> In production platforms (Render/Railway/Heroku), the `PORT` env is used automatically.

---

## 🐳 Docker

A production Dockerfile is included.

```powershell
# Build image
docker build -t realtime-chat-app .

# Run container
docker run --rm -p 5000:5000 `
	-e DATABASE_URL="postgres://user:pass@host:5432/db?sslmode=require" `
	-e SESSION_SECRET="your-secret" `
	realtime-chat-app
```

---

## 📦 Deployment

See `DEPLOYMENT.md` for step‑by‑step instructions (Docker on Render/Railway, etc.).

---

## 🧭 UI Notes

- Mobile‑first responsive layout (Tailwind)
- Chat header shows truncated names with a mobile call dropdown (audio/video)
- Consistent dark theme across pages/components (shadcn/ui + Radix)

---

## 📁 Project Structure (simplified)

```text
client/
	index.html
	src/
		components/
			chat/
				chat-area.tsx
				components/
					chat-header.tsx
					chat-message-area.tsx
					chat-input.tsx
		hooks/
		lib/
		pages/
server/
	index.ts
	routes.ts
	socket.ts
	vite.ts
shared/
	schema.ts
```

---

## ⚠️ Security Considerations

- Keep `SESSION_SECRET` private and strong.
- Never store or transmit users’ secret keys to the server.
- Use SSL/TLS in production for both API and WebSocket.
- Postgres `DATABASE_URL` should require SSL in hosted environments.

---

## 📝 License

MIT
