import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { MessageCircle, ArrowLeft, Loader2, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { authApi } from '../api';
import { useAuthStore } from '../stores';
import { resolvePostLoginRedirect } from '../utils/postLoginRedirect';

const OTP_LENGTH = 6;

export const VerifyOtpPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const phone = location.state?.phone;
  
  const { login } = useAuthStore();
  
  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [isLoading, setIsLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(60);
  const [canResend, setCanResend] = useState(false);
  
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Redirect if no phone
  useEffect(() => {
    if (!phone) {
      navigate('/login');
    }
  }, [phone, navigate]);

  // Resend timer
  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      setCanResend(true);
    }
  }, [resendTimer]);

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);

    // Auto-focus next input
    if (value && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when complete
    if (newOtp.every((digit) => digit) && newOtp.join('').length === OTP_LENGTH) {
      handleVerify(newOtp.join(''));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    const newOtp = [...otp];
    
    pastedData.split('').forEach((digit, index) => {
      newOtp[index] = digit;
    });
    
    setOtp(newOtp);
    
    if (pastedData.length === OTP_LENGTH) {
      handleVerify(pastedData);
    }
  };

  const handleVerify = async (otpCode: string) => {
    setIsLoading(true);
    
    try {
      const response = await authApi.verifyOtp(phone, otpCode);
      login(response.accessToken, response.refreshToken, response.user, response.isNewUser);
      
      toast.success('Logged in successfully!');
      
      if (response.isNewUser || !response.user.profile?.displayName) {
        navigate('/setup-profile');
      } else {
        navigate(resolvePostLoginRedirect(location.state), { replace: true });
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Invalid OTP');
      setOtp(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (!canResend) return;
    
    try {
      await authApi.sendOtp(phone);
      toast.success('OTP resent!');
      setResendTimer(60);
      setCanResend(false);
      setOtp(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Failed to resend OTP');
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '48px',
    height: '56px',
    textAlign: 'center',
    fontSize: '24px',
    fontWeight: 'bold',
    backgroundColor: '#2a3942',
    border: '2px solid #3b4a54',
    borderRadius: '12px',
    color: '#e9edef',
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
        onClick={() => navigate('/login')}
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

      {/* Logo */}
      <div style={{ marginBottom: '32px', textAlign: 'center' }} className="animate-fade-in">
        <div 
          style={{ 
            width: '64px', 
            height: '64px', 
            borderRadius: '50%', 
            backgroundColor: '#25d366', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            margin: '0 auto 16px' 
          }}
        >
          <MessageCircle size={32} color="white" />
        </div>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#e9edef', marginBottom: '8px' }}>
          Verify OTP
        </h1>
        <p style={{ color: '#8696a0' }}>
          Enter the code sent to<br />
          <span style={{ color: '#e9edef', fontWeight: '500' }}>{phone}</span>
        </p>
      </div>

      {/* OTP Input */}
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
        <div 
          style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginBottom: '32px' }} 
          onPaste={handlePaste}
        >
          {otp.map((digit, index) => (
            <input
              key={index}
              ref={(el) => { inputRefs.current[index] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleOtpChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              disabled={isLoading}
              style={{
                ...inputStyle,
                opacity: isLoading ? 0.5 : 1
              }}
            />
          ))}
        </div>

        {isLoading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: '#25d366', marginBottom: '24px' }}>
            <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
            Verifying...
          </div>
        )}

        {/* Resend */}
        <div style={{ textAlign: 'center' }}>
          {canResend ? (
            <button
              onClick={handleResend}
              style={{
                color: '#25d366',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontWeight: '500',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <RefreshCw size={16} />
              Resend OTP
            </button>
          ) : (
            <p style={{ color: '#8696a0' }}>
              Resend OTP in <span style={{ color: '#25d366', fontWeight: '500' }}>{resendTimer}s</span>
            </p>
          )}
        </div>
      </div>

      {/* Dev hint */}
      <p style={{ color: '#8696a0', fontSize: '12px', marginTop: '32px', textAlign: 'center' }}>
        💡 Check server console for OTP in development mode
      </p>
    </div>
  );
};
