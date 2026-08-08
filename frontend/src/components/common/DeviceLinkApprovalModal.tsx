import { useState } from 'react';
import { Laptop, Loader2, Smartphone } from 'lucide-react';
import toast from 'react-hot-toast';
import { useDeviceLinkStore } from '../../stores/useDeviceLinkStore';
import { approveDeviceLink, declineDeviceLink } from '../../services/deviceLinkSync';

function platformLabel(platform?: string) {
  if (platform === 'ios') return 'an iPhone';
  if (platform === 'android') return 'an Android device';
  if (platform === 'web') return 'a web browser';
  return 'a new device';
}

/** Mounted once at app-shell level — see App.tsx. Renders nothing when there's no pending request. */
export const DeviceLinkApprovalModal = () => {
  const { pendingLinkRequest, clearPendingLinkRequest } = useDeviceLinkStore();
  const [busyAction, setBusyAction] = useState<'approve' | 'decline' | null>(null);
  const isBusy = busyAction !== null;

  if (!pendingLinkRequest) return null;

  const Icon = pendingLinkRequest.platform === 'ios' || pendingLinkRequest.platform === 'android' ? Smartphone : Laptop;

  const handleApprove = async () => {
    setBusyAction('approve');
    try {
      // Pushes the actual history payload (one API call per recently-active
      // chat — see deviceLinkSync.ts) before resolving, so this can
      // genuinely take several seconds. The button's spinner + note below
      // is what tells the user that's expected, not a hang.
      await approveDeviceLink(pendingLinkRequest.deviceId);
      toast.success('Device approved and history synced');
      clearPendingLinkRequest();
    } catch (err) {
      console.error('Failed to approve device link:', err);
      toast.error('Failed to approve device');
    } finally {
      setBusyAction(null);
    }
  };

  const handleDecline = async () => {
    setBusyAction('decline');
    try {
      await declineDeviceLink(pendingLinkRequest.deviceId);
      clearPendingLinkRequest();
    } catch (err) {
      console.error('Failed to decline device link:', err);
      toast.error('Failed to decline device');
    } finally {
      setBusyAction(null);
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
    >
      <div
        style={{
          backgroundColor: 'var(--color-surface)',
          borderRadius: '12px',
          padding: '24px',
          maxWidth: '360px',
          width: '90%',
          color: 'var(--color-text-primary)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px',
          textAlign: 'center',
        }}
      >
        <Icon size={40} color="var(--color-accent)" />
        <h2 style={{ fontSize: '18px', fontWeight: 500, margin: 0 }}>New device wants to link</h2>
        <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', margin: 0 }}>
          {platformLabel(pendingLinkRequest.platform)} is asking to link to your account. Approving
          will let it receive your recent chat history.
        </p>
        <div style={{ display: 'flex', gap: '12px', marginTop: '8px', width: '100%' }}>
          <button
            disabled={isBusy}
            onClick={handleDecline}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              background: 'none',
              border: '1px solid var(--color-text-secondary)',
              color: 'var(--color-text-primary)',
              borderRadius: '8px',
              padding: '10px',
              cursor: isBusy ? 'default' : 'pointer',
              opacity: busyAction === 'approve' ? 0.5 : 1,
            }}
          >
            {busyAction === 'decline' && <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />}
            Decline
          </button>
          <button
            disabled={isBusy}
            onClick={handleApprove}
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
              cursor: isBusy ? 'default' : 'pointer',
              fontWeight: 500,
              opacity: busyAction === 'decline' ? 0.5 : 1,
            }}
          >
            {busyAction === 'approve' && <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />}
            {busyAction === 'approve' ? 'Approving…' : 'Approve'}
          </button>
        </div>
        {busyAction === 'approve' && (
          <p style={{ fontSize: '12.5px', color: 'var(--color-text-secondary)', margin: 0 }}>
            Syncing recent chat history to the new device — this can take a few seconds…
          </p>
        )}
      </div>
    </div>
  );
};
