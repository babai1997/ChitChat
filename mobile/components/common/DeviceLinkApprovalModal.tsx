import React, { useState } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Laptop, Smartphone } from 'lucide-react-native';
import { useDeviceLinkStore } from '../../src/stores/useDeviceLinkStore';
import { approveDeviceLink, declineDeviceLink } from '../../src/services/deviceLinkSync';
import { COLORS } from '../../src/theme/colors';

function platformLabel(platform?: string) {
  if (platform === 'ios') return 'an iPhone';
  if (platform === 'android') return 'an Android device';
  if (platform === 'web') return 'a web browser';
  return 'a new device';
}

/** Mounted once at the root layout — see app/_layout.tsx. Renders nothing when there's no pending request. */
export default function DeviceLinkApprovalModal() {
  const { pendingLinkRequest, clearPendingLinkRequest } = useDeviceLinkStore();
  const [isBusy, setIsBusy] = useState(false);
  const [isApproving, setIsApproving] = useState(false);

  if (!pendingLinkRequest) return null;

  const Icon = pendingLinkRequest.platform === 'ios' || pendingLinkRequest.platform === 'android' ? Smartphone : Laptop;

  const handleApprove = async () => {
    setIsBusy(true);
    setIsApproving(true);
    try {
      // Pushes one API call per recently-active chat (see
      // deviceLinkSync.ts's pushHistoryToDevice) before resolving — this
      // can genuinely take several seconds, hence the spinner + note
      // below rather than a plain disabled button that could look stuck.
      const syncedCount = await approveDeviceLink(pendingLinkRequest.deviceId);
      clearPendingLinkRequest();
      Alert.alert('Device approved', `Synced history for ${syncedCount} chat${syncedCount === 1 ? '' : 's'}`);
    } catch (err) {
      console.error('Failed to approve device link:', err);
      Alert.alert('Error', 'Failed to approve device');
    } finally {
      setIsBusy(false);
      setIsApproving(false);
    }
  };

  const handleDecline = async () => {
    setIsBusy(true);
    try {
      await declineDeviceLink(pendingLinkRequest.deviceId);
      clearPendingLinkRequest();
    } catch (err) {
      console.error('Failed to decline device link:', err);
      Alert.alert('Error', 'Failed to decline device');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Icon size={40} color={COLORS.accent} />
          <Text style={styles.title}>New device wants to link</Text>
          <Text style={styles.body}>
            {platformLabel(pendingLinkRequest.platform)} is asking to link to your account. Approving
            will let it receive your recent chat history.
          </Text>
          <View style={styles.actions}>
            <TouchableOpacity disabled={isBusy} onPress={handleDecline} style={[styles.declineBtn, isApproving && { opacity: 0.5 }]}>
              {isBusy && !isApproving ? (
                <ActivityIndicator size="small" color={COLORS.textPrimary} />
              ) : (
                <Text style={styles.declineBtnText}>Decline</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity disabled={isBusy} onPress={handleApprove} style={[styles.approveBtn, isBusy && !isApproving && { opacity: 0.5 }]}>
              {isApproving ? <ActivityIndicator size="small" color={COLORS.bgDeepest} /> : <Text style={styles.approveBtnText}>Approve</Text>}
            </TouchableOpacity>
          </View>
          {isApproving && (
            <Text style={styles.note}>Syncing recent chat history to this device — this can take a few seconds…</Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 24,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    gap: 12,
  },
  title: { fontSize: 18, fontWeight: '500', color: COLORS.textPrimary, textAlign: 'center' },
  body: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 12, marginTop: 8, width: '100%' },
  declineBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.textSecondary,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  declineBtnText: { color: COLORS.textPrimary, fontSize: 15 },
  approveBtn: {
    flex: 1,
    backgroundColor: COLORS.accent,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  approveBtnText: { color: COLORS.bgDeepest, fontSize: 15, fontWeight: '600' },
  note: { fontSize: 12.5, color: COLORS.textSecondary, textAlign: 'center' },
});
