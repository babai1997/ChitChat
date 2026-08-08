import { useState } from 'react';
import { Loader2, ShieldAlert } from 'lucide-react';

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
export const BackupPassphraseModal = ({ mode, onSubmit, onClose }: BackupPassphraseModalProps) => {
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
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
      }}
      onClick={!isBusy ? onClose : undefined}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: 'var(--color-surface)',
          borderRadius: '12px',
          padding: '24px',
          maxWidth: '360px',
          width: '90%',
          color: 'var(--color-text-primary)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <h2 style={{ fontSize: '18px', fontWeight: 500, margin: 0 }}>
          {isCreate ? 'Create Chat Backup' : 'Restore from Backup'}
        </h2>

        <div
          style={{
            display: 'flex',
            gap: '8px',
            padding: '10px 12px',
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            borderRadius: '8px',
            fontSize: '12.5px',
            color: 'var(--color-danger)',
          }}
        >
          <ShieldAlert size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
          <span>
            {isCreate
              ? "If you forget this passphrase, this backup can never be recovered — we never see it and can't reset it for you."
              : 'Enter the passphrase you used when creating this backup.'}
          </span>
        </div>

        <input
          type="password"
          autoFocus
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          placeholder={`Passphrase (min ${MIN_PASSPHRASE_LENGTH} characters)`}
          disabled={isBusy}
          style={{
            backgroundColor: 'var(--color-border)',
            border: 'none',
            borderRadius: '8px',
            padding: '10px 12px',
            color: 'var(--color-text-primary)',
            fontSize: '15px',
            outline: 'none',
          }}
        />

        {isCreate && (
          <input
            type="password"
            value={confirmPassphrase}
            onChange={(e) => setConfirmPassphrase(e.target.value)}
            placeholder="Confirm passphrase"
            disabled={isBusy}
            style={{
              backgroundColor: 'var(--color-border)',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 12px',
              color: 'var(--color-text-primary)',
              fontSize: '15px',
              outline: 'none',
            }}
          />
        )}

        {error && <p style={{ color: 'var(--color-danger)', fontSize: '13px', margin: 0 }}>{error}</p>}

        <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
          <button
            disabled={isBusy}
            onClick={onClose}
            style={{
              flex: 1,
              background: 'none',
              border: '1px solid var(--color-text-secondary)',
              color: 'var(--color-text-primary)',
              borderRadius: '8px',
              padding: '10px',
              cursor: isBusy ? 'default' : 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            disabled={isBusy || !canSubmit}
            onClick={handleSubmit}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              background: 'var(--color-accent)',
              border: 'none',
              color: 'var(--color-bg-deepest)',
              borderRadius: '8px',
              padding: '10px',
              cursor: isBusy || !canSubmit ? 'default' : 'pointer',
              fontWeight: 500,
              opacity: !canSubmit && !isBusy ? 0.5 : 1,
            }}
          >
            {isBusy && <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />}
            {isBusy ? 'Working…' : isCreate ? 'Create Backup' : 'Restore'}
          </button>
        </div>
        {isBusy && (
          <p style={{ fontSize: '12.5px', color: 'var(--color-text-secondary)', margin: 0, textAlign: 'center' }}>
            Deriving encryption key — this can take a second…
          </p>
        )}
      </div>
    </div>
  );
};
