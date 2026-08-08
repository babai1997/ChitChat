import {
  ArrowLeft,
  Key,
  Lock,
  Smile,
  List,
  MessageSquare,
  Bell,
  Database,
  Globe,
  HelpCircle,
  Users,
  QrCode,
  Laptop,
} from 'lucide-react';
import { useAuthStore } from '../../stores';
import { useNavigate } from 'react-router-dom';

interface SettingsSidebarProps {
  onBack: () => void;
}

export const SettingsSidebar = ({ onBack }: SettingsSidebarProps) => {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const settingsItems = [
    { icon: Key, label: 'Account', subLabel: 'Security notifications, change number' },
    { icon: Laptop, label: 'Linked Devices', subLabel: 'Approve or revoke devices linked to this account', onClick: () => navigate('/settings/linked-devices') },
    { icon: Lock, label: 'Privacy', subLabel: 'Block contacts, disappearing messages' },
    { icon: Smile, label: 'Avatar', subLabel: 'Create, edit, profile photo' },
    { icon: List, label: 'Lists', subLabel: 'Manage people and groups' },
    { icon: MessageSquare, label: 'Chats', subLabel: 'Theme, wallpapers, chat history' },
    { icon: Bell, label: 'Notifications', subLabel: 'Message, group & call tones' },
    { icon: Database, label: 'Storage and data', subLabel: 'Network usage, auto-download' },
    { icon: Globe, label: 'App language', subLabel: "English (device's language)" },
    { icon: HelpCircle, label: 'Help', subLabel: 'Help center, contact us, privacy policy' },
    { icon: Users, label: 'Invite a friend', subLabel: '' },
  ];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--color-bg)', color: 'var(--color-text-primary)' }}>
      {/* Header */}
      <div style={{ 
        padding: '0 16px', 
        backgroundColor: 'var(--color-surface)', 
        display: 'flex', 
        alignItems: 'center',
        gap: '20px', 
        height: '56px',
        borderBottom: '1px solid var(--color-border)',
        flexShrink: 0
      }}>
        <button 
          onClick={onBack}
          style={{ background: 'none', border: 'none', color: 'var(--color-text-primary)', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
        >
          <ArrowLeft size={24} />
        </button>
        <h1 style={{ fontSize: '19px', fontWeight: 600, margin: 0 }}>Settings</h1>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* Profile Card */}
        <div
          onClick={() => navigate('/setup-profile')}
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '28px 16px',
            cursor: 'pointer',
            transition: 'background-color 0.15s ease',
          }}
          onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--color-surface)'}
          onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          <div style={{ width: '82px', height: '82px', borderRadius: '50%', overflow: 'hidden', marginRight: '16px', flexShrink: 0 }}>
             <img 
               src={user?.profile?.avatarUrl || `https://ui-avatars.com/api/?name=${user?.profile?.displayName || 'User'}&background=random`} 
               referrerPolicy="no-referrer"
               alt="Profile" 
               style={{ width: '100%', height: '100%', objectFit: 'cover' }}
             />
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: '19px', fontWeight: 400, margin: '0 0 4px 0', color: 'var(--color-text-primary)' }}>
              {user?.profile?.displayName || 'User'}
            </h2>
            <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.profile?.about || 'Hey there! I am using ChitChat'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '16px', color: 'var(--color-accent)', alignItems: 'center' }}>
             <QrCode size={24} style={{ color: 'var(--color-text-tertiary)' }} />
          </div>
        </div>

        {/* Settings List */}
        <div style={{ display: 'flex', flexDirection: 'column', paddingBottom: '20px' }}>
          {settingsItems.map((item, index) => (
            <button
              key={index}
              onClick={item.onClick}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '0 24px',
                background: 'none',
                border: 'none',
                width: '100%',
                textAlign: 'left',
                cursor: 'pointer',
                color: 'var(--color-text-primary)',
                transition: 'background-color 0.15s ease',
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--color-surface)'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <div style={{ width: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-secondary)', marginRight: '24px', flexShrink: 0 }}>
                <item.icon size={22} />
              </div>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', minHeight: '24px', borderBottom: '1px solid var(--color-surface)', padding: '18px 0' }}>
                <div style={{ fontSize: '17px', color: 'var(--color-text-primary)' }}>{item.label}</div>
              </div>
            </button>
          ))}
          
           {/* Footer */}
           <div style={{ padding: '30px 24px', display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
              <div style={{ fontSize: '14px', color: 'var(--color-text-secondary)', textAlign: 'center' }}>
                 from
              </div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)', textAlign: 'center', letterSpacing: '0.5px' }}>
                 ChitChat
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};
