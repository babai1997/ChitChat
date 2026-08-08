import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Share, Alert, ActivityIndicator, Modal, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Pencil, Trash2, Users, Video } from 'lucide-react-native';
import { meetingsApi, type MyMeeting } from '../../src/api';
import { COLORS } from '../../src/theme/colors';

interface NamePromptState {
  mode: 'create' | 'rename';
  slug?: string;
  initialValue: string;
}

/** RN has no cross-platform text-input prompt (Alert.prompt is iOS-only) — this covers both naming a new meeting and renaming an existing one. */
function NamePromptModal({
  state,
  onCancel,
  onSubmit,
}: {
  state: NamePromptState | null;
  onCancel: () => void;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState('');

  useEffect(() => {
    if (state) setValue(state.initialValue);
  }, [state]);

  if (!state) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.promptOverlay}
      >
        <View style={styles.promptCard}>
          <Text style={styles.promptTitle}>
            {state.mode === 'create' ? 'Meeting name' : 'Rename meeting'}
          </Text>
          <TextInput
            value={value}
            onChangeText={setValue}
            placeholder="Meeting name (optional)"
            placeholderTextColor={COLORS.textSecondary}
            style={styles.promptInput}
            autoFocus
          />
          <View style={styles.promptActions}>
            <TouchableOpacity onPress={onCancel} style={styles.promptBtn}>
              <Text style={styles.promptBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onSubmit(value.trim())} style={styles.promptBtn}>
              <Text style={[styles.promptBtnText, styles.promptBtnTextPrimary]}>
                {state.mode === 'create' ? 'Create' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

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
  const [namePrompt, setNamePrompt] = useState<NamePromptState | null>(null);

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

  const handleCreateMeeting = async (name: string) => {
    setNamePrompt(null);
    setIsCreating(true);
    try {
      const { slug } = await meetingsApi.create(name || undefined);
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

  const handleRename = async (slug: string, name: string) => {
    setNamePrompt(null);
    if (!name) return;
    setActioningSlug(slug);
    try {
      await meetingsApi.rename(slug, name);
      await loadMine();
    } catch (err) {
      console.error('Failed to rename meeting:', err);
      Alert.alert('Error', 'Failed to rename meeting');
    } finally {
      setActioningSlug(null);
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
        <Video size={22} color={COLORS.accent} />
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

      <TouchableOpacity
        style={styles.newMeetingBtn}
        disabled={isCreating}
        onPress={() => setNamePrompt({ mode: 'create', initialValue: '' })}
      >
        {isCreating ? <ActivityIndicator size="small" color={COLORS.accent} /> : <Users size={16} color={COLORS.accent} />}
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
                onPress={() => setNamePrompt({ mode: 'rename', slug: m.slug, initialValue: m.name ?? '' })}
                disabled={actioningSlug === m.slug}
                style={styles.mineIconBtn}
              >
                <Pencil size={16} color={COLORS.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void Share.share({ message: `Join my ChitChat meeting: ${meetingLink(m.slug)}` })}
                style={styles.mineIconBtn}
              >
                <Video size={18} color={COLORS.accent} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleRevoke(m.slug)}
                disabled={actioningSlug === m.slug}
                style={styles.mineIconBtn}
              >
                {actioningSlug === m.slug ? (
                  <ActivityIndicator size="small" color={COLORS.danger} />
                ) : (
                  <Trash2 size={18} color={COLORS.danger} />
                )}
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      <NamePromptModal
        state={namePrompt}
        onCancel={() => setNamePrompt(null)}
        onSubmit={(value) => {
          if (namePrompt?.mode === 'create') void handleCreateMeeting(value);
          else if (namePrompt?.mode === 'rename' && namePrompt.slug) void handleRename(namePrompt.slug, value);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  personalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    marginBottom: 12,
  },
  personalInfo: { flex: 1 },
  personalTitle: { fontSize: 14, color: COLORS.textPrimary, fontWeight: '500' },
  personalSubtitle: { fontSize: 12.5, color: COLORS.textSecondary, marginTop: 2 },
  shareBtn: { borderWidth: 1, borderColor: COLORS.textSecondary, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
  shareBtnText: { color: COLORS.textPrimary, fontSize: 12.5 },
  startBtn: { backgroundColor: COLORS.accent, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
  startBtnText: { color: COLORS.bgDeepest, fontSize: 12.5, fontWeight: '600' },
  newMeetingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingVertical: 10,
  },
  newMeetingBtnText: { color: COLORS.accent, fontWeight: '600', fontSize: 14 },
  mineSection: { marginTop: 16 },
  mineSectionTitle: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '500', marginBottom: 8 },
  mineRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  mineInfo: { flex: 1 },
  mineName: { fontSize: 14, color: COLORS.textPrimary },
  mineDate: { fontSize: 12, color: COLORS.textSecondary, marginTop: 1 },
  mineIconBtn: { padding: 6 },
  promptOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  promptCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 12,
    padding: 18,
  },
  promptTitle: { fontSize: 16, fontWeight: '600', color: COLORS.textPrimary, marginBottom: 12 },
  promptInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  promptActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 16, marginTop: 16 },
  promptBtn: { paddingVertical: 6, paddingHorizontal: 8 },
  promptBtnText: { fontSize: 14, color: COLORS.textSecondary, fontWeight: '500' },
  promptBtnTextPrimary: { color: COLORS.accent },
});
