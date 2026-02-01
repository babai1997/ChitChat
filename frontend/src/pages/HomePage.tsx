import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  MessageCircle, 
  Search, 
  MoreVertical, 
  MessageSquarePlus,
  CircleDashed,
  Users,
  Phone,
  Camera,
  ArrowLeft
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { chatApi } from '../api';
import { useAuthStore, useChatStore } from '../stores';
import { useSocket } from '../hooks';
import { ChatList } from '../components/chat/ChatList';
import { ChatView } from '../components/chat/ChatView';
import { NewChatModal } from '../components/chat/NewChatModal';
import { SettingsSidebar } from '../components/chat/SettingsSidebar';
import { EmptyState } from '../components/common/EmptyState';
import { Sidebar } from '../components/common/Sidebar';
import type { Chat } from '../types';


interface BottomNavProps {
  activeTab: 'chats' | 'status' | 'communities';
  setActiveTab: (tab: 'chats' | 'status' | 'communities') => void;
}

const BottomNav = ({ activeTab, setActiveTab }: BottomNavProps) => (
  <div style={{
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '60px',
    backgroundColor: '#202c33',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderTop: '1px solid #2a3942',
    zIndex: 20
  }}>
    <button 
      onClick={() => setActiveTab('chats')}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', background: 'none', border: 'none', color: activeTab === 'chats' ? '#00a884' : '#8696a0', flex: 1 }}
    >
      <div style={{ position: 'relative' }}>
        <MessageCircle size={24} strokeWidth={activeTab === 'chats' ? 2.5 : 2} />
        {activeTab === 'chats' && <div style={{ position: 'absolute', top: -2, right: -2, width: '8px', height: '8px', backgroundColor: '#00a884', borderRadius: '50%' }} />}
      </div>
      <span style={{ fontSize: '12px', fontWeight: 500 }}>Chats</span>
    </button>
    
    <button 
      onClick={() => setActiveTab('status')}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', background: 'none', border: 'none', color: activeTab === 'status' ? '#00a884' : '#8696a0', flex: 1 }}
    >
       <CircleDashed size={24} strokeWidth={activeTab === 'status' ? 2.5 : 2} />
       <span style={{ fontSize: '12px', fontWeight: 500 }}>Updates</span>
    </button>

    <button 
      onClick={() => setActiveTab('communities')}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', background: 'none', border: 'none', color: activeTab === 'communities' ? '#00a884' : '#8696a0', flex: 1 }}
    >
      <Users size={24} strokeWidth={activeTab === 'communities' ? 2.5 : 2} />
      <span style={{ fontSize: '12px', fontWeight: 500 }}>Communities</span>
    </button>

    <button 
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', background: 'none', border: 'none', color: '#8696a0', flex: 1 }}
    >
      <Phone size={24} />
      <span style={{ fontSize: '12px', fontWeight: 500 }}>Calls</span>
    </button>
  </div>
);

