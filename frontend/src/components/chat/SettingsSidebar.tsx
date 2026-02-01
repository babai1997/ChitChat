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
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: '#111b21', color: '#e9edef' }}>
      {/* Header */}
      <div style={{ 
        padding: '0 16px', 
        backgroundColor: '#202c33', 
        display: 'flex', 
        alignItems: 'center',
        gap: '20px', 
        height: '56px',
        borderBottom: '1px solid #2a3942',
        flexShrink: 0
      }}>
        <button 
          onClick={onBack}
          style={{ background: 'none', border: 'none', color: '#e9edef', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
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
            cursor: 'pointer'
          }}
          className="hover:bg-[#202c33] transition-colors"
        >
          <div style={{ width: '82px', height: '82px', borderRadius: '50%', overflow: 'hidden', marginRight: '16px', flexShrink: 0 }}>
             <img 
               src={user?.profile?.avatarUrl || `https://ui-avatars.com/api/?name=${user?.profile?.displayName || 'User'}&background=random`} 
               alt="Profile" 
               style={{ width: '100%', height: '100%', objectFit: 'cover' }}
             />
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: '19px', fontWeight: 400, margin: '0 0 4px 0', color: '#e9edef' }}>
              {user?.profile?.displayName || 'User'}
            </h2>
            <p style={{ fontSize: '14px', color: '#8696a0', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.profile?.about || 'Hey there! I am using ChitChat'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '16px', color: '#00a884', alignItems: 'center' }}>
             <QrCode size={24} style={{ color: '#aebac1' }} />
          </div>
        </div>

        {/* Settings List */}
        <div style={{ display: 'flex', flexDirection: 'column', paddingBottom: '20px' }}>
          {settingsItems.map((item, index) => (
            <button
              key={index}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '18px 24px',
                background: 'none',
                border: 'none',
                width: '100%',
                textAlign: 'left',
                cursor: 'pointer',
                color: '#e9edef'
              }}
              className="hover:bg-[#202c33] transition-colors"
            >
              <div style={{ color: '#8696a0', marginRight: '24px' }}>
                <item.icon size={24} />
              </div>
              <div style={{ flex: 1, borderBottom: '1px solid #202c33', paddingBottom: '18px', paddingTop: '4px' }}>
                <div style={{ fontSize: '17px', marginBottom: '4px', color: '#e9edef' }}>{item.label}</div>
              </div>
            </button>
          ))}
          
           {/* Footer */}
           <div style={{ padding: '30px 24px', display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
              <div style={{ fontSize: '14px', color: '#8696a0', textAlign: 'center' }}>
                 from
              </div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#e9edef', textAlign: 'center', letterSpacing: '0.5px' }}>
                 ChitChat
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};
