import { useState, useEffect } from 'react';
import { X, Search, User, Loader2, Check, Users, UserPlus } from 'lucide-react';
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

type ListItem =
  | { kind: 'header'; label: string }
  | { kind: 'user'; user: SearchResultUser; isSelected: boolean };

interface AddMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  chat: Chat;
  currentUserId: string;
}

export const AddMemberModal = ({ isOpen, onClose, chat, currentUserId }: AddMemberModalProps) => {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResultUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<SearchResultUser[]>([]);

  const allChats = useChatStore(s => s.chats);

  // Existing member IDs in this group
  const existingMemberIds = new Set(chat.members.map(m => m.userId));

  // Contacts from direct chats who are NOT already in the group
  const contacts: SearchResultUser[] = allChats
    .filter(c => c.type === 'direct')
    .flatMap(c => {
      const other = c.members.find(m => m.userId !== currentUserId);
      if (!other || existingMemberIds.has(other.userId)) return [];
      return [{
        id: other.userId,
        phone: other.user.phone,
        email: other.user.email,
        profile: other.user.profile,
      }];
    });

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setSearchResults([]);
      setSelectedUsers([]);
    }
  }, [isOpen]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.trim().length >= 2) {
        setIsSearching(true);
        try {
          const results = await usersApi.searchUsers(query) as unknown as SearchResultUser[];
          setSearchResults(results.filter(u => u.id !== currentUserId && !existingMemberIds.has(u.id)));
        } catch (error) {
          console.error('Failed to search users:', error);
        } finally {
          setIsSearching(false);
        }
      } else {
        setSearchResults([]);
      }
    }, 500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const novelSearchResults = searchResults.filter(u => !contactIds.has(u.id));

  const buildList = (): ListItem[] => {
    const items: ListItem[] = [];

    if (selectedUsers.length > 0) {
      items.push({ kind: 'header', label: 'Selected' });
      for (const u of selectedUsers) items.push({ kind: 'user', user: u, isSelected: true });
    }

    const unselectedContacts = filteredContacts.filter(c => !selectedIds.has(c.id));
    items.push({
      kind: 'header',
      label: query.trim() ? `Contacts (${unselectedContacts.length})` : 'Contacts',
    });
    for (const u of unselectedContacts) items.push({ kind: 'user', user: u, isSelected: false });

    const novelUnselected = novelSearchResults.filter(u => !selectedIds.has(u.id));
    if (query.trim().length >= 2 && novelUnselected.length > 0) {
      items.push({ kind: 'header', label: 'Search results' });
      for (const u of novelUnselected) items.push({ kind: 'user', user: u, isSelected: false });
    }

    return items;
  };

  const toggleUser = (user: SearchResultUser) => {
    if (selectedIds.has(user.id)) {
      setSelectedUsers(prev => prev.filter(u => u.id !== user.id));
    } else {
      setSelectedUsers(prev => [...prev, user]);
    }
  };

  const handleAdd = async () => {
    if (selectedUsers.length === 0 || isAdding) return;
    setIsAdding(true);
    try {
      await Promise.all(selectedUsers.map(u => chatApi.addMember(chat.id, u.id)));
      // Refresh chat in store
      const updatedChat = await chatApi.getChat(chat.id);
      const { chats, setChats, activeChat, setActiveChat } = useChatStore.getState();
      setChats(chats.map(c => c.id === updatedChat.id ? updatedChat : c));
      if (activeChat?.id === updatedChat.id) setActiveChat(updatedChat);
      onClose();
    } catch (error) {
      console.error('Failed to add members:', error);
    } finally {
      setIsAdding(false);
    }
  };

  if (!isOpen) return null;

  const listItems = buildList();

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0,0,0,0.7)',
      zIndex: 60,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '450px',
        backgroundColor: 'var(--color-surface-elevated)',
        borderRadius: '16px',
        display: 'flex',
        flexDirection: 'column',
        height: '80vh',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--color-border)',
          backgroundColor: 'var(--color-surface)',
          borderTopLeftRadius: '16px',
          borderTopRightRadius: '16px',
        }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--color-text-primary)' }}>Add Member</h2>
            {selectedUsers.length > 0 && (
              <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                {selectedUsers.length} selected
              </p>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: '12px 16px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)' }} />
            {isSearching && (
              <div style={{ position: 'absolute', right: '12px', top: 0, bottom: 0, display: 'flex', alignItems: 'center' }}>
                <Loader2 size={16} color="var(--color-text-secondary)" className="animate-spin" />
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
                backgroundColor: 'var(--color-border)',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 16px 10px 44px',
                color: 'var(--color-text-primary)',
                fontSize: '15px',
                outline: 'none',
              }}
            />
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {contacts.length === 0 && !query ? (
              <div style={{ textAlign: 'center', padding: '48px 32px', color: 'var(--color-text-secondary)' }}>
                <Users size={40} color="var(--color-border)" style={{ margin: '0 auto 12px' }} />
                <p>No contacts to add</p>
                <p style={{ fontSize: '13px', marginTop: '4px' }}>All your contacts are already in this group</p>
              </div>
            ) : (
              listItems.map((item, index) => {
                if (item.kind === 'header') {
                  return (
                    <div key={`h-${index}`} style={{ padding: '6px 16px', backgroundColor: 'var(--color-surface-elevated)' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                        {item.label}
                      </span>
                    </div>
                  );
                }
                const { user, isSelected } = item;
                return (
                  <button
                    key={`${user.id}-${isSelected}`}
                    onClick={() => toggleUser(user)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '10px 16px',
                      backgroundColor: isSelected ? 'var(--color-bg-deepest)' : 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      width: '100%',
                    }}
                    onMouseOver={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--color-surface)'; }}
                    onMouseOut={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent'; }}
                  >
                    <div style={{ width: '46px', height: '46px', borderRadius: '50%', backgroundColor: 'var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                      {user.profile?.avatarUrl ? (
                        <img src={user.profile.avatarUrl} alt="" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <User size={22} color="var(--color-text-secondary)" />
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 style={{ fontSize: '15px', fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: '2px' }}>
                        {user.profile?.displayName || user.phone || 'Unknown User'}
                      </h3>
                      <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {user.profile?.about || 'Hey there! I am using ChitChat'}
                      </p>
                    </div>
                    <div style={{
                      width: '22px', height: '22px', borderRadius: '50%',
                      border: isSelected ? 'none' : '2px solid var(--color-border-strong)',
                      backgroundColor: isSelected ? 'var(--color-accent)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      {isSelected && <Check size={13} color="white" strokeWidth={3} />}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Add button */}
        {selectedUsers.length > 0 && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface)', borderBottomLeftRadius: '16px', borderBottomRightRadius: '16px' }}>
            <button
              onClick={() => void handleAdd()}
              disabled={isAdding}
              style={{
                width: '100%', padding: '12px',
                backgroundColor: isAdding ? 'var(--color-border)' : 'var(--color-accent)',
                color: isAdding ? 'var(--color-text-secondary)' : 'white',
                border: 'none', borderRadius: '24px',
                fontWeight: 600, fontSize: '15px',
                cursor: isAdding ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              }}
            >
              {isAdding
                ? <Loader2 size={18} className="animate-spin" />
                : <UserPlus size={18} />
              }
              Add {selectedUsers.length === 1 ? '1 Member' : `${selectedUsers.length} Members`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
