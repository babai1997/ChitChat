import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MessageCircle, Loader2 } from 'lucide-react';
import { GoogleLogin, type CredentialResponse } from '@react-oauth/google';
import toast from 'react-hot-toast';
import { authApi } from '../api';
import { useAuthStore } from '../stores';
import { resolvePostLoginRedirect } from '../utils/postLoginRedirect';

export const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuthStore();
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
        // Profile isn't complete yet — SetupProfilePage resolves the same
        // redirect target itself once setup finishes, so the meeting link
        // (or wherever ProtectedRoute bounced from) isn't lost.
        navigate('/setup-profile');
      } else {
        navigate(resolvePostLoginRedirect(location.state), { replace: true });
      }
    } catch (error: unknown) {
      console.error(error);
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Google Auth failed');
    } finally {
      setIsGoogleLoading(false);
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
        padding: '24px',
        background: 'linear-gradient(135deg, #0b141a 0%, #111b21 100%)',
        position: 'relative',
        overflow: 'hidden',
        fontFamily: "'Inter', sans-serif"
      }}
    >
      {/* Background Ambient Glows */}
      <div style={{
        position: 'absolute',
        top: '-10%',
        left: '-10%',
        width: '500px',
        height: '500px',
        background: 'radial-gradient(circle, rgba(37, 211, 102, 0.15) 0%, rgba(0,0,0,0) 70%)',
        borderRadius: '50%',
        filter: 'blur(60px)',
        zIndex: 0
      }} />
      <div style={{
        position: 'absolute',
        bottom: '-10%',
        right: '-10%',
        width: '400px',
        height: '400px',
        background: 'radial-gradient(circle, rgba(18, 140, 126, 0.15) 0%, rgba(0,0,0,0) 70%)',
        borderRadius: '50%',
        filter: 'blur(60px)',
        zIndex: 0
      }} />

      {/* Google Loading Overlay */}
      {isGoogleLoading && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(11, 20, 26, 0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 50,
          transition: 'all 0.3s ease'
        }}>
          <Loader2 size={48} style={{ animation: 'spin 1s linear infinite', color: '#25d366' }} />
          <p style={{ color: '#e9edef', marginTop: '20px', fontSize: '18px', fontWeight: '500', letterSpacing: '0.5px' }}>
            Authenticating securely...
          </p>
        </div>
      )}

      {/* Login Card */}
      <div 
        className="animate-slide-up"
        style={{ 
          width: '100%', 
          maxWidth: '420px',
          background: 'rgba(31, 44, 52, 0.6)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderRadius: '24px',
          padding: '48px 32px',
          border: '1px solid rgba(255, 255, 255, 0.05)',
          boxShadow: '0 24px 48px rgba(0, 0, 0, 0.4)',
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}
      >
        {/* Logo Section */}
        <div style={{ marginBottom: '40px', textAlign: 'center' }} className="animate-fade-in">
          <div 
            style={{ 
              width: '88px', 
              height: '88px', 
              borderRadius: '24px', 
              background: 'linear-gradient(135deg, #25d366 0%, #128c7e 100%)', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              margin: '0 auto 24px',
              boxShadow: '0 8px 24px rgba(37, 211, 102, 0.3)',
              transform: 'rotate(-4deg)',
              transition: 'transform 0.3s ease'
            }}
            onMouseOver={(e) => e.currentTarget.style.transform = 'rotate(0deg) scale(1.05)'}
            onMouseOut={(e) => e.currentTarget.style.transform = 'rotate(-4deg) scale(1)'}
          >
            <MessageCircle size={44} color="white" />
          </div>
          <h1 style={{ 
            fontSize: '32px', 
            fontWeight: '800', 
            color: '#e9edef', 
            marginBottom: '8px',
            letterSpacing: '-0.5px'
          }}>
            ChitChat
          </h1>
          <p style={{ color: '#8696a0', fontSize: '15px', lineHeight: '1.5' }}>
            Connect instantly with the people who matter most.
          </p>
        </div>

        {/* Google Login Section */}
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'center',
            padding: '4px',
            background: 'rgba(0, 0, 0, 0.2)',
            borderRadius: '100px',
            border: '1px solid rgba(255,255,255,0.02)'
          }}>
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={() => toast.error('Google Sign-In failed')}
              theme="filled_black"
              shape="circle"
              size="large"
              width="300px"
              text="continue_with"
            />
          </div>
          
          <div style={{
            background: 'rgba(37, 211, 102, 0.1)',
            border: '1px solid rgba(37, 211, 102, 0.2)',
            borderRadius: '12px',
            padding: '16px',
            textAlign: 'center'
          }}>
            <p style={{ color: '#25d366', fontSize: '13px', fontWeight: '500' }}>
              ✨ Quick, secure, and passwordless entry.
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ 
        position: 'absolute', 
        bottom: '32px', 
        color: '#8696a0', 
        fontSize: '13px', 
        textAlign: 'center',
        zIndex: 10
      }}>
        By continuing, you agree to our{' '}
        <a href="#" style={{ color: '#25d366', textDecoration: 'none', fontWeight: '500' }}>Terms</a>
        {' '}and{' '}
        <a href="#" style={{ color: '#25d366', textDecoration: 'none', fontWeight: '500' }}>Privacy Policy</a>
      </div>
    </div>
  );
};
