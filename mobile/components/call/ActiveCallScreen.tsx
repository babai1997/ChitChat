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
import { useChatStore } from "../../src/stores/chatStore";
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

function RemoteParticipantTile({
  userId,
  stream,
  videoEnabled,
  memberName,
  memberAvatar,
  isSpeaking,
  style,
  videoRenderKey,
  isSingleParticipant,
}: {
  userId: string;
  stream: MediaStream | undefined;
  videoEnabled: boolean;
  memberName: string;
  memberAvatar: string | null;
  isSpeaking: boolean;
  style?: any;
  videoRenderKey: number;
  isSingleParticipant: boolean;
}) {
  const streamURL = stream ? (stream as any).toURL() : null;
  const showVideo = videoEnabled && !!streamURL;

  const avatarSize = isSingleParticipant ? 160 : 72;
  const avatarRadius = avatarSize / 2;
  const iconSize = isSingleParticipant ? 100 : 36;

  return (
    <View
      style={[
        styles.remoteTile,
        style,
        isSpeaking && styles.remoteTileSpeaking,
      ]}
    >
      {showVideo ? (
        <RTCView
          key={`remote-${userId}-${videoRenderKey}`}
          streamURL={streamURL}
          style={StyleSheet.absoluteFillObject}
          objectFit="cover"
          zOrder={0}
        />
      ) : (
        <View style={styles.remoteTileAvatarBg}>
          {memberAvatar ? (
            <Image
              source={{ uri: memberAvatar }}
              style={{ width: avatarSize, height: avatarSize, borderRadius: avatarRadius }}
            />
          ) : (
            <View
              style={[
                styles.remoteTileAvatarPlaceholder,
                { width: avatarSize, height: avatarSize, borderRadius: avatarRadius },
              ]}
            >
              <User size={iconSize} color="#8696a0" />
            </View>
          )}
          {!videoEnabled && isSingleParticipant && (
            <Text style={styles.cameraOffLabel}>Camera off</Text>
          )}
        </View>
      )}

      {/* Speaking indicator ring (only when speaking) */}
      {isSpeaking && (
        <View style={styles.speakingRing} pointerEvents="none" />
      )}

      {/* Name label at bottom of tile */}
      <View style={styles.nameLabelContainer} pointerEvents="none">
        {isSpeaking && (
          <View style={styles.speakingDot} />
        )}
        <Text style={styles.nameLabel} numberOfLines={1}>
          {memberName}
        </Text>
      </View>
    </View>
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
    activeSpeakers,
    isMuted,
    isVideoEnabled,
    isSpeaker,
    activeChatId,
    endCall,
    toggleMute,
    toggleVideo,
    toggleSpeaker,
  } = useCall();

  const insets = useSafeAreaInsets();
  const router = useRouter();
  const localUserAvatar = useAuthStore((s) => s.user?.profile?.avatarUrl ?? null);
  const localUserName = useAuthStore((s) => s.user?.profile?.displayName ?? "You");

  // Resolve member info from chat store
  const chats = useChatStore((s) => s.chats);
  const chat = chats.find((c) => c.id === activeChatId) ?? null;
  const getMemberInfo = (userId: string) => {
    const member = chat?.members?.find((m: any) => m.userId === userId);
    return {
      name: member?.user?.profile?.displayName || "User",
      avatar: member?.user?.profile?.avatarUrl || null,
    };
  };

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

  // ── Layout logic ────────────────────────────────────────────────────────────
  //
  // Show the remote grid when:
  //   - video call: any number of remote participants
  //   - audio call: 2+ remote participants (group audio → avatar grid)
  // Show center avatar when:
  //   - still calling / incoming
  //   - audio 1:1 call while connected (single remote, audio only)

  const isConnectedWithPeers = callStatus === "connected" && participantCount > 0;
  const showGrid = isConnectedWithPeers && (isVideo || participantCount >= 2);
  const showCenterAvatar = !showGrid;

  // Local PiP only shown for video calls once connected
  const showLocalPip = isVideo && callStatus === "connected" && !!localStream;

  // ── Remote grid ─────────────────────────────────────────────────────────────
  //
  // 1 remote  → full screen
  // 2 remotes → 2 stacked rows (full width each)
  // 3–4       → 2-column grid
  // 5+        → 2-column scrollable (capped visually at first 6)

  const renderRemoteGrid = () => {
    if (!showGrid) return null;

    if (participantCount === 1) {
      const uid = participantIds[0];
      const { name, avatar } = getMemberInfo(uid);
      return (
        <RemoteParticipantTile
          userId={uid}
          stream={remoteStreams.get(uid)}
          videoEnabled={isVideo && (remoteVideoStates.get(uid) ?? true)}
          memberName={name}
          memberAvatar={avatar}
          isSpeaking={activeSpeakers.has(uid)}
          style={StyleSheet.absoluteFillObject}
          videoRenderKey={videoRenderKey}
          isSingleParticipant
        />
      );
    }

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
            {row.map((uid) => {
              const { name, avatar } = getMemberInfo(uid);
              return (
                <RemoteParticipantTile
                  key={uid}
                  userId={uid}
                  stream={remoteStreams.get(uid)}
                  videoEnabled={isVideo && (remoteVideoStates.get(uid) ?? true)}
                  memberName={name}
                  memberAvatar={avatar}
                  isSpeaking={activeSpeakers.has(uid)}
                  style={{
                    flex: 1,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: "#0b141a",
                  }}
                  videoRenderKey={videoRenderKey}
                  isSingleParticipant={false}
                />
              );
            })}
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
      {showGrid ? renderRemoteGrid() : <View style={styles.audioBackground} />}

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

        {/* ── Center avatar — calling state / audio 1:1 ── */}
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
              {/* Name shown below center avatar in connected audio 1:1 */}
              {callStatus === "connected" && participantCount === 1 && !isVideo && (
                <Text style={styles.connectedName}>
                  {getMemberInfo(participantIds[0]).name}
                </Text>
              )}
            </View>
          </View>
        )}

        {/* ── Local PiP (draggable, video calls only) ── */}
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
            {/* "You" label on local PiP */}
            <View style={styles.localPipLabel}>
              <Text style={styles.localPipLabelText} numberOfLines={1}>
                {localUserName}
              </Text>
            </View>
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
  // ── Remote tile ─────────────────────────────────────────────────────────────
  remoteTile: {
    overflow: "hidden",
    backgroundColor: "#0f171b",
  },
  remoteTileSpeaking: {
    // Green border indicates active speaker
    borderWidth: 2,
    borderColor: "#00a884",
  },
  remoteTileAvatarBg: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  remoteTileAvatarPlaceholder: {
    backgroundColor: "#1f2c33",
    alignItems: "center",
    justifyContent: "center",
  },
  speakingRing: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 3,
    borderColor: "#00a884",
    borderRadius: 0,
    pointerEvents: "none",
  },
  nameLabelContainer: {
    position: "absolute",
    bottom: 8,
    left: 8,
    right: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  speakingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#00a884",
  },
  nameLabel: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    flex: 1,
  },
  cameraOffLabel: {
    marginTop: 12,
    color: "rgba(255,255,255,0.55)",
    fontSize: 13,
  },
  // ── Overlay ─────────────────────────────────────────────────────────────────
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
  // ── Center avatar ────────────────────────────────────────────────────────────
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
  connectedName: {
    marginTop: 16,
    color: "#fff",
    fontSize: 18,
    fontWeight: "500",
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
  localPipLabel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
    paddingVertical: 3,
    paddingHorizontal: 6,
    alignItems: "center",
  },
  localPipLabelText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "600",
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
