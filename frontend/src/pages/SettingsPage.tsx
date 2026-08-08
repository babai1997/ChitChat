import { useNavigate } from 'react-router-dom';
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
  CheckCircle,
  Laptop,
} from 'lucide-react';
import { useAuthStore } from '../stores';

export const SettingsPage = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();

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
    <div style={{ backgroundColor: 'var(--color-bg-deepest)', minHeight: '100vh', color: 'var(--color-text-primary)' }}>
      {/* Header */}
      <div style={{ 
        padding: '12px 16px', 
        display: 'flex', 
        alignItems: 'center', 
        gap: '20px', 
        borderBottom: '1px solid var(--color-surface)',
        backgroundColor: 'var(--color-bg-deepest)',
        position: 'sticky',
        top: 0,
        zIndex: 10
      }}>
        <button 
          onClick={() => navigate(-1)}
          style={{ background: 'none', border: 'none', color: 'var(--color-text-primary)', cursor: 'pointer', padding: 0 }}
        >
          <ArrowLeft size={24} />
        </button>
        <h1 style={{ fontSize: '20px', fontWeight: 500, margin: 0 }}>Settings</h1>
        <div style={{ marginLeft: 'auto' }}>
           <SearchIcon /> 
        </div>
      </div>

      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        {/* Profile Card */}
        <div 
          onClick={() => navigate('/setup-profile')}
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            padding: '20px 16px', 
            borderBottom: '1px solid var(--color-surface)',
            cursor: 'pointer'
          }}
          className="hover:bg-[var(--color-surface)] transition-colors"
        >
          <div style={{ width: '60px', height: '60px', borderRadius: '50%', overflow: 'hidden', marginRight: '16px' }}>
             <img 
               src={user?.profile?.avatarUrl || `https://ui-avatars.com/api/?name=${user?.profile?.displayName || 'User'}&background=random`} 
               referrerPolicy="no-referrer"
               alt="Profile" 
               style={{ width: '100%', height: '100%', objectFit: 'cover' }}
             />
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: '18px', fontWeight: 400, margin: '0 0 4px 0' }}>
              {user?.profile?.displayName || 'User'}
            </h2>
            <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.profile?.about || 'Hey there! I am using ChitChat'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '16px', color: 'var(--color-accent)' }}>
             <QrCode size={24} />
             <div style={{ border: '1px solid var(--color-accent)', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircle size={14} />
             </div>
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
                padding: '20px 24px',
                background: 'none',
                border: 'none',
                width: '100%',
                textAlign: 'left',
                cursor: 'pointer',
                color: 'var(--color-text-primary)'
              }}
              className="hover:bg-[var(--color-surface)] transition-colors"
            >
              <div style={{ color: 'var(--color-text-secondary)', marginRight: '24px' }}>
                <item.icon size={24} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '16px', marginBottom: '4px' }}>{item.label}</div>
                {item.subLabel && (
                  <div style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>{item.subLabel}</div>
                )}
              </div>
            </button>
          ))}
          
           {/* Logout (Custom Addition) */}
           <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ height: '1px', backgroundColor: 'var(--color-surface)', marginBottom: '8px' }}></div>
              <div style={{ fontSize: '14px', color: 'var(--color-text-secondary)', textAlign: 'center', marginBottom: '16px' }}>
                 from <br/>
                 <span style={{ fontWeight: 'bold', color: 'var(--color-text-primary)', letterSpacing: '1px' }}>Meta</span>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className="css-i6dzq1"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
);
