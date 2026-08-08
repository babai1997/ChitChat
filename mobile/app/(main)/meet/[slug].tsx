import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Video } from 'lucide-react-native';
import { meetingsApi } from '../../../src/api';
import { useCall } from '../../../src/contexts/CallContext';

/**
 * Landing screen for a shared meeting link (`/meet/:slug`). Joining grants
 * ChatMember membership via a self-service slug lookup (see
 * MeetingsService.join on the backend) rather than an admin invite —
 * everything after that point reuses the exact same CallContext/
 * ActiveCallScreen any other chat's call uses. Mobile renders its active
 * -call UI INSIDE chat/[id].tsx (not a global overlay like web's
 * CallModal), so once the call is started/joined here, we hand off to
 * that screen to actually render it.
 */
export default function MeetingJoinScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const { ongoingCallsByChatId, startCall, joinOngoingCall } = useCall();
  const [error, setError] = useState<string | null>(null);
  const hasJoinedRef = useRef(false);

  useEffect(() => {
    if (!slug || hasJoinedRef.current) return;
    hasJoinedRef.current = true;

    (async () => {
      try {
        const { chatId } = await meetingsApi.join(slug);
        const ongoing = ongoingCallsByChatId.get(chatId);
        if (ongoing) {
          await joinOngoingCall(chatId, ongoing.type);
        } else {
          await startCall(chatId, 'video');
        }
        router.replace(`/chat/${chatId}`);
      } catch (err: any) {
        console.error('Failed to join meeting:', err);
        setError(
          err?.response?.status === 404
            ? 'This meeting link is no longer valid.'
            : 'Failed to join this meeting. Please try again.',
        );
      }
    })();
  }, [slug]);

  return (
    <View style={styles.container}>
      {error ? (
        <>
          <Video size={40} color="#8696a0" />
          <Text style={styles.message}>{error}</Text>
          <TouchableOpacity style={styles.button} onPress={() => router.replace('/')}>
            <Text style={styles.buttonText}>Go to ChitChat</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <ActivityIndicator size="large" color="#00a884" />
          <Text style={styles.message}>Joining meeting…</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b141a',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 24,
  },
  message: { color: '#8696a0', fontSize: 15, textAlign: 'center' },
  button: {
    backgroundColor: '#00a884',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  buttonText: { color: '#0b141a', fontWeight: '600', fontSize: 15 },
});
