import { CodeBlock, Step, Note, P } from '../CodeBlock';

export function MessagingScenario() {
  return (
    <div>
      <Step n="1" title="Login again → socket connects → you learn who's already online">
        <P>
          The moment <code>isAuthenticated</code> is true, <code>SocketProvider</code> connects and the backend's{' '}
          <code>handleConnection</code> sends you a one-time snapshot — everyone from your chats who's already connected, before
          any live event could reach you.
        </P>
        <CodeBlock
          file="backend/src/modules/gateway/chat.gateway.ts:118-126"
          lines={[
            '// Send the connecting user a list of currently online contacts',
            "const onlineUserIds = new Set<string>([user.id]);",
            'for (const chatId of userChatIds) {',
            '  const memberIds = await this.chatsService.getChatMemberIds(chatId);',
            '  memberIds.forEach((id) => {',
            '    if (this.registry.isOnline(id)) onlineUserIds.add(id);',
            '  });',
            '}',
            'socket.emit(SOCKET_EVENTS.USERS_ONLINE, Array.from(onlineUserIds));',
          ]}
        />
        <CodeBlock
          file="frontend/src/shared/socket/handlers/presence.handlers.ts (full file)"
          lines={[
            'const handleUserOnline = (data: { userId: string }) => {',
            '  useChatStore.getState().setUserOnline(data.userId, true);',
            '};',
            '',
            'const handleUserOffline = (data: { userId: string; lastSeen?: string }) => {',
            '  useChatStore.getState().setUserOnline(data.userId, false, data.lastSeen);',
            '};',
            '',
            'const handleUsersOnline = (userIds: string[]) => {',
            '  useChatStore.getState().setOnlineUsers(userIds);',
            '};',
            '',
            'export function registerPresenceHandlers(): () => void {',
            '  socketManager.on(SOCKET_EVENTS.USER_ONLINE, handleUserOnline as any);',
            '  socketManager.on(SOCKET_EVENTS.USER_OFFLINE, handleUserOffline as any);',
            '  socketManager.on(SOCKET_EVENTS.USERS_ONLINE, handleUsersOnline as any);',
            '  // ...typing handlers too, see step 6',
            '}',
          ]}
        />
        <CodeBlock
          file="frontend/src/stores/chatStore.ts:216-230"
          lines={[
            'setUserOnline: (userId, isOnline, lastSeen) => {',
            '  set((state) => {',
            '    const online = new Set(state.onlineUsers);',
            '    if (isOnline) {',
            '      online.add(userId);',
            '    } else {',
            '      online.delete(userId);',
            '      if (lastSeen) seen[userId] = lastSeen;',
            '    }',
            '    return { onlineUsers: online, lastSeen: seen };',
            '  });',
            '},',
            '',
            'setOnlineUsers: (userIds) => set({ onlineUsers: new Set(userIds) }),',
          ]}
        />
        <CodeBlock
          file="frontend/src/components/chat/ChatView.tsx:492-495"
          lines={[
            '// Check real-time online status from store',
            'if (onlineUsers.has(otherMember.userId)) {',
            '  return "Online";',
            '}',
          ]}
        />
        <Note>
          The green dot is never a database read at render time — it's this <code>Set&lt;userId&gt;</code> in Zustand, kept live
          by three socket events.
        </Note>
      </Step>

      <Step n="2" title="You hit send — the UI updates before the server has even replied">
        <P>
          <code>sendMessage</code> generates a client-side <code>tempId</code> immediately and emits over the socket — no HTTP
          round trip, no waiting.
        </P>
        <CodeBlock
          file="frontend/src/contexts/SocketContext.tsx:80-90"
          lines={[
            'const sendMessage = useCallback(',
            "  (chatId: string, content: string, type = 'text', replyToId?: string) => {",
            '    if (!socketManager.isConnected) return null;',
            '',
            '    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;',
            '    socketManager.emit(SOCKET_EVENTS.MESSAGE_SEND, { chatId, content, type, replyToId, tempId });',
            '    return tempId;',
            '  },',
            '  [],',
            ');',
          ]}
        />
        <CodeBlock
          file="frontend/src/components/chat/ChatView.tsx:437-453"
          lines={[
            'setMessage("");',
            'stopTyping(chat.id);',
            '',
            '// Instant Optimistic UI using WebSockets instead of awaiting HTTP',
            'const tempId = sendMessage(chat.id, content, "text");',
            'if (tempId && currentUserId) {',
            '  addMessage(chat.id, {',
            '    id: tempId,',
            '    chatId: chat.id,',
            '    content,',
            '    type: "text",',
            '    senderId: currentUserId,',
            '    createdAt: new Date().toISOString(),',
            '    status: "sending",',
            '    tempId,',
            '  } as any);',
            '}',
          ]}
        />
        <Note>
          The bubble appears instantly with a clock icon (<code>status: "sending"</code>) — before the server has confirmed
          anything. This is why sending feels instant even on a slow connection.
        </Note>
      </Step>

      <Step n="3" title="Backend persists the message, then tells the sender and every member separately">
        <CodeBlock
          file="backend/src/modules/gateway/handlers/message.handler.ts:34-67"
          lines={[
            'async handleSend(socket: AuthSocket, data: SendMessageDto) {',
            '  const { chatId, content, type = MessageType.text, tempId, replyToId } = data;',
            '  const senderId = socket.user.id;',
            '',
            '  const message = await this.messagesService.create(',
            '    { chatId, senderId, content, type, replyToId, attachments: data.attachments },',
            '    { emitEvent: false },',
            '  );',
            '',
            '  // Notify sender: temp → real message mapping',
            '  socket.emit(SOCKET_EVENTS.MESSAGE_SENT, {',
            '    tempId,',
            '    message: { ...message, status: "sent" },',
            '  });',
          ]}
        />
        <CodeBlock
          file="backend/src/modules/gateway/handlers/message.handler.ts:69-84"
          lines={[
            '// Deliver MESSAGE_NEW directly to each member via the registry instead of',
            '// broadcasting to a room. This makes delivery independent of socket room',
            '// membership — CHAT_LEAVE / socket.leave() can no longer break it.',
            'const allMemberIds = await this.chatsService.getChatMemberIds(chatId);',
            'allMemberIds.forEach((memberId) => {',
            '  this.registry.emitToUser(memberId, SOCKET_EVENTS.MESSAGE_NEW, {',
            '    ...message,',
            '    tempId,',
            '  });',
            '});',
          ]}
        />
        <Note>
          Notice <code>MESSAGE_NEW</code> goes to <b>every</b> member, including the sender's <i>other</i> devices — and{' '}
          <code>MESSAGE_SENT</code> goes only to the exact socket that sent it. Two different events for two different jobs.
        </Note>
      </Step>

      <Step n="4" title="Frontend reconciles: your own bubble swaps tempId → real ID; the other end gets a brand-new bubble">
        <CodeBlock
          file="frontend/src/shared/socket/handlers/message.handlers.ts:60-65"
          lines={[
            '// message:sent — sender-only. Atomically replaces the optimistic temp',
            '// entry with the confirmed real message. Fixes the duplicate-message bug.',
            'const handleMessageSent = ({ tempId, message }) => {',
            '  const store = useChatStore.getState();',
            '  store.replaceMessage(message.chatId, tempId, { ...message, status: "sent" });',
            '};',
          ]}
        />
        <CodeBlock
          file="frontend/src/shared/socket/handlers/message.handlers.ts:10-37"
          lines={[
            'const handleNewMessage = async (message) => {',
            '  const store = useChatStore.getState();',
            '  const currentUserId = useAuthStore.getState().user?.id;',
            '  const existingChat = store.chats.find((c) => c.id === message.chatId);',
            '',
            '  if (existingChat) {',
            '    // addMessage is dedup-aware — checks both real id and tempId',
            '    store.addMessage(message.chatId, message);',
            '',
            '    const isActive = store.activeChat?.id === message.chatId;',
            '    const isOwn = message.senderId === currentUserId;',
            '    store.updateChat(message.chatId, {',
            '      lastMessage: { id: message.id, content: message.content, /* ... */ },',
            '      unreadCount: !isActive && !isOwn',
            '        ? (existingChat.unreadCount || 0) + 1',
            '        : existingChat.unreadCount || 0,',
            '    });',
            '  }',
            '};',
          ]}
        />
        <Note>
          Both handlers run on <b>every</b> client, sender included — <code>addMessage</code>'s dedup check against{' '}
          <code>tempId</code> is what stops the sender from seeing their own message twice (once from the optimistic add, once
          from <code>MESSAGE_NEW</code>).
        </Note>
      </Step>

      <Step n="5" title="Delivered / read receipts">
        <P>
          If a recipient is online right now, the sender gets an immediate delivered ping; read receipts follow the same
          per-message-ID pattern when the recipient actually opens the chat.
        </P>
        <CodeBlock
          file="backend/src/modules/gateway/handlers/message.handler.ts:86-93"
          lines={[
            'const recipientIds = allMemberIds.filter((id) => id !== senderId);',
            'const onlineRecipients = recipientIds.filter((id) => this.registry.isOnline(id));',
            '',
            'if (onlineRecipients.length > 0) {',
            "  await this.messagesService.updateStatus(message.id, 'delivered');",
            '  socket.emit(SOCKET_EVENTS.MESSAGE_DELIVERED, { messageId: message.id, chatId, tempId, deliveredTo: onlineRecipients });',
            '}',
          ]}
        />
      </Step>

      <Step n="6" title='Typing indicator — "X is typing..."'>
        <P>Emitted with a 2-second trailing timeout, so a pause in typing clears the indicator automatically.</P>
        <CodeBlock
          file="frontend/src/components/chat/ChatView.tsx:205-212"
          lines={[
            'const handleInputChange = (e) => {',
            '  setMessage(e.target.value);',
            '  if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);',
            '  startTyping(chat.id);',
            '  typingTimeoutRef.current = setTimeout(() => {',
            '    stopTyping(chat.id);',
            '  }, 2000);',
            '};',
          ]}
        />
        <CodeBlock
          file="backend/src/modules/gateway/handlers/presence.handler.ts (full file)"
          lines={[
            'handleTypingStart(socket: AuthSocket, data: { chatId: string }) {',
            '  socket.to(`chat:${data.chatId}`).emit(SOCKET_EVENTS.TYPING_START, {',
            '    chatId: data.chatId,',
            '    userId: socket.user.id,',
            "    displayName: socket.user.profile?.displayName || 'Someone',",
            '  });',
            '}',
            '',
            'handleTypingStop(socket: AuthSocket, data: { chatId: string }) {',
            '  socket.to(`chat:${data.chatId}`).emit(SOCKET_EVENTS.TYPING_STOP, {',
            '    chatId: data.chatId,',
            '    userId: socket.user.id,',
            '  });',
            '}',
          ]}
        />
        <Note>
          This is the <b>only</b> presence-adjacent event that uses a room broadcast (<code>socket.to(room)</code>) instead of{' '}
          <code>registry.emitToUser</code> — typing is inherently "everyone currently looking at this chat," which is exactly
          what a room represents.
        </Note>
        <CodeBlock
          file="frontend/src/components/chat/ChatView.tsx:477-486"
          lines={[
            'const getTypingText = () => {',
            '  if (typingUserIds.length === 0) return null;',
            '  const names = typingUserIds.map((userId) => {',
            '    const member = chat.members.find((m) => m.userId === userId);',
            '    return member?.user.profile?.displayName || "Someone";',
            '  });',
            '  if (names.length === 1) return `${names[0]} is typing...`;',
            '  if (names.length === 2) return `${names[0]} and ${names[1]} are typing...`;',
            '  return `${names.length} people are typing...`;',
            '};',
          ]}
        />
      </Step>
    </div>
  );
}
