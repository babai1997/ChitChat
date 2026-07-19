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
  Modal,
  FlatList,
  Pressable,
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
  Volume2,
  SwitchCamera,
  ScreenShare,
  ScreenShareOff,
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

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const IS_TABLET = SCREEN_WIDTH >= 768;

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
  isRemoteMuted,
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
  isRemoteMuted: boolean;
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

      {/* Mic-off badge (top-right) */}
      {isRemoteMuted && (
        <View style={styles.muteBadge} pointerEvents="none">
          <MicOff size={14} color="#fff" />
        </View>
      )}

      {/* Name label at bottom of tile */}
      <View style={styles.nameLabelContainer} pointerEvents="none">
        {isRemoteMuted ? (
          <MicOff size={12} color="#ea4335" />
        ) : isSpeaking ? (
          <View style={styles.speakingDot} />
        ) : null}
        <Text style={styles.nameLabel} numberOfLines={1}>
          {memberName}
        </Text>
      </View>
    </View>
  );
}

// ── Local participant tile (tablet 50/50 view) ────────────────────────────────

function LocalParticipantTile({
  stream,
  videoEnabled,
  localUserName,
  localUserAvatar,
  style,
  videoRenderKey,
  isFrontCamera,
}: {
  stream: MediaStream | null;
  videoEnabled: boolean;
  localUserName: string;
  localUserAvatar: string | null;
  style?: any;
  videoRenderKey: number;
  isFrontCamera: boolean;
}) {
  const streamURL = stream ? (stream as any).toURL() : null;
  const showVideo = videoEnabled && !!streamURL;

  return (
    <View style={[styles.remoteTile, style]}>
      {showVideo ? (
        <RTCView
          key={`local-tile-${videoRenderKey}`}
          streamURL={streamURL}
          style={StyleSheet.absoluteFillObject}
          objectFit="cover"
          zOrder={0}
          mirror={isFrontCamera}
        />
      ) : (
        <View style={styles.remoteTileAvatarBg}>
          {localUserAvatar ? (
            <Image
              source={{ uri: localUserAvatar }}
              style={{ width: 72, height: 72, borderRadius: 36 }}
            />
          ) : (
            <View style={[styles.remoteTileAvatarPlaceholder, { width: 72, height: 72, borderRadius: 36 }]}>
              <User size={36} color="#8696a0" />
            </View>
          )}
        </View>
      )}
      <View style={styles.nameLabelContainer} pointerEvents="none">
        <Text style={styles.nameLabel} numberOfLines={1}>
          You
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
    remoteMuteStates,
    activeSpeakers,
    isMuted,
    isVideoEnabled,
    isSpeaker,
    activeChatId,
    endCall,
    toggleMute,
    toggleVideo,
    toggleSpeaker,
    addToCall,
    isScreenSharing,
    sharingUserId,
    startScreenShare,
    stopScreenShare,
  } = useCall();

  const insets = useSafeAreaInsets();
  const router = useRouter();
  const localUserAvatar = useAuthStore((s) => s.user?.profile?.avatarUrl ?? null);
  const localUserName = useAuthStore((s) => s.user?.profile?.displayName ?? "You");
  const currentUserId = useAuthStore((s) => s.user?.id ?? '');

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
  // True from the moment the user confirms sharing until isScreenSharing actually becomes true.
  // Blocks videoRenderKey bumps during the system picker → prevents avatar flicker.
  const shareStartingRef = useRef(false);
  // Update synchronously during render (not in an effect) so the ref is always
  // current before any AppState event that fires right after a re-render.
  const isScreenSharingRef = useRef(isScreenSharing);
  isScreenSharingRef.current = isScreenSharing;
  if (isScreenSharing) shareStartingRef.current = false;

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Tap PiP to swap full-screen ↔ corner (like WhatsApp)
  const [isSwapped, setIsSwapped] = useState(false);

  const pan = useRef(new Animated.ValueXY()).current;
  const panResponder = useRef(
    PanResponder.create({
      // Claim the gesture from touch-start so taps also reach onPanResponderRelease
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: (_, gestureState) => {
        // Small movement = tap → swap which stream is full-screen
        if (Math.abs(gestureState.dx) < 8 && Math.abs(gestureState.dy) < 8) {
          setIsSwapped((s) => !s);
        }
        pan.extractOffset();
      },
    }),
  ).current;

  // Re-render RTCView when returning from background.
  // Skip when sharing is active OR starting (system picker causes a background→active
  // transition before getDisplayMedia resolves, which would remount RTCViews mid-flow).
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextState === "active" &&
        !isScreenSharingRef.current &&
        !shareStartingRef.current
      ) {
        setVideoRenderKey((k) => k + 1);
      }
      appStateRef.current = nextState;
    });
    return () => sub.remove();
  }, []);

  // Bump once after mount to ensure RTCView starts rendering (skip if sharing is already active)
  useEffect(() => {
    const t = setTimeout(() => {
      if (!isScreenSharingRef.current && !shareStartingRef.current) {
        setVideoRenderKey((k) => k + 1);
      }
    }, 300);
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

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  useEffect(() => {
    if (callStatus !== "connected") {
      setElapsedSeconds(0);
      return;
    }
    const id = setInterval(() => setElapsedSeconds((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [callStatus]);

  const formatDuration = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const mm = String(m).padStart(2, "0");
    const ss = String(sec).padStart(2, "0");
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  };

  const statusText =
    callStatus === "calling"
      ? "Calling…"
      : callStatus === "connected"
        ? formatDuration(elapsedSeconds)
        : "Connecting…";

  const isVideo = callType === "video";
  const participantIds = Array.from(remoteStreams.keys());
  const participantCount = participantIds.length;

  const isRemoteScreenSharing = sharingUserId !== null;
  const sharingStream = isRemoteScreenSharing ? remoteStreams.get(sharingUserId!) : undefined;
  // Cache the URL in a ref — toURL() must not be called on every render because a
  // new string value changes the RTCView key and causes it to remount (flash).
  const sharingStreamURLRef = useRef<string | null>(null);
  if (sharingStream) {
    sharingStreamURLRef.current = (sharingStream as any).toURL();
  } else {
    sharingStreamURLRef.current = null;
  }
  const sharingStreamURL = sharingStreamURLRef.current;

  // Camera flip (front ↔ back)
  const [isFrontCamera, setIsFrontCamera] = useState(true);
  const switchCamera = () => {
    if (!localStream) return;
    const videoTrack = (localStream as any).getVideoTracks?.()[0];
    if (videoTrack) {
      videoTrack._switchCamera();
      setIsFrontCamera((f) => !f);
    }
  };

  // ── Add-member picker ────────────────────────────────────────────────────────
  const [showAddMemberPicker, setShowAddMemberPicker] = useState(false);
  const [showShareConfirm, setShowShareConfirm] = useState(false);

  // Members available to invite: in the chat but not already in the call
  const alreadyInCall = new Set([currentUserId, ...Array.from(remoteStreams.keys())]);
  const invitableMembers = (chat?.members ?? []).filter(
    (m: any) => !alreadyInCall.has(m.userId),
  );

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

  // PiP only for 1:1 video — group calls (2+ remotes) include local as a grid tile instead
  // Also hide PiP when screen sharing is active (screen fills the main view)
  const showLocalPip = isVideo && callStatus === "connected" && !!localStream &&
    participantCount === 1 && !IS_TABLET && !isScreenSharing && !isRemoteScreenSharing;

  // ── Remote grid ─────────────────────────────────────────────────────────────
  //
  // 1 remote  → full screen
  // 2 remotes → side-by-side 2-column grid (same as WhatsApp)
  // 3–4       → 2-column grid (2+1 or 2+2)
  // 5+        → 2-column grid rows

  const renderRemoteGrid = () => {
    if (!showGrid) return null;

    if (participantCount === 1) {
      const uid = participantIds[0];
      const { name, avatar } = getMemberInfo(uid);

      if (IS_TABLET && isVideo) {
        // Tablet 1-on-1 video: equal 50/50 side-by-side tiles
        return (
          <View style={[StyleSheet.absoluteFillObject, { flexDirection: "row" }]}>
            <RemoteParticipantTile
              userId={uid}
              stream={remoteStreams.get(uid)}
              videoEnabled={remoteVideoStates.get(uid) ?? true}
              memberName={name}
              memberAvatar={avatar}
              isSpeaking={activeSpeakers.has(uid)}
              isRemoteMuted={remoteMuteStates.get(uid) === true}
              style={{ flex: 1 }}
              videoRenderKey={videoRenderKey}
              isSingleParticipant={false}
            />
            <LocalParticipantTile
              stream={localStream as MediaStream | null}
              videoEnabled={isVideoEnabled}
              localUserName={localUserName}
              localUserAvatar={localUserAvatar}
              style={{ flex: 1 }}
              videoRenderKey={videoRenderKey}
              isFrontCamera={isFrontCamera}
            />
          </View>
        );
      }

      // Phone: single remote fills the entire screen
      return (
        <RemoteParticipantTile
          userId={uid}
          stream={remoteStreams.get(uid)}
          videoEnabled={isVideo && (remoteVideoStates.get(uid) ?? true)}
          memberName={name}
          memberAvatar={avatar}
          isSpeaking={activeSpeakers.has(uid)}
          isRemoteMuted={remoteMuteStates.get(uid) === true}
          style={StyleSheet.absoluteFillObject}
          videoRenderKey={videoRenderKey}
          isSingleParticipant
        />
      );
    }

    // Group call: include local user as a grid tile (no PiP for 3+ people).
    // A tile alone in its row gets flex:2 so it spans the full row width.
    const LOCAL_KEY = "__local__";
    const colsPerRow = 2;
    const allIds = [...participantIds, LOCAL_KEY];
    const rows = chunkArray(allIds, colsPerRow);
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
              const tileStyle = {
                flex: row.length === 1 ? colsPerRow : 1,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: "#0b141a",
              };
              if (uid === LOCAL_KEY) {
                return (
                  <LocalParticipantTile
                    key={LOCAL_KEY}
                    stream={localStream as any}
                    videoEnabled={isVideoEnabled}
                    localUserName={localUserName}
                    localUserAvatar={localUserAvatar}
                    style={tileStyle}
                    videoRenderKey={videoRenderKey}
                    isFrontCamera={isFrontCamera}
                  />
                );
              }
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
                  isRemoteMuted={remoteMuteStates.get(uid) === true}
                  style={tileStyle}
                  videoRenderKey={videoRenderKey}
                  isSingleParticipant={false}
                />
              );
            })}
          </View>
        ))}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {/* ── Full-screen background / remote grid ── */}
      {/* Skip all remote video tiles while sharing locally: two layers of Android
          SurfaceViews (remote grid zOrder=0 + screen-share zOrder=1) cause Z-fighting
          that makes the whole page flicker. Audio keeps flowing without the RTCViews. */}
      {isScreenSharing ? (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#000' }]} />
      ) : showGrid ? (
        isSwapped && participantCount === 1 && isVideo && !!localStream ? (
          isVideoEnabled ? (
            <RTCView
              key={`local-fullscreen-${videoRenderKey}`}
              streamURL={(localStream as any).toURL()}
              style={StyleSheet.absoluteFillObject}
              objectFit="cover"
              zOrder={0}
              mirror={isFrontCamera}
            />
          ) : (
            <View style={[StyleSheet.absoluteFillObject, styles.audioBackground]} />
          )
        ) : (
          renderRemoteGrid()
        )
      ) : (
        <View style={styles.audioBackground} />
      )}

      {/* ── Screen share full-screen view ── */}
      {/* Remote screen share still uses zOrder=1; remote grid is hidden above so no conflict */}
      {(!isScreenSharing && isRemoteScreenSharing && sharingStreamURL) && (
        <RTCView
          key={`screen-remote-${sharingStreamURL}`}
          streamURL={sharingStreamURL}
          style={StyleSheet.absoluteFillObject}
          objectFit="contain"
          zOrder={1}
        />
      )}
      {/* Local screen-share preview intentionally omitted: the user has no need to see
          their own capture, and rendering it creates a MediaProjection feedback loop
          (capture sees the RTCView which sees the capture) that causes constant flickering. */}

      {/* Gradient overlay — never intercept touches */}
      <View
        style={[styles.overlay, { zIndex: (isScreenSharing || isRemoteScreenSharing) ? 2 : 0 }]}
        pointerEvents="none"
      />

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
              onPress={() => setShowAddMemberPicker(true)}
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

        {/* ── Screen sharing banner ── */}
        {(isScreenSharing || isRemoteScreenSharing) && (
          <View style={styles.screenShareBanner}>
            <View style={styles.screenShareBannerLeft}>
              <Text style={styles.screenShareBannerText}>
                {isScreenSharing
                  ? "You are sharing your screen"
                  : `${getMemberInfo(sharingUserId!).name} is sharing`}
              </Text>
            </View>
            {isScreenSharing && (
              <TouchableOpacity style={styles.stopShareInlinBtn} onPress={stopScreenShare}>
                <Text style={styles.stopShareInlinBtnText}>Stop Sharing</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ── Center avatar — calling state / audio 1:1 ── */}
        {showCenterAvatar && !(isScreenSharing || isRemoteScreenSharing) && (
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

        {/* ── PiP (draggable) — tap to flip full-screen ↔ corner ── */}
        {showLocalPip && (
          <Animated.View
            style={[
              styles.localVideoWrapper,
              { transform: [{ translateX: pan.x }, { translateY: pan.y }] },
            ]}
            {...panResponder.panHandlers}
          >
            {isSwapped && participantCount === 1 ? (
              // Swapped: show remote stream in the corner PiP
              (() => {
                const uid = participantIds[0];
                const remoteStream = remoteStreams.get(uid);
                const remoteStreamURL = remoteStream ? (remoteStream as any).toURL() : null;
                const remoteVideoOn = remoteVideoStates.get(uid) ?? true;
                const { name, avatar } = getMemberInfo(uid);
                return (
                  <>
                    {remoteStreamURL && remoteVideoOn ? (
                      <RTCView
                        key={`remote-pip-${videoRenderKey}`}
                        streamURL={remoteStreamURL}
                        style={{ flex: 1 }}
                        objectFit="cover"
                        zOrder={1}
                      />
                    ) : (
                      <View style={styles.localVideoOff}>
                        {avatar ? (
                          <Image source={{ uri: avatar }} style={styles.localAvatarPip} />
                        ) : (
                          <User size={40} color="#8696a0" />
                        )}
                      </View>
                    )}
                    <View style={styles.localPipLabel}>
                      <Text style={styles.localPipLabelText} numberOfLines={1}>
                        {name}
                      </Text>
                    </View>
                  </>
                );
              })()
            ) : (
              // Default: show local camera in the corner PiP
              <>
                {isVideoEnabled ? (
                  <RTCView
                    key={`local-pip-${videoRenderKey}`}
                    streamURL={(localStream as any).toURL()}
                    style={{ flex: 1 }}
                    objectFit="cover"
                    zOrder={1}
                    mirror={isFrontCamera}
                  />
                ) : (
                  <View style={styles.localVideoOff}>
                    {localUserAvatar ? (
                      <Image source={{ uri: localUserAvatar }} style={styles.localAvatarPip} />
                    ) : (
                      <User size={40} color="#8696a0" />
                    )}
                  </View>
                )}
                <View style={styles.localPipLabel}>
                  <Text style={styles.localPipLabelText} numberOfLines={1}>
                    {localUserName}
                  </Text>
                </View>
              </>
            )}
          </Animated.View>
        )}

        {/* ── Bottom control pill ── */}
        <View style={styles.bottomPillContainer}>
          <View style={styles.bottomPill}>
            {(() => {
              const canShare = isScreenSharing || (callStatus === "connected" && remoteStreams.size > 0);
              return (
                <TouchableOpacity
                  style={[styles.pillIconBtn, isScreenSharing && styles.pillBtnActive, !canShare && styles.pillIconBtnDisabled]}
                  onPress={canShare ? (isScreenSharing ? stopScreenShare : () => setShowShareConfirm(true)) : undefined}
                  activeOpacity={canShare ? 0.7 : 1}
                >
                  {isScreenSharing
                    ? <ScreenShareOff size={30} color="#00a884" />
                    : <ScreenShare size={30} color="#fff" />}
                </TouchableOpacity>
              );
            })()}
            <TouchableOpacity style={styles.pillIconBtn} onPress={toggleVideo}>
              {isVideoEnabled ? (
                <Video size={32} color="#fff" />
              ) : (
                <VideoOff size={32} color="#fff" />
              )}
            </TouchableOpacity>
            {isVideo && isVideoEnabled && (
              <TouchableOpacity style={styles.pillIconBtn} onPress={switchCamera}>
                <SwitchCamera size={32} color="#fff" />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.pillIconBtn, isSpeaker && styles.pillBtnActive]}
              onPress={toggleSpeaker}
            >
              <Volume2 size={32} color={isSpeaker ? "#00a884" : "#fff"} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.pillIconBtn, isMuted && styles.pillBtnActive]}
              onPress={toggleMute}
            >
              {isMuted ? (
                <MicOff size={32} color="#fff" />
              ) : (
                <Mic size={32} color="#fff" />
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.endCallBtn} onPress={endCall}>
              <PhoneOff size={30} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>

      {/* ── Add member picker modal ── */}
      <Modal
        visible={showAddMemberPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddMemberPicker(false)}
      >
        <Pressable
          style={styles.pickerBackdrop}
          onPress={() => setShowAddMemberPicker(false)}
        />
        <View style={styles.pickerSheet}>
          <View style={styles.pickerHandle} />
          <Text style={styles.pickerTitle}>Add to call</Text>

          {invitableMembers.length === 0 ? (
            <Text style={styles.pickerEmpty}>All chat members are already in the call.</Text>
          ) : (
            <FlatList
              data={invitableMembers}
              keyExtractor={(item: any) => item.userId}
              renderItem={({ item }: { item: any }) => {
                const name = item.user?.profile?.displayName || item.user?.phone || 'User';
                const avatar = item.user?.profile?.avatarUrl;
                return (
                  <TouchableOpacity
                    style={styles.pickerRow}
                    onPress={() => {
                      addToCall(item.userId);
                      setShowAddMemberPicker(false);
                    }}
                  >
                    <View style={styles.pickerAvatar}>
                      {avatar ? (
                        <Image source={{ uri: avatar }} style={styles.pickerAvatarImg} />
                      ) : (
                        <User size={24} color="#8696a0" />
                      )}
                    </View>
                    <Text style={styles.pickerName}>{name}</Text>
                    <UserPlus size={18} color="#00a884" />
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>
      </Modal>

      {/* ── Screen share confirmation modal ── */}
      <Modal
        visible={showShareConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowShareConfirm(false)}
      >
        <Pressable
          style={styles.confirmBackdrop}
          onPress={() => setShowShareConfirm(false)}
        >
          <Pressable style={styles.confirmSheet} onPress={() => {}}>
            <View style={styles.confirmIconCircle}>
              <ScreenShare size={28} color="#00a884" />
            </View>
            <Text style={styles.confirmTitle}>Share your screen?</Text>
            <Text style={styles.confirmBody}>
              Everything on your screen — including notifications — will be visible to everyone in this call.
            </Text>
            <TouchableOpacity
              style={styles.confirmShareBtn}
              onPress={() => {
                setShowShareConfirm(false);
                shareStartingRef.current = true;
                startScreenShare();
              }}
            >
              <Text style={styles.confirmShareBtnText}>Start Sharing</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.confirmCancelBtn}
              onPress={() => setShowShareConfirm(false)}
            >
              <Text style={styles.confirmCancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
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
  muteBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(234,67,53,0.85)",
    alignItems: "center",
    justifyContent: "center",
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
    paddingHorizontal: 8,
    paddingBottom: 32,
  },
  bottomPill: {
    flexDirection: "row",
    backgroundColor: "#1c2227",
    borderRadius: 46,
    paddingVertical: 10,
    paddingHorizontal: 10,
    justifyContent: "space-between",
    alignItems: "center",
  },
  pillIconBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  pillBtnActive: {
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  endCallBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "#ff253a",
    alignItems: "center",
    justifyContent: "center",
  },
  pillIconBtnDisabled: {
    opacity: 0.35,
  },
  // ── Screen share banner ─────────────────────────────────────────────────────
  screenShareBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 24,
    paddingVertical: 7,
    paddingHorizontal: 14,
    gap: 10,
    marginTop: 8,
  },
  screenShareBannerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  screenShareBannerText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "500",
  },
  stopShareInlinBtn: {
    backgroundColor: "#ea4335",
    borderRadius: 14,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  stopShareInlinBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  stopShareBtn: {
    backgroundColor: "#ea4335",
    borderRadius: 12,
    paddingVertical: 3,
    paddingHorizontal: 10,
    marginLeft: 4,
  },
  stopShareBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  // ── Add-member picker ────────────────────────────────────────────────────────
  pickerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  pickerSheet: {
    backgroundColor: "#202c33",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 32,
    maxHeight: "60%",
  },
  pickerHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#8696a0",
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 4,
  },
  pickerTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#e9edef",
    textAlign: "center",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#2a3942",
  },
  pickerEmpty: {
    color: "#8696a0",
    fontSize: 14,
    textAlign: "center",
    padding: 24,
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 14,
  },
  pickerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#2a3942",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  pickerAvatarImg: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  pickerName: {
    flex: 1,
    fontSize: 16,
    color: "#e9edef",
  },
  confirmBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  confirmSheet: {
    backgroundColor: "#1e2a30",
    borderRadius: 20,
    padding: 28,
    width: "100%",
    alignItems: "center",
  },
  confirmIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(0,168,132,0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  confirmTitle: {
    color: "#e9edef",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 10,
    textAlign: "center",
  },
  confirmBody: {
    color: "#8696a0",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginBottom: 24,
  },
  confirmShareBtn: {
    backgroundColor: "#00a884",
    borderRadius: 12,
    paddingVertical: 13,
    width: "100%",
    alignItems: "center",
    marginBottom: 10,
  },
  confirmShareBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  confirmCancelBtn: {
    paddingVertical: 12,
    width: "100%",
    alignItems: "center",
  },
  confirmCancelBtnText: {
    color: "#8696a0",
    fontSize: 15,
  },
});
