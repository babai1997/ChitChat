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
  ArrowLeft,
  Settings,
  LogOut,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { chatApi } from '../api';
import { decryptMessagesInPlace } from '../services/e2eeSessions';
import { useAuthStore, useChatStore } from '../stores';
import { useSocket } from '../hooks';
import { ChatList } from '../components/chat/ChatList';
import { CallList } from '../components/call/CallList';
import { MeetingsPanel } from '../components/call/MeetingsPanel';
import { CallInfoView } from '../components/call/CallInfoView';
import { ChatView } from '../components/chat/ChatView';
import { NewChatModal } from '../components/chat/NewChatModal';
import { SettingsSidebar } from '../components/chat/SettingsSidebar';
import { EmptyState } from '../components/common/EmptyState';
import { Sidebar } from '../components/common/Sidebar';
import { UnapprovedDeviceBanner } from '../components/common/UnapprovedDeviceBanner';
import type { Chat } from '../types';
import { ChatListSkeleton } from '../components/chat/ChatListSkeleton';


interface BottomNavProps {
  activeTab: 'chats' | 'status' | 'communities' | 'calls';
  setActiveTab: (tab: 'chats' | 'status' | 'communities' | 'calls') => void;
}

const BottomNav = ({ activeTab, setActiveTab }: BottomNavProps) => (
  <div style={{
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '60px',
    backgroundColor: 'var(--color-surface)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderTop: '1px solid var(--color-border)',
    zIndex: 20
  }}>
    <button 
      onClick={() => setActiveTab('chats')}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', background: 'none', border: 'none', color: activeTab === 'chats' ? 'var(--color-accent)' : 'var(--color-text-secondary)', flex: 1 }}
    >
      <div style={{ position: 'relative' }}>
        <MessageCircle size={24} strokeWidth={activeTab === 'chats' ? 2.5 : 2} />
        {activeTab === 'chats' && <div style={{ position: 'absolute', top: -2, right: -2, width: '8px', height: '8px', backgroundColor: 'var(--color-accent)', borderRadius: '50%' }} />}
      </div>
      <span style={{ fontSize: '12px', fontWeight: 500 }}>Chats</span>
    </button>
    
    <button 
      onClick={() => setActiveTab('status')}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', background: 'none', border: 'none', color: activeTab === 'status' ? 'var(--color-accent)' : 'var(--color-text-secondary)', flex: 1 }}
    >
       <CircleDashed size={24} strokeWidth={activeTab === 'status' ? 2.5 : 2} />
       <span style={{ fontSize: '12px', fontWeight: 500 }}>Updates</span>
    </button>

    <button 
      onClick={() => setActiveTab('communities')}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', background: 'none', border: 'none', color: activeTab === 'communities' ? 'var(--color-accent)' : 'var(--color-text-secondary)', flex: 1 }}
    >
      <Users size={24} strokeWidth={activeTab === 'communities' ? 2.5 : 2} />
      <span style={{ fontSize: '12px', fontWeight: 500 }}>Communities</span>
    </button>

    <button 
      onClick={() => setActiveTab('calls')}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', background: 'none', border: 'none', color: activeTab === 'calls' ? 'var(--color-accent)' : 'var(--color-text-secondary)', flex: 1 }}
    >
      <Phone size={24} strokeWidth={activeTab === 'calls' ? 2.5 : 2} />
      <span style={{ fontSize: '12px', fontWeight: 500 }}>Calls</span>
    </button>
  </div>
);

