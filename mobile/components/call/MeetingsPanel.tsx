import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Share, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Trash2, Users, Video } from 'lucide-react-native';
import { meetingsApi, type MyMeeting } from '../../src/api';

// The meeting link is a web route (/meet/:slug) — shared regardless of
// platform, since the recipient may open it on web or (once universal
// links are configured — explicitly scoped out, see the meeting-links
// plan) on the app directly. No dedicated web-origin env var exists yet,
// so derive it from the API URL, overridable via EXPO_PUBLIC_WEB_URL.
const WEB_APP_URL =
  process.env.EXPO_PUBLIC_WEB_URL ?? (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/api\/?$/, '');

function meetingLink(slug: string): string {
  return `${WEB_APP_URL}/meet/${slug}`;
}

/**
 * Replaces the old "New Meeting -> share sheet -> link gone forever"
 * flow. Gives every user ONE persistent, reusable Personal Meeting Room
 * (same link every time, like Zoom's PMI) plus a "My Meetings" list so an
 * ad-hoc named room's link can be found and re-shared later instead of
 * only ever being shown once.
 */
export default function MeetingsPanel() {
  const router = useRouter();
  const [personalSlug, setPersonalSlug] = useState<string | null>(null);
  const [isLoadingPersonal, setIsLoadingPersonal] = useState(true);
  const [meetings, setMeetings] = useState<MyMeeting[]>([]);
  const [isLoadingMine, setIsLoadingMine] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [actioningSlug, setActioningSlug] = useState<string | null>(null);

  const loadMine = async () => {
    try {
      setMeetings(await meetingsApi.listMine());
    } catch (err) {
      console.error('Failed to load meetings:', err);
    } finally {
      setIsLoadingMine(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const { slug } = await meetingsApi.getPersonalRoom();
        setPersonalSlug(slug);
      } catch (err) {
        console.error('Failed to load personal meeting room:', err);
      } finally {
        setIsLoadingPersonal(false);
      }
    })();
    void loadMine();
  }, []);

  const handleSharePersonal = () => {
    if (!personalSlug) return;
    void Share.share({ message: `Join my ChitChat meeting: ${meetingLink(personalSlug)}` });
  };

  const handleCreateMeeting = async () => {
    setIsCreating(true);
    try {
      const { slug } = await meetingsApi.create();
      await Share.share({ message: `Join my ChitChat meeting: ${meetingLink(slug)}` });
      router.push(`/meet/${slug}`);
      await loadMine();
    } catch (err) {
      console.error('Failed to create meeting:', err);
      Alert.alert('Error', 'Failed to create meeting');
    } finally {
      setIsCreating(false);
    }
  };

  const handleRevoke = (slug: string) => {
    Alert.alert('Revoke meeting link', 'It will stop working immediately.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Revoke',
        style: 'destructive',
        onPress: async () => {
          setActioningSlug(slug);
          try {
            await meetingsApi.revoke(slug);
            await loadMine();
          } catch (err) {
            console.error('Failed to revoke meeting:', err);
            Alert.alert('Error', 'Failed to revoke meeting');
          } finally {
            setActioningSlug(null);
          }
        },
      },
    ]);
  };

  const namedMeetings = meetings.filter((m) => !m.isPersonal && !m.revoked);

  return (
    <View style={styles.container}>
      {/* Personal Meeting Room — the actual fix: one link, reused forever */}
      <View style={styles.personalCard}>
        <Video size={22} color="#00a884" />
        <View style={styles.personalInfo}>
          <Text style={styles.personalTitle}>Your Personal Meeting Room</Text>
          <Text style={styles.personalSubtitle} numberOfLines={1}>
            {isLoadingPersonal ? 'Loading…' : personalSlug ? meetingLink(personalSlug) : 'Unavailable'}
          </Text>
        </View>
        {personalSlug && (
          <>
            <TouchableOpacity onPress={handleSharePersonal} style={styles.shareBtn}>
              <Text style={styles.shareBtnText}>Share</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push(`/meet/${personalSlug}`)} style={styles.startBtn}>
              <Text style={styles.startBtnText}>Start</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      <TouchableOpacity style={styles.newMeetingBtn} disabled={isCreating} onPress={handleCreateMeeting}>
        {isCreating ? <ActivityIndicator size="small" color="#00a884" /> : <Users size={16} color="#00a884" />}
        <Text style={styles.newMeetingBtnText}>New Meeting</Text>
      </TouchableOpacity>

      {!isLoadingMine && namedMeetings.length > 0 && (
        <View style={styles.mineSection}>
          <Text style={styles.mineSectionTitle}>My Meetings</Text>
          {namedMeetings.map((m) => (
            <View key={m.slug} style={styles.mineRow}>
              <View style={styles.mineInfo}>
                <Text style={styles.mineName} numberOfLines={1}>{m.name || 'Meeting'}</Text>
                <Text style={styles.mineDate}>Created {new Date(m.createdAt).toLocaleDateString()}</Text>
              </View>
              <TouchableOpacity
                onPress={() => void Share.share({ message: `Join my ChitChat meeting: ${meetingLink(m.slug)}` })}
                style={styles.mineIconBtn}
              >
                <Video size={18} color="#00a884" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleRevoke(m.slug)}
                disabled={actioningSlug === m.slug}
                style={styles.mineIconBtn}
              >
                {actioningSlug === m.slug ? (
                  <ActivityIndicator size="small" color="#ff5252" />
                ) : (
                  <Trash2 size={18} color="#ff5252" />
                )}
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#2a3942' },
  personalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: '#202c33',
    borderRadius: 8,
    marginBottom: 12,
  },
  personalInfo: { flex: 1 },
  personalTitle: { fontSize: 14, color: '#e9edef', fontWeight: '500' },
  personalSubtitle: { fontSize: 12.5, color: '#8696a0', marginTop: 2 },
  shareBtn: { borderWidth: 1, borderColor: '#8696a0', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
  shareBtnText: { color: '#e9edef', fontSize: 12.5 },
  startBtn: { backgroundColor: '#00a884', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
  startBtnText: { color: '#0b141a', fontSize: 12.5, fontWeight: '600' },
  newMeetingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#2a3942',
    borderRadius: 8,
    paddingVertical: 10,
  },
  newMeetingBtnText: { color: '#00a884', fontWeight: '600', fontSize: 14 },
  mineSection: { marginTop: 16 },
  mineSectionTitle: { color: '#8696a0', fontSize: 13, fontWeight: '500', marginBottom: 8 },
  mineRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  mineInfo: { flex: 1 },
  mineName: { fontSize: 14, color: '#e9edef' },
  mineDate: { fontSize: 12, color: '#8696a0', marginTop: 1 },
  mineIconBtn: { padding: 6 },
});
