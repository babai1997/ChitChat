# ChitChat Backend API

![NestJS](https://img.shields.io/badge/nestjs-%23E0234E.svg?style=for-the-badge&logo=nestjs&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/postgresql-%23316192.svg?style=for-the-badge&logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-3982CE?style=for-the-badge&logo=Prisma&logoColor=white)
![Socket.io](https://img.shields.io/badge/Socket.io-black?style=for-the-badge&logo=socket.io&badgeColor=010101)

The robust backend server for the ChitChat application, powering real-time messaging, video/voice calls, and user management. Built with **NestJS**, **Prisma**, and **Socket.IO**.

## 🚀 Features

- **Authentication**: Secure JWT-based auth with Google OAuth and Email OTP support.
- **Real-time Messaging**: Instant message delivery using Socket.IO.
- **Video & Voice Calls**: WebRTC signaling server for peer-to-peer connections.
- **Media Management**: Secure image/file uploads via Cloudinary.
- **Group Chats**: Full support for creating and managing group conversations.
- **Presence System**: Real-time online/offline status tracking.

## 🛠 Tech Stack

- **Framework**: [NestJS](https://nestjs.com/)
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Real-time**: Socket.IO
- **Validation**: class-validator, class-transformer
- **Storage**: Cloudinary

## ⚙️ Environment Variables

Create a `.env` file in the root directory:

```env
# App
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173

# Database
DATABASE_URL="postgresql://user:password@localhost:5432/chitchat?schema=public"

# Authentication
JWT_SECRET="your-super-secret-key"
JWT_EXPIRATION="7d"

# Cloudinary (File Uploads)
CLOUDINARY_CLOUD_NAME="your-cloud-name"
CLOUDINARY_API_KEY="your-api-key"
CLOUDINARY_API_SECRET="your-api-secret"

# Google OAuth (Optional)
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
GOOGLE_CALLBACK_URL="http://localhost:3000/api/auth/google/callback"
```

## 🏃‍♂️ Getting Started

### Prerequisites

- Node.js (v18+)
- PostgreSQL (Local or Docker)

### Installation

1.  Clone the repository:

    ```bash
    git clone https://github.com/your-username/chitchat.git
    cd chitchat/backend
    ```

2.  Install dependencies:

    ```bash
    npm install
    ```

3.  Set up the database:

    ```bash
    # Push schema to DB
    npx prisma db push

    # (Optional) Open Prisma Studio to view data
    npx prisma studio
    ```

4.  Run the server:

    ```bash
    # Development
    npm run start:dev

    # Production
    npm run build
    npm run start:prod
    ```

## 📡 API Documentation

The WebSocket gateway runs at `/chat`.
REST API endpoints are prefixed with `/api`.

- **Auth**: `/api/auth/*`
- **Users**: `/api/users/*`
- **Chats**: `/api/chats/*`
- **Messages**: `/api/chats/:chatId/messages`

## 📦 Deployment

This project is ready for deployment on platforms like **Render**, **Railway**, or **Heroku**.
Ensure you set all environment variables in your cloud provider dashboard.

---

Made with ❤️ by Sudipta Pramanik
