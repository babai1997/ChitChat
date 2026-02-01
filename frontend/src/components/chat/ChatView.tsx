import { useState, useEffect, useRef } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { 
  ArrowLeft, 
  MoreVertical, 
  Paperclip, 
  Smile, 
  Send, 
  Mic,
  User,
  Phone,
  Video
} from 'lucide-react';
import { chatApi } from '../../api';
import { useChatStore } from '../../stores';
import { useSocket } from '../../hooks';
import { MessageBubble } from './MessageBubble';
import { ChatViewSkeleton } from './ChatViewSkeleton';
import { ContactInfoModal } from './ContactInfoModal';
import { GroupInfoModal } from './GroupInfoModal';
import { useCall } from '../../contexts/CallContext';
import EmojiPicker, { type EmojiClickData, Theme } from 'emoji-picker-react';
import { Image, FileText, StopCircle, Trash2 } from 'lucide-react';
import type { Chat, Message } from '../../types';

interface ChatViewProps {
  chat: Chat;
  onBack: () => void;
  currentUserId: string;
}

export const ChatView = ({ chat, onBack, currentUserId }: ChatViewProps) => {
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isContactInfoOpen, setIsContactInfoOpen] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  
  const { messages, setMessages, addMessage, typingUsers, onlineUsers, lastSeen } = useChatStore();
  const { startTyping, stopTyping, joinChat, leaveChat } = useSocket();
  const { startCall } = useCall();
  
  const chatMessages = messages[chat.id] || [];
  const typingUserIds = typingUsers[chat.id] || [];

  // Fetch messages
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['messages', chat.id],
    queryFn: ({ pageParam }) => chatApi.getMessages(chat.id, pageParam, 50),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: undefined as string | undefined,
    staleTime: 5 * 60 * 1000, 
    gcTime: 10 * 60 * 1000, 
  });

  // Update store with fetched messages
  useEffect(() => {
    if (data?.pages) {
      const fetchedMessages = [...data.pages].reverse().flatMap((page) => page.messages);
      const currentMessages = useChatStore.getState().messages[chat.id] || [];
      const currentIds = new Set(currentMessages.map(m => m.id));
      const missingMessages = fetchedMessages.filter(m => !currentIds.has(m.id));
      
      if (missingMessages.length > 0) {
        const mergedMessages = [...missingMessages, ...currentMessages].sort((a, b) => 
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        setMessages(chat.id, mergedMessages);
      } else if (currentMessages.length === 0 && fetchedMessages.length > 0) {
         setMessages(chat.id, fetchedMessages);
      }
    }
  }, [data, chat.id, setMessages]);

  const { updateChat } = useChatStore();
  const { markAsRead } = useSocket();

  // Mark messages as read and clear unread count
  useEffect(() => {
    // Reset unread count in local store immediately
    if (chat.unreadCount > 0) {
      updateChat(chat.id, { unreadCount: 0 });
    }

    const unreadMessages = chatMessages.filter(
      (m) => m.senderId !== currentUserId && m.status !== 'read'
    );

    if (unreadMessages.length > 0) {
      const ids = unreadMessages.map((m) => m.id);
      markAsRead(chat.id, ids);
    }
  }, [chat.id, chat.unreadCount, chatMessages, currentUserId, markAsRead, updateChat]);

  useEffect(() => {
    joinChat(chat.id);
    return () => {
      leaveChat(chat.id);
    };
  }, [chat.id, joinChat, leaveChat]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages.length]);

  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessage(e.target.value);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    startTyping(chat.id);
    typingTimeoutRef.current = setTimeout(() => {
      stopTyping(chat.id);
    }, 2000);
  };

  // Close menus on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
      if (attachMenuRef.current && !attachMenuRef.current.contains(event.target as Node)) {
        setShowAttachMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Recording timer
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    setMessage((prev) => prev + emojiData.emoji);
  };

  const handleUploadAndSend = async (file: File, type: 'image' | 'video' | 'audio' | 'file') => {
    try {
      setIsSending(true);
      const attachment = await chatApi.uploadAttachment(chat.id, file);
      const newMessage = await chatApi.sendMessage(
        chat.id, 
        type === 'image' ? 'Image' : type === 'audio' ? 'Voice Message' : file.name, 
        type, 
        undefined, 
        [attachment]
      );
      addMessage(chat.id, newMessage);
      setShowAttachMenu(false);
    } catch (error) {
      console.error('Failed to send attachment:', error);
    } finally {
      setIsSending(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    let type: 'image' | 'video' | 'audio' | 'file' = 'file';
    if (file.type.startsWith('image/')) type = 'image';
    else if (file.type.startsWith('video/')) type = 'video';
    else if (file.type.startsWith('audio/')) type = 'audio';

    handleUploadAndSend(file, type);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const file = new File([blob], 'voice-message.webm', { type: 'audio/webm' });
        handleUploadAndSend(file, 'audio');
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
      setRecordingDuration(0);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      alert('Could not access microphone');
    }
  };

  const stopRecording = (cancel: boolean = false) => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      if (cancel) {
        mediaRecorder.ondataavailable = null;
        mediaRecorder.onstop = null;
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
      } else {
        mediaRecorder.stop();
      }
      setIsRecording(false);
      setMediaRecorder(null);
      setRecordingDuration(0);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSend = async () => {
    if (!message.trim() || isSending) return;
    const content = message.trim();
    setMessage('');
    setIsSending(true);
    stopTyping(chat.id);
    try {
      const newMessage = await chatApi.sendMessage(chat.id, content);
      addMessage(chat.id, newMessage);
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const getChatName = () => {
    if (chat.name) return chat.name;
    const otherMember = chat.members.find((m) => m.userId !== currentUserId);
    return otherMember?.user.profile?.displayName || 'Unknown';
  };

  const getChatAvatar = () => {
    if (chat.type === 'direct') {
      const otherMember = chat.members.find((m) => m.userId !== currentUserId);
      return otherMember?.user.profile?.avatarUrl || null;
    }
    return chat.avatarUrl || null;
  };

  const getTypingText = () => {
    if (typingUserIds.length === 0) return null;
    const names = typingUserIds.map((userId) => {
      const member = chat.members.find((m) => m.userId === userId);
      return member?.user.profile?.displayName || 'Someone';
    });
    if (names.length === 1) return `${names[0]} is typing...`;
    if (names.length === 2) return `${names[0]} and ${names[1]} are typing...`;
    return `${names.length} people are typing...`;
  };

  const getOnlineStatus = () => {
    if (chat.type === 'group') {
      const memberNames = chat.members
        .map(m => m.userId === currentUserId ? 'You' : (m.user.profile?.displayName || m.user.phone || 'Unknown'))
        .sort((a, b) => a === 'You' ? -1 : a.localeCompare(b));
      return memberNames.join(', ');
    }
    const otherMember = chat.members.find((m) => m.userId !== currentUserId);
    if (!otherMember) return 'Offline';
    
    // Check real-time online status from store
    if (onlineUsers.has(otherMember.userId)) {
      return 'Online';
    }
    
    const lastSeenTime = lastSeen[otherMember.userId] || otherMember.user.lastSeen;
    if (lastSeenTime) {
      const date = new Date(lastSeenTime);
      if (!isNaN(date.getTime())) {
         const today = new Date();
         const isToday = date.toDateString() === today.toDateString();
         const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
         
         return `Last seen ${isToday ? 'today' : date.toLocaleDateString()} at ${timeStr}`;
      }
    }
    
    return 'Offline';
  };

  // ... (typing text logic)

  // Group messages by date
  const groupMessagesByDate = (msgs: Message[]) => {
    const groups: { date: string; messages: Message[] }[] = [];
    let currentDate = '';
    
    msgs.forEach((msg) => {
      const msgDateObj = new Date(msg.createdAt);
      if (isNaN(msgDateObj.getTime())) {
         if (groups.length === 0 || groups[groups.length - 1].date !== 'Unknown') {
             groups.push({ date: 'Unknown', messages: [msg] });
         } else {
             groups[groups.length - 1].messages.push(msg);
         }
         return;
      }
      
      // Use ISO string (YYYY-MM-DD) for grouping to avoid locale issues
      const msgDate = msgDateObj.toISOString().split('T')[0];
      
      if (msgDate !== currentDate) {
        currentDate = msgDate;
        groups.push({ date: msgDate, messages: [msg] });
      } else {
        groups[groups.length - 1].messages.push(msg);
      }
    });
    
    return groups;
  };



  const formatDateHeader = (dateStr: string) => {
    if (!dateStr || dateStr === 'Unknown') return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  };

  const messageGroups = groupMessagesByDate(chatMessages);

  const buttonStyle = {
    padding: '8px', 
    borderRadius: '50%', 
    background: 'none', 
    border: 'none', 
    cursor: 'pointer', 
    color: '#8696a0', 
    display: 'flex', 
    alignItems: 'center', 
    justifyContent: 'center' 
  };
  
  const getOtherMember = () => {
     return chat.members.find((m) => m.userId !== currentUserId);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ 
        padding: '10px 16px', 
        backgroundColor: '#202c33', 
        display: 'flex', 
        alignItems: 'center', 
        gap: '12px', 
        borderBottom: '1px solid #2a3942',
        height: '60px'
      }}>
        <button 
          onClick={onBack}
          style={{ ...buttonStyle, marginLeft: '-8px' }}
          className="md-hidden"
        >
          <ArrowLeft size={20} />
        </button>
        
        {/* Clickable Header Area */}
        <div 
          onClick={() => setIsContactInfoOpen(true)}
          style={{ 
             display: 'flex', 
             alignItems: 'center', 
             gap: '12px', 
             flex: 1, 
             cursor: 'pointer',
             minWidth: 0
          }}
        >
          <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#2a3942', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {getChatAvatar() ? (
              <img src={getChatAvatar()!} alt={getChatName()} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <User size={20} color="#8696a0" />
            )}
          </div>
          
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontWeight: 500, color: '#e9edef', fontSize: '16px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', margin: 0 }}>
              {getChatName()}
            </h2>
            <p style={{ fontSize: '12px', color: '#8696a0', margin: 0 }}>
              {getTypingText() || getOnlineStatus()}
            </p>
          </div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button style={buttonStyle} onClick={() => startCall(chat.id, 'video')}>
            <Video size={20} />
          </button>
          <button style={buttonStyle} onClick={() => startCall(chat.id, 'audio')}>
            <Phone size={20} />
          </button>
          <button style={buttonStyle}>
            <MoreVertical size={20} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div 
        ref={messagesContainerRef}
        className="chat-bg"
        style={{ 
          flex: 1, 
          overflowY: 'auto', 
          padding: '16px 32px' 
        }}
      >
        {isLoading ? (
          <ChatViewSkeleton />
        ) : (
          <>
            {hasNextPage && (
              <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                <button
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                  style={{ color: '#25d366', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px' }}
                >
                  {isFetchingNextPage ? 'Loading...' : 'Load more messages'}
                </button>
              </div>
            )}
            
            {messageGroups.map((group) => (
              <div key={group.date}>
                {/* Date Header */}
                <div style={{ display: 'flex', justifyContent: 'center', margin: '16px 0' }}>
                  <span style={{ 
                    padding: '6px 12px', 
                    backgroundColor: '#1f2c34', 
                    borderRadius: '8px', 
                    fontSize: '12px', 
                    color: '#8696a0', 
                    boxShadow: '0 1px 2px rgba(0,0,0,0.2)' 
                  }}>
                    {formatDateHeader(group.date)}
                  </span>
                </div>
                
                {/* Messages */}
                {group.messages.map((msg, index) => {
                  const prevMsg = index > 0 ? group.messages[index - 1] : null;
                  const showSender = chat.type === 'group' && 
                    msg.senderId !== currentUserId &&
                    (!prevMsg || prevMsg.senderId !== msg.senderId);
                  
                  return (
                    <MessageBubble
                      key={msg.id}
                      message={msg}
                      isOwn={msg.senderId === currentUserId}
                      showSender={showSender}
                    />
                  );
                })}
              </div>
            ))}
            
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div style={{ 
        padding: '8px 16px', 
        backgroundColor: '#202c33', 
        display: 'flex', 
        alignItems: 'center', 
        gap: '8px', 
        borderTop: '1px solid #2a3942',
        position: 'relative'
      }}>
        {/* Emoji Picker */}
        {showEmojiPicker && (
          <div ref={emojiPickerRef} style={{ position: 'absolute', bottom: '70px', left: '20px', zIndex: 10 }}>
            <EmojiPicker 
              onEmojiClick={handleEmojiClick} 
              theme={Theme.DARK}
              lazyLoadEmojis={true}
            />
          </div>
        )}

        {/* Attachment Menu */}
        {showAttachMenu && (
          <div ref={attachMenuRef} style={{ 
            position: 'absolute', 
            bottom: '70px', 
            left: '60px', 
            zIndex: 10,
            backgroundColor: '#233138',
            borderRadius: '8px',
            padding: '8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
          }}>
             <button 
               onClick={() => fileInputRef.current?.click()}
               style={{ ...buttonStyle, borderRadius: '8px', justifyContent: 'flex-start', gap: '8px', width: '100%' }}
             >
               <Image size={20} color="#007bff" /> Photos & Videos
             </button>
             <button 
               onClick={() => fileInputRef.current?.click()}
               style={{ ...buttonStyle, borderRadius: '8px', justifyContent: 'flex-start', gap: '8px', width: '100%' }}
             >
               <FileText size={20} color="#7f66ff" /> Document
             </button>
          </div>
        )}

        <input 
          type="file" 
          ref={fileInputRef} 
          style={{ display: 'none' }} 
          onChange={handleFileSelect}
        />

        {isRecording ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '12px', color: '#e9edef' }}>
            <span style={{ color: '#ff5252', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#ff5252', animation: 'pulse 1s infinite' }} />
              {formatDuration(recordingDuration)}
            </span>
            <span style={{ flex: 1, color: '#8696a0', fontSize: '14px' }}>Recording...</span>
            <button onClick={() => stopRecording(true)} style={{ color: '#ff5252', background: 'none', border: 'none', cursor: 'pointer' }}>
              <Trash2 size={24} />
            </button>
            <button onClick={() => stopRecording(false)} style={{ color: '#25d366', background: 'none', border: 'none', cursor: 'pointer' }}>
              <StopCircle size={24} />
            </button>
          </div>
        ) : (
          <>
            <button 
              onClick={() => setShowEmojiPicker(!showEmojiPicker)} 
              style={{ ...buttonStyle, color: showEmojiPicker ? '#25d366' : '#8696a0' }}
            >
              <Smile size={24} />
            </button>
            <button 
              onClick={() => setShowAttachMenu(!showAttachMenu)} 
              style={{ ...buttonStyle, color: showAttachMenu ? '#25d366' : '#8696a0' }}
            >
              <Paperclip size={24} />
            </button>
            
            <input
              type="text"
              value={message}
              onChange={handleInputChange}
              onKeyPress={handleKeyPress}
              placeholder="Type a message"
              style={{
                flex: 1,
                backgroundColor: '#2a3942',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 16px',
                color: '#e9edef',
                fontSize: '15px',
                outline: 'none',
                height: '42px'
              }}
            />
            
            <button
              onClick={message.trim() ? handleSend : startRecording}
              disabled={isSending}
              style={{
                minWidth: '40px',
                height: '40px',
                borderRadius: '50%',
                backgroundColor: message.trim() || isRecording ? '#25d366' : '#2a3942', // Changing this logic to show green only for send
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: 'none',
                cursor: 'pointer',
                transition: 'background-color 0.2s ease',
                color: message.trim() ? 'white' : '#8696a0'
              }}
            >
              {message.trim() ? (
                <Send size={20} />
              ) : (
                <Mic size={20} />
              )}
            </button>
          </>
        )}
      </div>
      
      <style>{`
        @media (min-width: 1024px) {
          .md-hidden {
            display: none !important;
          }
        }
      `}</style>
      
      {/* Contact Info Modal */}
      {chat.type === 'direct' && getOtherMember() && (
        <ContactInfoModal
          isOpen={isContactInfoOpen}
          onClose={() => setIsContactInfoOpen(false)}
          user={{
            id: getOtherMember()!.userId,
            displayName: getOtherMember()!.user.profile?.displayName || 'Unknown',
            avatarUrl: getOtherMember()!.user.profile?.avatarUrl || null,
            about: getOtherMember()!.user.profile?.about || null,
            phone: getOtherMember()!.user.phone,
            email: getOtherMember()!.user.email
          }}
        />
      )}
      
      {/* Group Info Modal */}
      {chat.type === 'group' && (
        <GroupInfoModal
          isOpen={isContactInfoOpen}
          onClose={() => setIsContactInfoOpen(false)}
          chat={chat}
          currentUserId={currentUserId}
        />
      )}
    </div>
  );
};
