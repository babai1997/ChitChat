import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Animated,
  Easing,
  Image,
  PanResponder,
} from "react-native";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  User,
  Minimize2,
  UserPlus,
  MessageSquare,
  MoreHorizontal,
  Volume2,
} from "lucide-react-native";
import { useCall } from "../../src/contexts/CallContext";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useRouter } from "expo-router";

// Safe lazy require — react-native-webrtc may fail to load on emulators
// without camera/mic hardware. Falls back to plain View so app doesn't crash.
let RTCView: any = View;
try {
  RTCView = require("react-native-webrtc").RTCView;
} catch (e) {
  console.warn("[ActiveCallScreen] RTCView not available");
}

interface ActiveCallScreenProps {
  chatName: string;
  chatAvatar?: string;
}

export default function ActiveCallScreen({
  chatName,
  chatAvatar,
}: ActiveCallScreenProps) {
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

  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [isSpeaker, setIsSpeaker] = useState(callType === "video");

  // Fade animation for "calling…" label
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Draggable PiP
  const pan = useRef(new Animated.ValueXY()).current;
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: () => {
        pan.extractOffset();
      },
    }),
  ).current;

  useEffect(() => {
    if (callStatus !== "calling") return;

    // Fade for text
    const textAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(fadeAnim, {
          toValue: 0.3,
          duration: 800,
          easing: Easing.ease,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 800,
          easing: Easing.ease,
          useNativeDriver: true,
        }),
      ]),
    );
    textAnim.start();

    // Pulse for avatar ring
    const ringAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.15,
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
    ringAnim.start();

    return () => {
      textAnim.stop();
      ringAnim.stop();
    };
  }, [callStatus]);

  const statusText =
    callStatus === "calling"
      ? "Calling…"
      : callStatus === "connected"
        ? "Connected"
        : "Connecting…";

  const isVideo = callType === "video";

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

      <SafeAreaView style={styles.safeArea}>
        {/* Top Header Row */}
        <View style={[styles.topBar, { paddingTop: Math.max(insets.top, 16) }]}>
          <TouchableOpacity
            style={styles.topIconBtn}
            onPress={() => router.back()}
          >
            <Minimize2 size={24} color="#fff" />
          </TouchableOpacity>

          <View style={styles.headerTitles}>
            <Text style={styles.callerName}>{chatName}</Text>
            <Animated.Text
              style={[
                styles.statusText,
                callStatus === "calling" && { opacity: fadeAnim },
              ]}
            >
              {statusText}
            </Animated.Text>
          </View>

          <View style={styles.topRightBtns}>
            <TouchableOpacity
              style={styles.topIconBtn}
              onPress={() => console.log("Add user")}
            >
              <UserPlus size={24} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.topIconBtn, { marginTop: 12 }]}
              onPress={() => router.back()}
            >
              <MessageSquare size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Audio Avatar Center */}
        {!isVideo && (
          <View style={styles.avatarCenterContainer}>
            <View
              style={{
                alignItems: "center",
                justifyContent: "center",
                marginTop: -50,
              }}
            >
              {callStatus === "calling" && (
                <Animated.View
                  style={[
                    styles.pulseRing,
                    { transform: [{ scale: pulseAnim }] },
                  ]}
                />
              )}
              {chatAvatar ? (
                <Image
                  source={{ uri: chatAvatar }}
                  style={styles.largeAvatar}
                />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <User size={80} color="#8696a0" />
                </View>
              )}
            </View>
          </View>
        )}

        {/* Local video PiP */}
        {isVideo && localStream && (
          <Animated.View
            style={[
              styles.localVideoWrapper,
              { transform: [{ translateX: pan.x }, { translateY: pan.y }] },
            ]}
            {...panResponder.panHandlers}
          >
            <RTCView
              streamURL={(localStream as any).toURL()}
              style={{ flex: 1 }}
              objectFit="cover"
              mirror
            />
          </Animated.View>
        )}

        {/* Bottom Control Pill */}
        <View style={styles.bottomPillContainer}>
          <View style={styles.bottomPill}>
            <TouchableOpacity
              style={styles.pillIconBtn}
              onPress={() => console.log("More options")}
            >
              <MoreHorizontal size={24} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.pillIconBtn} onPress={toggleVideo}>
              {isVideoEnabled ? (
                <Video size={24} color="#fff" />
              ) : (
                <VideoOff size={24} color="#fff" />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.pillIconBtn,
                isSpeaker && { backgroundColor: "rgba(255,255,255,0.2)" },
              ]}
              onPress={() => setIsSpeaker(!isSpeaker)}
            >
              <Volume2 size={24} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.pillIconBtn,
                isMuted && { backgroundColor: "rgba(255,255,255,0.2)" },
              ]}
              onPress={toggleMute}
            >
              {isMuted ? (
                <MicOff size={24} color="#fff" />
              ) : (
                <Mic size={24} color="#fff" />
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.endCallBtn} onPress={endCall}>
              <PhoneOff size={28} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  audioBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0f171b", // dark whatsapp bg
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.1)",
  },
  safeArea: {
    flex: 1,
    justifyContent: "space-between",
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    alignItems: "flex-start",
  },
  topIconBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitles: {
    alignItems: "center",
    flex: 1,
    marginTop: 4,
  },
  callerName: {
    fontSize: 22,
    fontWeight: "500",
    color: "#fff",
    marginBottom: 4,
  },
  statusText: {
    fontSize: 15,
    color: "rgba(255,255,255,0.7)",
  },
  topRightBtns: {
    alignItems: "center",
  },
  avatarCenterContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  largeAvatar: {
    width: 180,
    height: 180,
    borderRadius: 90,
    zIndex: 2,
  },
  avatarPlaceholder: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "#1f2c33",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  pulseRing: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.2)",
    zIndex: 1,
  },
  localVideoWrapper: {
    position: "absolute",
    top: 130,
    right: 16,
    width: 110,
    height: 155,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.25)",
  },
  bottomPillContainer: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  bottomPill: {
    flexDirection: "row",
    backgroundColor: "#1c2227",
    borderRadius: 40,
    paddingVertical: 12,
    paddingHorizontal: 16,
    justifyContent: "space-between",
    alignItems: "center",
  },
  pillIconBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  endCallBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#ff253a",
    alignItems: "center",
    justifyContent: "center",
  },
});
