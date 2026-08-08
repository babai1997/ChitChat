import { View, Text, TouchableOpacity, StyleSheet, Platform, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MessageCircle, Lock } from 'lucide-react-native';
import { useState, useEffect } from 'react';
import { router } from 'expo-router';
import { useAuthStore } from '../../src/stores/authStore';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { authApi } from '../../src/api';

console.log('EXPO_PUBLIC_WEB_CLIENT_ID:', process.env.EXPO_PUBLIC_WEB_CLIENT_ID);
console.log('EXPO_PUBLIC_ANDROID_CLIENT_ID:', process.env.EXPO_PUBLIC_ANDROID_CLIENT_ID);

GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_WEB_CLIENT_ID,
  // iosClientId: process.env.EXPO_PUBLIC_IOS_CLIENT_ID,
});

export default function LoginScreen() {
  const { login } = useAuthStore();
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const handleBackendLogin = async (idToken: string) => {
    try {
      const data = await authApi.googleAuth(idToken);
      const { accessToken, refreshToken, user, isNewUser } = data;
      login(accessToken, refreshToken, user, isNewUser);
    } catch (error) {
      console.error('Failed to authenticate with backend:', error);
      setIsAuthenticating(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsAuthenticating(true);
    try {
      await GoogleSignin.hasPlayServices();
      // Force sign out first so the account chooser always appears when clicking login
      await GoogleSignin.signOut().catch(() => {});
      const userInfo = await GoogleSignin.signIn();
      if (userInfo.data?.idToken) {
        await handleBackendLogin(userInfo.data.idToken);
      } else {
        // Failsafe in case it succeeds but returns empty
        setIsAuthenticating(false);
      }
    } catch (error: any) {
      // If the user simply cancelled the modal, we don't need to log it as an error
      if (error.code === '12501' || error.message?.includes('CANCELLED')) {
        console.log('User cancelled Google Sign-In');
      } else {
        console.error('Google Sign-In Error:', error);
      }
      setIsAuthenticating(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        
        {/* Logo Section */}
        <View style={styles.logoContainer}>
          <View style={styles.iconWrapper}>
            <MessageCircle size={44} color="white" />
          </View>
          <Text style={styles.title}>ChitChat</Text>
          <Text style={styles.subtitle}>
            Connect instantly with the people who matter most.
          </Text>
        </View>

        {/* Google Login Section */}
        <View style={styles.loginSection}>
          <TouchableOpacity 
            style={[styles.googleButton, isAuthenticating && styles.googleButtonDisabled]} 
            onPress={handleGoogleLogin}
            disabled={isAuthenticating}
            activeOpacity={0.8}
          >
            <View style={styles.googleButtonInner}>
              {isAuthenticating ? (
                <ActivityIndicator color="black" style={styles.googleIcon} />
              ) : (
                <Image 
                  source={{ uri: 'https://developers.google.com/identity/images/g-logo.png' }} 
                  style={styles.googleIcon} 
                />
              )}
              <Text style={styles.googleButtonText}>
                {isAuthenticating ? 'Connecting...' : 'Continue with Google'}
              </Text>
            </View>
          </TouchableOpacity>
          
          <View style={styles.badgeContainer}>
            <Text style={styles.badgeText}>✨ Quick, secure, and passwordless entry.</Text>
          </View>

          <View style={styles.encryptionRow}>
            <Lock size={14} color="#8696a0" />
            <Text style={styles.encryptionText}>Your messages are end-to-end encrypted</Text>
          </View>
        </View>

      </View>

      {/* Footer */}
      <Text style={styles.footerText}>
        By continuing, you agree to our{' '}
        <Text style={styles.link} onPress={() => router.push('/(auth)/terms')}>Terms</Text>
        {' '}and{' '}
        <Text style={styles.link} onPress={() => router.push('/(auth)/privacy')}>Privacy Policy</Text>
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111b21',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  iconWrapper: {
    width: 88,
    height: 88,
    borderRadius: 24,
    backgroundColor: '#25d366',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    transform: [{ rotate: '-4deg' }],
    // React Native Shadow
    shadowColor: '#25d366',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 10,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#e9edef',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  subtitle: {
    color: '#8696a0',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  loginSection: {
    width: '100%',
    gap: 24,
  },
  googleButton: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 100,
    alignItems: 'center',
  },
  googleButtonDisabled: {
    opacity: 0.8,
  },
  googleButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleIcon: {
    width: 24, 
    height: 24, 
    marginRight: 12,
  },
  googleButtonText: {
    color: 'black',
    fontSize: 16,
    fontWeight: 'bold',
  },
  badgeContainer: {
    backgroundColor: 'rgba(37, 211, 102, 0.1)',
    borderColor: 'rgba(37, 211, 102, 0.2)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  badgeText: {
    color: '#25d366',
    fontSize: 13,
    fontWeight: '500',
  },
  encryptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
  },
  encryptionText: {
    color: '#8696a0',
    fontSize: 13,
  },
  footerText: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 40 : 20,
    left: 0,
    right: 0,
    textAlign: 'center',
    color: '#8696a0',
    fontSize: 13,
  },
  link: {
    color: '#25d366',
    fontWeight: '500',
  },
});
