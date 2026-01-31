import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  MessageCircle, 
  Search, 
  MoreVertical, 
  MessageSquarePlus,
} from 'lucide-react';
import { chatApi } from '../api';
import { useAuthStore, useChatStore } from '../stores';
import { useSocket } from '../hooks';
import { ChatList } from '../components/chat/ChatList';
import { ChatView } from '../components/chat/ChatView';
import { NewChatModal } from '../components/chat/NewChatModal';
import { EmptyState } from '../components/common/EmptyState';
import { Sidebar } from '../components/common/Sidebar';
import type { Chat } from '../types';


export const HomePage = () => {
  const { user } = useAuthStore();
  const { chats, setChats, activeChat, setActiveChat } = useChatStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'chats' | 'status' | 'communities'>('chats');
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);

  // Initialize socket connection
  useSocket();

  // Fetch chats
  const { isLoading, refetch } = useQuery({
    queryKey: ['chats'],
    queryFn: chatApi.getChats,
    staleTime: 30000,
    refetchOnWindowFocus: true,
  });

  // Update store when query succeeds
  useEffect(() => {
    const fetchChats = async () => {
      try {
        const data = await chatApi.getChats();
        setChats(data);
      } catch (error) {
        console.error('Failed to fetch chats:', error);
      }
    };
    fetchChats();
  }, [setChats]);

  const handleChatSelect = (chat: Chat) => {
    setActiveChat(chat);
  };

  const handleChatCreated = (chat: Chat) => {
    setChats([chat, ...chats]);
    setActiveChat(chat);
    refetch();
  };

  const filteredChats = chats.filter((chat: Chat) => {
    if (!searchQuery) return true;
    const searchLower = searchQuery.toLowerCase();
    
    if (chat.name) {
      return chat.name.toLowerCase().includes(searchLower);
    }
    
    // For direct chats, search by member name
    const otherMember = chat.members.find((m) => m.userId !== user?.id);
    return otherMember?.user.profile?.displayName?.toLowerCase().includes(searchLower);
  });

  return (
    <div style={{ height: '100vh', display: 'flex', backgroundColor: '#111b21', overflow: 'hidden' }}>
      {/* Sidebar Navigation */}
      <Sidebar 
        activeTab={activeTab} 
        onTabChange={setActiveTab} 
        userProfile={user?.profile} 
      />

      {/* Secondary Sidebar (Chat List / Status / Communities) */}
      <div 
        style={{ 
          width: '100%', 
          maxWidth: '400px', 
          display: activeChat ? 'none' : 'flex',
          flexDirection: 'column', 
          borderRight: '1px solid #2a3942',
          height: '100%',
          backgroundColor: '#111b21'
        }}
        className={`md-flex ${activeChat ? 'hidden-mobile' : ''}`}
      >
        {activeTab === 'chats' && (
          <>
            {/* Header */}
            <div style={{ 
              padding: '10px 16px', 
              backgroundColor: '#111b21', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between', 
              height: '60px' 
            }}>
              <h1 style={{ fontSize: '22px', fontWeight: 'bold', color: '#e9edef' }}>Chats</h1>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button 
                  onClick={() => setIsNewChatModalOpen(true)}
                  title="New Chat"
                  style={{ padding: '8px', borderRadius: '50%', background: 'none', border: 'none', cursor: 'pointer', color: '#aebac1' }}
                >
                  <MessageSquarePlus size={20} />
                </button>
                <button 
                  style={{ padding: '8px', borderRadius: '50%', background: 'none', border: 'none', cursor: 'pointer', color: '#aebac1' }}
                >
                  <MoreVertical size={20} />
                </button>
              </div>
            </div>

            {/* Search */}
            <div style={{ padding: '0 12px 8px 12px', backgroundColor: '#111b21' }}>
              <div style={{ position: 'relative' }}>
                <Search 
                  size={18} 
                  style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#8696a0' }} 
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search or start new chat"
                  style={{
                    width: '100%',
                    backgroundColor: '#202c33',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 16px 8px 40px',
                    color: '#e9edef',
                    fontSize: '14px',
                    outline: 'none',
                    height: '36px'
                  }}
                />
              </div>
            </div>

            {/* Chat List */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {isLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '128px', color: '#8696a0' }}>
                  Loading chats...
                </div>
              ) : filteredChats.length > 0 ? (
                <ChatList 
                  chats={filteredChats} 
                  activeChat={activeChat}
                  onChatSelect={handleChatSelect}
                  currentUserId={user?.id || ''}
                />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '256px', color: '#8696a0' }}>
                  <MessageCircle size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
                  <p>{searchQuery ? 'No chats found' : 'No conversations yet'}</p>
                  <button 
                    onClick={() => setIsNewChatModalOpen(true)}
                    style={{ 
                      marginTop: '12px', 
                      backgroundColor: '#25d366', 
                      color: 'white', 
                      border: 'none', 
                      padding: '8px 16px', 
                      borderRadius: '20px', 
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: '14px'
                    }}
                  >
                    Start a new chat
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {/* Status Tab Placeholder */}
        {activeTab === 'status' && (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8696a0' }}>
            <p>Status updates coming soon</p>
          </div>
        )}

        {/* Communities Tab Placeholder */}
        {activeTab === 'communities' && (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8696a0' }}>
            <p>Communities coming soon</p>
          </div>
        )}
      </div>

      {/* Main Chat Area */}
      <div 
        style={{ 
          flex: 1, 
          display: activeChat ? 'flex' : 'none',
          flexDirection: 'column', 
          height: '100%',
          backgroundColor: '#0b141a',
          position: 'relative'
        }}
        className={`md-chat-area ${!activeChat ? 'hidden-mobile' : ''}`}
      >
        {activeChat ? (
          <ChatView 
            chat={activeChat} 
            onBack={() => setActiveChat(null)}
            currentUserId={user?.id || ''}
          />
        ) : (
          <EmptyState />
        )}
      </div>

      <style>{`
        @media (min-width: 768px) {
          .md-flex {
            display: flex !important;
          }
          .hidden-mobile {
            display: flex !important;
          }
          .md-chat-area {
            display: flex !important;
          }
        }
        @media (max-width: 767px) {
          .hidden-mobile {
            display: none !important;
          }
        }
      `}</style>
      
      {/* New Chat Modal */}
      <NewChatModal 
        isOpen={isNewChatModalOpen}
        onClose={() => setIsNewChatModalOpen(false)}
        onChatCreated={handleChatCreated}
        currentUserId={user?.id || ''}
      />
    </div>
  );
};
