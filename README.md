# ChitChat

A real-time chat application built with React, React Native (Expo), NestJS, and WebRTC — supporting messaging, group chats, and audio/video calls across web and mobile.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | NestJS · Prisma · PostgreSQL (Neon) · Socket.io |
| Web Frontend | React · Vite · TypeScript · simple-peer (WebRTC) |
| Mobile | Expo (React Native) · react-native-webrtc |
| Auth | Google OAuth · JWT |
| Storage | Cloudinary |
| Deployment | Render |

---

## Features

- Real-time messaging with delivery and read receipts
- Group chats with admin controls and member management
- Audio and video calls (1-to-1 and group)
- Voice messages
- Image and file sharing
- Typing indicators and online presence
- Google sign-in

---

## Project Structure

```
Chitchat/
├── backend/        # NestJS API + Socket.io gateway
├── frontend/       # React web app (Vite)
├── mobile/         # Expo React Native app
└── packages/       # Shared packages
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database (or Neon connection string)
- Expo CLI (`npm install -g expo-cli`)
- Android Studio (for Android emulator) / Xcode (for iOS)

### Backend

```bash
cd backend
npm install
cp .env.example .env      # fill in DATABASE_URL, JWT_SECRET, etc.
npx prisma migrate dev
npm run start:dev
```

### Web Frontend

```bash
cd frontend
npm install
npm run dev
```

### Mobile

```bash
cd mobile
npm install
npm run android     # build and run on Android emulator / device
npm run ios         # build and run on iOS simulator / device
```

---

## Environment Variables

### Backend (`.env`)

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret for signing JWTs |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret |

### Frontend (`.env`)

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Backend REST API base URL |
| `VITE_SOCKET_URL` | Backend WebSocket URL |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth client ID |

### Mobile

Configured in `mobile/src/api/client.ts` — update the base URL to point to your backend.

---

## Scripts

### Backend

| Command | Description |
|---------|-------------|
| `npm run start:dev` | Start with hot reload |
| `npm run start:prod` | Start production build |
| `npm run build` | Compile TypeScript |

### Web Frontend

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |

### Mobile

| Command | Description |
|---------|-------------|
| `npm start` | Start Metro bundler |
| `npm run android` | Build and run on Android |
| `npm run ios` | Build and run on iOS |

---

## Deployment

The app is deployed on [Render](https://render.com). Configuration is in `render.yaml`.

- **Frontend**: deployed as a static site with SPA rewrite rules
- **Backend**: deployed as a web service

---

## License

MIT
