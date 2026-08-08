import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Check, ArrowLeft, Camera, User, Edit2, Phone, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import { profileApi } from '../api';
import { useAuthStore } from '../stores';
import { ImageCropModal } from '../components/common/ImageCropModal';
import { resolvePostLoginRedirect } from '../utils/postLoginRedirect';

export const SetupProfilePage = () => {
  const navigate = useNavigate();
  const { updateProfile, user } = useAuthStore();

  const [displayName, setDisplayName] = useState(user?.profile?.displayName || '');
  const [about, setAbout] = useState(user?.profile?.about || 'Hey there! I am using ChitChat');
  const [isLoading, setIsLoading] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  // Default to editing if no display name (new user), otherwise view mode
  const [isEditing, setIsEditing] = useState(!user?.profile?.displayName);

  // File picked from the OS file dialog — open the crop step rather than
  // uploading it as-is (mobile already gets this via expo-image-picker's
  // native `allowsEditing` crop screen; web never had an equivalent step).
  const handleAvatarFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCropSrc(URL.createObjectURL(file));
  };

  // Same "dedicated camera button" pattern as GroupInfoModal's group-photo
  // change, for a consistent feel across the app rather than a hover-only
  // overlay that gives no visible affordance until you happen to hover.
  const handleCroppedAvatarUpload = async (file: File) => {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
    setIsUploadingAvatar(true);
    try {
      const updatedProfile = await profileApi.uploadAvatar(file);
      updateProfile({ avatarUrl: updatedProfile.avatarUrl });
      toast.success('Avatar updated!');
    } catch (error) {
      console.error('Avatar upload failed:', error);
      toast.error('Failed to upload avatar');
    } finally {
      setIsUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  const handleCropCancel = () => {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
    if (avatarInputRef.current) avatarInputRef.current.value = '';
  };

  const handleBack = () => {
    if (isEditing && user?.profile?.displayName) {
        setIsEditing(false);
    } else {
        navigate('/');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!displayName.trim()) {
      toast.error('Please enter your name');
      return;
    }

    setIsLoading(true);
    
    try {
      await profileApi.updateProfile({
        displayName: displayName.trim(),
        about: about.trim(),
      });
      
      updateProfile({
        displayName: displayName.trim(),
        about: about.trim(),
      });
      
      toast.success('Profile updated!');
      setIsEditing(false); // Go to view mode
      if (!user?.profile?.displayName) {
          // Initial setup completing — honor whatever ProtectedRoute originally
          // bounced from (e.g. a shared meeting link), stashed in sessionStorage
          // by ProtectedRoute since this page never receives location.state.
          navigate(resolvePostLoginRedirect(undefined), { replace: true });
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Failed to update profile');
    } finally {
      setIsLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    backgroundColor: '#2a3942',
    border: '1px solid #3b4a54',
    borderRadius: '12px',
    padding: '12px 16px',
    color: '#e9edef',
    fontSize: '16px',
    outline: 'none'
  };

  // View Mode Component
  const ProfileView = () => (
    <div style={{ padding: '0 24px', width: '100%', maxWidth: '600px' }}>
      <div style={{ display: 'flex', justifyContent: 'center', margin: '40px 0' }}>
        <div style={{ position: 'relative', width: '200px', height: '200px' }}>
          <div
            style={{
              width: '100%',
              height: '100%',
              borderRadius: '50%',
              backgroundColor: '#202c33',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {user?.profile?.avatarUrl ? (
              <img
                src={user.profile.avatarUrl}
                alt="Profile"
                referrerPolicy="no-referrer"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <User size={80} color="#6a7f8a" />
            )}
          </div>
          <button
            onClick={() => avatarInputRef.current?.click()}
            disabled={isUploadingAvatar}
            title="Change profile photo"
            style={{
              position: 'absolute',
              bottom: '8px',
              right: '8px',
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              backgroundColor: '#00a884',
              border: '2px solid #111b21',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
            }}
            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#017a62')}
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#00a884')}
          >
            {isUploadingAvatar ? (
              <Loader2 size={20} color="white" className="animate-spin" />
            ) : (
              <Camera size={20} color="white" />
            )}
          </button>
        </div>
      </div>

      {/* Name Section */}
      <div style={{ marginBottom: '32px', cursor: 'pointer' }} onClick={() => setIsEditing(true)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', color: '#8696a0', marginBottom: '8px' }}>
           <User size={20} />
           <span style={{ fontSize: '14px' }}>Name</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #202c33', paddingBottom: '8px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 400, color: '#e9edef', margin: 0 }}>{displayName}</h2>
            <Edit2 size={18} color="#00a884" />
        </div>
        <p style={{ fontSize: '12px', color: '#8696a0', marginTop: '8px' }}>
          This is not your username or pin. This name will be visible to your ChitChat contacts.
        </p>
      </div>

      {/* About Section */}
      <div style={{ marginBottom: '32px', cursor: 'pointer' }} onClick={() => setIsEditing(true)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', color: '#8696a0', marginBottom: '8px' }}>
           <Info size={20} />
           <span style={{ fontSize: '14px' }}>About</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #202c33', paddingBottom: '8px' }}>
            <p style={{ fontSize: '16px', color: '#e9edef', margin: 0 }}>{about}</p>
            <Edit2 size={18} color="#00a884" />
        </div>
      </div>

      {/* Phone Section */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', color: '#8696a0', marginBottom: '8px' }}>
           <Phone size={20} />
           <span style={{ fontSize: '14px' }}>Phone</span>
        </div>
        <div style={{ borderBottom: '1px solid #202c33', paddingBottom: '8px' }}>
            <p style={{ fontSize: '16px', color: '#e9edef', margin: 0 }}>{user?.phone || '+91 83488 15989'}</p>
        </div>
      </div>
    </div>
  );

  return (
    <div 
      style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center', 
        padding: '16px',
        backgroundColor: '#111b21',
        position: 'relative'
      }}
    >
      {/* Back Button */}
      <button
        onClick={handleBack}
        style={{
          position: 'absolute',
          top: '24px',
          left: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          color: '#8696a0',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: '14px'
        }}
      >
        <ArrowLeft size={20} />
        Back
      </button>
      {/* Header */}
      <div style={{ marginBottom: '32px', textAlign: 'center' }} className="animate-fade-in">
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#e9edef', marginBottom: '8px' }}>
          {isEditing && !user?.profile?.displayName ? 'Set Up Your Profile' : 'Profile'}
        </h1>
        {isEditing && !user?.profile?.displayName && (
            <p style={{ color: '#8696a0' }}>
            Let others know who you are
            </p>
        )}
      </div>

      {/* Content Area */}
      <div 
        className="animate-slide-up"
        style={{ 
          width: '100%', 
          maxWidth: isEditing ? '400px' : '600px',
          backgroundColor: isEditing ? '#1f2c34' : 'transparent',
          borderRadius: isEditing ? '16px' : '0',
          padding: isEditing ? '32px' : '0',
          border: isEditing ? '1px solid #2a3942' : 'none',
          boxShadow: isEditing ? '0 4px 24px rgba(0, 0, 0, 0.4)' : 'none'
        }}
      >
        <input
          ref={avatarInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleAvatarFileSelected}
        />
        {!isEditing ? (
            <ProfileView />
        ) : (
            <form onSubmit={handleSubmit}>
            {/* Avatar */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
                <div style={{ position: 'relative', width: '120px', height: '120px' }}>
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      borderRadius: '50%',
                      backgroundColor: '#2a3942',
                      overflow: 'hidden',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {user?.profile?.avatarUrl ? (
                      <img
                        src={user.profile.avatarUrl}
                        alt="Profile"
                        referrerPolicy="no-referrer"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <User size={50} color="#6a7f8a" />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={isUploadingAvatar}
                    title="Change profile photo"
                    style={{
                      position: 'absolute',
                      bottom: '4px',
                      right: '4px',
                      width: '34px',
                      height: '34px',
                      borderRadius: '50%',
                      backgroundColor: '#00a884',
                      border: '2px solid #1f2c34',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#017a62')}
                    onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#00a884')}
                  >
                    {isUploadingAvatar ? (
                      <Loader2 size={16} color="white" className="animate-spin" />
                    ) : (
                      <Camera size={16} color="white" />
                    )}
                  </button>
                </div>
            </div>

            {/* Display Name */}
            <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', color: '#8696a0', fontSize: '14px', marginBottom: '8px' }}>
                Your Name
                </label>
                <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter your name"
                maxLength={50}
                disabled={isLoading}
                style={inputStyle}
                />
                <p style={{ color: '#8696a0', fontSize: '12px', marginTop: '4px', textAlign: 'right' }}>
                {displayName.length}/50
                </p>
            </div>

            {/* About */}
            <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', color: '#8696a0', fontSize: '14px', marginBottom: '8px' }}>
                About
                </label>
                <textarea
                value={about}
                onChange={(e) => setAbout(e.target.value)}
                placeholder="Write something about yourself"
                maxLength={140}
                rows={3}
                disabled={isLoading}
                style={{ ...inputStyle, resize: 'none' }}
                />
                <p style={{ color: '#8696a0', fontSize: '12px', marginTop: '4px', textAlign: 'right' }}>
                {about.length}/140
                </p>
            </div>

            {/* Submit */}
            <button
                type="submit"
                disabled={isLoading || !displayName.trim()}
                style={{
                width: '100%',
                backgroundColor: isLoading || !displayName.trim() ? '#1a5c3e' : '#25d366',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                padding: '16px',
                fontSize: '16px',
                fontWeight: '600',
                cursor: isLoading || !displayName.trim() ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                opacity: isLoading || !displayName.trim() ? 0.6 : 1,
                transition: 'all 0.2s ease'
                }}
            >
                {isLoading ? (
                <>
                    <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
                    Saving...
                </>
                ) : (
                <>
                    <Check size={20} />
                    {user?.profile?.displayName ? 'Save Changes' : 'Complete Setup'}
                </>
                )}
            </button>
            </form>
        )}
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
