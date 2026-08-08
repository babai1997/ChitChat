import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Laptop, Lock, Smartphone, Trash2 } from 'lucide-react-native';
import { devicesApi, type DeviceSummary } from '../../src/api';
import { approveDeviceLink, declineDeviceLink } from '../../src/services/deviceLinkSync';
import { createOrUpdateBackup, deleteBackup, hasBackup, restoreBackup } from '../../src/services/backupSync';
import { getOrCreateDeviceId } from '../../src/services/deviceId';
import BackupPassphraseModal from '../../components/common/BackupPassphraseModal';
import { COLORS } from '../../src/theme/colors';

function platformIcon(platform: string | null) {
  return platform === 'ios' || platform === 'android' ? Smartphone : Laptop;
}

function platformLabel(platform: string | null) {
  if (platform === 'ios') return 'iPhone';
  if (platform === 'android') return 'Android';
  if (platform === 'web') return 'Web browser';
  return 'Unknown device';
}

export default function LinkedDevicesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [devices, setDevices] = useState<DeviceSummary[]>([]);
  const [myDeviceId, setMyDeviceId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [actioningDeviceId, setActioningDeviceId] = useState<string | null>(null);
  const [actioningType, setActioningType] = useState<'approve' | 'decline' | 'revoke' | null>(null);
  const [backupInfo, setBackupInfo] = useState<{ exists: boolean; updatedAt?: string } | null>(null);
  const [backupModalMode, setBackupModalMode] = useState<'create' | 'restore' | null>(null);
  const [isBackupActionBusy, setIsBackupActionBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await devicesApi.getMyDevices();
      setDevices(data);
    } catch (err) {
      console.error('Failed to load devices:', err);
      Alert.alert('Error', 'Failed to load linked devices');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadBackupInfo = useCallback(async () => {
    try {
      setBackupInfo(await hasBackup());
    } catch (err) {
      console.error('Failed to check backup status:', err);
    }
  }, []);

  useEffect(() => {
    void load();
    void loadBackupInfo();
    void getOrCreateDeviceId().then(setMyDeviceId);
  }, [load, loadBackupInfo]);

  const handleDeleteBackup = () => {
    Alert.alert('Delete backup', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setIsBackupActionBusy(true);
          try {
            await deleteBackup();
            await loadBackupInfo();
          } catch (err) {
            console.error('Failed to delete backup:', err);
            Alert.alert('Error', 'Failed to delete backup');
          } finally {
            setIsBackupActionBusy(false);
          }
        },
      },
    ]);
  };

  const handleApprove = async (deviceId: string) => {
    setActioningDeviceId(deviceId);
    setActioningType('approve');
    try {
      // Pushes one API call per recently-active chat (see
      // deviceLinkSync.ts's pushHistoryToDevice) before resolving — this
      // can genuinely take several seconds, hence the spinner below rather
      // than a plain disabled button that could look stuck.
      const syncedCount = await approveDeviceLink(deviceId);
      Alert.alert('Device approved', `Synced history for ${syncedCount} chat${syncedCount === 1 ? '' : 's'}`);
      await load();
    } catch (err) {
      console.error('Failed to approve device:', err);
      Alert.alert('Error', 'Failed to approve device');
    } finally {
      setActioningDeviceId(null);
      setActioningType(null);
    }
  };

  const handleDecline = async (deviceId: string) => {
    setActioningDeviceId(deviceId);
    setActioningType('decline');
    try {
      await declineDeviceLink(deviceId);
      await load();
    } catch (err) {
      console.error('Failed to decline device:', err);
      Alert.alert('Error', 'Failed to decline device');
    } finally {
      setActioningDeviceId(null);
      setActioningType(null);
    }
  };

  const handleRevoke = (deviceId: string) => {
    Alert.alert('Revoke device', 'This device will stop receiving new messages.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Revoke',
        style: 'destructive',
        onPress: async () => {
          setActioningDeviceId(deviceId);
          setActioningType('revoke');
          try {
            await devicesApi.revokeDevice(deviceId);
            await load();
          } catch (err) {
            console.error('Failed to revoke device:', err);
            Alert.alert('Error', 'Failed to revoke device');
          } finally {
            setActioningDeviceId(null);
            setActioningType(null);
          }
        },
      },
    ]);
  };

  const pending = devices.filter((d) => !d.approved && !d.revoked);
  const active = devices.filter((d) => d.approved && !d.revoked);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Linked Devices</Text>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <ActivityIndicator style={{ marginTop: 32 }} color={COLORS.accent} />
        ) : (
          <>
            {pending.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Waiting for approval</Text>
                {pending.map((device) => {
                  const Icon = platformIcon(device.platform);
                  const isSelf = device.deviceId === myDeviceId;
                  return (
                    <View key={device.deviceId} style={styles.pendingCard}>
                      <Icon size={22} color={COLORS.textSecondary} />
                      <View style={styles.itemContent}>
                        <Text style={styles.itemLabel}>
                          {isSelf ? 'This device' : platformLabel(device.platform)}
                        </Text>
                        <Text style={styles.itemSubLabel}>
                          {isSelf
                            ? 'Waiting for approval from another device'
                            : `Requested ${new Date(device.createdAt).toLocaleString()}`}
                        </Text>
                      </View>
                      {!isSelf && (
                        <TouchableOpacity
                          disabled={actioningDeviceId === device.deviceId}
                          onPress={() => handleDecline(device.deviceId)}
                          style={[
                            styles.declineBtn,
                            actioningDeviceId === device.deviceId && actioningType === 'approve' && { opacity: 0.5 },
                          ]}
                        >
                          {actioningDeviceId === device.deviceId && actioningType === 'decline' ? (
                            <ActivityIndicator size="small" color={COLORS.textPrimary} />
                          ) : (
                            <Text style={styles.declineBtnText}>Decline</Text>
                          )}
                        </TouchableOpacity>
                      )}
                      {!isSelf && (
                        <TouchableOpacity
                          disabled={actioningDeviceId === device.deviceId}
                          onPress={() => handleApprove(device.deviceId)}
                          style={[
                            styles.approveBtn,
                            actioningDeviceId === device.deviceId && actioningType === 'decline' && { opacity: 0.5 },
                          ]}
                        >
                          {actioningDeviceId === device.deviceId && actioningType === 'approve' ? (
                            <ActivityIndicator size="small" color={COLORS.bgDeepest} />
                          ) : (
                            <Text style={styles.approveBtnText}>Approve</Text>
                          )}
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
              </View>
            )}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Active devices</Text>
              {active.length === 0 ? (
                <Text style={styles.itemSubLabel}>No active devices</Text>
              ) : (
                active.map((device) => {
                  const Icon = platformIcon(device.platform);
                  return (
                    <View key={device.deviceId} style={styles.activeRow}>
                      <Icon size={22} color={COLORS.accent} />
                      <View style={styles.itemContent}>
                        <Text style={styles.itemLabel}>{platformLabel(device.platform)}</Text>
                        <Text style={styles.itemSubLabel}>
                          Last active {new Date(device.lastActiveAt).toLocaleString()}
                        </Text>
                      </View>
                      <TouchableOpacity
                        disabled={actioningDeviceId === device.deviceId}
                        onPress={() => handleRevoke(device.deviceId)}
                        style={styles.revokeBtn}
                      >
                        <Trash2 size={20} color={COLORS.danger} />
                      </TouchableOpacity>
                    </View>
                  );
                })
              )}
            </View>

            <View style={[styles.section, { borderTopWidth: 1, borderTopColor: COLORS.surface }]}>
              <Text style={styles.sectionTitle}>Chat Backup</Text>
              <View style={styles.pendingCard}>
                <Lock size={22} color={backupInfo?.exists ? COLORS.accent : COLORS.textSecondary} />
                <View style={styles.itemContent}>
                  <Text style={styles.itemLabel}>{backupInfo?.exists ? 'Backup created' : 'No backup yet'}</Text>
                  <Text style={styles.itemSubLabel}>
                    {backupInfo?.exists
                      ? `Updated ${new Date(backupInfo.updatedAt!).toLocaleString()}`
                      : 'Encrypt a copy of your recent chats with a passphrase — a fallback if no other device is online to sync from'}
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                {backupInfo?.exists && (
                  <TouchableOpacity disabled={isBackupActionBusy} onPress={handleDeleteBackup} style={styles.revokeBtn}>
                    <Trash2 size={20} color={COLORS.danger} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  disabled={isBackupActionBusy}
                  onPress={() => setBackupModalMode('create')}
                  style={styles.approveBtn}
                >
                  <Text style={styles.approveBtnText}>{backupInfo?.exists ? 'Update' : 'Create'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  disabled={isBackupActionBusy}
                  onPress={() => setBackupModalMode('restore')}
                  style={styles.declineBtn}
                >
                  <Text style={styles.declineBtnText}>Restore</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}
      </ScrollView>

      {backupModalMode && (
        <BackupPassphraseModal
          mode={backupModalMode}
          onClose={() => setBackupModalMode(null)}
          onSubmit={async (passphrase) => {
            if (backupModalMode === 'create') {
              const count = await createOrUpdateBackup(passphrase);
              Alert.alert('Backup created', `Backed up ${count} message${count === 1 ? '' : 's'}`);
              await loadBackupInfo();
            } else {
              const count = await restoreBackup(passphrase);
              Alert.alert('Restored', `Restored ${count} message${count === 1 ? '' : 's'} from backup`);
            }
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: { padding: 0 },
  headerTitle: { fontSize: 20, fontWeight: '500', color: COLORS.textPrimary },
  scrollView: { flex: 1 },
  section: { padding: 16 },
  sectionTitle: { color: COLORS.textSecondary, fontSize: 14, fontWeight: '500', marginBottom: 8 },
  pendingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    marginBottom: 8,
  },
  activeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  itemContent: { flex: 1 },
  itemLabel: { fontSize: 15, color: COLORS.textPrimary },
  itemSubLabel: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  declineBtn: {
    borderWidth: 1,
    borderColor: COLORS.textSecondary,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  declineBtnText: { color: COLORS.textPrimary, fontSize: 13 },
  approveBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  approveBtnText: { color: COLORS.bgDeepest, fontSize: 13, fontWeight: '600' },
  revokeBtn: { padding: 6 },
});
