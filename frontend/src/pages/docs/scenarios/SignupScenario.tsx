import { CodeBlock, Step, Note, P } from '../CodeBlock';

export function SignupScenario() {
  return (
    <div>
      <Step n="1" title="User clicks &quot;Continue with Google&quot;">
        <P>The button is Google's own component; we only supply the success callback.</P>
        <CodeBlock
          file="frontend/src/pages/LoginPage.tsx:164-172"
          lines={[
            '<GoogleLogin',
            '  onSuccess={handleGoogleSuccess}',
            "  onError={() => toast.error('Google Sign-In failed')}",
            '  theme="filled_black"',
            '  shape="circle"',
            '  size="large"',
            '  width="300px"',
            '  text="continue_with"',
            '/>',
          ]}
        />
      </Step>

      <Step n="2" title="Frontend sends the Google credential to the backend">
        <CodeBlock
          file="frontend/src/pages/LoginPage.tsx:14-30"
          lines={[
            'const handleGoogleSuccess = async (credentialResponse: CredentialResponse) => {',
            '  if (!credentialResponse.credential) {',
            "    toast.error('Google Sign-In failed: No credential');",
            '    return;',
            '  }',
            '',
            '  setIsGoogleLoading(true);',
            '  try {',
            '    const response = await authApi.googleAuth(credentialResponse.credential);',
            '    login(response.accessToken, response.refreshToken, response.user, response.isNewUser);',
            "    toast.success('Logged in with Google!');",
            '',
            '    if (response.isNewUser || !response.user.profile?.displayName) {',
            "      navigate('/setup-profile');",
            '    } else {',
            "      navigate('/');",
            '    }',
          ]}
        />
        <CodeBlock
          file="frontend/src/api/auth.ts:15-18"
          lines={[
            'googleAuth: async (idToken: string): Promise<AuthResponse> => {',
            "  const response = await api.post('/auth/google', { idToken });",
            '  return response.data;',
            '},',
          ]}
        />
      </Step>

      <Step n="3" title="Backend verifies the token and looks for an existing account">
        <P>
          Public route (no JWT guard needed — you don't have a token yet). It checks for a match by <code>email</code> <i>or</i> an
          existing <code>AuthProvider(google, providerId)</code> row — this is what lets someone who signed up via OTP later add
          Google as a second sign-in method, instead of ending up with two separate accounts.
        </P>
        <CodeBlock
          file="backend/src/modules/auth/auth.controller.ts:58-65"
          lines={[
            '@Public()',
            "@Post('google')",
            '@HttpCode(HttpStatus.OK)',
            "@ApiOperation({ summary: 'Sign in with Google ID token' })",
            'async googleAuth(@Body() dto: GoogleAuthDto) {',
            '  return this.authService.googleAuth(dto);',
            '}',
          ]}
        />
        <CodeBlock
          file="backend/src/modules/auth/auth.service.ts:144-159"
          lines={[
            'let user = await this.prisma.user.findFirst({',
            '  where: {',
            '    OR: [',
            '      { email: googleUser.email },',
            '      {',
            '        authProviders: {',
            '          some: {',
            '            provider: AuthProviderType.google,',
            '            providerId: googleUser.sub,',
            '          },',
            '        },',
            '      },',
            '    ],',
            '  },',
            '  include: { profile: true, authProviders: true },',
            '});',
          ]}
        />
      </Step>

      <Step n="4" title="No match — a brand-new User + AuthProvider + Profile is created in one transaction">
        <CodeBlock
          file="backend/src/modules/auth/auth.service.ts:163-186"
          lines={[
            'let isNewUser = false;',
            '',
            'if (!user) {',
            '  isNewUser = true;',
            '  user = await this.prisma.user.create({',
            '    data: {',
            '      email: googleUser.email,',
            '      isVerified: true,',
            '      authProviders: {',
            '        create: {',
            '          provider: AuthProviderType.google,',
            '          providerId: googleUser.sub,',
            '          metadata: { name: googleUser.name, picture: googleUser.picture },',
            '        },',
            '      },',
            '      profile: {',
            '        create: {',
            '          displayName: googleUser.name,',
            '          avatarUrl: googleUser.picture,',
            "          about: 'Hey there! I am using ChitChat',",
            '        },',
            '      },',
            '    },',
            '    include: { profile: true, authProviders: true },',
            '  });',
            '}',
          ]}
        />
        <Note>
          This is exactly the shape we drew in the <b>ERD</b>: <code>User 1—0..1 Profile</code> and <code>User 1—many AuthProvider</code>.
          One Google login produces one row in each of three tables.
        </Note>
      </Step>

      <Step n="5" title="Tokens land in the persisted auth store; the app decides where to send you">
        <CodeBlock
          file="frontend/src/stores/authStore.ts:69-77"
          lines={[
            'login: (accessToken, refreshToken, user, isNewUser) => {',
            '  set({',
            '    accessToken,',
            '    refreshToken,',
            '    user,',
            '    isAuthenticated: true,',
            '    isNewUser,',
            '  });',
            '},',
          ]}
        />
        <P>
          <code>isAuthenticated</code> flipping to <code>true</code> is what triggers <code>SocketProvider</code> to connect the
          WebSocket (see the <b>WebSocket & presence</b> tab) — the socket comes up automatically the instant login succeeds, no
          extra step. If it's your first time (<code>isNewUser</code>) or you have no display name yet, you land on{' '}
          <code>/setup-profile</code> instead of the chat list.
        </P>
      </Step>

      <Step n="6" title="Finding someone — debounced search as you type">
        <CodeBlock
          file="frontend/src/components/chat/NewChatModal.tsx:69-84"
          lines={[
            'useEffect(() => {',
            '  const timer = setTimeout(async () => {',
            '    if (query.trim().length >= 2) {',
            '      setIsLoading(true);',
            '      try {',
            '        const results = await usersApi.searchUsers(query);',
            '        setSearchResults(results.filter(u => u.id !== currentUserId));',
            '      } finally {',
            '        setIsLoading(false);',
            '      }',
            '    } else {',
            '      setSearchResults([]);',
            '    }',
            '  }, 500);',
            '  return () => clearTimeout(timer);',
            '}, [query, currentUserId]);',
          ]}
        />
        <P>
          That hits <code>GET /users/search?q=...</code> — a normal authenticated REST call, nothing to do with sockets yet.
        </P>
        <CodeBlock
          file="backend/src/modules/users/users.service.ts:36-58"
          lines={[
            'async searchUsers(query: string, currentUserId: string, limit = 20) {',
            '  return this.prisma.user.findMany({',
            '    where: {',
            '      AND: [',
            '        { id: { not: currentUserId } },',
            '        { isVerified: true },',
            '        {',
            '          OR: [',
            "            { phone: { contains: query } },",
            "            { email: { contains: query, mode: 'insensitive' } },",
            '            { profile: { displayName: { contains: query, mode: "insensitive" } } },',
            '          ],',
            '        },',
            '      ],',
            '    },',
            '    include: { profile: true },',
            '    take: limit,',
            '  });',
            '}',
          ]}
        />
      </Step>

      <Step n="7" title="Starting the chat — dedup check first, so you never get two threads with the same person">
        <CodeBlock
          file="backend/src/modules/chats/chats.service.ts:181-198"
          lines={[
            '// Check if direct chat already exists between these users',
            'const existingChat = await this.prisma.chat.findFirst({',
            '  where: {',
            '    type: ChatType.direct,',
            '    AND: [',
            '      { members: { some: { userId } } },',
            '      { members: { some: { userId: dto.participantId } } },',
            '    ],',
            '  },',
            '  include: { members: { include: { user: { include: { profile: true } } } } },',
            '});',
            '',
            'if (existingChat) {',
            '  // ...compute unread count and return the existing chat, no new row',
            '  return ChatsMapper.toDto(existingChat, userId, unreadCount);',
            '}',
          ]}
        />
        <CodeBlock
          file="backend/src/modules/chats/chats.service.ts:213-238"
          lines={[
            'const chat = await this.prisma.chat.create({',
            '  data: {',
            '    type: ChatType.direct,',
            '    createdBy: userId,',
            '    members: {',
            '      create: [',
            '        { userId, role: ChatMemberRole.member },',
            '        { userId: dto.participantId, role: ChatMemberRole.member },',
            '      ],',
            '    },',
            '  },',
            '  include: { members: { include: { user: { include: { profile: true } } } } },',
            '});',
            '',
            'const formattedChat = ChatsMapper.toDto(chat, userId, 0);',
            '',
            "this.eventEmitter.emit('chat.created', {",
            '  chat: formattedChat,',
            '  userIds: [userId, dto.participantId],',
            '});',
          ]}
        />
      </Step>

      <Step n="8" title="The gateway hears chat.created and pushes it to the OTHER user's live socket(s)">
        <P>
          This is a plain in-process Nest <code>EventEmitter</code>, not a socket event — it's how an HTTP controller (no socket
          context at all) reaches into the gateway to trigger a push.
        </P>
        <CodeBlock
          file="backend/src/modules/gateway/chat.gateway.ts:362-382"
          lines={[
            "@OnEvent('chat.created')",
            'handleChatCreated(payload: { chat: { id: string }; userIds: string[] }) {',
            '  const { chat, userIds } = payload;',
            '',
            '  userIds.forEach((userId) => {',
            '    const socketIds = this.registry.getSocketIds(userId);',
            '    socketIds.forEach((socketId) => {',
            '      const socket = this.server.sockets.sockets.get(socketId);',
            '      if (socket) {',
            '        void socket.join(`chat:${chat.id}`);',
            '        socket.emit(SOCKET_EVENTS.CHAT_NEW, chat);',
            '      }',
            '    });',
            '  });',
            '}',
          ]}
        />
        <Note>
          Both people get their sockets joined to the new <code>chat:&#123;id&#125;</code> room here — this is the only place a
          socket joins a room <i>outside</i> of the initial connection sequence.
        </Note>
      </Step>

      <Step n="9" title="Other user's screen — the chat list updates itself, no page refresh">
        <CodeBlock
          file="frontend/src/shared/socket/handlers/chat.handlers.ts (full file)"
          lines={[
            "const handleChatNew = (chat: Chat) => {",
            "  useChatStore.getState().upsertChat(chat);",
            '};',
            '',
            'export function registerChatHandlers(): () => void {',
            '  socketManager.on(SOCKET_EVENTS.CHAT_NEW, handleChatNew as any);',
            '  return () => socketManager.off(SOCKET_EVENTS.CHAT_NEW, handleChatNew as any);',
            '}',
          ]}
        />
        <P>
          <code>upsertChat</code> inserts if new, updates if it already exists — <code>ChatList</code> reads straight from that
          store, so the new conversation just appears.
        </P>
      </Step>
    </div>
  );
}
