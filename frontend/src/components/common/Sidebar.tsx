import { useState } from 'react';
import { 
  MessageCircle, 
  Users, 
  CircleDashed,
  Settings, 
  User,
  LogOut,
  Phone
} from 'lucide-react';
import { useAuthStore } from '../../stores';
import { useNavigate } from 'react-router-dom';

interface SidebarProps {
  activeTab: 'chats' | 'status' | 'communities' | 'calls';
  onTabChange: (tab: 'chats' | 'status' | 'communities' | 'calls') => void;
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
      color: isActive ? 'var(--color-accent)' : 'var(--color-text-secondary)'
    }}
  >
    {isActive && (
      <div style={{
        position: 'absolute',
        top: '6px',
        bottom: '6px',
        left: '0',
        width: '3px',
        backgroundColor: 'var(--color-accent)',
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
      backgroundColor: 'var(--color-surface)', 
      borderRight: '1px solid var(--color-border)',
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
        <NavItem id="calls" icon={Phone} isActive={activeTab === 'calls'} onClick={() => onTabChange('calls')} />
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
            color: 'var(--color-text-secondary)',
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
              backgroundColor: 'var(--color-text-tertiary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
             {userProfile?.avatarUrl ? (
                <img src={userProfile.avatarUrl} alt="Profile" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
             ) : (
                <div style={{ width: '100%', height: '100%', backgroundColor: 'var(--color-text-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
                backgroundColor: 'var(--color-surface)',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                border: '1px solid var(--color-border)',
                zIndex: 40,
                minWidth: '200px',
                overflow: 'hidden'
              }}>
                 <div style={{ padding: '16px', borderBottom: '1px solid var(--color-border)' }}>
                    <div style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>
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
                      color: 'var(--color-text-primary)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: '14px'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--color-bg)'}
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
                      color: 'var(--color-danger)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: '14px'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--color-bg)'}
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
