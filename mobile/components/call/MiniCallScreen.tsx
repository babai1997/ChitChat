import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Animated, PanResponder, NativeModules } from 'react-native';
import { useCall } from '../../src/contexts/CallContext';
import { useRouter, useSegments } from 'expo-router';
import { Phone, Video, MicOff } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

let RTCView: any = View;
try {
  RTCView = require('react-native-webrtc').RTCView;
} catch (e) {}

export default function MiniCallScreen() {
  const { isCallActive, activeChatId, callStatus, callType, remoteStreams, isMuted } = useCall();
  const remoteStream = remoteStreams.size > 0 ? remoteStreams.values().next().value : null;
  const router = useRouter();
  const segments = useSegments() as string[];
  const insets = useSafeAreaInsets();

  const pan = useRef(new Animated.ValueXY()).current;
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only trigger drag if moved more than 5 pixels
        return Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5;
      },
      onPanResponderGrant: () => {
        pan.setOffset({
          x: (pan.x as any)._value,
          y: (pan.y as any)._value,
        });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event(
        [null, { dx: pan.x, dy: pan.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: () => {
        pan.flattenOffset();
      },
    })
  ).current;

  if (!isCallActive) return null;

  // Don't show mini screen if we are already inside the full chat view
  // which renders the full ActiveCallScreen
  const isChatScreen = segments.length > 2 && segments[2] === '[id]' && segments[1] === 'chat';
  if (isChatScreen) return null;

  const isVideo = callType === 'video';

  const formatStatus = () => {
    if (callStatus === 'calling') return 'Calling...';
    if (callStatus === 'connected') return 'Ongoing call';
    return 'Connecting...';
  };

  return (
    <Animated.View
      style={[
        styles.container,
        { bottom: Platform.OS === 'ios' ? 100 : 80 + insets.bottom },
        { transform: [{ translateX: pan.x }, { translateY: pan.y }] }
      ]}
      {...panResponder.panHandlers}
    >
      <TouchableOpacity
        style={{ flex: 1, flexDirection: 'row' }}
        activeOpacity={0.9}
        onPress={() => {
          if (activeChatId) {
            router.push(`/chat/${activeChatId}` as any);
          }
        }}
      >
      {isVideo && remoteStream ? (
        <View style={styles.videoWrapper}>
          <RTCView
            streamURL={(remoteStream as any).toURL()}
            style={StyleSheet.absoluteFillObject}
            objectFit="cover"
          />
        </View>
      ) : (
        <View style={[styles.audioWrapper, isVideo && { backgroundColor: '#111b21' }]}>
          {isVideo ? (
            <Video size={24} color="#00a884" />
          ) : (
            <Phone size={24} color="#00a884" />
          )}
        </View>
      )}

      <View style={styles.info}>
        <Text style={styles.title}>Tap to return</Text>
        <Text style={styles.status}>{formatStatus()}</Text>
      </View>

      {isMuted && (
        <View style={styles.muteIcon}>
          <MicOff size={14} color="#ef4444" />
        </View>
      )}
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 16,
    width: 160,
    height: 90,
    backgroundColor: '#202c33',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a3942',
    flexDirection: 'row',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
    zIndex: 9999,
  },
  videoWrapper: {
    width: 60,
    height: '100%',
    backgroundColor: '#000',
  },
  audioWrapper: {
    width: 60,
    height: '100%',
    backgroundColor: 'rgba(0,168,132,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    padding: 8,
    justifyContent: 'center',
  },
  title: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  status: {
    color: '#00a884',
    fontSize: 12,
  },
  muteIcon: {
    position: 'absolute',
    top: 6,
    right: 6,
  },
});
