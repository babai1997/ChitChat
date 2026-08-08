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
          backgroundColor: '#202c33',
          borderRadius: '12px',
          padding: '24px',
          maxWidth: '360px',
          width: '90%',
          color: '#e9edef',
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
            backgroundColor: '#2a1f1f',
            borderRadius: '8px',
            fontSize: '12.5px',
            color: '#d9a5a5',
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
            backgroundColor: '#2a3942',
            border: 'none',
            borderRadius: '8px',
            padding: '10px 12px',
            color: '#e9edef',
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
              backgroundColor: '#2a3942',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 12px',
              color: '#e9edef',
              fontSize: '15px',
              outline: 'none',
            }}
          />
        )}

        {error && <p style={{ color: '#ff5252', fontSize: '13px', margin: 0 }}>{error}</p>}

        <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
          <button
            disabled={isBusy}
            onClick={onClose}
            style={{
              flex: 1,
              background: 'none',
              border: '1px solid #8696a0',
              color: '#e9edef',
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
              background: '#00a884',
              border: 'none',
              color: '#0b141a',
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
          <p style={{ fontSize: '12.5px', color: '#8696a0', margin: 0, textAlign: 'center' }}>
            Deriving encryption key — this can take a second…
          </p>
        )}
      </div>
    </div>
  );
};
