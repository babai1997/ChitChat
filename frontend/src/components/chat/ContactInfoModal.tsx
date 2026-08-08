import { X, User, Phone, Video, Info, Image as ImageIcon, ChevronRight } from 'lucide-react';

interface ContactInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
    about: string | null;
    phone?: string | null;
    email?: string | null;
  };
  onOpenGallery?: () => void;
}

export const ContactInfoModal = ({ isOpen, onClose, user, onOpenGallery }: ContactInfoModalProps) => {
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
    }} onClick={onClose}>
      <div 
        className="glass" 
        style={{
          width: '100%',
          maxWidth: '350px',
          backgroundColor: '#1f2c34',
          borderRadius: '16px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
          overflow: 'hidden',
          border: '1px solid #2a3942'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          borderBottom: '1px solid #2a3942',
          backgroundColor: '#202c33'
        }}>
          <button 
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#8696a0', cursor: 'pointer', display: 'flex' }}
          >
            <X size={24} />
          </button>
          <h2 style={{ fontSize: '18px', fontWeight: 500, color: '#e9edef', margin: 0 }}>Contact Info</h2>
        </div>

        <div style={{ padding: '24px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {/* Avatar */}
          <div style={{ 
            width: '120px', 
            height: '120px', 
            borderRadius: '50%', 
            backgroundColor: '#2a3942', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            marginBottom: '16px',
            overflow: 'hidden'
          }}>
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt={user.displayName} referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <User size={60} color="#8696a0" />
            )}
          </div>

          {/* Name & Phone */}
          <h3 style={{ fontSize: '22px', fontWeight: 600, color: '#e9edef', marginBottom: '4px', textAlign: 'center' }}>
            {user.displayName}
          </h3>
          <p style={{ fontSize: '16px', color: '#8696a0', marginBottom: '24px' }}>
            {user.phone || user.email || ''}
          </p>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '24px', marginBottom: '24px', width: '100%', justifyContent: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <div style={{ padding: '12px', borderRadius: '50%', backgroundColor: '#202c33', border: '1px solid #2a3942', color: '#25d366' }}>
                <Phone size={24} />
              </div>
              <span style={{ fontSize: '12px', color: '#25d366', fontWeight: 500 }}>Audio</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <div style={{ padding: '12px', borderRadius: '50%', backgroundColor: '#202c33', border: '1px solid #2a3942', color: '#25d366' }}>
                <Video size={24} />
              </div>
              <span style={{ fontSize: '12px', color: '#25d366', fontWeight: 500 }}>Video</span>
            </div>
          </div>

          {/* About */}
          <div style={{ width: '100%', backgroundColor: '#111b21', borderRadius: '12px', padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: '#8696a0' }}>
              <Info size={16} />
              <span style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase' }}>Allowed</span>
            </div>
            <p style={{ fontSize: '15px', color: '#e9edef', lineHeight: '1.5' }}>
              {user.about || 'Hey there! I am using ChitChat'}
            </p>
          </div>

          {onOpenGallery && (
            <button
              onClick={onOpenGallery}
              style={{
                width: '100%',
                marginTop: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '14px 16px',
                backgroundColor: '#111b21',
                borderRadius: '12px',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <ImageIcon size={18} color="#8696a0" />
              <span style={{ flex: 1, fontSize: '14px', color: '#e9edef' }}>Media, links and docs</span>
              <ChevronRight size={16} color="#8696a0" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
