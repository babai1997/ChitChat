import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft, MessageCircle } from 'lucide-react-native';
import { COLORS } from '../../src/theme/colors';

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: '1. What this covers',
    body: [
      'This explains what ChitChat collects, why, and — importantly — what end-to-end encryption means for what we can and can’t see.',
    ],
  },
  {
    title: '2. What we collect',
    body: [
      'Account info: your email/name from Google Sign-In, or your phone number if you sign in via one-time code.',
      'Profile info: display name, avatar photo, and about text you choose to set — visible to people you chat with.',
      'Device & encryption keys: each device you use generates its own public encryption keys, registered so others can start an encrypted session with you. Your private keys never leave your device.',
      'Metadata: who you’re chatting with, timestamps, delivery/read status, group membership, and call metadata (participants, duration) — needed to route messages and calls, but not their content.',
      'Push notification tokens: used only to wake your device for a new message or incoming call.',
    ],
  },
  {
    title: '3. What end-to-end encryption means here',
    body: [
      'Text messages, photos, videos, audio, and files sent in direct and group chats are encrypted on your device before they ever leave it, using per-conversation keys only you and the people you’re chatting with hold. Our servers relay and store only encrypted ciphertext — we cannot read message content or attachments, and we don’t have a way to decrypt them even if legally compelled to try.',
      'What is NOT covered by encryption: who you message and when (metadata, above), your profile info, and group membership — all visible to us because the app needs them to function.',
      'A device you explicitly link or a passphrase-protected backup you create can restore your message history to a new device — protected by your own passphrase, which we never see or store.',
    ],
  },
  {
    title: '4. Third parties we use',
    body: [
      'Google — for sign-in (Google Sign-In / OAuth).',
      'Cloudinary — stores encrypted attachment files as opaque blobs; it cannot decrypt or interpret them.',
      'Firebase Cloud Messaging — delivers push notifications (a "you have a new message" ping, not the message itself).',
      'Neon (PostgreSQL hosting) — stores account, profile, and message metadata, and encrypted ciphertext.',
    ],
  },
  {
    title: '5. How long we keep data',
    body: [
      'Messages and attachments are retained until you or the other party deletes them, or your account is deleted. Deleting your account removes your profile and, where technically possible, your message content.',
    ],
  },
  {
    title: '6. Your choices',
    body: [
      'You can delete individual messages, leave or delete group chats, revoke a linked device at any time from Settings, and request account deletion by contacting us.',
    ],
  },
  {
    title: '7. Children',
    body: [
      'ChitChat isn’t directed at children under the age required by your local law to consent to this kind of service on your own, and we don’t knowingly collect data from them.',
    ],
  },
  {
    title: '8. Changes to this policy',
    body: [
      'If this policy changes in a way that matters, we’ll let you know in the app before it takes effect.',
    ],
  },
  {
    title: '9. Contact',
    body: [
      'Questions, or want to request account/data deletion? Reach out to [your-support-email@example.com].',
    ],
  },
];

export default function PrivacyPolicyScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <MessageCircle size={18} color={COLORS.accentSecondary} />
        <Text style={styles.headerTitle}>Privacy Policy</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.updated}>Last updated: August 8, 2026</Text>
        {SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.body.map((p, i) => (
              <Text key={i} style={styles.paragraph}>{p}</Text>
            ))}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgDeepest },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backBtn: {},
  headerTitle: { fontSize: 17, fontWeight: '600', color: COLORS.textPrimary },
  content: { padding: 20, paddingBottom: 48 },
  updated: { color: COLORS.textSecondary, fontSize: 12.5, marginBottom: 24 },
  section: { marginBottom: 22 },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: COLORS.accentSecondary, marginBottom: 6 },
  paragraph: { fontSize: 14, lineHeight: 21, color: COLORS.textPrimary, marginBottom: 8 },
});
