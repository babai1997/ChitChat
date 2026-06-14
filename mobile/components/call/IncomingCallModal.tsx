import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Image,
  Animated,
  Easing,
} from 'react-native';
import { PhoneOff, Video, Phone, User } from 'lucide-react-native';
import { useCall } from '../../src/contexts/CallContext';

export default function IncomingCallModal() {
  const { incomingCall, answerCall, rejectCall } = useCall();
  const pulseAnim = useRef(new Animated.Value(1)).current;

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
    <Modal visible animationType="fade" transparent statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Pulse ring */}
          <Animated.View style={[styles.pulseRing, { transform: [{ scale: pulseAnim }] }]} />

          {/* Avatar */}
          <View style={styles.avatarWrapper}>
            {incomingCall.callerAvatar ? (
              <Image source={{ uri: incomingCall.callerAvatar }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <User size={52} color="#8696a0" />
              </View>
            )}
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
              <TouchableOpacity style={[styles.actionBtn, styles.acceptBtn]} onPress={answerCall} activeOpacity={0.8}>
                {isVideo ? <Video size={30} color="white" /> : <Phone size={30} color="white" />}
              </TouchableOpacity>
              <Text style={styles.actionLabel}>Accept</Text>
            </View>
          </View>
        </View>
      </View>
    </Modal>
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
    backgroundColor: '#1f2c33',
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
    top: 20,
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 3,
    borderColor: 'rgba(0, 168, 132, 0.3)',
  },
  avatarWrapper: {
    marginBottom: 20,
  },
  avatar: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 3,
    borderColor: '#00a884',
  },
  avatarPlaceholder: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#2a3942',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#00a884',
  },
  callerName: {
    fontSize: 26,
    fontWeight: '600',
    color: '#e9edef',
    marginBottom: 8,
  },
  callTypeText: {
    color: '#8696a0',
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
    backgroundColor: '#ef4444',
  },
  acceptBtn: {
    backgroundColor: '#00a884',
  },
  actionLabel: {
    color: '#e9edef',
    fontSize: 13,
    fontWeight: '500',
  },
});
