import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, Phone, ArrowRight, Loader2 } from 'lucide-react';
import { GoogleLogin, type CredentialResponse } from '@react-oauth/google';
import toast from 'react-hot-toast';
import { authApi } from '../api';
import { useAuthStore } from '../stores';

export const LoginPage = () => {
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const [phone, setPhone] = useState('+91');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const handleGoogleSuccess = async (credentialResponse: CredentialResponse) => {
    if (!credentialResponse.credential) {
      toast.error('Google Sign-In failed: No credential');
      return;
    }

    setIsGoogleLoading(true);
    try {
      const response = await authApi.googleAuth(credentialResponse.credential);
      login(response.accessToken, response.refreshToken, response.user, response.isNewUser);
      toast.success('Logged in with Google!');
      
      if (response.isNewUser || !response.user.profile?.displayName) {
        navigate('/setup-profile');
      } else {
        navigate('/');
      }
    } catch (error: unknown) {
      console.error(error);
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Google Auth failed');
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const formatPhoneNumber = (value: string) => {
    // Remove all non-digits except +
    const cleaned = value.replace(/[^\d+]/g, '');
    
    // Ensure it starts with +
    if (cleaned && !cleaned.startsWith('+')) {
      return '+' + cleaned;
    }
    return cleaned;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneNumber(e.target.value);
    setPhone(formatted);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!phone || phone.length < 12) {
      toast.error('Please enter a valid phone number');
      return;
    }

    setIsLoading(true);
    
    try {
      await authApi.sendOtp(phone);
      toast.success('OTP sent successfully!');
      navigate('/verify-otp', { state: { phone } });
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Failed to send OTP');
    } finally {
      setIsLoading(false);
    }
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
      {/* Google Loading Overlay */}
      {isGoogleLoading && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(17, 27, 33, 0.9)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 50
        }}>
          <Loader2 size={40} style={{ animation: 'spin 1s linear infinite', color: '#25d366' }} />
          <p style={{ color: '#e9edef', marginTop: '16px', fontSize: '18px' }}>Signing in with Google...</p>
        </div>
      )}
      {/* Logo */}
      <div style={{ marginBottom: '32px', textAlign: 'center' }} className="animate-fade-in">
        <div 
          style={{ 
            width: '80px', 
            height: '80px', 
            borderRadius: '50%', 
            backgroundColor: '#25d366', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            margin: '0 auto 16px' 
          }}
        >
          <MessageCircle size={40} color="white" />
        </div>
        <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: '#e9edef', marginBottom: '8px' }}>
          ChitChat
        </h1>
        <p style={{ color: '#8696a0' }}>Connect with friends & family</p>
      </div>

      {/* Login Form */}
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
        <h2 style={{ 
          fontSize: '18px', 
          fontWeight: '600', 
          color: '#e9edef', 
          marginBottom: '24px', 
          textAlign: 'center' 
        }}>
          Enter your phone number
        </h2>
        
        <form onSubmit={handleSubmit}>
          <div style={{ position: 'relative', marginBottom: '24px' }}>
            <Phone 
              size={20} 
              style={{ 
                position: 'absolute', 
                left: '16px', 
                top: '50%', 
                transform: 'translateY(-50%)', 
                color: '#8696a0' 
              }} 
            />
            <input
              type="tel"
              value={phone}
              onChange={handlePhoneChange}
              placeholder="+91 98765 43210"
              disabled={isLoading}
              style={{
                width: '100%',
                backgroundColor: '#2a3942',
                border: '1px solid #3b4a54',
                borderRadius: '12px',
                padding: '16px 16px 16px 48px',
                color: '#e9edef',
                fontSize: '18px',
                outline: 'none'
              }}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || phone.length < 12}
            style={{
              width: '100%',
              backgroundColor: isLoading || phone.length < 12 ? '#1a5c3e' : '#25d366',
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              padding: '16px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: isLoading || phone.length < 12 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              opacity: isLoading || phone.length < 12 ? 0.6 : 1,
              transition: 'all 0.2s ease'
            }}
          >
            {isLoading ? (
              <>
                <Loader2 size={20} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} />
                Sending OTP...
              </>
            ) : (
              <>
                Continue
                <ArrowRight size={20} />
              </>
            )}
          </button>
        </form>

        <p style={{ color: '#8696a0', fontSize: '14px', textAlign: 'center', marginTop: '24px' }}>
          We'll send you a verification code via SMS
        </p>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', margin: '24px 0' }}>
          <div style={{ flex: 1, height: '1px', backgroundColor: '#2a3942' }}></div>
          <span style={{ color: '#8696a0', fontSize: '14px' }}>OR</span>
          <div style={{ flex: 1, height: '1px', backgroundColor: '#2a3942' }}></div>
        </div>

        {/* Google Login */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <GoogleLogin
            onSuccess={handleGoogleSuccess}
            onError={() => toast.error('Google Sign-In failed')}
            theme="filled_black"
            shape="circle"
            width="300px" // This might be ignored by the component if specific sizes are enforced, but good to try
          />
        </div>
      </div>

      {/* Footer */}
      <p style={{ color: '#8696a0', fontSize: '12px', marginTop: '32px', textAlign: 'center' }}>
        By continuing, you agree to our Terms of Service and Privacy Policy
      </p>
    </div>
  );
};
