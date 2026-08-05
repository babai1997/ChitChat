// Mermaid flowchart definitions. Layout is computed automatically by
// mermaid/dagre — no manual x/y coordinates, so nodes can't overlap the
// way they did in the earlier hand-placed version.

const CLASSDEFS = `
    classDef httpNode fill:#173226,stroke:#25D366,color:#e9edef,stroke-width:1px
    classDef wsNode fill:#3a2a05,stroke:#f0a500,color:#e9edef,stroke-width:1px
    classDef procNode fill:#202C33,stroke:#2a3942,color:#e9edef,stroke-width:1px
    classDef decNode fill:#26313a,stroke:#8696a0,color:#e9edef,stroke-width:1px
    classDef storeNode fill:#0b141a,stroke:#3a4750,color:#e9edef,stroke-width:1px
    classDef errNode fill:#3a1418,stroke:#ef4444,color:#e9edef,stroke-width:1px
`;

export const databaseErd = `
erDiagram
    USER ||--o| PROFILE : has
    USER ||--o{ AUTH_PROVIDER : "signs in via"
    USER ||--o{ CHAT_MEMBER : "belongs to"
    USER ||--o{ MESSAGE : sends
    USER ||--o{ CHAT : creates
    USER ||--o{ REFRESH_TOKEN : holds
    USER ||--o{ PUSH_TOKEN : registers
    CHAT ||--o{ CHAT_MEMBER : "has members"
    CHAT ||--o{ MESSAGE : contains
    MESSAGE ||--o{ ATTACHMENT : carries
    MESSAGE ||--o| MESSAGE : "replies to"

    USER {
        string id PK
        string phone UK
        string email UK
        boolean isVerified
        datetime lastSeen
    }
    PROFILE {
        string id PK
        string userId FK
        string displayName
        string avatarUrl
        boolean isOnline
    }
    AUTH_PROVIDER {
        string id PK
        string userId FK
        string provider
        string providerId
    }
    OTP_CODE {
        string id PK
        string phone
        string code
        datetime expiresAt
    }
    CHAT {
        string id PK
        string type
        string name
        string createdBy FK
    }
    CHAT_MEMBER {
        string id PK
        string chatId FK
        string userId FK
        string role
        datetime lastReadAt
    }
    MESSAGE {
        string id PK
        string chatId FK
        string senderId FK
        string type
        string status
        string replyToId FK
    }
    ATTACHMENT {
        string id PK
        string messageId FK
        string fileName
        string url
    }
    REFRESH_TOKEN {
        string id PK
        string userId FK
        string token UK
        datetime expiresAt
    }
    PUSH_TOKEN {
        string id PK
        string userId FK
        string deviceId
        string tokenType
    }
`;

export const otpSend = `
flowchart TD
    A(["Client<br/>POST /auth/otp/send { phone }"]) --> B{"Unverified OtpCode sent<br/>within rateLimitMinutes (1)?"}
    B -->|yes| C["400 — seconds remaining"]
    B -->|no| D["Generate 6-digit OTP<br/>SHA-256 hash → OtpCode{attempts:0}"]
    D --> E[("Twilio SMS / console log")]
${CLASSDEFS}
    class A wsNode
    class B decNode
    class C errNode
    class D procNode
    class E storeNode
`;

export const otpVerify = `
flowchart TD
    A(["Client<br/>POST /auth/otp/verify { phone, code }"]) --> B["Load latest unverified OtpCode"]
    B --> C{"Expired?"}
    C -->|yes| C1["Delete row, 401"]
    C -->|no| D{"attempts ≥ 3?"}
    D -->|yes| D1["Delete row, 401"]
    D -->|no| E{"Hash matches?"}
    E -->|no| E1["attempts++, 401"]
    E -->|yes| F["verified:true<br/>delete sibling OTPs"]
    F --> G{"User exists for phone?"}
    G -->|no| H["Create User(isVerified:true)<br/>+ AuthProvider(otp) + Profile"]
    G -->|yes, unverified| I["Flip isVerified on User"]
    G -->|yes, verified| J["generateTokens(user)"]
    H --> J
    I --> J
    J --> K["sign access+refresh JWT<br/>insert RefreshToken row"]
${CLASSDEFS}
    class A wsNode
    class B,F,H,I,J,K procNode
    class C,D,E,G decNode
    class C1,D1,E1 errNode
`;

