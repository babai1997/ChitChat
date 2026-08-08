import React, { useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { ShieldAlert } from 'lucide-react-native';
import { COLORS } from '../../src/theme/colors';

interface BackupPassphraseModalProps {
  mode: 'create' | 'restore';
  onSubmit: (passphrase: string) => Promise<void>;
  onClose: () => void;
}

const MIN_PASSPHRASE_LENGTH = 8;

/**
 * Shared passphrase prompt for both creating/updating a backup and
 * restoring one — see backupSync.ts. Deriving the encryption key
 * (scrypt) genuinely takes ~0.5-1.5s, so this always shows a spinner +
 * note rather than treating the action as instant.
 */
export default function BackupPassphraseModal({ mode, onSubmit, onClose }: BackupPassphraseModalProps) {
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCreate = mode === 'create';
  const canSubmit =
    passphrase.length >= MIN_PASSPHRASE_LENGTH && (!isCreate || passphrase === confirmPassphrase);

  const handleSubmit = async () => {
    setError(null);
    setIsBusy(true);
    try {
      await onSubmit(passphrase);
      onClose();
    } catch (err) {
      console.error(`Failed to ${mode} backup:`, err);
      setError(
        mode === 'restore'
          ? 'Incorrect passphrase, or no backup found.'
          : 'Something went wrong — please try again.',
      );
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>{isCreate ? 'Create Chat Backup' : 'Restore from Backup'}</Text>

          <View style={styles.warning}>
            <ShieldAlert size={16} color={COLORS.danger} style={{ marginTop: 1 }} />
            <Text style={styles.warningText}>
              {isCreate
                ? "If you forget this passphrase, this backup can never be recovered — we never see it and can't reset it for you."
                : 'Enter the passphrase you used when creating this backup.'}
            </Text>
          </View>

          <TextInput
            style={styles.input}
            secureTextEntry
            autoFocus
            value={passphrase}
            onChangeText={setPassphrase}
            placeholder={`Passphrase (min ${MIN_PASSPHRASE_LENGTH} characters)`}
            placeholderTextColor={COLORS.textSecondary}
            editable={!isBusy}
          />

          {isCreate && (
            <TextInput
              style={styles.input}
              secureTextEntry
              value={confirmPassphrase}
              onChangeText={setConfirmPassphrase}
              placeholder="Confirm passphrase"
              placeholderTextColor={COLORS.textSecondary}
              editable={!isBusy}
            />
          )}

          {error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.actions}>
            <TouchableOpacity disabled={isBusy} onPress={onClose} style={styles.cancelBtn}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={isBusy || !canSubmit}
              onPress={handleSubmit}
              style={[styles.submitBtn, (!canSubmit || isBusy) && { opacity: 0.5 }]}
            >
              {isBusy ? (
                <ActivityIndicator size="small" color={COLORS.bgDeepest} />
              ) : (
                <Text style={styles.submitBtnText}>{isCreate ? 'Create Backup' : 'Restore'}</Text>
              )}
            </TouchableOpacity>
          </View>
          {isBusy && <Text style={styles.note}>Deriving encryption key — this can take a second…</Text>}
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
    gap: 12,
  },
  title: { fontSize: 18, fontWeight: '500', color: COLORS.textPrimary },
  warning: {
    flexDirection: 'row',
    gap: 8,
    padding: 10,
    backgroundColor: '#2a1f1f',
    borderRadius: 8,
  },
  warningText: { flex: 1, fontSize: 12.5, color: COLORS.danger },
  input: {
    backgroundColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.textPrimary,
    fontSize: 15,
  },
  error: { color: COLORS.danger, fontSize: 13 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.textSecondary,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  cancelBtnText: { color: COLORS.textPrimary, fontSize: 15 },
  submitBtn: {
    flex: 1,
    backgroundColor: COLORS.accent,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  submitBtnText: { color: COLORS.bgDeepest, fontSize: 15, fontWeight: '600' },
  note: { fontSize: 12.5, color: COLORS.textSecondary, textAlign: 'center' },
});
