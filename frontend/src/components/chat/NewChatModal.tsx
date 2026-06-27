import { useState, useEffect } from 'react';
import { X, Search, User, Loader2, Check, Camera, MessageSquare, Users } from 'lucide-react';
import { usersApi, chatApi } from '../../api';
import { useChatStore } from '../../stores';
import type { Chat } from '../../types';

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

type ModalView = 'list' | 'new-group-details';

type ListItem =
  | { kind: 'header'; label: string }
  | { kind: 'user'; user: SearchResultUser; isSelected: boolean };

export const NewChatModal = ({ isOpen, onClose, onChatCreated, currentUserId }: NewChatModalProps) => {
  const [view, setView] = useState<ModalView>('list');
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResultUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const [selectedUsers, setSelectedUsers] = useState<SearchResultUser[]>([]);
  const [groupName, setGroupName] = useState('');
  const [showGroupHint, setShowGroupHint] = useState(false);

  const allChats = useChatStore(s => s.chats);

  // Derive contacts from existing direct chats
  const contacts: SearchResultUser[] = allChats
    .filter(c => c.type === 'direct')
    .flatMap(c => {
      const other = c.members.find(m => m.userId !== currentUserId);
      if (!other) return [];
      return [{
        id: other.userId,
        phone: other.user.phone,
        email: other.user.email,
        profile: other.user.profile,
      }];
    });

  useEffect(() => {
    if (isOpen) {
      setView('list');
      setQuery('');
      setSearchResults([]);
      setSelectedUsers([]);
      setGroupName('');
    }
  }, [isOpen]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.trim().length >= 2) {
        setIsLoading(true);
        try {
          const results = await usersApi.searchUsers(query) as unknown as SearchResultUser[];
          setSearchResults(results.filter(u => u.id !== currentUserId));
        } catch (error) {
          console.error('Failed to search users:', error);
        } finally {
          setIsLoading(false);
        }
      } else {
        setSearchResults([]);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [query, currentUserId]);

  const filteredContacts = contacts.filter(c => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    const name = c.profile?.displayName?.toLowerCase() ?? '';
    const phone = c.phone?.toLowerCase() ?? '';
    return name.includes(q) || phone.includes(q);
  });

  const contactIds = new Set(contacts.map(c => c.id));
  const selectedIds = new Set(selectedUsers.map(u => u.id));

  // API results that aren't already contacts
  const novelSearchResults = searchResults.filter(u => !contactIds.has(u.id));

  const buildList = (): ListItem[] => {
    const items: ListItem[] = [];

    if (selectedUsers.length > 0) {
      items.push({ kind: 'header', label: 'Selected' });
      for (const u of selectedUsers) {
        items.push({ kind: 'user', user: u, isSelected: true });
      }
    }

    const unselectedContacts = filteredContacts.filter(c => !selectedIds.has(c.id));
    items.push({
      kind: 'header',
      label: query.trim() ? `Contacts (${unselectedContacts.length})` : 'Contacts',
    });
    for (const u of unselectedContacts) {
      items.push({ kind: 'user', user: u, isSelected: false });
    }

    const novelUnselected = novelSearchResults.filter(u => !selectedIds.has(u.id));
    if (query.trim().length >= 2 && novelUnselected.length > 0) {
      items.push({ kind: 'header', label: 'Search results' });
      for (const u of novelUnselected) {
        items.push({ kind: 'user', user: u, isSelected: false });
      }
    }

    return items;
  };

  const toggleUser = (user: SearchResultUser) => {
    if (selectedIds.has(user.id)) {
      setSelectedUsers(selectedUsers.filter(u => u.id !== user.id));
    } else {
      setSelectedUsers([...selectedUsers, user]);
    }
  };

  const handleDirectMessage = async () => {
    if (selectedUsers.length !== 1 || isCreating) return;
    const targetUser = selectedUsers[0];

    // Prefer existing chat from store — avoids any duplicate creation
    const existingChat = allChats.find(
      c => c.type === 'direct' && c.members.some(m => m.userId === targetUser.id),
    );

    if (existingChat) {
      onChatCreated(existingChat);
      onClose();
      return;
    }

    // New contact from search — backend will find-or-create
    setIsCreating(true);
    try {
      const chat = await chatApi.createDirectChat(targetUser.id);
      onChatCreated(chat);
      onClose();
    } catch (error) {
      console.error('Failed to open chat:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim() || selectedUsers.length < 2 || isCreating) return;
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

  const listItems = buildList();

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      zIndex: 50,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
    }}>
      <div className="glass" style={{
        width: '100%',
        maxWidth: '450px',
        backgroundColor: '#1f2c34',
        borderRadius: '16px',
        display: 'flex',
        flexDirection: 'column',
        height: '80vh',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
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
          borderTopRightRadius: '16px',
        }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#e9edef' }}>
              {view === 'list' ? 'New Chat' : 'New Group'}
            </h2>
            {view === 'list' && selectedUsers.length > 0 && (
              <p style={{ fontSize: '12px', color: '#8696a0', marginTop: '2px' }}>
                {selectedUsers.length} selected
              </p>
            )}
          </div>
          <button
            onClick={view === 'new-group-details' ? () => setView('list') : onClose}
            style={{ background: 'none', border: 'none', color: '#8696a0', cursor: 'pointer' }}
          >
            <X size={24} />
          </button>
        </div>

        {/* Group details form */}
        {view === 'new-group-details' ? (
          <div style={{ padding: '24px', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{
              width: '100px',
              height: '100px',
              borderRadius: '50%',
              backgroundColor: '#2a3942',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '24px',
              cursor: 'pointer',
            }}>
              <Camera size={40} color="#8696a0" />
            </div>

            <div style={{ width: '100%', marginBottom: '8px' }}>
              <p style={{ fontSize: '12px', color: '#8696a0', marginBottom: '8px' }}>
                {selectedUsers.map(u => u.profile?.displayName || u.phone).join(', ')}
              </p>
              <input
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleCreateGroup(); }}
                placeholder="Group name"
                autoFocus
                style={{
                  width: '100%',
                  backgroundColor: 'transparent',
                  border: 'none',
                  borderBottom: '2px solid #00a884',
                  padding: '8px 0',
                  color: '#e9edef',
                  fontSize: '16px',
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ flex: 1 }} />

            <button
              onClick={() => void handleCreateGroup()}
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
                gap: '8px',
              }}
            >
              {isCreating ? <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={20} />}
              Create Group
            </button>
          </div>
        ) : (
          <>
            {/* Search */}
            <div style={{ padding: '12px 16px' }}>
              <div style={{ position: 'relative' }}>
                <Search
                  size={18}
                  style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#8696a0' }}
                />
                {isLoading && (
                  <div style={{ position: 'absolute', right: '12px', top: 0, bottom: 0, display: 'flex', alignItems: 'center' }}>
                    <Loader2 size={16} color="#8696a0" className="animate-spin" />
                  </div>
                )}
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
                    padding: '10px 16px 10px 44px',
                    color: '#e9edef',
                    fontSize: '15px',
                    outline: 'none',
                  }}
                />
              </div>
            </div>

            {/* New Group entry */}
            {!query && (
              <button
                onClick={() => setShowGroupHint(h => !h)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  padding: '12px 16px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  width: '100%',
                  borderBottom: '1px solid #2a3942',
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#202c33'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <div style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '50%',
                  backgroundColor: '#00a884',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Users size={22} color="white" />
                </div>
                <span style={{ fontSize: '15px', fontWeight: 500, color: '#e9edef' }}>New Group</span>
              </button>
            )}

            {/* Group hint banner */}
            {showGroupHint && selectedUsers.length < 2 && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 16px',
                backgroundColor: '#182229',
                borderBottom: '1px solid #2a3942',
              }}>
                <Users size={16} color="#00a884" style={{ flexShrink: 0 }} />
                <p style={{ flex: 1, fontSize: '13px', color: '#8696a0', margin: 0 }}>
                  Select 2 or more contacts to create a group
                </p>
                <button
                  onClick={() => setShowGroupHint(false)}
                  style={{ background: 'none', border: 'none', color: '#8696a0', cursor: 'pointer', padding: '2px', flexShrink: 0 }}
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {/* User list */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {listItems.length === 0 || (listItems.length === 1 && listItems[0].kind === 'header') ? (
                    contacts.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '48px 32px', color: '#8696a0' }}>
                        <Users size={40} color="#2a3942" style={{ margin: '0 auto 12px' }} />
                        <p>No contacts yet</p>
                        <p style={{ fontSize: '13px', marginTop: '4px' }}>Search to start a new chat</p>
                      </div>
                    ) : query.trim().length >= 2 ? (
                      <div style={{ textAlign: 'center', padding: '32px', color: '#8696a0' }}>
                        No users found
                      </div>
                    ) : null
                  ) : (
                    listItems.map((item, index) => {
                      if (item.kind === 'header') {
                        return (
                          <div
                            key={`header-${index}`}
                            style={{ padding: '6px 16px', backgroundColor: '#1f2c34' }}
                          >
                            <span style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              color: '#8696a0',
                              textTransform: 'uppercase',
                              letterSpacing: '0.8px',
                            }}>
                              {item.label}
                            </span>
                          </div>
                        );
                      }

                      const { user, isSelected } = item;

                      return (
                        <button
                          key={`${user.id}-${isSelected ? 'sel' : 'unsel'}`}
                          onClick={() => toggleUser(user)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            padding: '10px 16px',
                            backgroundColor: isSelected ? '#182229' : 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            textAlign: 'left',
                            width: '100%',
                          }}
                          onMouseOver={(e) => {
                            if (!isSelected) e.currentTarget.style.backgroundColor = '#202c33';
                          }}
                          onMouseOut={(e) => {
                            if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                          }}
                        >
                          {/* Avatar */}
                          <div style={{
                            width: '46px',
                            height: '46px',
                            borderRadius: '50%',
                            backgroundColor: '#2a3942',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            overflow: 'hidden',
                          }}>
                            {user.profile?.avatarUrl ? (
                              <img
                                src={user.profile.avatarUrl}
                                alt={user.profile.displayName || 'User'}
                                referrerPolicy="no-referrer"
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              />
                            ) : (
                              <User size={22} color="#8696a0" />
                            )}
                          </div>

                          {/* Name + about */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <h3 style={{ fontSize: '15px', fontWeight: 500, color: '#e9edef', marginBottom: '2px' }}>
                              {user.profile?.displayName || user.phone || 'Unknown User'}
                            </h3>
                            <p style={{ fontSize: '13px', color: '#8696a0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {user.profile?.about || 'Hey there! I am using ChitChat'}
                            </p>
                          </div>

                          {/* Checkbox */}
                          <div style={{
                            width: '22px',
                            height: '22px',
                            borderRadius: '50%',
                            border: isSelected ? 'none' : '2px solid #3b4a54',
                            backgroundColor: isSelected ? '#00a884' : 'transparent',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            transition: 'background-color 0.15s, border-color 0.15s',
                          }}>
                            {isSelected && <Check size={13} color="white" strokeWidth={3} />}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
            </div>

            {/* Bottom action bar — appears when ≥1 user selected */}
            {selectedUsers.length > 0 && (
              <div style={{
                padding: '12px 16px',
                borderTop: '1px solid #2a3942',
                backgroundColor: '#202c33',
                borderBottomLeftRadius: '16px',
                borderBottomRightRadius: '16px',
              }}>
                {selectedUsers.length === 1 ? (
                  <button
                    onClick={() => void handleDirectMessage()}
                    disabled={isCreating}
                    style={{
                      width: '100%',
                      padding: '12px',
                      backgroundColor: isCreating ? '#2a3942' : '#00a884',
                      color: isCreating ? '#8696a0' : 'white',
                      border: 'none',
                      borderRadius: '24px',
                      fontWeight: 600,
                      fontSize: '15px',
                      cursor: isCreating ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                    }}
                  >
                    {isCreating
                      ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                      : <MessageSquare size={18} />
                    }
                    Direct Message
                  </button>
                ) : (
                  <button
                    onClick={() => setView('new-group-details')}
                    style={{
                      width: '100%',
                      padding: '12px',
                      backgroundColor: '#00a884',
                      color: 'white',
                      border: 'none',
                      borderRadius: '24px',
                      fontWeight: 600,
                      fontSize: '15px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                    }}
                  >
                    <Users size={18} />
                    Create Group ({selectedUsers.length} members)
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
