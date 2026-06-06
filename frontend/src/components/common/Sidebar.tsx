import { useState } from 'react';
import { 
  MessageCircle, 
  Users, 
  CircleDashed,
  Settings, 
  User,
  LogOut
} from 'lucide-react';
import { useAuthStore } from '../../stores';
import { useNavigate } from 'react-router-dom';

interface SidebarProps {
  activeTab: 'chats' | 'status' | 'communities';
  onTabChange: (tab: 'chats' | 'status' | 'communities') => void;
  userProfile?: {
    avatarUrl: string | null;
    displayName: string | null;
  } | null;
  onSettingsClick?: () => void;
}


interface NavItemProps {
  id: string;
  icon: React.ElementType;
  isActive: boolean;
  onClick: (id: string) => void;
}

const NavItem = ({ id, icon: Icon, isActive, onClick }: NavItemProps) => (
  <button 
    onClick={() => onClick(id)}
    style={{ 
      width: '100%', 
      height: '48px', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      position: 'relative',
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      color: isActive ? '#00a884' : '#8696a0'
    }}
  >
    {isActive && (
      <div style={{
        position: 'absolute',
        top: '6px',
        bottom: '6px',
        left: '0',
        width: '3px',
        backgroundColor: '#00a884',
        borderTopRightRadius: '4px',
        borderBottomRightRadius: '4px'
      }} />
    )}
    <Icon size={24} strokeWidth={isActive ? 2.5 : 2} />
  </button>
);

export const Sidebar = ({ activeTab, onTabChange, userProfile, onSettingsClick }: SidebarProps) => {
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const { logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div style={{ 
      width: '60px', 
      backgroundColor: '#202c33', 
      borderRight: '1px solid #2a3942',
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      padding: '12px 0', 
      justifyContent: 'space-between', 
      zIndex: 20
    }}>
      {/* Top Navigation */}
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <NavItem id="chats" icon={MessageCircle} isActive={activeTab === 'chats'} onClick={() => onTabChange('chats')} />
        <NavItem id="status" icon={CircleDashed} isActive={activeTab === 'status'} onClick={() => onTabChange('status')} />
        <NavItem id="communities" icon={Users} isActive={activeTab === 'communities'} onClick={() => onTabChange('communities')} />
      </div>

      {/* Bottom Actions */}
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <button 
          title="Settings"
          onClick={() => {
             if (onSettingsClick) {
                onSettingsClick();
             } else {
                navigate('/settings');
             }
          }}
          style={{ 
            width: '100%', 
            height: '48px', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            color: '#8696a0',
            background: 'none',
            border: 'none',
            cursor: 'pointer'
          }}
        >
          <Settings size={20} />
        </button>
        
        <div style={{ padding: '8px', display: 'flex', justifyContent: 'center', position: 'relative' }}>
          <button 
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            style={{ 
              width: '32px', 
              height: '32px', 
              borderRadius: '50%', 
              overflow: 'hidden', 
              cursor: 'pointer',
              border: '2px solid transparent',
              padding: 0,
              backgroundColor: '#6a7f8a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
             {userProfile?.avatarUrl ? (
                <img src={userProfile.avatarUrl} alt="Profile" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
             ) : (
                <div style={{ width: '100%', height: '100%', backgroundColor: '#6a7f8a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <User size={18} color="white" />
                </div>
             )}
          </button>

          {/* Profile Menu */}
          {showProfileMenu && (
            <>
              <div 
                style={{ position: 'fixed', inset: 0, zIndex: 30 }} 
                onClick={() => setShowProfileMenu(false)}
              />
              <div style={{
                position: 'absolute',
                bottom: '100%',
                left: '100%',
                marginBottom: '10px',
                marginLeft: '10px',
                backgroundColor: '#202c33',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                border: '1px solid #2a3942',
                zIndex: 40,
                minWidth: '200px',
                overflow: 'hidden'
              }}>
                 <div style={{ padding: '16px', borderBottom: '1px solid #2a3942' }}>
                    <div style={{ color: '#e9edef', fontWeight: 500 }}>
                      {userProfile?.displayName || 'User'}
                    </div>
                 </div>
                 <button
                    onClick={() => { 
                        if (onSettingsClick) {
                            onSettingsClick();
                        } else {
                            navigate('/settings');
                        }
                        setShowProfileMenu(false); 
                    }}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      background: 'none',
                      border: 'none',
                      color: '#e9edef',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: '14px'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#111b21'}
                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <Settings size={18} />
                    Settings
                  </button>
                  <button
                    onClick={handleLogout}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      background: 'none',
                      border: 'none',
                      color: '#f87171',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: '14px'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#111b21'}
                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <LogOut size={18} />
                    Logout
                  </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
