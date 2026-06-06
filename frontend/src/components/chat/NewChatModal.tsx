import { useState, useEffect } from 'react';
import { X, Search, User, Loader2, Users, ArrowLeft, Check, ArrowRight, Camera } from 'lucide-react';
import { usersApi, chatApi } from '../../api';
import type { Chat } from '../../types';

// Define the type returned by the backend search endpoint
interface SearchResultUser {
  id: string;
  phone: string | null;
  email: string | null;
  profile: {
    displayName: string | null;
    avatarUrl: string | null;
    about: string | null;
    isOnline: boolean;
  } | null;
}

interface NewChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onChatCreated: (chat: Chat) => void;
  currentUserId: string;
}

type ModalView = 'list' | 'new-group-members' | 'new-group-details';

export const NewChatModal = ({ isOpen, onClose, onChatCreated, currentUserId }: NewChatModalProps) => {
  const [view, setView] = useState<ModalView>('list');
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<SearchResultUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  
  // Group creation state
  const [selectedUsers, setSelectedUsers] = useState<SearchResultUser[]>([]);
  const [groupName, setGroupName] = useState('');

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setView('list');
      setQuery('');
      setUsers([]);
      setSelectedUsers([]);
      setGroupName('');
    }
  }, [isOpen]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.trim().length >= 2) {
        setIsLoading(true);
        try {
          const results = await usersApi.searchUsers(query) as unknown as SearchResultUser[];
          setUsers(results.filter(u => u.id !== currentUserId));
        } catch (error) {
          console.error('Failed to search users:', error);
        } finally {
          setIsLoading(false);
        }
      } else {
        setUsers([]);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [query, currentUserId]);

      const handleUserSelect = async (user: SearchResultUser) => {
    if (view === 'new-group-members') {
      // Toggle selection
      if (selectedUsers.find(u => u.id === user.id)) {
        setSelectedUsers(selectedUsers.filter(u => u.id !== user.id));
      } else {
        setSelectedUsers([...selectedUsers, user]);
      }
      setQuery(''); // Clear search after selection to make it easier to find next person
    } else {
      // Direct chat creation
      if (isCreating) return;
      setIsCreating(true);
      try {
        const chat = await chatApi.createDirectChat(user.id);
        onChatCreated(chat);
        onClose();
      } catch (error) {
        console.error('Failed to create chat:', error);
      } finally {
        setIsCreating(false);
      }
    }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim() || selectedUsers.length === 0 || isCreating) return;
    
    setIsCreating(true);
    try {
      const memberIds = selectedUsers.map(u => u.id);
      const chat = await chatApi.createGroup(groupName, memberIds);
      onChatCreated(chat);
      onClose();
    } catch (error) {
      console.error('Failed to create group:', error);
    } finally {
      setIsCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      zIndex: 50,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px'
    }}>
      <div className="glass" style={{
        width: '100%',
        maxWidth: '450px',
        backgroundColor: '#1f2c34',
        borderRadius: '16px',
        display: 'flex',
        flexDirection: 'column',
        height: '80vh',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
      }}>
        {/* Header */}
        <div style={{
          padding: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #2a3942',
          backgroundColor: '#202c33',
          borderTopLeftRadius: '16px',
          borderTopRightRadius: '16px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {view !== 'list' && (
              <button 
                onClick={() => setView(view === 'new-group-details' ? 'new-group-members' : 'list')}
                style={{ background: 'none', border: 'none', color: '#e9edef', cursor: 'pointer', padding: '4px' }}
              >
                <ArrowLeft size={20} />
              </button>
            )}
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#e9edef' }}>
                {view === 'list' ? 'New Chat' : view === 'new-group-members' ? 'Add group members' : 'New group'}
              </h2>
              {view === 'new-group-members' && (
                <p style={{ fontSize: '12px', color: '#8696a0' }}>{selectedUsers.length} selected</p>
              )}
            </div>
          </div>
          <button 
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#8696a0', cursor: 'pointer' }}
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        {view === 'new-group-details' ? (
          <div style={{ padding: '24px', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
             {/* Group Icon Placeholder */}
             <div style={{ marginBottom: '24px', position: 'relative' }}>
               <div style={{ 
                 width: '100px', 
                 height: '100px', 
                 borderRadius: '50%', 
                 backgroundColor: '#2a3942', 
                 display: 'flex', 
                 alignItems: 'center', 
                 justifyContent: 'center',
                 cursor: 'pointer'
               }}>
                 <Camera size={40} color="#8696a0" />
               </div>
             </div>

             {/* Group Name Input */}
             <div style={{ width: '100%', marginBottom: '24px' }}>
               <input
                 type="text"
                 value={groupName}
                 onChange={(e) => setGroupName(e.target.value)}
                 placeholder="Group Subject"
                 autoFocus
                 style={{
                   width: '100%',
                   backgroundColor: 'transparent',
                   border: 'none',
                   borderBottom: '2px solid #00a884',
                   padding: '8px 0',
                   color: '#e9edef',
                   fontSize: '16px',
                   outline: 'none'
                 }}
               />
             </div>

             {/* Create Button */}
             <button
               onClick={handleCreateGroup}
               disabled={!groupName.trim() || isCreating}
               style={{
                 width: '100%',
                 padding: '12px',
                 backgroundColor: !groupName.trim() || isCreating ? '#2a3942' : '#00a884',
                 color: !groupName.trim() || isCreating ? '#8696a0' : 'white',
                 border: 'none',
                 borderRadius: '24px',
                 fontWeight: 600,
                 cursor: !groupName.trim() || isCreating ? 'not-allowed' : 'pointer',
                 display: 'flex',
                 alignItems: 'center',
                 justifyContent: 'center',
                 gap: '8px'
               }}
             >
               {isCreating ? <Loader2 className="animate-spin" size={20} /> : <Check size={20} />}
               Create Group
             </button>
          </div>
        ) : (
          <>
            {/* Search Input */}
            <div style={{ padding: '16px' }}>
              <div style={{ position: 'relative' }}>
                <Search 
                  size={20} 
                  style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#8696a0' }} 
                />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name or phone"
                  autoFocus
                  style={{
                    width: '100%',
                    backgroundColor: '#2a3942',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '12px 16px 12px 48px',
                    color: '#e9edef',
                    fontSize: '16px',
                    outline: 'none'
                  }}
                />
              </div>
            </div>

            {/* Selected Users (Chips) - Only in group mode */}
            {view === 'new-group-members' && selectedUsers.length > 0 && (
              <div style={{ padding: '0 16px 16px', display: 'flex', gap: '8px', overflowX: 'auto' }}>
                {selectedUsers.map(u => (
                  <div key={u.id} style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '8px', 
                    backgroundColor: '#2a3942', 
                    padding: '4px 8px', 
                    borderRadius: '16px',
                    minWidth: 'fit-content'
                  }}>
                    {u.profile?.avatarUrl ? (
                      <img src={u.profile.avatarUrl} alt="" referrerPolicy="no-referrer" style={{ width: '20px', height: '20px', borderRadius: '50%' }} />
                    ) : (
                      <User size={16} color="#8696a0" />
                    )}
                    <span style={{ color: '#e9edef', fontSize: '14px' }}>{u.profile?.displayName || u.phone}</span>
                    <button 
                      onClick={() => handleUserSelect(u)}
                      style={{ background: 'none', border: 'none', color: '#8696a0', cursor: 'pointer', padding: 2 }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Results List */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {/* Options (New Group) - Only show in list view and if no query */}
              {view === 'list' && !query && (
                <button
                  onClick={() => setView('new-group-members')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    padding: '16px',
                    backgroundColor: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    width: '100%',
                    textAlign: 'left'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#2a3942'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <div style={{ 
                    width: '48px', 
                    height: '48px', 
                    borderRadius: '50%', 
                    backgroundColor: '#00a884', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center' 
                  }}>
                    <Users size={24} color="white" />
                  </div>
                  <span style={{ fontSize: '16px', fontWeight: 500, color: '#e9edef' }}>New group</span>
                </button>
              )}

              {isLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '32px' }}>
                  <Loader2 size={24} className="animate-spin" color="#25d366" style={{ animation: 'spin 1s linear infinite' }} />
                </div>
              ) : users.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {users.map((user) => {
                    const isSelected = selectedUsers.some(u => u.id === user.id);
                    return (
                      <button
                        key={user.id}
                        onClick={() => handleUserSelect(user)}
                        disabled={isCreating}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          padding: '12px 16px',
                          backgroundColor: isSelected ? '#2a3942' : 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          textAlign: 'left',
                          width: '100%',
                          transition: 'background-color 0.2s',
                          position: 'relative'
                        }}
                        onMouseOver={(e) => !isSelected && (e.currentTarget.style.backgroundColor = '#202c33')}
                        onMouseOut={(e) => !isSelected && (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        {/* Checkmark for selection */}
                        {isSelected && (
                          <div style={{ 
                            position: 'absolute', 
                            right: '16px', 
                            top: '50%', 
                            transform: 'translateY(-50%)',
                            backgroundColor: '#00a884',
                            borderRadius: '50%',
                            padding: '4px'
                          }}>
                            <Check size={12} color="white" />
                          </div>
                        )}

                        {/* Loader when creating */}
                        {isCreating && !isSelected && view !== 'new-group-members' && (
                           <div style={{ 
                            position: 'absolute', 
                            right: '16px', 
                            top: '50%', 
                            transform: 'translateY(-50%)',
                          }}>
                            <Loader2 size={20} className="animate-spin" color="#00a884" style={{ animation: 'spin 1s linear infinite' }} />
                          </div>
                        )}

                        <div style={{ 
                          width: '48px', 
                          height: '48px', 
                          borderRadius: '50%', 
                          backgroundColor: '#202c33', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center',
                          flexShrink: 0,
                          overflow: 'hidden' 
                        }}>
                          {user.profile?.avatarUrl ? (
                            <img src={user.profile.avatarUrl} alt={user.profile.displayName || 'User'} referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <User size={24} color="#8696a0" />
                          )}
                        </div>
                        
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <h3 style={{ fontSize: '16px', fontWeight: 500, color: '#e9edef', marginBottom: '4px' }}>
                            {user.profile?.displayName || user.phone || 'Unknown User'}
                          </h3>
                          <p style={{ fontSize: '14px', color: '#8696a0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {user.profile?.about || 'Hey there! I am using ChitChat'}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : query.trim().length >= 2 ? (
                <div style={{ textAlign: 'center', padding: '32px', color: '#8696a0' }}>
                  No users found
                </div>
              ) : null}
            </div>

            {/* Next Button - Only for Group Members View */}
            {view === 'new-group-members' && selectedUsers.length > 0 && (
              <div style={{ padding: '16px', display: 'flex', justifyContent: 'center' }}>
                <button
                  onClick={() => setView('new-group-details')}
                  style={{
                    backgroundColor: '#00a884',
                    border: 'none',
                    borderRadius: '50%',
                    width: '56px',
                    height: '56px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                  }}
                >
                  <ArrowRight size={24} color="white" />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