export const HomePage = () => {
  const { user } = useAuthStore();
  const { chats, setChats, activeChat, setActiveChat } = useChatStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'chats' | 'status' | 'communities'>('chats');
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const navigate = useNavigate();
  const { logout } = useAuthStore();

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setShowMenu(false);
    if (showMenu) {
      document.addEventListener('click', handleClickOutside);
    }
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [showMenu]);

  // Initialize socket connection
  useSocket();

  // Screen size detection for responsive layout
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
      {/* Sidebar Navigation - Desktop/Tablet only */}
      {!isMobile && (
        <Sidebar 
          activeTab={activeTab} 
          onTabChange={setActiveTab} 
          userProfile={user?.profile}
          onSettingsClick={() => setSettingsOpen(true)}
        />
      )}

      {/* Secondary Sidebar (Chat List / Status / Communities / Settings) */}
      <div 
        style={{ 
          width: '100%', 
          maxWidth: isMobile ? '100%' : '400px', 
          display: isMobile && activeChat ? 'none' : 'flex',
          flexDirection: 'column', 
          borderRight: '1px solid #2a3942',
          height: '100%',
          backgroundColor: '#111b21',
          position: 'relative', // Ensure tabs can be positioned if needed
          zIndex: 10
        }}
      >
        {settingsOpen ? (
           <SettingsSidebar onBack={() => setSettingsOpen(false)} />
        ) : (
          activeTab === 'chats' && (
          <>
            {/* Mobile Header (WhatsApp Style) */}
            {isMobile && (
              <div style={{ 
                padding: '10px 16px', 
                backgroundColor: '#202c33', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between', 
                height: '40px', // Decreased height
                borderBottom: '1px solid #2a3942'
              }}>
                <h1 style={{ fontSize: '20px', fontWeight: 'bold', color: '#8696a0' }}>WhatsApp</h1>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                   <button style={{ background: 'none', border: 'none', color: '#aebac1', padding: 0 }}><Camera size={22} /></button>
                   <div style={{ position: 'relative' }}>
                     <button 
                        onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
                        style={{ background: 'none', border: 'none', color: '#aebac1', padding: 0, cursor: 'pointer' }}
                     >
                       <MoreVertical size={22} />
                     </button>
                     {/* Mobile Dropdown Menu */}
                     {showMenu && (
                        <div style={{
                          position: 'absolute',
                          top: '100%',
                          right: 0,
                          backgroundColor: '#233138',
                          borderRadius: '4px',
                          padding: '8px 0',
                          minWidth: '180px',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                          zIndex: 50,
                          marginTop: '8px'
                        }}>
                          <button onClick={() => setSettingsOpen(true)} style={{ width: '100%', padding: '10px 20px', textAlign: 'left', background: 'none', border: 'none', color: '#e9edef', fontSize: '15px', cursor: 'pointer' }} className="hover:bg-[#111b21]">Settings</button>
                          <button onClick={() => { logout(); navigate('/login'); }} style={{ width: '100%', padding: '10px 20px', textAlign: 'left', background: 'none', border: 'none', color: '#e9edef', fontSize: '15px', cursor: 'pointer' }} className="hover:bg-[#111b21]">Log out</button>
                        </div>
                     )}
                   </div>
                </div>
              </div>
            )}

            {/* Desktop/Tablet Header */}
            {!isMobile && (
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
                  <div style={{ position: 'relative' }}>
                    <button 
                      onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
                      style={{ padding: '8px', borderRadius: '50%', background: 'none', border: 'none', cursor: 'pointer', color: '#aebac1' }}
                    >
                      <MoreVertical size={20} />
                    </button>
                    {/* Desktop Dropdown Menu */}
                     {showMenu && (
                        <div style={{
                          position: 'absolute',
                          top: '100%',
                          right: 0,
                          backgroundColor: '#233138',
                          borderRadius: '4px',
                          padding: '8px 0',
                          minWidth: '200px',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                          zIndex: 50,
                          marginTop: '4px'
                        }}>
                          <button style={{ width: '100%', padding: '10px 24px', textAlign: 'left', background: 'none', border: 'none', color: '#e9edef', fontSize: '14px', cursor: 'pointer' }}>New group</button>
                          <button style={{ width: '100%', padding: '10px 24px', textAlign: 'left', background: 'none', border: 'none', color: '#e9edef', fontSize: '14px', cursor: 'pointer' }}>Starred messages</button>
                          <button onClick={() => setSettingsOpen(true)} style={{ width: '100%', padding: '10px 24px', textAlign: 'left', background: 'none', border: 'none', color: '#e9edef', fontSize: '14px', cursor: 'pointer' }}>Settings</button>
                          <button onClick={() => { logout(); navigate('/login'); }} style={{ width: '100%', padding: '10px 24px', textAlign: 'left', background: 'none', border: 'none', color: '#e9edef', fontSize: '14px', cursor: 'pointer' }}>Log out</button>
                        </div>
                     )}
                  </div>
                </div>
              </div>
            )}

            {/* Search (Desktop/Tablet or Mobile sub-header) */}
            <div style={{ padding: '8px 12px', backgroundColor: isMobile ? '#111b21' : '#111b21' }}>
              <div style={{ position: 'relative' }}>
                <button 
                  style={{
                    position: 'absolute', 
                    left: '12px', 
                    top: '50%', // Centers vertically relative to container
                    transform: 'translateY(-50%)', 
                    zIndex: 10,
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    color: isSearchFocused || searchQuery ? '#00a884' : '#8696a0',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  {isSearchFocused || searchQuery ? (
                    <ArrowLeft size={18} onClick={() => { setSearchQuery(''); setIsSearchFocused(false); }} />
                  ) : (
                    <Search size={18} />
                  )}
                </button>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setIsSearchFocused(true)}
                  onBlur={() => !searchQuery && setIsSearchFocused(false)}
                  placeholder="Search or start new chat"
                  style={{
                    width: '100%',
                    backgroundColor: '#202c33',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 16px 8px 65px', // Adjusted left padding for icon
                    color: '#e9edef',
                    fontSize: '14px',
                    outline: 'none',
                    height: '40px', // Increased height
                    borderBottom: isSearchFocused ? '1px solid #00a884' : 'none' // Green border effect (bottom only, or could be full border)
                  }}
                />
              </div>
            </div>

            {/* Mobile FAB (Floating Action Button) for New Chat */}
            {isMobile && (
              <button 
                onClick={() => setIsNewChatModalOpen(true)}
                style={{
                  position: 'absolute',
                  bottom: '80px', // Adjusted to 80px
                  right: '24px',
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  backgroundColor: '#00a884',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: 'none',
                  boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
                  zIndex: 20
                }}
              >
                <MessageSquarePlus size={24} color="white" />
              </button>
            )}

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
                </div>
              )}
            </div>
            
            {/* Render Bottom Nav on Mobile */}
             {isMobile && <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />}
          </>
        ) 
      )}

        {/* Status Tab Placeholder */}
        {!settingsOpen && activeTab === 'status' && (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
             <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8696a0' }}>
               <p>Status updates coming soon</p>
             </div>
              {isMobile && <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />}
          </div>
        )}

        {/* Communities Tab Placeholder */}
        {!settingsOpen && activeTab === 'communities' && (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
             <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8696a0' }}>
               <p>Communities coming soon</p>
             </div>
             {isMobile && <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />}
          </div>
        )}
      </div>

      {/* Main Chat Area */}
      <div 
        style={{ 
          flex: 1, 
          display: isMobile && !activeChat ? 'none' : 'flex',
          flexDirection: 'column', 
          height: '100%',
          backgroundColor: '#0b141a',
          position: 'relative'
        }}
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
