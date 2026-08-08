import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import toast from 'react-hot-toast';
import { useDeviceLinkStore } from '../../stores/useDeviceLinkStore';
import { restoreBackup } from '../../services/backupSync';
import { BackupPassphraseModal } from './BackupPassphraseModal';

/**
 * Proactive notice for a brand-new, not-yet-approved device. Unlike
 * WhatsApp's QR-scan (an explicit "I am linking a device right now"
 * ceremony), logging into a new device here looks identical to any other
 * login — nothing inherently tells the user this device has no chat
 * history yet, short of stumbling onto a decrypt placeholder inside some
 * chat. Rendered at the top of the chat list so it's the first thing a new
 * device's user sees, not something they have to go looking for.
 */
export const UnapprovedDeviceBanner = () => {
  const isThisDeviceApproved = useDeviceLinkStore((s) => s.isThisDeviceApproved);
  const navigate = useNavigate();
  const [showRestoreModal, setShowRestoreModal] = useState(false);

  if (isThisDeviceApproved !== false) return null;

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '12px 16px',
          backgroundColor: '#1f2c34',
          borderBottom: '1px solid #202c33',
        }}
      >
        <Lock size={18} color="#00a884" style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => navigate('/settings/linked-devices')}>
          <div style={{ fontSize: '14px', color: '#e9edef', fontWeight: 500 }}>
            This device needs approval
          </div>
          <div style={{ fontSize: '12.5px', color: '#8696a0' }}>
            Open Linked Devices on another device you're logged into and approve this one to load
            your chat history — tap to check status
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowRestoreModal(true);
            }}
            style={{
              background: 'none',
              border: 'none',
              color: '#00a884',
              fontSize: '12.5px',
              fontWeight: 500,
              padding: 0,
              marginTop: '4px',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            No other device online? Restore from your passphrase backup instead
          </button>
        </div>
      </div>

      {showRestoreModal && (
        <BackupPassphraseModal
          mode="restore"
          onClose={() => setShowRestoreModal(false)}
          onSubmit={async (passphrase) => {
            const count = await restoreBackup(passphrase);
            toast.success(`Restored ${count} message${count === 1 ? '' : 's'} from backup`);
          }}
        />
      )}
    </>
  );
};
