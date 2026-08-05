import { CodeBlock, Step, Note, P } from '../CodeBlock';

export function GroupScenario() {
  return (
    <div>
      <Step n="1" title="Creating a group — no dedup check, creator becomes admin">
        <P>
          Unlike a direct chat, a group is always a brand-new row — there's no "does this group already exist" question to ask.
          The only bookkeeping is deduping the member list and making sure the creator is included.
        </P>
        <CodeBlock
          file="backend/src/modules/chats/chats.service.ts:245-278"
          lines={[
            'async createGroup(userId: string, dto: CreateGroupDto) {',
            '  const users = await this.prisma.user.findMany({ where: { id: { in: dto.memberIds } } });',
            '  if (users.length !== dto.memberIds.length) {',
            "    throw new BadRequestException('One or more users not found');",
            '  }',
            '',
            '  // Remove duplicates and add creator if not included',
            '  const uniqueMemberIds = [...new Set([userId, ...dto.memberIds])];',
            '',
            '  const chat = await this.prisma.chat.create({',
            '    data: {',
            '      type: ChatType.group,',
            '      name: dto.name,',
            '      avatarUrl: dto.avatarUrl,',
            '      createdBy: userId,',
            '      members: {',
            '        create: uniqueMemberIds.map((memberId) => ({',
            '          userId: memberId,',
            '          role: memberId === userId ? ChatMemberRole.admin : ChatMemberRole.member,',
            '        })),',
            '      },',
            '    },',
            '    include: { members: { include: { user: { include: { profile: true } } } } },',
            '  });',
            '',
            '  const formattedChat = ChatsMapper.toDto(chat, userId, 0);',
            "  this.eventEmitter.emit('chat.created', { chat: formattedChat, userIds: uniqueMemberIds });",
            '  return formattedChat;',
            '}',
          ]}
        />
        <Note>
          Same <code>chat.created</code> event as a direct chat, just with an N-length <code>userIds</code> array instead of a
          fixed pair — the gateway listener from the signup scenario doesn't need to know or care how many people that is.
        </Note>
      </Step>

      <Step n="2" title="Sending a message to a group runs through the exact same code as a direct chat">
        <P>
          This is worth calling out explicitly because it's easy to assume groups need special fan-out logic. They don't — go
          back to <code>MessageHandler.handleSend</code> from the previous scenario:
        </P>
        <CodeBlock
          file="backend/src/modules/gateway/handlers/message.handler.ts:72-78"
          lines={[
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
          There is no <code>if (chat.type === 'group')</code> branch anywhere in this file. <code>allMemberIds</code> is 2 items
          for a direct chat and N items for a group — the loop doesn't know or care which. One code path, two shapes of input.
        </Note>
      </Step>

      <Step n="3" title="Frontend: the only group-specific logic is display, not delivery">
        <P>
          Sender names above a bubble only make sense when there's more than one possible sender — so this is gated on chat
          type, and clustered so the name only shows once per consecutive run of messages from the same person.
        </P>
        <CodeBlock
          file="frontend/src/components/chat/ChatView.tsx:842-852"
          lines={[
            'const showSender =',
            '  chat.type === "group" &&',
            '  msg.senderId !== currentUserId &&',
            '  (!prevMsg || prevMsg.senderId !== msg.senderId);',
            '',
            'return (',
            '  <MessageBubble',
            '    key={msg.tempId || msg.id}',
            '    message={msg}',
            '    isOwn={msg.senderId === currentUserId}',
            '    showSender={showSender}',
            '  />',
            ');',
          ]}
        />
        <CodeBlock
          file="frontend/src/components/chat/MessageBubble.tsx:405-406"
          lines={['{/* Sender name for group chats */}', '{showSender && message.sender && (']}
        />
        <P>The chat list preview applies the same group-only prefix, so you can tell at a glance who sent the last message:</P>
        <CodeBlock
          file="frontend/src/components/chat/ChatList.tsx:164"
          lines={[
            "{chat.lastMessage.senderId === currentUserId ? '' :",
            "  (chat.type === 'group' ? (chat.lastMessage.senderName ? `${chat.lastMessage.senderName}: ` : '') : '')}",
          ]}
        />
      </Step>

      <Step n="4" title="What this means in practice">
        <P>
          Add a 10th person to a group chat and nothing on the backend changes shape — <code>getChatMemberIds</code> just
          returns 10 IDs instead of 9, and the same <code>forEach</code> loop delivers to all of them. The entire
          "group-ness" of a group chat lives in two places: the <code>ChatMemberRole</code> (admin vs member) at creation time,
          and the <code>showSender</code> display flag on the frontend. Everything else — presence, typing, delivery,
          optimistic UI — is identical to a 1-on-1 chat.
        </P>
      </Step>
    </div>
  );
}
