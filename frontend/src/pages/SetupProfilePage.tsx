import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Check, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { profileApi } from '../api';
import { useAuthStore } from '../stores';
import { AvatarUpload } from '../features/profile/components/AvatarUpload';

export const SetupProfilePage = () => {
  const navigate = useNavigate();
  const { updateProfile, user } = useAuthStore();
  
  const [displayName, setDisplayName] = useState(user?.profile?.displayName || '');
  const [about, setAbout] = useState(user?.profile?.about || 'Hey there! I am using ChitChat');
  const [isLoading, setIsLoading] = useState(false);

  const handleBack = () => {
    // Log out and go back to login
    navigate('/');
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
      navigate('/');
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
          Set Up Your Profile
        </h1>
        <p style={{ color: '#8696a0' }}>
          Let others know who you are
        </p>
      </div>

      {/* Profile Form */}
      <div 
        className="animate-slide-up"
        style={{ 
          width: '100%', 
          maxWidth: '400px',
          backgroundColor: '#1f2c34',
          borderRadius: '16px',
          padding: '32px',
          border: '1px solid #2a3942',
          boxShadow: '0 4px 24px rgba(0, 0, 0, 0.4)'
        }}
      >
        <form onSubmit={handleSubmit}>
          {/* Avatar */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
             <AvatarUpload
                currentAvatarUrl={user?.profile?.avatarUrl || null}
                onUpload={async (file) => {
                  setIsLoading(true);
                  try {
                    const updatedProfile = await profileApi.uploadAvatar(file);
                    updateProfile({ avatarUrl: updatedProfile.avatarUrl });
                    toast.success('Avatar updated!');
                  } catch (error) {
                    console.error('Avatar upload failed:', error);
                    toast.error('Failed to upload avatar');
                  } finally {
                    setIsLoading(false);
                  }
                }}
                isUploading={isLoading}
             />
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
                Complete Setup
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
