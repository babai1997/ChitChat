import { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, ViewStyle } from 'react-native';
import { COLORS } from '../../src/theme/colors';

// ── Single shimmer pulse ─────────────────────────────────────────────────────
function Shimmer({ style }: { style?: ViewStyle }) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return <Animated.View style={[styles.shimmer, style, { opacity }]} />;
}

// ── Chat list row skeleton ───────────────────────────────────────────────────
export function ChatRowSkeleton() {
  return (
    <View style={styles.row}>
      <Shimmer style={styles.avatar} />
      <View style={styles.rowContent}>
        <View style={styles.rowTop}>
          <Shimmer style={styles.nameBar} />
          <Shimmer style={styles.timeBar} />
        </View>
        <Shimmer style={styles.previewBar} />
      </View>
    </View>
  );
}

// ── Chat list skeleton (repeating rows) ─────────────────────────────────────
export function ChatListSkeleton({ count = 8 }: { count?: number }) {
  return (
    <View style={{ flex: 1 }}>
      {Array.from({ length: count }).map((_, i) => (
        <ChatRowSkeleton key={i} />
      ))}
    </View>
  );
}

// ── Message bubble skeletons ─────────────────────────────────────────────────
function MessageSkeleton({ isOwn, width }: { isOwn: boolean; width: number }) {
  return (
    <View style={[styles.msgRow, isOwn ? styles.msgOwn : styles.msgTheirs]}>
      <Shimmer
        style={{
          ...styles.msgBubble,
          width,
          borderTopRightRadius: isOwn ? 4 : 18,
          borderTopLeftRadius: isOwn ? 18 : 4,
        }}
      />
    </View>
  );
}

export function MessageListSkeleton() {
  // Predefined pattern that looks like a real conversation
  const pattern: { isOwn: boolean; width: number }[] = [
    { isOwn: false, width: 180 },
    { isOwn: true,  width: 130 },
    { isOwn: true,  width: 210 },
    { isOwn: false, width: 240 },
    { isOwn: false, width: 160 },
    { isOwn: true,  width: 90  },
    { isOwn: false, width: 200 },
    { isOwn: true,  width: 170 },
    { isOwn: true,  width: 250 },
    { isOwn: false, width: 140 },
  ];

  return (
    <View style={{ flex: 1, paddingHorizontal: 16, paddingVertical: 12, justifyContent: 'flex-start' }}>
      {pattern.map((p, i) => (
        <MessageSkeleton key={i} isOwn={p.isOwn} width={p.width} />
      ))}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  shimmer: {
    backgroundColor: COLORS.border,
    borderRadius: 6,
  },

  // Chat row
  row: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.surface,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    marginRight: 14,
    flexShrink: 0,
  },
  rowContent: {
    flex: 1,
    justifyContent: 'center',
    gap: 8,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  nameBar:    { height: 15, width: '45%', borderRadius: 8 },
  timeBar:    { height: 11, width: 48,    borderRadius: 6 },
  previewBar: { height: 12, width: '75%', borderRadius: 6 },

  // Messages
  msgRow: {
    marginVertical: 3,
    paddingHorizontal: 4,
  },
  msgOwn:    { alignItems: 'flex-end' },
  msgTheirs: { alignItems: 'flex-start' },
  msgBubble: {
    height: 38,
    borderRadius: 18,
  },
});
