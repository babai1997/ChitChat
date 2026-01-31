# ChitChat Frontend

![React](https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB)
![Vite](https://img.shields.io/badge/vite-%23646CFF.svg?style=for-the-badge&logo=vite&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/tailwindcss-%2338B2AC.svg?style=for-the-badge&logo=tailwind-css&logoColor=white)
![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)

The modern, responsive web client for ChitChat. Features a WhatsApp-like interface with support for rich messaging, media sharing, and high-quality voice/video calls.

## ✨ Features

- **Real-time Chat**: Zero-latency messaging with read receipts and typing indicators.
- **Voice & Video Calls**: Integrated WebRTC calling with crystal clear audio/video.
- **Rich Media**: Send images, videos, audio messages, and documents.
- **Group Chats**: Create groups, manage members, and chat with multiple people.
- **Responsive Design**: Fully optimized for desktop, tablet, and mobile devices.
- **Emoji Picker**: Built-in emoji support for expressive conversations.

## 🛠 Tech Stack

- **Core**: [React 18](https://reactjs.org/), [TypeScript](https://www.typescriptlang.org/)
- **Build Tool**: [Vite](https://vitejs.dev/)
- **Styling**: [TailwindCSS](https://tailwindcss.com/)
- **State Management**: [Zustand](https://github.com/pmndrs/zustand)
- **Data Fetching**: [TanStack Query (React Query)](https://tanstack.com/query/latest)
- **Real-time**: [Socket.IO Client](https://socket.io/)
- **WebRTC**: [Simple-Peer](https://github.com/feross/simple-peer)
- **Icons**: [Lucide React](https://lucide.dev/)

## ⚙️ Environment Variables

Create a `.env` file in the frontend directory:

```env
# Backend API URL (for authentication & REST)
VITE_API_URL=http://localhost:3000/api

# WebSocket URL (for real-time chat & signaling)
VITE_SOCKET_URL=http://localhost:3000/chat
```

## 🏃‍♂️ Getting Started

### Prerequisites

- Node.js (v18+)

### Installation

1.  Navigate to the frontend directory:

    ```bash
    cd chitchat/frontend
    ```

2.  Install dependencies:

    ```bash
    npm install
    ```

3.  Run the development server:

    ```bash
    npm run dev
    ```

4.  Open [http://localhost:5173](http://localhost:5173) in your browser.

## 🏗️ Build for Production

To create an optimized production build:

```bash
npm run build
```

The output will be in the `dist` folder, ready to be deployed to **Vercel**, **Netlify**, or **Render Static Sites**.

## 📱 Mobile Support

The UI is built with a mobile-first approach using responsive Tailwind classes, ensuring a native-app-like experience on smaller screens.

---

Made with ❤️ by Sudipta Pramanik
