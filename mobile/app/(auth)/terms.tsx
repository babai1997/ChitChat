import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft, MessageCircle } from 'lucide-react-native';
import { COLORS } from '../../src/theme/colors';

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: '1. Acceptance of these Terms',
    body: [
      'By creating an account or using ChitChat, you agree to these Terms of Service. If you don’t agree, please don’t use the app.',
    ],
  },
  {
    title: '2. What ChitChat is',
    body: [
      'ChitChat is a messaging app that lets you send text, photos, videos, audio, and files, and make voice/video calls, one-to-one or in groups. Direct messages, group messages, and attachments are end-to-end encrypted — see the Privacy Policy for exactly what that means and what it does not cover.',
    ],
  },
  {
    title: '3. Your account',
    body: [
      'You sign in with your Google account or a phone number (via a one-time code). You’re responsible for keeping access to your account secure and for anything that happens through it.',
      'You must be old enough to legally consent to using this kind of service in your country.',
    ],
  },
  {
    title: '4. Acceptable use',
    body: [
      'Don’t use ChitChat to: break the law; harass, threaten, or abuse anyone; send spam or unsolicited bulk messages; distribute malware; impersonate someone else; or attempt to access accounts, data, or systems that aren’t yours.',
      'Because messages are end-to-end encrypted, we generally cannot see message content and cannot proactively moderate it. If we receive a valid report or legal request about an account, we may act on account-level information we do have (see the Privacy Policy) — including suspending or removing an account.',
    ],
  },
  {
    title: '5. Calls',
    body: [
      'Voice and video calls are relayed peer-to-peer where possible; a relay server may be used to help establish the connection but does not record or store call audio/video.',
    ],
  },
  {
    title: '6. Service availability',
    body: [
      'ChitChat is provided “as is,” without warranties of any kind. We don’t guarantee the service will always be available, error-free, or uninterrupted.',
    ],
  },
  {
    title: '7. Limitation of liability',
    body: [
      'To the fullest extent permitted by law, ChitChat and its operators are not liable for any indirect, incidental, or consequential damages arising from your use of the service.',
    ],
  },
  {
    title: '8. Changes to these Terms',
    body: [
      'We may update these Terms from time to time. Continuing to use ChitChat after a change means you accept the updated Terms.',
    ],
  },
  {
    title: '9. Contact',
    body: [
      'Questions about these Terms? Reach out to [your-support-email@example.com].',
    ],
  },
];

export default function TermsScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <MessageCircle size={18} color={COLORS.accentSecondary} />
        <Text style={styles.headerTitle}>Terms of Service</Text>
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
