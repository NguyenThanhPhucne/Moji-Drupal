# 📚 BÁO CÁO ĐỒ ÁN MÔN HỌC

## ỨNG DỤNG CHAT THỜI GIAN THỰC - MOJI REALTIME CHAT APP

---

## 📋 MỤC LỤC

1. [Tổng Quan Dự Án](#1-tổng-quan-dự-án)
2. [Kiến Trúc Hệ Thống](#2-kiến-trúc-hệ-thống)
3. [Công Nghệ Sử Dụng](#3-công-nghệ-sử-dụng)
4. [Cấu Trúc Thư Mục](#4-cấu-trúc-thư-mục)
5. [Tính Năng Chính](#5-tính-năng-chính)
6. [API Endpoints](#6-api-endpoints)
7. [Database Schema](#7-database-schema)
8. [Luồng Hoạt Động](#8-luồng-hoạt-động)
9. [**Admin Dashboard (MỞ RỘNG)** 🆕](#9-admin-dashboard-mở-rộng)
10. [Hướng Dẫn Cài Đặt](#10-hướng-dẫn-cài-đặt)
11. [Kết Luận](#11-kết-luận)

---

## 1. TỔNG QUAN DỰ ÁN

### 1.1. Giới Thiệu

**Moji Realtime Chat App** là ứng dụng nhắn tin thời gian thực được xây dựng với kiến trúc **Hybrid Architecture**, kết hợp sức mạnh của:

- **Drupal 11** (CMS Framework) - Quản lý xác thực, người dùng, kết bạn
- **Node.js + Express** - Server backend xử lý tin nhắn realtime
- **React 19** - Frontend SPA hiện đại với TypeScript
- **MongoDB Atlas** - Database NoSQL lưu trữ tin nhắn
- **Socket.IO** - WebSocket cho realtime communication

### 1.2. Mục Tiêu

- Xây dựng ứng dụng chat fullstack với khả năng mở rộng cao
- Tích hợp CMS Drupal cho quản lý người dùng enterprise-grade
- Áp dụng kiến trúc microservices để tách biệt concerns
- Triển khai WebSocket cho giao tiếp realtime
- Sử dụng JWT authentication cho bảo mật

### 1.3. Phạm Vi Ứng Dụng

- ✅ Đăng ký / Đăng nhập với JWT
- ✅ Quản lý hồ sơ người dùng
- ✅ Gửi / Chấp nhận / Từ chối lời mời kết bạn
- ✅ Chat 1-1 (Direct Message)
- ✅ Chat nhóm (Group Chat)
- ✅ Upload hình ảnh (Cloudinary CDN)
- ✅ Emoji picker
- ✅ Đánh dấu tin nhắn đã đọc
- ✅ Dark/Light theme
- ✅ Realtime notifications

---

## 2. KIẾN TRÚC HỆ THỐNG

### 2.1. Sơ Đồ Tổng Quan

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                             │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  React 19 + TypeScript + Vite                            │   │
│  │  - Zustand (State Management)                            │   │
│  │  - React Router (Navigation)                             │   │
│  │  - Axios (HTTP Client)                                   │   │
│  │  - Socket.IO Client (WebSocket)                          │   │
│  │  - Tailwind CSS + shadcn/ui (UI Components)             │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              ↕ HTTP/WebSocket
┌─────────────────────────────────────────────────────────────────┐
│                         PROXY LAYER                              │
│  ┌──────────────────────┐         ┌────────────────────────┐   │
│  │  /api/drupal/*       │         │  /api/node/*           │   │
│  │  (Port 8000)         │         │  (Port 5001)           │   │
│  └──────────────────────┘         └────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                ↕                                    ↕
┌───────────────────────────┐       ┌────────────────────────────┐
│    DRUPAL 11 BACKEND      │       │   NODE.JS BACKEND          │
│  ┌─────────────────────┐  │       │  ┌──────────────────────┐ │
│  │ Custom Module:      │  │       │  │ Express.js Server    │ │
│  │ - chat_api          │  │       │  │ - REST API           │ │
│  │                     │  │       │  │ - Socket.IO          │ │
│  │ Controllers:        │  │       │  │ - JWT Middleware     │ │
│  │ - AuthController    │  │       │  │                      │ │
│  │ - UserController    │  │       │  │ Routes:              │ │
│  │ - FriendController  │  │       │  │ - /conversations     │ │
│  │                     │  │       │  │ - /messages          │ │
│  │ Entities:           │  │       │  │ - /users             │ │
│  │ - ChatFriend        │  │       │  │                      │ │
│  │ - ChatFriendRequest │  │       │  │ Models:              │ │
│  │ - ChatSession       │  │       │  │ - User               │ │
│  │                     │  │       │  │ - Conversation       │ │
│  │ Features:           │  │       │  │ - Message            │ │
│  │ - JWT Auth          │  │       │  └──────────────────────┘ │
│  │ - User Management   │  │       └────────────────────────────┘
│  │ - Friend System     │  │                    ↕
│  └─────────────────────┘  │       ┌────────────────────────────┐
└───────────────────────────┘       │   MongoDB Atlas (Cloud)    │
            ↕                        │  ┌──────────────────────┐ │
┌───────────────────────────┐       │  │ Collections:         │ │
│   MySQL Database          │       │  │ - users              │ │
│  ┌─────────────────────┐  │       │  │ - conversations      │ │
│  │ Tables:             │  │       │  │ - messages           │ │
│  │ - users             │  │       │  └──────────────────────┘ │
│  │ - chat_friend       │  │       └────────────────────────────┘
│  │ - chat_friend_req   │  │                    ↕
│  │ - chat_session      │  │       ┌────────────────────────────┐
│  └─────────────────────┘  │       │   Cloudinary CDN           │
└───────────────────────────┘       │  - Image Storage           │
                                     │  - Avatar Uploads          │
                                     └────────────────────────────┘
```

### 2.2. Luồng Dữ Liệu

#### 2.2.1. Authentication Flow

```
1. User → Frontend → POST /api/drupal/auth/signin
2. Drupal validates credentials (MySQL)
3. Drupal generates JWT token (drupalId included)
4. Frontend stores JWT in localStorage
5. Frontend → GET /api/node/users/me (with JWT)
6. Node.js validates JWT → finds/creates MongoDB user by drupalId
7. Return MongoDB user with ObjectId _id
8. Frontend stores MongoDB user in Zustand + localStorage
```

#### 2.2.2. Message Flow (Realtime)

```
1. User types message in chat window
2. Frontend emits Socket.IO event: "send-message"
   {
     conversationId: "...",
     content: "Hello",
     senderId: MongoDB ObjectId
   }
3. Node.js Socket.IO server receives event
4. Save message to MongoDB messages collection
5. Update conversation's lastMessage field
6. Socket.IO broadcasts to conversation participants
7. Other users receive real-time message update
```

#### 2.2.3. Friend Request Flow

```
1. User A → POST /api/drupal/friends/requests { to: drupalId_B }
2. Drupal creates ChatFriendRequest entity (MySQL)
3. User B fetches requests → GET /api/drupal/friends/requests
4. User B accepts → POST /api/drupal/friends/requests/:id/accept
5. Drupal creates ChatFriend entity (MySQL)
6. Frontend calls Node.js to create MongoDB conversation
7. Both users can now chat via MongoDB/Socket.IO
```

---

## 3. CÔNG NGHỆ SỬ DỤNG

### 3.1. Frontend Stack

| Công Nghệ            | Version | Mục Đích                                            |
| -------------------- | ------- | --------------------------------------------------- |
| **React**            | 19.1.1  | UI Framework với React Server Components            |
| **TypeScript**       | Latest  | Type safety và developer experience                 |
| **Vite**             | 6.x     | Build tool nhanh với HMR                            |
| **React Router**     | 7.9.3   | Client-side routing                                 |
| **Zustand**          | 5.0.8   | State management (lightweight alternative to Redux) |
| **Axios**            | 1.12.2  | HTTP client với interceptors                        |
| **Socket.IO Client** | 4.8.1   | WebSocket client cho realtime                       |
| **Tailwind CSS**     | 4.1.14  | Utility-first CSS framework                         |
| **shadcn/ui**        | Latest  | Pre-built accessible components                     |
| **Radix UI**         | Latest  | Headless UI primitives                              |
| **Lucide React**     | 0.544.0 | Icon library (1000+ icons)                          |
| **Sonner**           | 2.0.7   | Toast notifications                                 |
| **Emoji Mart**       | 5.6.0   | Emoji picker component                              |
| **React Hook Form**  | 7.64.0  | Form handling với validation                        |
| **Zod**              | 4.1.11  | Schema validation                                   |

### 3.2. Backend Stack (Node.js)

| Công Nghệ      | Version           | Mục Đích                      |
| -------------- | ----------------- | ----------------------------- |
| **Node.js**    | 20+               | JavaScript runtime            |
| **Express**    | 5.1.0             | Web framework                 |
| **MongoDB**    | 8.19.0 (Mongoose) | NoSQL database ODM            |
| **Socket.IO**  | 4.8.1             | Realtime WebSocket server     |
| **JWT**        | 9.0.2             | Token-based authentication    |
| **Bcrypt**     | 6.0.0             | Password hashing              |
| **Cloudinary** | 2.8.0             | Image CDN service             |
| **Multer**     | 2.0.2             | File upload middleware        |
| **CORS**       | 2.8.5             | Cross-Origin Resource Sharing |
| **Dotenv**     | 17.2.3            | Environment variables         |
| **Swagger UI** | 5.0.1             | API documentation             |
| **Nodemon**    | 3.1.10            | Auto-restart dev server       |

### 3.3. Backend Stack (Drupal)

| Công Nghệ            | Version | Mục Đích                         |
| -------------------- | ------- | -------------------------------- |
| **Drupal Core**      | 11.3    | CMS Framework                    |
| **PHP**              | 8.5.2   | Server-side language             |
| **MySQL**            | 8.0+    | Relational database              |
| **Composer**         | 2.x     | PHP dependency manager           |
| **Drush**            | 13.7    | Drupal CLI tool                  |
| **Firebase PHP-JWT** | 7.0     | JWT implementation               |
| **PHP-DotEnv**       | 5.6     | Environment config               |
| **MongoDB PHP**      | 1.20    | MongoDB driver (for hybrid sync) |

### 3.4. DevOps & Tools

| Tool              | Mục Đích                             |
| ----------------- | ------------------------------------ |
| **Git**           | Version control                      |
| **VS Code**       | IDE                                  |
| **Postman**       | API testing                          |
| **MongoDB Atlas** | Cloud database hosting               |
| **Cloudinary**    | CDN for images                       |
| **ESLint**        | Code linting (JavaScript/TypeScript) |
| **Prettier**      | Code formatting                      |

---

## 4. CẤU TRÚC THƯ MỤC

```
Moji-Drupal/
├── frontend/                      # React Frontend Application
│   ├── public/                    # Static assets
│   ├── src/
│   │   ├── assets/               # Images, fonts, etc.
│   │   ├── components/           # React Components
│   │   │   ├── auth/            # ProtectedRoute, SignIn/Up forms
│   │   │   ├── chat/            # ChatWindow, MessageBubble, etc.
│   │   │   ├── createNewChat/   # FriendListModal
│   │   │   ├── newGroupChat/    # Group creation components
│   │   │   └── ui/              # shadcn/ui primitives
│   │   ├── hooks/               # Custom React hooks
│   │   ├── lib/                 # Utilities
│   │   │   └── axios.ts         # Axios config với proxy routing
│   │   ├── pages/               # Route pages
│   │   │   ├── ChatAppPage.tsx  # Main chat interface
│   │   │   ├── SignInPage.tsx   # Login page
│   │   │   └── SignUpPage.tsx   # Register page
│   │   ├── services/            # API service layer
│   │   │   ├── authService.ts   # Auth APIs
│   │   │   ├── chatService.ts   # Chat/Message APIs
│   │   │   └── friendService.ts # Friend APIs
│   │   ├── stores/              # Zustand state stores
│   │   │   ├── useAuthStore.ts  # Authentication state
│   │   │   ├── useChatStore.ts  # Conversations & messages
│   │   │   ├── useFriendStore.ts # Friends & requests
│   │   │   ├── useSocketStore.ts # WebSocket connection
│   │   │   └── useThemeStore.ts # Dark/Light theme
│   │   ├── types/               # TypeScript definitions
│   │   ├── App.tsx              # Root component
│   │   └── main.tsx             # App entry point
│   ├── .env.development          # Dev environment vars
│   ├── .env.production           # Prod environment vars
│   ├── package.json              # Dependencies
│   ├── tsconfig.json             # TypeScript config
│   └── vite.config.ts            # Vite config with proxy
│
├── backend/                       # Node.js Backend API
│   ├── src/
│   │   ├── controllers/          # Request handlers
│   │   │   ├── authController.js    # Signup/Signin (backup)
│   │   │   ├── conversationController.js # Conversation CRUD
│   │   │   ├── friendController.js  # Friend management (backup)
│   │   │   ├── messageController.js # Send messages
│   │   │   └── userController.js    # User profile, search
│   │   ├── libs/
│   │   │   └── db.js             # MongoDB connection
│   │   ├── middlewares/
│   │   │   ├── authMiddleware.js    # JWT verification
│   │   │   ├── friendMiddleware.js  # Check friendship/membership
│   │   │   ├── socketMiddleware.js  # Socket.IO auth
│   │   │   └── uploadMiddleware.js  # Cloudinary upload
│   │   ├── models/               # Mongoose schemas
│   │   │   ├── User.js          # User schema (with drupalId)
│   │   │   ├── Conversation.js  # Conversation schema
│   │   │   ├── Message.js       # Message schema
│   │   │   ├── Friend.js        # Friend relationship (backup)
│   │   │   └── Session.js       # JWT session (optional)
│   │   ├── routes/               # API routes
│   │   │   ├── authRoute.js     # /api/auth/*
│   │   │   ├── conversationRoute.js # /api/conversations/*
│   │   │   ├── friendRoute.js   # /api/friends/*
│   │   │   ├── messageRoute.js  # /api/messages/*
│   │   │   └── userRoute.js     # /api/users/*
│   │   ├── socket/
│   │   │   └── index.js         # Socket.IO server setup
│   │   ├── utils/
│   │   │   └── messageHelper.js # Message utilities
│   │   ├── server.js            # Express app entry
│   │   └── swagger.json         # API documentation
│   ├── .env                      # Environment variables
│   └── package.json              # Dependencies
│
└── Drupal Discord/                # Drupal 11 CMS
    ├── web/                       # Document root
    │   ├── core/                 # Drupal core files
    │   ├── modules/
    │   │   └── custom/
    │   │       └── chat_api/     # Custom Drupal module
    │   │           ├── src/
    │   │           │   ├── Controller/
    │   │           │   │   ├── AuthController.php
    │   │           │   │   ├── UserController.php
    │   │           │   │   └── FriendController.php
    │   │           │   ├── Entity/
    │   │           │   │   ├── ChatFriend.php
    │   │           │   │   ├── ChatFriendRequest.php
    │   │           │   │   └── ChatSession.php
    │   │           │   └── Middleware/
    │   │           │       └── JwtAuthMiddleware.php
    │   │           └── chat_api.routing.yml
    │   ├── sites/default/
    │   │   └── settings.php      # Database config
    │   └── themes/               # Drupal themes
    ├── vendor/                    # Composer dependencies
    ├── .env                       # Environment variables
    └── composer.json              # PHP dependencies
```

---

## 5. TÍNH NĂNG CHÍNH

### 5.1. Xác Thực & Phân Quyền

- ✅ **Đăng ký tài khoản** với validation (username unique, password min 5 chars)
- ✅ **Đăng nhập** với JWT token (shared secret giữa Drupal & Node.js)
- ✅ **Tự động refresh token** khi hết hạn
- ✅ **Protected routes** - Chuyển hướng đến login nếu chưa auth
- ✅ **Hybrid user sync** - MongoDB user tự động tạo từ Drupal JWT
- ✅ **Logout** - Xóa token và session

### 5.2. Quản Lý Bạn Bè

- ✅ **Tìm kiếm người dùng** theo username
- ✅ **Gửi lời mời kết bạn** (validation: không tự gửi cho mình, không duplicate)
- ✅ **Nhận danh sách lời mời** (sent/received)
- ✅ **Chấp nhận/Từ chối** lời mời
- ✅ **Xem danh sách bạn bè** với avatar & display name
- ✅ **Check friendship** trước khi tạo conversation (middleware)

### 5.3. Chat Trực Tiếp (1-1)

- ✅ **Tạo conversation** tự động khi gửi tin nhắn đầu tiên
- ✅ **Gửi tin nhắn text** realtime qua Socket.IO
- ✅ **Upload & gửi hình ảnh** (Cloudinary CDN)
- ✅ **Emoji picker** với search
- ✅ **Hiển thị đúng sender** (tin nhắn mình bên phải, người khác bên trái)
- ✅ **Đánh dấu đã đọc** (seen indicator)
- ✅ **Timestamp** cho mỗi tin nhắn
- ✅ **Infinite scroll** load tin nhắn cũ

### 5.4. Chat Nhóm

- ✅ **Tạo nhóm** với tên và danh sách thành viên
- ✅ **Mời bạn bè** vào nhóm với search/filter
- ✅ **Gửi tin nhắn nhóm** (broadcast đến tất cả members)
- ✅ **Hiển thị avatar nhóm** (grid layout)
- ✅ **Group info** với danh sách thành viên

### 5.5. Giao Diện & Trải Nghiệm

- ✅ **Sidebar** hiển thị danh sách conversations với preview tin nhắn cuối
- ✅ **Unread count** badge
- ✅ **Online status** indicator (Socket.IO presence)
- ✅ **Dark/Light mode** toggle
- ✅ **Responsive design** (mobile-friendly)
- ✅ **Toast notifications** cho actions
- ✅ **Loading states** cho async operations
- ✅ **Error handling** với user-friendly messages

### 5.6. Realtime Features

- ✅ **Socket.IO connection** tự động khi đăng nhập
- ✅ **Auto-reconnect** khi mất kết nối
- ✅ **Room-based messaging** (join conversation rooms)
- ✅ **Broadcast events**:
  - `send-message` - Gửi tin nhắn
  - `new-message` - Nhận tin nhắn mới
  - `conversation-updated` - Cập nhật conversation
  - `user-online` / `user-offline` - Status changes

---

## 6. API ENDPOINTS

### 6.1. Drupal APIs (Port 8000)

#### Authentication

```http
POST /api/auth/signup
Body: { username, password, email, firstName, lastName }
Response: { message, user }

POST /api/auth/signin
Body: { username, password }
Response: { message, accessToken, user: { _id: drupalId, ... } }

POST /api/auth/signout
Response: { message }

POST /api/auth/refresh
Response: { accessToken }
```

#### Friends

```http
POST /api/friends/requests
Body: { to: drupalId, message? }
Response: { message, request }

POST /api/friends/requests/:requestId/accept
Response: { message, newFriend }

POST /api/friends/requests/:requestId/decline
Response: 204 No Content

GET /api/friends
Response: { friends: [{ _id: drupalId, username, displayName, avatarUrl }] }

GET /api/friends/requests
Response: {
  sentRequests: [...],
  receivedRequests: [...]
}
```

#### Users (Drupal)

```http
GET /api/users/me  (Drupal endpoint - KHÔNG DÙNG NỮA)
Response: { user: { _id: drupalId, ... } }  ← Trả về Drupal ID
```

### 6.2. Node.js APIs (Port 5001)

#### Users

```http
GET /api/users/me  (Node.js endpoint - SỬ DỤNG CHÍNH)
Headers: Authorization: Bearer <JWT>
Response: { user: { _id: mongoObjectId, drupalId, username, ... } }

GET /api/users/search?username=xxx
Response: { user: { _id, username, displayName, avatarUrl } }

POST /api/users/uploadAvatar
Body: FormData with file
Response: { user: { avatarUrl, ... } }
```

#### Conversations

```http
POST /api/conversations
Body: {
  type: "direct" | "group",
  name?: string,  // required for group
  memberIds: [drupalId1, drupalId2, ...]  // Backend maps to MongoDB ObjectIds
}
Response: { conversation: { _id, type, participants, ... } }

GET /api/conversations
Response: { conversations: [...] }

GET /api/conversations/:conversationId/messages?limit=50&before=timestamp
Response: { messages: [...], hasMore: boolean }

PATCH /api/conversations/:conversationId/seen
Response: { conversation: { seenBy: [...] } }
```

#### Messages

```http
POST /api/messages/direct
Body: {
  conversationId,
  content: string,
  imageUrl?: string
}
Response: { message: { _id, senderId, content, createdAt, ... } }

POST /api/messages/group
Body: { conversationId, content, imageUrl? }
Response: { message: {...} }
```

### 6.3. Socket.IO Events

#### Client → Server

```javascript
socket.emit("join-conversation", conversationId);
socket.emit("send-message", { conversationId, content, senderId });
```

#### Server → Client

```javascript
socket.on("new-message", (message) => {
  /* Update UI */
});
socket.on("conversation-updated", (conversation) => {
  /* Update sidebar */
});
socket.on("user-online", (userId) => {
  /* Show online indicator */
});
socket.on("user-offline", (userId) => {
  /* Hide online indicator */
});
```

---

## 7. DATABASE SCHEMA

### 7.1. MySQL (Drupal)

#### Table: `users`

```sql
CREATE TABLE users (
  uid INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(60) UNIQUE NOT NULL,
  mail VARCHAR(254) UNIQUE,
  pass VARCHAR(255),  -- Drupal hashed password
  created INT,
  changed INT,
  field_display_name VARCHAR(255),
  field_avatar_url VARCHAR(255)
);
```

#### Table: `chat_friend`

```sql
CREATE TABLE chat_friend (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_a INT NOT NULL,  -- Smaller drupalId
  user_b INT NOT NULL,  -- Larger drupalId
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY (user_a, user_b),
  FOREIGN KEY (user_a) REFERENCES users(uid),
  FOREIGN KEY (user_b) REFERENCES users(uid)
);
```

#### Table: `chat_friend_request`

```sql
CREATE TABLE chat_friend_request (
  id INT PRIMARY KEY AUTO_INCREMENT,
  from_user INT NOT NULL,
  to_user INT NOT NULL,
  message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (from_user) REFERENCES users(uid),
  FOREIGN KEY (to_user) REFERENCES users(uid)
);
```

#### Table: `chat_session`

```sql
CREATE TABLE chat_session (
  id INT PRIMARY KEY AUTO_INCREMENT,
  uid INT NOT NULL,
  token VARCHAR(500) UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,
  FOREIGN KEY (uid) REFERENCES users(uid)
);
```

### 7.2. MongoDB (Node.js)

#### Collection: `users`

```javascript
{
  _id: ObjectId("..."),  // MongoDB primary key
  username: "aaaaa",     // From Drupal
  email: "user@example.com",
  displayName: "User A",
  drupalId: 6,          // Link to Drupal UID (UNIQUE)
  hashedPassword: "...", // Bcrypt hash (only if created via Node.js)
  avatarUrl: "https://res.cloudinary.com/...",
  avatarId: "cloudinary_public_id",
  bio: "Hello world",
  phone: "+1234567890",
  createdAt: ISODate("2026-01-27T..."),
  updatedAt: ISODate("2026-01-27T...")
}
```

#### Collection: `conversations`

```javascript
{
  _id: ObjectId("..."),
  type: "direct" | "group",
  participants: [
    {
      userId: ObjectId("..."),  // Reference to users._id
      joinedAt: ISODate("...")
    },
    { userId: ObjectId("..."), joinedAt: ISODate("...") }
  ],
  group: {  // Only for type="group"
    name: "Team Chat",
    createdBy: ObjectId("...")
  },
  lastMessage: ObjectId("..."),  // Reference to messages._id
  lastMessageAt: ISODate("..."),
  seenBy: [ObjectId("..."), ObjectId("...")],  // Array of user IDs
  unreadCounts: {
    "userId1": 3,
    "userId2": 0
  },
  createdAt: ISODate("..."),
  updatedAt: ISODate("...")
}
```

#### Collection: `messages`

```javascript
{
  _id: ObjectId("..."),
  conversationId: ObjectId("..."),  // Reference to conversations._id
  senderId: ObjectId("..."),        // Reference to users._id
  content: "Hello world!",
  imageUrl: "https://res.cloudinary.com/...",
  createdAt: ISODate("..."),
  updatedAt: ISODate("...")
}
```

---

## 8. LUỒNG HOẠT ĐỘNG

### 8.1. User Registration & Login

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant D as Drupal
    participant N as Node.js
    participant M as MongoDB

    U->>F: Nhập username/password
    F->>D: POST /api/drupal/auth/signin
    D->>D: Validate credentials (MySQL)
    D->>D: Generate JWT (with drupalId)
    D-->>F: Return { accessToken, user: {_id: drupalId} }
    F->>F: Store JWT in localStorage
    F->>N: GET /api/node/users/me (with JWT)
    N->>N: Verify JWT
    N->>M: Find user by drupalId
    alt User exists
        M-->>N: Return MongoDB user
    else User not found
        N->>M: Create new user with drupalId
        M-->>N: Return created user
    end
    N-->>F: Return { user: {_id: mongoObjectId, drupalId} }
    F->>F: Store MongoDB user in Zustand
    F->>N: Connect Socket.IO
    N-->>F: Socket connected
```

### 8.2. Send Direct Message

```mermaid
sequenceDiagram
    participant U as User A
    participant F as Frontend
    participant N as Node.js
    participant S as Socket.IO
    participant M as MongoDB
    participant U2 as User B

    U->>F: Type message "Hello"
    F->>F: Get conversationId from state
    F->>S: emit("send-message", {conversationId, content, senderId})
    S->>N: Handle send-message event
    N->>M: Save message to messages collection
    M-->>N: Return saved message
    N->>M: Update conversation.lastMessage
    N->>S: Broadcast to conversation room
    S-->>F: emit("new-message", message)
    F->>F: Update chat UI
    S-->>U2: emit("new-message", message)
    U2->>U2: Show notification
```

### 8.3. Create Group Chat

```mermaid
sequenceDiagram
    participant U as User A
    participant F as Frontend
    participant N as Node.js
    participant M as MongoDB

    U->>F: Click "Tạo nhóm"
    F->>F: Open modal, load friends from Drupal
    U->>F: Select User B, User C
    U->>F: Enter group name "Team"
    F->>N: POST /conversations {type:"group", name:"Team", memberIds:[7,8]}
    N->>N: Map drupalIds [7,8] to MongoDB ObjectIds
    N->>M: Create conversation doc
    M-->>N: Return conversation
    N->>M: Populate participants
    N-->>F: Return populated conversation
    F->>F: Add conversation to state
    F->>F: Join Socket.IO room
    U->>F: Send first message
    F->>N: Socket emit("send-message")
    N->>M: Save message
    N->>N: Broadcast to group members
```

### 8.4. Friend Request Flow

```mermaid
sequenceDiagram
    participant UA as User A
    participant F as Frontend
    participant D as Drupal
    participant DB as MySQL
    participant UB as User B

    UA->>F: Search "bbbbb"
    F->>D: GET /api/drupal/friends?search=bbbbb
    D-->>F: Return user list
    UA->>F: Click "Kết bạn"
    F->>D: POST /api/drupal/friends/requests {to: 7}
    D->>DB: Check if already friends
    D->>DB: Check if request exists
    D->>DB: INSERT INTO chat_friend_request
    D-->>F: Return success

    UB->>F: Open "Lời mời kết bạn"
    F->>D: GET /api/drupal/friends/requests
    D->>DB: SELECT * WHERE to_user = 7
    D-->>F: Return received requests
    UB->>F: Click "Chấp nhận"
    F->>D: POST /api/drupal/friends/requests/:id/accept
    D->>DB: INSERT INTO chat_friend (user_a=6, user_b=7)
    D->>DB: DELETE FROM chat_friend_request
    D-->>F: Return newFriend
    F->>F: Update friends list
```

---

## 9. HƯỚNG DẪN CÀI ĐẶT

### 9.1. Requirements

```
- Node.js >= 20.x
- npm >= 10.x
- PHP >= 8.2
- Composer >= 2.x
- MySQL >= 8.0
- MongoDB Atlas account (hoặc local MongoDB)
- Cloudinary account (cho upload ảnh)
```

### 9.2. Setup Backend (Node.js)

```bash
# 1. Navigate to backend folder
cd backend

# 2. Install dependencies
npm install

# 3. Create .env file
cp .env.example .env

# 4. Configure .env
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/chatapp
PORT=5001
JWT_SECRET=chat_api_access_token_secret
CLIENT_URL=http://localhost:5173
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# 5. Start development server
npm run dev

# Server running on http://localhost:5001
```

### 9.3. Setup Drupal

```bash
# 1. Navigate to Drupal folder
cd "Drupal Discord"

# 2. Install Composer dependencies
composer install

# 3. Create .env file
cp .env.example .env

# 4. Configure .env
DATABASE_NAME=chatapp_db
DATABASE_USER=root
DATABASE_PASSWORD=your_password
DATABASE_HOST=localhost
DATABASE_PORT=3306
JWT_SECRET=chat_api_access_token_secret
CORS_ALLOWED_ORIGINS=http://localhost:5173

# 5. Create database
mysql -u root -p
CREATE DATABASE chatapp_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
exit

# 6. Install Drupal (if first time)
cd web
php core/install.php

# 7. Enable custom module
drush en chat_api -y

# 8. Start PHP server
php -S localhost:8000 -t web

# Drupal running on http://localhost:8000
```

### 9.4. Setup Frontend

```bash
# 1. Navigate to frontend folder
cd frontend

# 2. Install dependencies
npm install

# 3. Create .env.development
VITE_NODE_API=http://localhost:5001
VITE_DRUPAL_API=http://localhost:8000

# 4. Start development server
npm run dev

# Frontend running on http://localhost:5173
```

### 9.5. Build for Production

```bash
# Backend
cd backend
npm start  # Uses node src/server.js

# Frontend
cd frontend
npm run build  # Creates dist/ folder
npm run preview  # Test production build
```

---

## 10. KẾT LUẬN

### 10.1. Thành Tựu Đạt Được

✅ **Kiến trúc Hybrid hoàn chỉnh** - Tích hợp thành công Drupal CMS với Node.js microservice

✅ **Realtime Communication** - Socket.IO đảm bảo tin nhắn gửi/nhận tức thì không delay

✅ **Scalable Database Design** - MySQL cho structured data (users/friends), MongoDB cho unstructured (messages)

✅ **Modern Frontend** - React 19 với TypeScript, Zustand state management, responsive UI

✅ **Security Best Practices** - JWT authentication, password hashing, input validation, CORS protection

✅ **Developer Experience** - Hot reload, TypeScript IntelliSense, ESLint, Swagger API docs

### 10.2. Kỹ Năng Áp Dụng

**Frontend Development:**

- Single Page Application (SPA) với React Router
- State management với Zustand (Redux alternative)
- WebSocket integration với Socket.IO Client
- Form handling với React Hook Form + Zod validation
- UI component library (shadcn/ui + Radix UI)
- Responsive design với Tailwind CSS

**Backend Development:**

- RESTful API design với Express.js
- MongoDB với Mongoose ODM
- WebSocket server với Socket.IO
- JWT authentication & middleware
- File upload với Multer + Cloudinary
- Error handling & logging

**CMS Development:**

- Drupal 11 custom module development
- Entity API (Content Entities)
- Routing & Controllers
- Services & Dependency Injection
- MySQL database design

**DevOps:**

- Environment configuration (.env)
- Git version control
- API documentation (Swagger)
- Debugging techniques

### 10.3. Hạn Chế & Cải Tiến

**Hạn chế hiện tại:**

- Chưa có typing indicators (đang gõ...)
- Chưa có voice/video call
- Chưa có message reactions (emoji reactions)
- Chưa có file sharing (PDF, DOC, etc.)
- ~~Chưa có admin panel~~ ✅ **ĐÃ BỔ SUNG** (Xem [Section 9](#9-admin-dashboard-mở-rộng))

**Hướng phát triển:**

- **Security**: Implement rate limiting, XSS protection, SQL injection prevention
- **Performance**: Redis caching, CDN for static assets, database indexing
- **Features**: Push notifications (Firebase), message search, user blocking
- **DevOps**: Docker containerization, CI/CD pipeline, monitoring (Sentry)
- **Testing**: Unit tests (Jest), Integration tests, E2E tests (Cypress)
- **Admin UI**: Complete implementation of TODO items in AdminController (✅ File structure ready)

### 10.4. Kết Luận Cuối

Dự án **Moji Realtime Chat App** đã thành công trong việc xây dựng một ứng dụng chat hiện đại với:

1. **Kiến trúc Microservices** - Tách biệt concerns giữa authentication (Drupal) và messaging (Node.js)
2. **Realtime Communication** - Socket.IO đảm bảo trải nghiệm mượt mà
3. **Scalability** - Database design cho phép mở rộng dễ dàng
4. **Modern Tech Stack** - React 19, Node.js, Drupal 11, MongoDB
5. **Admin Dashboard** - Drupal Admin UI cho quản lý hệ thống (File structure ready) 🆕

Dự án đã giúp củng cố kiến thức về:

- Full-stack web development
- WebSocket & realtime systems
- Hybrid architecture design
- Authentication & authorization
- Database modeling (SQL & NoSQL)
- API design best practices
- Drupal custom module development & Admin UI 🆕

---

## 9. ADMIN DASHBOARD (MỞ RỘNG) 🆕

### 9.1. Tổng Quan Admin Dashboard

Để mở rộng dự án và tận dụng thế mạnh của Drupal CMS, chúng ta đã bổ sung **Drupal Admin Dashboard** - một hệ thống quản trị web-based cho phép Admin/Moderator quản lý toàn bộ ứng dụng chat.

**Vai trò:**

- **End Users** (Người dùng thông thường) → Sử dụng React App (`localhost:5173`)
- **Admin/Moderator** → Truy cập Drupal Admin UI (`localhost:8000/admin/chat`)

**Kiến trúc sau khi mở rộng:**

```
┌─────────────────────────────────────────────┐
│  END USERS (React SPA)                      │
│  localhost:5173                             │
│  - Chat, Send Messages, Add Friends         │
└─────────────────────────────────────────────┘
                ↓ API Calls
┌──────────────────────────────────────────────────┐
│              BACKEND LAYER                        │
│  ┌────────────────┐    ┌────────────────────┐   │
│  │ Drupal Backend │    │ Node.js Backend    │   │
│  │ localhost:8000 │    │ localhost:5001     │   │
│  │                │    │                    │   │
│  │ REST API + UI  │    │ REST API + Socket  │   │
│  └────────────────┘    └────────────────────┘   │
│          ↓                                       │
│  ┌─────────────────────────────────────┐        │
│  │  ADMIN/MODERATOR                    │        │
│  │  localhost:8000/admin/chat  🆕       │        │
│  │                                     │        │
│  │  - User Management                  │        │
│  │  - Conversation Monitoring          │        │
│  │  - Reports & Analytics              │        │
│  │  - System Settings                  │        │
│  └─────────────────────────────────────┘        │
└──────────────────────────────────────────────────┘
```

### 9.2. File Structure Admin Dashboard

**Tất cả file đã được tạo sẵn (Ready to implement):**

```
Drupal Discord/web/modules/custom/chat_api/
├── chat_api.routing.yml         ✅ Admin routes
├── chat_api.links.menu.yml      ✅ Admin menu structure
├── chat_api.permissions.yml     ✅ Admin permissions
├── chat_api.libraries.yml       ✅ CSS/JS libraries
├── chat_api.info.yml            ✅ Updated description
│
├── src/
│   ├── Controller/
│   │   ├── AdminController.php         ✅ Main admin controller
│   │   └── AdminApiController.php      ✅ AJAX API endpoints
│   │
│   └── Form/
│       └── ChatSettingsForm.php        ✅ Settings configuration form
│
├── templates/                           ✅ Twig templates
│   ├── chat-admin-dashboard.html.twig
│   ├── chat-admin-users.html.twig
│   ├── chat-admin-user-view.html.twig
│   ├── chat-admin-conversations.html.twig
│   ├── chat-admin-conversation-view.html.twig
│   ├── chat-admin-friend-requests.html.twig
│   └── chat-admin-reports.html.twig
│
├── css/                                 ✅ Stylesheets
│   ├── admin.css
│   └── tables.css
│
└── js/                                  ✅ JavaScript
    ├── admin.js
    ├── charts.js
    └── tables.js
```

### 9.3. Tính Năng Admin Dashboard

#### 9.3.1. Dashboard (`/admin/chat`)

**Trang chủ admin với thống kê tổng quan:**

- 📊 Statistics cards:
  - Total Users
  - Active Users Today
  - Total Friendships
  - Pending Friend Requests
- 🚀 Quick action buttons
- 📈 Activity charts (TODO: Implement Chart.js)

**File:** `AdminController::dashboard()` + `chat-admin-dashboard.html.twig`

#### 9.3.2. User Management (`/admin/chat/users`)

**Quản lý người dùng:**

- ✅ Danh sách tất cả users với pagination
- 🔍 Search users by username/email (Frontend JS)
- 🔄 Filter by status (Active/Blocked)
- 👁️ View user details (`/admin/chat/users/{uid}`)
- 🚫 Ban/Unban users
- ✏️ Edit user profile (link to Drupal core)

**Files:**

- `AdminController::usersList()`
- `AdminController::userView($uid)`
- `AdminController::banUser($uid)`
- `AdminController::unbanUser($uid)`
- Templates: `chat-admin-users.html.twig`, `chat-admin-user-view.html.twig`

#### 9.3.3. Conversation Management (`/admin/chat/conversations`)

**Giám sát và điều hành conversations:**

- 📝 Xem tất cả conversations (TODO: Fetch from Node.js)
- 👁️ View conversation details with messages
- 🗑️ Delete conversations vi phạm
- 📊 Statistics per conversation

**Files:**

- `AdminController::conversationsList()`
- `AdminController::conversationView($conversation_id)`
- `AdminController::conversationDelete($conversation_id)`
- Templates: `chat-admin-conversations.html.twig`, `chat-admin-conversation-view.html.twig`

**TODO:** Cần implement API endpoint trong Node.js backend để fetch conversations.

#### 9.3.4. Friend Requests (`/admin/chat/friend-requests`)

**Quản lý lời mời kết bạn:**

- 📋 Danh sách tất cả friend requests
- 🔍 Filter by status (Pending/Accepted/Declined)
- 📊 Statistics về friend requests

**Files:**

- `AdminController::friendRequestsList()`
- Template: `chat-admin-friend-requests.html.twig`

#### 9.3.5. Reports & Analytics (`/admin/chat/reports`)

**Báo cáo và phân tích:**

- 📈 User statistics:
  - Total users
  - Active users today/week
  - New users this week/month
- 💬 Message statistics (TODO: Fetch from Node.js)
- 📊 Charts visualization (TODO: Integrate Chart.js)
  - Messages per day
  - New users per day
  - Activity trends

**Files:**

- `AdminController::reports()`
- `AdminController::reportsUsers()`
- `AdminController::reportsMessages()`
- `AdminApiController::getStats()` (AJAX endpoint)
- Template: `chat-admin-reports.html.twig`
- JavaScript: `js/charts.js`

#### 9.3.6. Settings (`/admin/chat/settings`)

**Cấu hình hệ thống:**

**Upload Settings:**

- Max file size (MB)
- Allowed file extensions

**Message Settings:**

- Max message length
- Message retention days
- Enable message editing
- Enable message deletion

**Rate Limiting:**

- Max messages per minute
- Max friend requests per day

**Security Settings:**

- Require email verification
- Enable profanity filter

**Backend Settings:**

- Node.js backend URL
- MongoDB connection string

**Files:**

- `ChatSettingsForm::buildForm()`
- Drupal config system: `chat_api.settings`

### 9.4. Permissions System

**File:** `chat_api.permissions.yml`

Đã định nghĩa 4 permissions:

1. **`administer chat`** (restrict access)
   - Full administrative access
   - Manage users, conversations, settings
   - Ban/unban users

2. **`moderate chat`**
   - View and moderate conversations
   - View friend requests
   - Cannot change system settings

3. **`view chat reports`**
   - View statistics and analytics
   - Access reports pages
   - Read-only access

4. **`ban chat users`**
   - Ban and unban users
   - User moderation only

**Cách assign permissions:**

1. Vào `/admin/people/permissions`
2. Tìm section "Chat Administration"
3. Tick checkbox cho role (Administrator, Moderator, etc.)
4. Save permissions

### 9.5. Routing Structure

**File:** `chat_api.routing.yml`

**Admin routes đã tạo:**

| Route                                | Path                                    | Permission        | Description                |
| ------------------------------------ | --------------------------------------- | ----------------- | -------------------------- |
| `chat_api.admin_dashboard`           | `/admin/chat`                           | administer chat   | Main dashboard             |
| `chat_api.admin_users`               | `/admin/chat/users`                     | administer chat   | User list                  |
| `chat_api.admin_user_view`           | `/admin/chat/users/{uid}`               | administer chat   | User details               |
| `chat_api.admin_user_ban`            | `/admin/chat/users/{uid}/ban`           | administer chat   | Ban user (POST)            |
| `chat_api.admin_user_unban`          | `/admin/chat/users/{uid}/unban`         | administer chat   | Unban user (POST)          |
| `chat_api.admin_conversations`       | `/admin/chat/conversations`             | moderate chat     | Conversation list          |
| `chat_api.admin_conversation_view`   | `/admin/chat/conversations/{id}`        | moderate chat     | Conversation details       |
| `chat_api.admin_conversation_delete` | `/admin/chat/conversations/{id}/delete` | administer chat   | Delete conversation (POST) |
| `chat_api.admin_friend_requests`     | `/admin/chat/friend-requests`           | moderate chat     | Friend requests            |
| `chat_api.admin_reports`             | `/admin/chat/reports`                   | view chat reports | Main reports               |
| `chat_api.admin_reports_users`       | `/admin/chat/reports/users`             | view chat reports | User statistics            |
| `chat_api.admin_reports_messages`    | `/admin/chat/reports/messages`          | view chat reports | Message statistics         |
| `chat_api.admin_settings`            | `/admin/chat/settings`                  | administer chat   | System settings            |
| `chat_api.admin_api_stats`           | `/admin/chat/api/stats`                 | view chat reports | AJAX stats endpoint        |

### 9.6. Menu Structure

**File:** `chat_api.links.menu.yml`

Drupal admin menu hierarchy:

```
Administration
└── Chat Administration
    ├── Users
    ├── Conversations
    ├── Friend Requests
    ├── Reports & Analytics
    └── Settings
```

**Truy cập:** Click vào "Manage" → "Chat Administration" trong Drupal admin toolbar.

### 9.7. UI Components

#### 9.7.1. CSS Styling

**Files:** `css/admin.css`, `css/tables.css`

**Features:**

- ✨ Modern gradient cards for statistics
- 📊 Responsive grid layouts
- 🎨 Color-coded status badges
- 🔘 Hover effects on buttons
- 📱 Mobile-responsive design
- 🌈 Beautiful admin theme

**Color scheme:**

- Primary: `#667eea` (Purple-blue gradient)
- Success: `#4caf50` (Green)
- Danger: `#f44336` (Red)
- Warning: `#ffa726` (Orange)

#### 9.7.2. JavaScript Functionality

**Files:** `js/admin.js`, `js/charts.js`, `js/tables.js`

**Implemented:**

- 🔍 User search filter (live search)
- 🔄 Status filter dropdown
- 🚫 Ban/Unban confirmation dialogs
- 🗑️ Delete confirmation prompts
- 📊 Chart.js preparation (TODO: Add data)

**TODO:**

- Implement AJAX for ban/unban (no page reload)
- Fetch real data from backend APIs
- Implement Chart.js with real statistics
- Add pagination enhancements

### 9.8. Implementation Status

**✅ COMPLETED (File Structure Ready):**

- [x] Routing configuration
- [x] Menu structure
- [x] Permissions system
- [x] AdminController with all methods (placeholder)
- [x] AdminApiController
- [x] ChatSettingsForm
- [x] All Twig templates
- [x] CSS styling (admin.css, tables.css)
- [x] JavaScript files (admin.js, charts.js, tables.js)
- [x] Libraries definition (chat_api.libraries.yml)

**⏳ TODO (Implementation Required):**

- [ ] Complete `AdminController` methods with real data
- [ ] Implement conversation fetching from Node.js
- [ ] Add Node.js admin API endpoints:
  - `GET /api/admin/conversations`
  - `GET /api/admin/users/{userId}/message-count`
  - `GET /api/admin/stats`
- [ ] Integrate Chart.js library (CDN or local)
- [ ] Implement real-time statistics updates
- [ ] Add AJAX handlers for ban/unban/delete actions
- [ ] Complete reports with actual data
- [ ] Add form validation and error handling
- [ ] Implement message count queries
- [ ] Add logging for admin actions

### 9.9. Hướng Dẫn Enable Admin UI

**Bước 1: Clear Drupal Cache**

```bash
cd "Drupal Discord"
drush cr
# hoặc vào /admin/config/development/performance → Clear cache
```

**Bước 2: Assign Permissions**

1. Vào `/admin/people/permissions`
2. Tìm "Chat Administration" section
3. Tick "Administer chat system" cho Administrator role
4. Save permissions

**Bước 3: Truy Cập Admin Dashboard**

- URL: `http://localhost:8000/admin/chat`
- Hoặc: Click "Manage" → "Chat Administration" trong admin toolbar

**Bước 4: Configure Settings**

1. Vào `/admin/chat/settings`
2. Cấu hình:
   - Upload limits
   - Message settings
   - Rate limiting
   - Backend URLs
3. Save configuration

### 9.10. Demo Screenshots (Conceptual)

**Dashboard:**

```
┌─────────────────────────────────────────────────┐
│  Chat Administration                            │
│  Manage users, conversations, and system        │
├─────────────────────────────────────────────────┤
│  📊 Statistics Cards                            │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐          │
│  │  👥  │ │  ✅  │ │  🤝  │ │  ⏳  │          │
│  │ 1,234│ │  156 │ │  567 │ │   12 │          │
│  │Users │ │Active│ │Friends│ │Pending│         │
│  └──────┘ └──────┘ └──────┘ └──────┘          │
│                                                 │
│  🚀 Quick Actions                               │
│  [👤 Manage Users] [💬 Conversations]          │
│  [📊 View Reports] [⚙️ Settings]               │
│                                                 │
│  📈 Activity Overview (TODO: Charts)            │
│  [Chart placeholder]                            │
└─────────────────────────────────────────────────┘
```

**User Management:**

```
┌─────────────────────────────────────────────────┐
│  User Management                                │
│  [Search: ________] [Filter: All statuses ▼]   │
├─────────────────────────────────────────────────┤
│  ID  │ Username  │ Email          │ Status     │
├─────────────────────────────────────────────────┤
│  1   │ admin     │ admin@test.com │ ✅ Active │
│  2   │ john_doe  │ john@test.com  │ ✅ Active │
│  3   │ spammer   │ spam@test.com  │ 🚫 Blocked│
└─────────────────────────────────────────────────┘
  [Actions: View | Edit | Ban/Unban]
```

### 9.11. Ưu Điểm Của Admin Dashboard

**Tận dụng thế mạnh Drupal:**

- ✅ Sử dụng Drupal's Form API
- ✅ Permission system enterprise-grade
- ✅ Menu & Routing framework
- ✅ Twig templating engine
- ✅ Database query builder
- ✅ Configuration management

**Tách biệt vai trò rõ ràng:**

- **End Users** → Modern React SPA
- **Admins** → Powerful Drupal Admin UI
- Không conflict giữa 2 interfaces

**Mở rộng dễ dàng:**

- File structure đã sẵn sàng
- Placeholder methods để implement từng tính năng
- TODO comments hướng dẫn rõ ràng

---

## 10. HƯỚNG DẪN CÀI ĐẶT

## 📌 APPENDIX

### A. Môi Trường Phát Triển

```
- OS: macOS / Windows / Linux
- Editor: VS Code
- Browser: Chrome (React DevTools)
- API Client: Postman / Insomnia
- Database Client: MongoDB Compass, MySQL Workbench
```

### B. Tài Liệu Tham Khảo

1. React Documentation: https://react.dev
2. Socket.IO Documentation: https://socket.io/docs
3. Drupal API: https://www.drupal.org/docs/drupal-apis
4. Express.js Guide: https://expressjs.com/
5. MongoDB Manual: https://www.mongodb.com/docs/
6. JWT.io: https://jwt.io/introduction

### C. Contributors

- **Developer**: Phúc Nguyễn
- **Project Type**: Đồ án môn học
- **Year**: 2026
- **Institution**: [Tên trường]

---

**© 2026 Moji Chat App - All Rights Reserved**