export const google = `
flowchart TD
    A(["Client<br/>POST /auth/google { idToken }"]) --> B[("verifyGoogleToken<br/>google-auth-library → Google")]
    B --> C{"Found by email OR<br/>AuthProvider(google, sub)?"}
    C -->|not found| D["Create User + AuthProvider(google)<br/>+ Profile (name/picture)"]
    C -->|found by email, no google link| E["Link by email:<br/>add AuthProvider(google)"]
    C -->|found, linked| F["generateTokens(user)"]
    D --> F
    E --> F
${CLASSDEFS}
    class A wsNode
    class B storeNode
    class C decNode
    class D,E,F procNode
`;

export const refresh = `
flowchart TD
    A(["Client<br/>POST /auth/refresh { refreshToken }"]) --> B["Lookup RefreshToken by token string"]
    B --> C{"Found?"}
    C -->|no| C1["401"]
    C -->|yes| D{"expiresAt passed?"}
    D -->|yes| D1["Delete row, 401"]
    D -->|no| E["jwtService.verifyAsync"]
    E --> F{"Valid?"}
    F -->|no| F1["Delete row, 401"]
    F -->|yes| G["Rotate: delete old row<br/>generateTokens() → insert new RefreshToken"]
${CLASSDEFS}
    class A wsNode
    class B,E,G procNode
    class C,D,F decNode
    class C1,D1,F1 errNode
`;

export const logout = `
flowchart TD
    L(["Client<br/>POST /auth/logout (protected)"]) --> M["refreshToken.deleteMany({ userId })<br/>removes ALL devices' tokens"]
${CLASSDEFS}
    class L wsNode
    class M procNode
`;

export const wsConnect = `
flowchart TD
    A(["Client<br/>WS connect, namespace /chat"]) --> B["authenticateSocket<br/>verify JWT + isVerified"]
    B --> C{"Valid?"}
    C -->|no| D["disconnect"]
    C -->|yes| E["registry.register(userId, socketId)"]
    E --> F["Join chat:{chatId} room<br/>for every chat membership"]
    F --> G["markAllAsDeliveredForChats<br/>emit MESSAGE_DELIVERED to senders"]
    G --> H["Profile.isOnline = true"]
    G --> I["User.lastSeen updated"]
    H --> J["Broadcast USER_ONLINE<br/>to each chat room"]
    I --> J
    J --> K["Emit USERS_ONLINE list<br/>back to the connecting socket"]
${CLASSDEFS}
    class A wsNode
    class B,E,F,G,H,I,J,K procNode
    class C decNode
    class D errNode
`;

export const wsDisconnectTyping = `
flowchart TD
    A(["Client disconnects"]) --> B["registry.unregister(socketId)"]
    B --> C{"Last socket for this user?"}
    C -->|no| D["no-op — other devices still connected"]
    C -->|yes| E["Profile.isOnline = false<br/>User.lastSeen updated"]
    E --> F["callHandler.handleUserDisconnect<br/>clears active-call participant set"]
    F --> G["Per chat: emit TYPING_STOP,<br/>then USER_OFFLINE{lastSeen}"]

    T(["Client<br/>TYPING_START / TYPING_STOP"]) --> U["socket.to(chat:{chatId})<br/>room broadcast, excludes sender"]
${CLASSDEFS}
    class A,T wsNode
    class B,E,F,G,U procNode
    class C decNode
    class D procNode
`;

