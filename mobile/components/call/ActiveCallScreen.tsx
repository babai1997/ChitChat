import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Animated,
  Easing,
} from 'react-native';
import { Mic, MicOff, Video, VideoOff, PhoneOff } from 'lucide-react-native';
import { useCall } from '../../src/contexts/CallContext';

// Safe lazy require — react-native-webrtc may fail to load on emulators
// without camera/mic hardware. Falls back to plain View so app doesn't crash.
let RTCView: any = View;
try {
  RTCView = require('react-native-webrtc').RTCView;
} catch (e) {
  console.warn('[ActiveCallScreen] RTCView not available');
}

interface ActiveCallScreenProps {
  chatName: string;
  chatAvatar?: string;
}

export default function ActiveCallScreen({ chatName }: ActiveCallScreenProps) {
  const {
    callStatus,
    callType,
    localStream,
    remoteStream,
    isMuted,
    isVideoEnabled,
    endCall,
    toggleMute,
    toggleVideo,
  } = useCall();

  // Fade animation for "calling…" label
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (callStatus !== 'calling') return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(fadeAnim, { toValue: 0.3, duration: 800, easing: Easing.ease, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 800, easing: Easing.ease, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [callStatus]);

  const statusText =
    callStatus === 'calling' ? 'Calling…' :
    callStatus === 'connected' ? 'Connected' :
    'Connecting…';

  const isVideo = callType === 'video';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {/* Remote video background */}
      {isVideo && remoteStream ? (
        <RTCView
          streamURL={(remoteStream as any).toURL()}
          style={StyleSheet.absoluteFillObject}
          objectFit="cover"
        />
      ) : (
        <View style={styles.audioBackground} />
      )}

      {/* Gradient overlay for readability */}
      <View style={styles.overlay} />

      {/* Header info */}
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Text style={styles.callerName}>{chatName}</Text>
          <Animated.Text style={[styles.statusText, callStatus === 'calling' && { opacity: fadeAnim }]}>
            {statusText}
          </Animated.Text>
        </View>

        {/* Local video PiP */}
        {isVideo && localStream && (
          <View style={styles.localVideoWrapper}>
            <RTCView
              streamURL={(localStream as any).toURL()}
              style={{ flex: 1 }}
              objectFit="cover"
              mirror
            />
          </View>
        )}

        {/* Controls */}
        <View style={styles.controls}>
          <TouchableOpacity style={styles.controlBtn} onPress={toggleMute} activeOpacity={0.8}>
            {isMuted ? <MicOff size={24} color="#e9edef" /> : <Mic size={24} color="#e9edef" />}
            <Text style={styles.controlLabel}>{isMuted ? 'Unmute' : 'Mute'}</Text>
          </TouchableOpacity>

          {/* End call (center, larger) */}
          <TouchableOpacity style={[styles.controlBtn, styles.endCallBtn]} onPress={endCall} activeOpacity={0.85}>
            <PhoneOff size={30} color="white" />
            <Text style={styles.controlLabel}>End</Text>
          </TouchableOpacity>

          {isVideo ? (
            <TouchableOpacity style={styles.controlBtn} onPress={toggleVideo} activeOpacity={0.8}>
              {isVideoEnabled ? <Video size={24} color="#e9edef" /> : <VideoOff size={24} color="#e9edef" />}
              <Text style={styles.controlLabel}>{isVideoEnabled ? 'Cam off' : 'Cam on'}</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.controlBtn} />
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  audioBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0b1a24',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  safeArea: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 24,
  },
  callerName: {
    fontSize: 30,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 10,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  statusText: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.75)',
  },
  localVideoWrapper: {
    position: 'absolute',
    top: 130,
    right: 16,
    width: 110,
    height: 155,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 8,
  },
  controls: {
    position: 'absolute',
    bottom: 50,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 28,
    paddingHorizontal: 32,
  },
  controlBtn: {
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 50,
    padding: 16,
    minWidth: 76,
  },
  controlLabel: {
    color: '#e9edef',
    fontSize: 11,
    fontWeight: '500',
  },
  endCallBtn: {
    backgroundColor: '#ef4444',
    padding: 22,
    elevation: 6,
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
});