export const HomePage = () => {
  const { user } = useAuthStore();
  const { chats, setChats, activeChat, setActiveChat } = useChatStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'chats' | 'status' | 'communities' | 'calls'>('chats');
  const [activeCallInfoId, setActiveCallInfoId] = useState<string | null>(null);
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [newChatStartsInGroupMode, setNewChatStartsInGroupMode] = useState(false);
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
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Fetch chats
  const { data: chatsData, isLoading, refetch } = useQuery({
    queryKey: ['chats', user?.id],
    queryFn: chatApi.getChats,
    staleTime: 30000,
    refetchOnWindowFocus: true,
    enabled: !!user?.id,
  });

  // Update store when query succeeds.
  // Merge carefully: if the user already cleared a badge locally (unreadCount=0),
  // don't let a racing server refetch resurrect it before lastReadAt has committed.
  useEffect(() => {
    if (!chatsData) return;
    let cancelled = false;

    (async () => {
      // This query refetches on every window focus — including every time
      // you alt-tab between two test sessions — so an encrypted chat's
      // lastMessage.cipher has to be decrypted every time it comes back,
      // not just on first load. decryptMessagesInPlace checks the
      // persistent plaintext cache first, so this is a no-op for messages
      // already resolved (including the sender's own, seeded at send time).
      // LastMessage carries no chatId of its own, and this batch spans every
      // chat (mixed direct/group) in one pass — tag each IN PLACE (not a
      // copy) with its chatId, since decryptMessagesInPlace's whole
      // contract is mutating the same object that `merged`/setChats below
      // ends up using; a spread copy here would decrypt a throwaway clone
      // and leave chatsData's actual lastMessage undecrypted.
      const groupChatIds = new Set(
        chatsData.filter((c) => c.type === 'group' || c.type === 'meeting').map((c) => c.id),
      );
      const lastMessages = chatsData
        .filter((c) => !!c.lastMessage)
        .map((c) => {
          (c.lastMessage as unknown as { chatId: string }).chatId = c.id;
          return c.lastMessage!;
        });
      await decryptMessagesInPlace(lastMessages, (chatId) => groupChatIds.has(chatId));
      if (cancelled) return;

      const currentChats = useChatStore.getState().chats;
      const merged = chatsData.map((serverChat) => {
        const local = currentChats.find((c) => c.id === serverChat.id);
        return {
          ...serverChat,
          unreadCount: local?.unreadCount === 0 ? 0 : (serverChat.unreadCount ?? 0),
        };
      });
      setChats(merged);
    })();

    return () => {
      cancelled = true;
    };
  }, [chatsData, setChats]);

  const handleChatSelect = (chat: Chat) => {
    setActiveChat(chat);
  };

  const handleCallChatSelect = (chatId: string) => {
    setActiveCallInfoId(chatId);
  };

  const handleMessageClickFromCallInfo = async (chatId: string) => {
    const chat = chats.find(c => c.id === chatId);
    if (chat) {
       setActiveChat(chat);
       setActiveTab('chats');
    } else {
       try {
         const fetchedChat = await chatApi.getChat(chatId);
         setChats([fetchedChat, ...chats]);
         setActiveChat(fetchedChat);
         setActiveTab('chats');
       } catch (error) {
         console.error('Failed to load chat from call record', error);
       }
    }
  };

  const handleDeleteChat = async (chat: Chat) => {
    const previousChats = chats;
    const previousActiveChat = activeChat;
    setChats(chats.filter((c) => c.id !== chat.id));
    if (activeChat?.id === chat.id) setActiveChat(null);
    try {
      await chatApi.deleteChat(chat.id);
    } catch (error) {
      console.error('Failed to delete chat:', error);
      toast.error('Failed to delete chat');
      setChats(previousChats);
      setActiveChat(previousActiveChat);
    }
  };

  const handleChatCreated = (chat: Chat) => {
    setChats([chat, ...chats.filter(c => c.id !== chat.id)]);
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
  }).sort((a, b) => {
    const timeA = new Date(a.updatedAt || a.createdAt).getTime();
    const timeB = new Date(b.updatedAt || b.createdAt).getTime();
    return timeB - timeA;
  });

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--color-bg)', overflow: 'hidden' }}>
      {/* Desktop Top Navigation Bar */}
      {!isMobile && (
        <div style={{
          height: '48px',
          backgroundColor: 'var(--color-surface)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingLeft: '16px',
          paddingRight: '24px',
          borderBottom: '1px solid var(--color-border)',
          flexShrink: 0
        }}>
          {/* Logo and Name */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-secondary) 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(108, 93, 216, 0.3)'
            }}>
              <MessageCircle size={18} color="var(--color-white)" strokeWidth={2.5} />
            </div>
            <span style={{ 
              fontSize: '18px', 
              fontWeight: 600, 
              color: 'var(--color-text-primary)',
              letterSpacing: '-0.3px'
            }}>
              ChitChat
            </span>
          </div>

          {/* Right side - could add user actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
              {user?.profile?.displayName && `Welcome, ${user.profile.displayName}`}
            </span>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
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
          borderRight: '1px solid var(--color-border)',
          height: '100%',
          backgroundColor: 'var(--color-bg)',
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
                backgroundColor: 'var(--color-surface)', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between', 
                height: '40px', // Decreased height
                borderBottom: '1px solid var(--color-border)'
              }}>
                <h1 style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--color-text-secondary)' }}>ChitChat</h1>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                   <button style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', padding: 0 }}><Camera size={22} /></button>
                   <div style={{ position: 'relative' }}>
                     <button 
                        onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
                        style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', padding: 0, cursor: 'pointer' }}
                     >
                       <MoreVertical size={22} />
                     </button>
                     {/* Mobile Dropdown Menu */}
                     {showMenu && (
                        <div style={{
                          position: 'absolute',
                          top: '100%',
                          right: 0,
                          backgroundColor: 'var(--color-surface-hover)',
                          borderRadius: '4px',
                          padding: '8px 0',
                          minWidth: '180px',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                          zIndex: 50,
                          marginTop: '8px'
                        }}>
                        <button onClick={() => setSettingsOpen(true)} style={{ width: '100%', padding: '12px 20px', textAlign: 'left', background: 'none', border: 'none', color: 'var(--color-text-primary)', fontSize: '15px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px' }} className="hover:bg-[var(--color-bg)]"><Settings size={18} color="var(--color-text-secondary)" />Settings</button>
                          <button onClick={() => { logout(); navigate('/login'); }} style={{ width: '100%', padding: '12px 20px', textAlign: 'left', background: 'none', border: 'none', color: 'var(--color-text-primary)', fontSize: '15px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px' }} className="hover:bg-[var(--color-bg)]"><LogOut size={18} color="var(--color-danger)" />Log out</button>
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
                backgroundColor: 'var(--color-bg)', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between', 
                height: '60px' 
              }}>
                <h1 style={{ fontSize: '22px', fontWeight: 'bold', color: 'var(--color-text-primary)' }}>Chats</h1>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    onClick={() => { setNewChatStartsInGroupMode(false); setIsNewChatModalOpen(true); }}
                    title="New Chat"
                    style={{ padding: '8px', borderRadius: '50%', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-tertiary)' }}
                  >
                    <MessageSquarePlus size={20} />
                  </button>
                  <div style={{ position: 'relative' }}>
                    <button 
                      onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
                      style={{ padding: '8px', borderRadius: '50%', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-tertiary)' }}
                    >
                      <MoreVertical size={20} />
                    </button>
                    {/* Desktop Dropdown Menu */}
                     {showMenu && (
                        <div style={{
                          position: 'absolute',
                          top: '100%',
                          right: 0,
                          backgroundColor: 'var(--color-surface-hover)',
                          borderRadius: '4px',
                          padding: '8px 0',
                          minWidth: '200px',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                          zIndex: 50,
                          marginTop: '4px'
                        }}>
                          <button
                            onClick={() => { setNewChatStartsInGroupMode(true); setIsNewChatModalOpen(true); setShowMenu(false); }}
                            style={{ width: '100%', padding: '10px 24px', textAlign: 'left', background: 'none', border: 'none', color: 'var(--color-text-primary)', fontSize: '14px', cursor: 'pointer' }}
                          >
                            New group
                          </button>
                          <button onClick={() => setSettingsOpen(true)} style={{ width: '100%', padding: '10px 24px', textAlign: 'left', background: 'none', border: 'none', color: 'var(--color-text-primary)', fontSize: '14px', cursor: 'pointer' }}>Settings</button>
                          <button onClick={() => { logout(); navigate('/login'); }} style={{ width: '100%', padding: '10px 24px', textAlign: 'left', background: 'none', border: 'none', color: 'var(--color-text-primary)', fontSize: '14px', cursor: 'pointer' }}>Log out</button>
                        </div>
                     )}
                  </div>
                </div>
              </div>
            )}

            {/* Search (Desktop/Tablet or Mobile sub-header) */}
            <div style={{ padding: '10px 16px', backgroundColor: 'var(--color-bg)' }}>
              <div style={{ 
                position: 'relative',
                transition: 'all 0.2s ease'
              }}>
                <button 
                  style={{
                    position: 'absolute', 
                    left: '16px', 
                    top: '50%',
                    transform: 'translateY(-50%)', 
                    zIndex: 10,
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    color: isSearchFocused || searchQuery ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    transition: 'color 0.2s ease, transform 0.2s ease'
                  }}
                >
                  {isSearchFocused || searchQuery ? (
                    <ArrowLeft size={20} onClick={() => { setSearchQuery(''); setIsSearchFocused(false); }} />
                  ) : (
                    <Search size={20} />
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
                    backgroundColor: 'var(--color-surface)',
                    border: isSearchFocused ? '1px solid var(--color-accent)' : '1px solid transparent',
                    borderRadius: '10px',
                    padding: '14px 20px 14px 50px',
                    color: 'var(--color-text-primary)',
                    fontSize: '15px',
                    outline: 'none',
                    height: '48px',
                    transition: 'all 0.2s ease',
                    boxShadow: isSearchFocused ? '0 2px 8px rgba(108, 93, 216, 0.15)' : 'none'
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
                  backgroundColor: 'var(--color-accent)',
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

            <UnapprovedDeviceBanner />

            {/* Chat List — paddingBottom on mobile so BottomNav doesn't cover last item */}
            <div style={{ flex: 1, overflowY: 'auto', paddingBottom: isMobile ? '60px' : 0 }}>
              {isLoading ? (
                <ChatListSkeleton />
              ) : filteredChats.length > 0 ? (
                <ChatList
                  chats={filteredChats}
                  activeChat={activeChat}
                  onChatSelect={handleChatSelect}
                  onDeleteChat={handleDeleteChat}
                  currentUserId={user?.id || ''}
                />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '256px', color: 'var(--color-text-secondary)' }}>
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
             <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-secondary)' }}>
               <p>Status updates coming soon</p>
             </div>
              {isMobile && <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />}
          </div>
        )}

        {/* Communities Tab Placeholder */}
        {!settingsOpen && activeTab === 'communities' && (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
             <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-secondary)' }}>
               <p>Communities coming soon</p>
             </div>
             {isMobile && <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />}
          </div>
        )}

        {/* Calls Tab */}
        {!settingsOpen && activeTab === 'calls' && (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
             {/* Header */}
             <div style={{
               padding: '10px 16px',
               backgroundColor: 'var(--color-bg)',
               display: 'flex',
               alignItems: 'center',
               justifyContent: 'space-between',
               height: '60px'
             }}>
               <h1 style={{ fontSize: '22px', fontWeight: 'bold', color: 'var(--color-text-primary)' }}>Calls</h1>
             </div>
             <div style={{ flex: 1, overflowY: 'auto', paddingBottom: isMobile ? '60px' : 0 }}>
               <MeetingsPanel />
               <CallList onChatSelect={handleCallChatSelect} />
             </div>
             {isMobile && <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />}
          </div>
        )}
      </div>

      {/* Main Chat Area */}
      <div 
        style={{ 
          flex: 1, 
          display: isMobile && !((activeTab === 'chats' && activeChat) || (activeTab === 'calls' && activeCallInfoId)) ? 'none' : 'flex',
          flexDirection: 'column', 
          height: '100%',
          backgroundColor: 'var(--color-bg-deepest)',
          position: 'relative'
        }}
      >
        {activeTab === 'chats' && activeChat ? (
          <ChatView
            chat={activeChat}
            onBack={() => setActiveChat(null)}
            currentUserId={user?.id || ''}
            isMobile={isMobile}
          />
        ) : activeTab === 'calls' && activeCallInfoId ? (
          <CallInfoView 
            chatId={activeCallInfoId} 
            onBack={() => setActiveCallInfoId(null)}
            onMessageClick={handleMessageClickFromCallInfo}
          />
        ) : (
          <EmptyState />
        )}
      </div>

      <style>{`
        @media (min-width: 1024px) {
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
        @media (max-width: 1023px) {
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
        startInGroupMode={newChatStartsInGroupMode}
      />
      </div>
    </div>
  );
};
