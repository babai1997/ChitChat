import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Animated,
  Easing,
} from 'react-native';
import { PhoneOff, Video, Phone, User } from 'lucide-react-native';
import { useCall } from '../../src/contexts/CallContext';
import { useRouter } from 'expo-router';
import { COLORS } from '../../src/theme/colors';

export default function IncomingCallModal() {
  const { incomingCall, answerCall, rejectCall } = useCall();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const router = useRouter();

  const handleAccept = () => {
    if (!incomingCall) return;
    const chatId = incomingCall.chatId;
    answerCall();
    router.push(`/chat/${chatId}`);
  };

  useEffect(() => {
    if (!incomingCall) {
      pulseAnim.setValue(1);
      return;
    }

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.12,
          duration: 700,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 700,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [!!incomingCall]);

  if (!incomingCall) return null;

  const isVideo = incomingCall.type === 'video';

  return (
    <View style={[StyleSheet.absoluteFill, styles.overlay, { zIndex: 9999, elevation: 9999 }]}>
      <View style={styles.card}>
          <View style={{ alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
            {/* Pulse ring */}
            <Animated.View style={[styles.pulseRing, { transform: [{ scale: pulseAnim }] }]} />

            {/* Avatar */}
            <View style={styles.avatarWrapper}>
              {incomingCall.callerAvatar ? (
                <Image source={{ uri: incomingCall.callerAvatar }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <User size={52} color={COLORS.textSecondary} />
                </View>
              )}
            </View>
          </View>

          <Text style={styles.callerName}>{incomingCall.callerName}</Text>
          <Text style={styles.callTypeText}>
            Incoming {isVideo ? 'video' : 'voice'} call…
          </Text>

          {/* Actions */}
          <View style={styles.actions}>
            {/* Decline */}
            <View style={styles.actionItem}>
              <TouchableOpacity style={[styles.actionBtn, styles.rejectBtn]} onPress={rejectCall} activeOpacity={0.8}>
                <PhoneOff size={30} color="white" />
              </TouchableOpacity>
              <Text style={styles.actionLabel}>Decline</Text>
            </View>

            {/* Accept */}
            <View style={styles.actionItem}>
              <TouchableOpacity style={[styles.actionBtn, styles.acceptBtn]} onPress={handleAccept} activeOpacity={0.8}>
                {isVideo ? <Video size={30} color="white" /> : <Phone size={30} color="white" />}
              </TouchableOpacity>
              <Text style={styles.actionLabel}>Accept</Text>
            </View>
          </View>
        </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 28,
    padding: 36,
    alignItems: 'center',
    width: '82%',
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
  },
  pulseRing: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 3,
    borderColor: 'rgba(108, 93, 216, 0.3)',
  },
  avatarWrapper: {
  },
  avatar: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 3,
    borderColor: COLORS.accent,
  },
  avatarPlaceholder: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: COLORS.accent,
  },
  callerName: {
    fontSize: 26,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  callTypeText: {
    color: COLORS.textSecondary,
    fontSize: 15,
    marginBottom: 40,
  },
  actions: {
    flexDirection: 'row',
    gap: 52,
  },
  actionItem: {
    alignItems: 'center',
    gap: 10,
  },
  actionBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  rejectBtn: {
    backgroundColor: COLORS.danger,
  },
  acceptBtn: {
    backgroundColor: COLORS.accent,
  },
  actionLabel: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '500',
  },
});
