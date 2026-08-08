import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Lock } from 'lucide-react-native';
import { useDeviceLinkStore } from '../../src/stores/useDeviceLinkStore';
import { restoreBackup } from '../../src/services/backupSync';
import BackupPassphraseModal from './BackupPassphraseModal';
import { COLORS } from '../../src/theme/colors';

/**
 * Proactive notice for a brand-new, not-yet-approved device. Unlike
 * WhatsApp's QR-scan (an explicit "I am linking a device right now"
 * ceremony), logging into a new device here looks identical to any other
 * login — nothing inherently tells the user this device has no chat
 * history yet, short of stumbling onto a decrypt placeholder inside some
 * chat. Rendered at the top of the chat list so it's the first thing a new
 * device's user sees, not something they have to go looking for.
 */
export default function UnapprovedDeviceBanner() {
  const isThisDeviceApproved = useDeviceLinkStore((s) => s.isThisDeviceApproved);
  const router = useRouter();
  const [showRestoreModal, setShowRestoreModal] = useState(false);

  if (isThisDeviceApproved !== false) return null;

  return (
    <>
      <View style={styles.container}>
        <Lock size={18} color={COLORS.accent} />
        <View style={styles.textContainer}>
          <TouchableOpacity onPress={() => router.push('/linked-devices')}>
            <Text style={styles.title}>This device needs approval</Text>
            <Text style={styles.subtitle}>
              Open Linked Devices on another device you're logged into and approve this one to
              load your chat history — tap to check status
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowRestoreModal(true)}>
            <Text style={styles.restoreLink}>
              No other device online? Restore from your passphrase backup instead
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {showRestoreModal && (
        <BackupPassphraseModal
          mode="restore"
          onClose={() => setShowRestoreModal(false)}
          onSubmit={async (passphrase) => {
            const count = await restoreBackup(passphrase);
            Alert.alert('Restored', `Restored ${count} message${count === 1 ? '' : 's'} from backup`);
          }}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.surfaceElevated,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.surface,
  },
  textContainer: { flex: 1 },
  title: { fontSize: 14, color: COLORS.textPrimary, fontWeight: '500' },
  subtitle: { fontSize: 12.5, color: COLORS.textSecondary, marginTop: 2 },
  restoreLink: {
    fontSize: 12.5,
    color: COLORS.accent,
    fontWeight: '500',
    marginTop: 6,
    textDecorationLine: 'underline',
  },
});
