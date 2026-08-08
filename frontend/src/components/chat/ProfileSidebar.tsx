import { useState } from 'react';
import { ArrowLeft, User, Edit2, Check, Camera } from 'lucide-react';
import { useAuthStore } from '../../stores';
import { profileApi } from '../../api';
import toast from 'react-hot-toast';
import { ImageCropModal } from '../common/ImageCropModal';

interface ProfileSidebarProps {
  onBack: () => void;
}

export const ProfileSidebar = ({ onBack }: ProfileSidebarProps) => {
  const { user, updateProfile } = useAuthStore();
  const [isEditingName, setIsEditingName] = useState(false);
  const [isEditingAbout, setIsEditingAbout] = useState(false);
  const [name, setName] = useState(user?.profile?.displayName || '');
  const [about, setAbout] = useState(user?.profile?.about || 'Hey there! I am using ChitChat');
  const [isLoading, setIsLoading] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);

  const handleNameSave = async () => {
    if (!name.trim()) return;
    setIsLoading(true);
    try {
      await profileApi.updateProfile({ displayName: name.trim() });
      updateProfile({ displayName: name.trim() });
      setIsEditingName(false);
      toast.success('Name updated');
    } catch (error) {
      toast.error('Failed to update name');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAboutSave = async () => {
    setIsLoading(true);
    try {
      await profileApi.updateProfile({ about: about.trim() });
      updateProfile({ about: about.trim() });
      setIsEditingAbout(false);
      toast.success('About updated');
    } catch (error) {
      toast.error('Failed to update about');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAvatarFileSelected = (file: File) => {
    setCropSrc(URL.createObjectURL(file));
  };

  const handleCropCancel = () => {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  };

  const handleCroppedAvatarUpload = async (file: File) => {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
    setIsLoading(true);
    try {
      const updatedProfile = await profileApi.uploadAvatar(file);
      updateProfile({ avatarUrl: updatedProfile.avatarUrl });
      toast.success('Profile photo updated');
    } catch (error) {
      toast.error('Failed to update profile photo');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--color-bg)', color: 'var(--color-text-primary)' }}>
      {/* Header */}
      <div style={{ 
        padding: '10px 16px', 
        backgroundColor: 'var(--color-surface)', 
        display: 'flex', 
        alignItems: 'end', 
        gap: '20px', 
        height: '108px', 
        borderBottom: '1px solid var(--color-border)',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', paddingBottom: '4px' }}>
            <button 
                onClick={onBack}
                style={{ background: 'none', border: 'none', color: 'var(--color-text-primary)', cursor: 'pointer', padding: 0 }}
            >
                <ArrowLeft size={24} />
            </button>
            <h1 style={{ fontSize: '19px', fontWeight: 600, margin: 0 }}>Profile</h1>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* Avatar Section */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '28px 0' }}>
            <div style={{ position: 'relative', width: '200px', height: '200px' }}>
                <div style={{ 
                    width: '100%', 
                    height: '100%', 
                    borderRadius: '50%', 
                    backgroundColor: 'var(--color-surface)', 
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer'
                }} className="group">
                    {user?.profile?.avatarUrl ? (
                        <img src={user.profile.avatarUrl} alt="Profile" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                        <User size={100} color="var(--color-text-tertiary)" />
                    )}
                     
                    {/* Overlay for upload - simplified version of AvatarUpload for this context */}
                     <label 
                        style={{ 
                            position: 'absolute', 
                            inset: 0, 
                            backgroundColor: 'rgba(0,0,0,0.4)', 
                            display: 'flex', 
                            flexDirection: 'column', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            opacity: 0,
                            cursor: 'pointer',
                            transition: 'opacity 0.2s',
                            color: 'var(--color-text-primary)'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                        onMouseLeave={(e) => e.currentTarget.style.opacity = '0'}
                    >
                        <Camera size={24} style={{ marginBottom: '8px' }} />
                        <span style={{ fontSize: '12px', textAlign: 'center', maxWidth: '120px' }}>
                             CHANGE PROFILE PHOTO
                        </span>
                        <input 
                            type="file" 
                            accept="image/*" 
                            style={{ display: 'none' }} 
                            onChange={(e) => {
                                if (e.target.files?.[0]) handleAvatarFileSelected(e.target.files[0]);
                            }}
                        />
                    </label>
                </div>
            </div>
        </div>

        {/* Name Section */}
        <div style={{ padding: '14px 30px', marginBottom: '10px' }}>
            <div style={{ fontSize: '14px', color: 'var(--color-accent)', marginBottom: '14px' }}>Your name</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                {isEditingName ? (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input 
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            maxLength={25}
                            autoFocus
                            style={{ 
                                background: 'none', 
                                border: 'none', 
                                borderBottom: '2px solid var(--color-accent)', 
                                color: 'var(--color-text-primary)', 
                                fontSize: '17px', 
                                width: '100%',
                                padding: '4px 0',
                                outline: 'none'
                            }}
                        />
                        <div style={{ display: 'flex', gap: '8px', color: 'var(--color-text-secondary)' }}>
                             <button onClick={handleNameSave} disabled={isLoading} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)' }}><Check size={20} /></button>
                        </div>
                    </div>
                ) : (
                    <>
                        <div style={{ fontSize: '17px', color: 'var(--color-text-primary)', flex: 1 }}>{user?.profile?.displayName}</div>
                        <button onClick={() => setIsEditingName(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
                            <Edit2 size={20} />
                        </button>
                    </>
                )}
            </div>
            {!isEditingName && (
                <div style={{ fontSize: '14px', color: 'var(--color-text-secondary)', lineHeight: '20px' }}>
                    This is not your username or pin. This name will be visible to your ChitChat contacts.
                </div>
            )}
        </div>

        {/* About Section */}
        <div style={{ padding: '14px 30px' }}>
            <div style={{ fontSize: '14px', color: 'var(--color-accent)', marginBottom: '14px' }}>About</div>
             <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                {isEditingAbout ? (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px' }}>
                         <input 
                            value={about}
                            onChange={(e) => setAbout(e.target.value)}
                            autoFocus
                            style={{ 
                                background: 'none', 
                                border: 'none', 
                                borderBottom: '2px solid var(--color-accent)', 
                                color: 'var(--color-text-primary)', 
                                fontSize: '17px', 
                                width: '100%',
                                padding: '4px 0',
                                outline: 'none'
                            }}
                        />
                        <div style={{ display: 'flex', gap: '8px', color: 'var(--color-text-secondary)' }}>
                             <button onClick={handleAboutSave} disabled={isLoading} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)' }}><Check size={20} /></button>
                        </div>
                    </div>
                ) : (
                    <>
                        <div style={{ fontSize: '17px', color: 'var(--color-text-primary)', flex: 1 }}>{user?.profile?.about || 'Hey there! I am using ChitChat'}</div>
                        <button onClick={() => setIsEditingAbout(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
                            <Edit2 size={20} />
                        </button>
                    </>
                )}
            </div>
        </div>
      </div>

      {cropSrc && (
        <ImageCropModal
          imageSrc={cropSrc}
          cropShape="round"
          fileName="avatar.jpg"
          onCropped={handleCroppedAvatarUpload}
          onClose={handleCropCancel}
        />
      )}
    </div>
  );
};
