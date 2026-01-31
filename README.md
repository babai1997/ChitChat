# ChitChat 💬

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![React](https://img.shields.io/badge/frontend-React-61DAFB?logo=react)
![NestJS](https://img.shields.io/badge/backend-NestJS-E0234E?logo=nestjs)
![Socket.io](https://img.shields.io/badge/realtime-Socket.io-010101?logo=socket.io)
![WebRTC](https://img.shields.io/badge/calls-WebRTC-333333?logo=webrtc)

**ChitChat** is a modern, full-featured messaging application built for seamless communication. It combines real-time text messaging with high-quality voice and video calls, packaged in a sleek, responsive interface.

---

## 🚀 Features

### 💬 Real-time Messaging

- **Instant delivery** powered by Socket.IO.
- **Typing indicators** and **Read receipts**.
- **Group chats** with admin controls.
- **Rich media support** (Images, Files).

### 📞 Voice & Video Calls

- **Crystal clear audio/video** using WebRTC (Simple-Peer).
- **Peer-to-Peer** connection for privacy and low latency.
- **Interactive UI** with mute, camera toggle, and picture-in-picture.

### 🔐 Secure & robust

- **JWT Authentication** with Google OAuth integration.
- **PostgreSQL** database with prisma ORM for data integrity.
- **Cloudinary** integration for secure file storage.

---

## 🛠️ Tech Stack

### Frontend

- **React 18** + **Vite** (Blazing fast build tool)
- **TypeScript** (Type safety)
- **TailwindCSS** (Modern styling)
- **Zustand** (State management)
- **React Query** (Server state)

### Backend

- **NestJS** (Progressive Node.js framework)
- **Prisma** (Next-generation ORM)
- **PostgreSQL** (Relational Database)
- **Socket.IO** (Real-time event-based communication)

---

## 🏃‍♂️ Getting Started

### Prerequisites

- Node.js (v18 or higher)
- PostgreSQL installed locally or via Docker.

### 1. Clone the repository

```bash
git clone https://github.com/babai1997/ChitChat.git
cd ChitChat
```

### 2. Setup Backend

```bash
cd backend
npm install

# Create .env file and configure your DB credentials
cp .env.example .env

# Push schema to database
npx prisma db push

# Start server
npm run start:dev
```

### 3. Setup Frontend

```bash
cd ../frontend
npm install

# Start development server
npm run dev
```

The app should now be running at `http://localhost:5173`! 🚀

---

## 🤝 Contributing

Contributions are what make the open-source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

---

Made with ❤️ by [Babai](https://github.com/babai1997)
