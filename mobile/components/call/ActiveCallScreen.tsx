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
  AppState,
  Dimensions,
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
import { useAuthStore } from "../../src/stores/authStore";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useRouter } from "expo-router";

let RTCView: any = View;
try {
  RTCView = require("react-native-webrtc").RTCView;
} catch (e) {
  console.warn("[ActiveCallScreen] RTCView not available");
}

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

// ── Helpers ───────────────────────────────────────────────────────────────────

function chunkArray<T>(arr: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, i * size + size),
  );
}

// ── Remote participant tile ───────────────────────────────────────────────────
// Shows either the participant's RTCView or their avatar when camera is off.

function RemoteParticipantTile({
  userId,
  stream,
  videoEnabled,
  chatAvatar,
  style,
  videoRenderKey,
  isSingleParticipant,
}: {
  userId: string;
  stream: MediaStream | undefined;
  videoEnabled: boolean;
  chatAvatar?: string;
  style?: any;
  videoRenderKey: number;
  isSingleParticipant: boolean;
}) {
  const streamURL = stream ? (stream as any).toURL() : null;

  if (!videoEnabled || !streamURL) {
    return (
      <View style={[styles.remoteTile, styles.remoteTileAvatarBg, style]}>
        {chatAvatar ? (
          <Image
            source={{ uri: chatAvatar }}
            style={isSingleParticipant ? styles.avatarBgImage : styles.remoteTileAvatar}
          />
        ) : (
          <View style={isSingleParticipant ? styles.avatarBgPlaceholder : styles.remoteTileAvatarPlaceholder}>
            <User size={isSingleParticipant ? 100 : 48} color="#8696a0" />
          </View>
        )}
        <Text style={styles.cameraOffLabel}>Camera off</Text>
      </View>
    );
  }

  return (
    <RTCView
      key={`remote-${userId}-${videoRenderKey}`}
      streamURL={streamURL}
      style={[styles.remoteTile, style]}
      objectFit="cover"
      zOrder={0}
    />
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

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
    remoteStreams,
    remoteVideoStates,
    isMuted,
    isVideoEnabled,
    isSpeaker,
    endCall,
    toggleMute,
    toggleVideo,
    toggleSpeaker,
  } = useCall();

  const insets = useSafeAreaInsets();
  const router = useRouter();
  const localUserAvatar = useAuthStore((s) => s.user?.profile?.avatarUrl ?? null);

  const [videoRenderKey, setVideoRenderKey] = useState(0);
  const appStateRef = useRef(AppState.currentState);

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

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

  // Re-render RTCView when returning from background
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextState === "active"
      ) {
        setVideoRenderKey((k) => k + 1);
      }
      appStateRef.current = nextState;
    });
    return () => sub.remove();
  }, []);

  // Bump once after mount to ensure RTCView starts rendering
  useEffect(() => {
    const t = setTimeout(() => setVideoRenderKey((k) => k + 1), 300);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (callStatus !== "calling") return;

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
  const participantIds = Array.from(remoteStreams.keys());
  const participantCount = participantIds.length;

  // Show center avatar: audio calls, or video call during calling/ringing phase
  const showCenterAvatar = !isVideo || callStatus === "calling" || callStatus === "incoming";
  // PiP only when video call is connected
  const showLocalPip = isVideo && callStatus === "connected" && !!localStream;

  // ── Remote grid ─────────────────────────────────────────────────────────────
  //
  // Layout based on number of remote participants:
  //   1 → full-screen (WhatsApp 1:1 style)
  //   2 → two equal rows, each full width
  //   3 → top row: two tiles side-by-side; bottom row: one full-width
  //   4 → 2×2 grid

  const renderRemoteGrid = () => {
    if (callStatus !== "connected" || participantCount === 0) return null;

    if (participantCount === 1) {
      const uid = participantIds[0];
      return (
        <RemoteParticipantTile
          userId={uid}
          stream={remoteStreams.get(uid)}
          videoEnabled={remoteVideoStates.get(uid) ?? true}
          chatAvatar={chatAvatar}
          style={StyleSheet.absoluteFillObject}
          videoRenderKey={videoRenderKey}
          isSingleParticipant
        />
      );
    }

    // 2 participants → each in their own row (full width, half height)
    // 3–4 participants → 2 columns per row
    const colsPerRow = participantCount === 2 ? 1 : 2;
    const rows = chunkArray(participantIds, colsPerRow);
    const numRows = rows.length;
    const rowHeight = SCREEN_HEIGHT / numRows;

    return (
      <View style={StyleSheet.absoluteFillObject}>
        {rows.map((row, rowIdx) => (
          <View
            key={rowIdx}
            style={{
              position: "absolute",
              top: rowIdx * rowHeight,
              left: 0,
              right: 0,
              height: rowHeight,
              flexDirection: "row",
            }}
          >
            {row.map((uid) => (
              <RemoteParticipantTile
                key={uid}
                userId={uid}
                stream={remoteStreams.get(uid)}
                videoEnabled={remoteVideoStates.get(uid) ?? true}
                chatAvatar={chatAvatar}
                style={{
                  flex: 1,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: "#0b141a",
                }}
                videoRenderKey={videoRenderKey}
                isSingleParticipant={false}
              />
            ))}
            {/* Fill gap when last row has an odd participant */}
            {row.length < colsPerRow && (
              <View style={{ flex: colsPerRow - row.length, backgroundColor: "#0f171b" }} />
            )}
          </View>
        ))}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {/* ── Full-screen background / remote grid ── */}
      {showCenterAvatar ? (
        <View style={styles.audioBackground} />
      ) : (
        renderRemoteGrid()
      )}

      {/* Gradient overlay */}
      <View style={styles.overlay} />

      <SafeAreaView style={styles.safeArea}>
        {/* ── Top bar ── */}
        <View style={[styles.topBar, { paddingTop: Math.max(insets.top, 16) }]}>
          <TouchableOpacity style={styles.topIconBtn} onPress={() => router.back()}>
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

        {/* ── Center avatar — audio calls and calling state ── */}
        {showCenterAvatar && (
          <View style={styles.avatarCenterContainer}>
            <View style={styles.avatarInner}>
              {callStatus === "calling" && (
                <Animated.View
                  style={[styles.pulseRing, { transform: [{ scale: pulseAnim }] }]}
                />
              )}
              {chatAvatar ? (
                <Image source={{ uri: chatAvatar }} style={styles.largeAvatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <User size={80} color="#8696a0" />
                </View>
              )}
            </View>
          </View>
        )}

        {/* ── Local PiP (draggable, visible only when connected video) ── */}
        {showLocalPip && (
          <Animated.View
            style={[
              styles.localVideoWrapper,
              { transform: [{ translateX: pan.x }, { translateY: pan.y }] },
            ]}
            {...panResponder.panHandlers}
          >
            {isVideoEnabled ? (
              <RTCView
                key={`local-pip-${videoRenderKey}`}
                streamURL={(localStream as any).toURL()}
                style={{ flex: 1 }}
                objectFit="cover"
                zOrder={1}
                mirror
              />
            ) : (
              <View style={styles.localVideoOff}>
                {localUserAvatar ? (
                  <Image
                    source={{ uri: localUserAvatar }}
                    style={styles.localAvatarPip}
                  />
                ) : (
                  <User size={40} color="#8696a0" />
                )}
              </View>
            )}
          </Animated.View>
        )}

        {/* ── Bottom control pill ── */}
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
              style={[styles.pillIconBtn, isSpeaker && styles.pillBtnActive]}
              onPress={toggleSpeaker}
            >
              <Volume2 size={24} color={isSpeaker ? "#00a884" : "#fff"} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.pillIconBtn, isMuted && styles.pillBtnActive]}
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
    backgroundColor: "#0f171b",
  },
  // ── Remote tile styles (used by RemoteParticipantTile) ──────────────────────
  remoteTile: {
    overflow: "hidden",
  },
  remoteTileAvatarBg: {
    backgroundColor: "#0f171b",
    alignItems: "center",
    justifyContent: "center",
  },
  // Smaller avatar shown inside a grid tile (2-4 participants)
  remoteTileAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  remoteTileAvatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#1f2c33",
    alignItems: "center",
    justifyContent: "center",
  },
  // Larger avatar shown when only one remote (full-screen tile)
  avatarBgImage: {
    width: 160,
    height: 160,
    borderRadius: 80,
  },
  avatarBgPlaceholder: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "#1f2c33",
    alignItems: "center",
    justifyContent: "center",
  },
  cameraOffLabel: {
    marginTop: 16,
    color: "rgba(255,255,255,0.55)",
    fontSize: 14,
  },
  // ── Overlay & safe area ─────────────────────────────────────────────────────
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.15)",
  },
  safeArea: {
    flex: 1,
    justifyContent: "space-between",
  },
  // ── Top bar ─────────────────────────────────────────────────────────────────
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
  // ── Center avatar (audio / calling) ─────────────────────────────────────────
  avatarCenterContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInner: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: -50,
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
  // ── Local PiP ───────────────────────────────────────────────────────────────
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
    zIndex: 100,
    elevation: 10,
  },
  localVideoOff: {
    flex: 1,
    backgroundColor: "#1f2c33",
    alignItems: "center",
    justifyContent: "center",
  },
  localAvatarPip: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  // ── Bottom controls ─────────────────────────────────────────────────────────
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
  pillBtnActive: {
    backgroundColor: "rgba(255,255,255,0.2)",
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
