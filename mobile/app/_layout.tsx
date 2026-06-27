import { Stack, useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { useEffect, useState } from 'react';
import { useAuthStore } from '../src/stores/authStore';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { View, Text } from 'react-native';
import { SocketProvider, useSocketContext } from '../src/contexts/SocketProvider';
import { CallProvider } from '../src/contexts/CallContext';
import IncomingCallModal from '../components/call/IncomingCallModal';

function ReconnectBanner() {
  const { isReconnecting } = useSocketContext();
  if (!isReconnecting) return null;
  return (
    <View style={{ backgroundColor: '#2a3942', paddingVertical: 5, alignItems: 'center' }}>
      <Text style={{ color: '#e9edef', fontSize: 12 }}>⟳ Reconnecting…</Text>
    </View>
  );
}

/**
 * Wait for Zustand persist to finish reading from AsyncStorage.
 */
function useHasHydrated() {
  const [hydrated, setHydrated] = useState(
    () => useAuthStore.persist.hasHydrated()
  );

  useEffect(() => {
    if (hydrated) return;
    const unsub = useAuthStore.persist.onFinishHydration(() => setHydrated(true));
    return unsub;
  }, [hydrated]);

  return hydrated;
}

export default function RootLayout() {
  const hydrated = useHasHydrated();
  const { isAuthenticated } = useAuthStore();
  const segments = useSegments() as string[];
  const router = useRouter();

  const navigationState = useRootNavigationState();

  useEffect(() => {
    if (!hydrated || !navigationState?.key) return;

    const inAuthGroup = segments[0] === '(auth)';

    const timeout = setTimeout(() => {
      const user = useAuthStore.getState().user;
      const hasProfile = !!user?.profile?.displayName;
      const isSetupScreen = segments.length > 1 && segments[1] === 'setup-profile';

      if (!isAuthenticated && !inAuthGroup) {
        router.replace('/(auth)/login');
      } else if (isAuthenticated) {
        if (!hasProfile && (!inAuthGroup || !isSetupScreen)) {
          router.replace('/(auth)/setup-profile');
        } else if (hasProfile && inAuthGroup) {
          router.replace('/(main)');
        }
      }
    }, 0);

    return () => clearTimeout(timeout);
  }, [isAuthenticated, segments, hydrated, navigationState?.key]);

  if (!hydrated) {
    return (
      <View style={{ flex: 1, backgroundColor: '#111b21', justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: '#00a884', fontSize: 18 }}>Loading...</Text>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" backgroundColor="transparent" translucent />
      <SocketProvider>
        <CallProvider>
          <ReconnectBanner />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#111b21' }, animation: 'slide_from_right' }}>
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            <Stack.Screen name="(main)" options={{ headerShown: false }} />
          </Stack>
          {/* Global incoming call overlay */}
          <IncomingCallModal />
        </CallProvider>
      </SocketProvider>
    </SafeAreaProvider>
  );
}