export const messaging = `
flowchart TD
    A(["Client — web / mobile"])
    A -->|optional, before sending| U["POST .../messages/attachments"]
    U --> CL[("CloudinaryService.uploadFile<br/>→ Cloudinary")]
    CL --> UB["Attachment URL returned<br/>included in create payload"]

    UB --> WS["WS event MESSAGE_SEND<br/>MessageHandler.handleSend"]
    UB --> RS["POST /chats/:id/messages<br/>MessagesController.create"]
    A -->|no attachment| WS
    A -->|no attachment| RS

    WS --> CR["MessagesService.create()<br/>writes Message + Attachment rows"]
    RS --> CR
    CR --> DB[("PostgreSQL, via Prisma")]

    CR -->|emitEvent:false — WS path| DIRECT["Direct emit:<br/>MESSAGE_SENT to sender,<br/>MESSAGE_NEW to each member"]
    CR -->|emitEvent:true — REST path| BRIDGE["EventEmitter2:<br/>'message.created'"]
    BRIDGE --> GW["ChatGateway.handleMessageCreatedEvent"]
    GW --> ROOM["Broadcast MESSAGE_NEW<br/>to chat room"]

    DIRECT --> ONLINE{"Recipient online?"}
    ONLINE -->|yes| DELIV["mark delivered"]
    ONLINE -->|no| PUSH["PushService.sendMessagePush"]
    PUSH --> FCM[("Firebase / FCM<br/>Android wired; iOS VoIP not yet")]
${CLASSDEFS}
    class A wsNode
    class U,BRIDGE,GW,ROOM httpNode
    class WS,DIRECT wsNode
    class RS httpNode
    class CL,DB,FCM storeNode
    class UB,CR,DELIV,PUSH procNode
    class ONLINE decNode
`;

export const callSignaling = `
flowchart TD
    A(["Caller: CALL_START"]) --> B["CALL_INCOMING → each recipient"]
    A --> C["CALL_RINGING → back to caller"]
    B --> D[("sendCallPush<br/>unconditional, parallel FCM wake-up")]
    D --> E(["Recipient: CALL_JOIN"])
    E --> F["CALL_USER_JOINED (room)"]
    E --> G["CALL_ONGOING (room)<br/>once ≥2 participants"]
    G --> H["CALL_SIGNAL<br/>offer/answer/candidate,<br/>point-to-point via registry.emitToUser"]
    B -.->|group call| ADDM["CALL_ADD_MEMBER →<br/>targeted CALL_INCOMING + push"]

    C -->|or| REJ["CALL_REJECT →<br/>targeted CALL_REJECTED to caller"]
    C -->|or| END["CALL_END →<br/>room CALL_ENDED;<br/>CALL_FINISHED once participants ≤1"]
    C -->|or| MISS["Ring timeout → CALL_MISSED<br/>+ persists missed_call message → MESSAGE_NEW"]

    H --> CANCEL["sendCancelPush<br/>fired on join/reject/end/missed/disconnect"]
    REJ --> CANCEL
    END --> CANCEL
    MISS --> CANCEL
    F --> ADDM2["CALL_ADD_MEMBER →<br/>targeted CALL_INCOMING + push"]
    H --> SCREEN["Screen-share start/stop →<br/>room broadcast CALL_SCREEN_SHARING/_STOPPED"]
${CLASSDEFS}
    class A,E wsNode
    class H wsNode
    class B,C,F,G,REJ,END,MISS,ADDM,ADDM2,SCREEN procNode
    class D,CANCEL storeNode
`;

export const pushLifecycle = `
flowchart TD
    A(["POST /push/register<br/>{ deviceId, platform, tokenType, token }"]) --> B["Upsert by [userId, deviceId, tokenType]"]
    C(["POST /push/unregister"]) --> D["Delete by userId + deviceId"]
    B --> T[("PushToken table")]
    D --> T
    T --> S["sendDataMessage(tokens)<br/>Promise.allSettled per token"]
    S --> R{"FCM result?"}
    R -->|rejected: invalid token| P["Delete that PushToken row<br/>registration-token-not-registered /<br/>invalid-registration-token"]
    R -->|fulfilled| OK["Delivered"]
${CLASSDEFS}
    class A,C httpNode
    class B,D,S,OK procNode
    class T storeNode
    class R decNode
    class P errNode
`;
