import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Laptop, Loader2, Lock, Smartphone, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { devicesApi, type DeviceSummary } from '../api';
import { approveDeviceLink, declineDeviceLink } from '../services/deviceLinkSync';
import { createOrUpdateBackup, deleteBackup, hasBackup, restoreBackup } from '../services/backupSync';
import { getOrCreateDeviceId } from '../services/deviceId';
import { BackupPassphraseModal } from '../components/common/BackupPassphraseModal';

function platformIcon(platform: string | null) {
  if (platform === 'ios' || platform === 'android') return Smartphone;
  return Laptop;
}

function platformLabel(platform: string | null) {
  if (platform === 'ios') return 'iPhone';
  if (platform === 'android') return 'Android';
  if (platform === 'web') return 'Web browser';
  return 'Unknown device';
}

export const LinkedDevicesPage = () => {
  const navigate = useNavigate();
  const [devices, setDevices] = useState<DeviceSummary[]>([]);
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
      toast.error('Failed to load linked devices');
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
  }, [load, loadBackupInfo]);

  const handleDeleteBackup = async () => {
    if (!window.confirm('Delete your chat backup? This cannot be undone.')) return;
    setIsBackupActionBusy(true);
    try {
      await deleteBackup();
      toast.success('Backup deleted');
      await loadBackupInfo();
    } catch (err) {
      console.error('Failed to delete backup:', err);
      toast.error('Failed to delete backup');
    } finally {
      setIsBackupActionBusy(false);
    }
  };

  const handleApprove = async (deviceId: string) => {
    setActioningDeviceId(deviceId);
    setActioningType('approve');
    try {
      // Pushes one API call per recently-active chat (see
      // deviceLinkSync.ts's pushHistoryToDevice) before resolving — this
      // can genuinely take several seconds, hence the spinner below rather
      // than a plain disabled button that could look stuck.
      await approveDeviceLink(deviceId);
      toast.success('Device approved and history synced');
      await load();
    } catch (err) {
      console.error('Failed to approve device:', err);
      toast.error('Failed to approve device');
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
      toast.success('Device declined');
      await load();
    } catch (err) {
      console.error('Failed to decline device:', err);
      toast.error('Failed to decline device');
    } finally {
      setActioningDeviceId(null);
      setActioningType(null);
    }
  };

  const handleRevoke = async (deviceId: string) => {
    if (!window.confirm('Revoke this device? It will stop receiving new messages.')) return;
    setActioningDeviceId(deviceId);
    setActioningType('revoke');
    try {
      await devicesApi.revokeDevice(deviceId);
      toast.success('Device revoked');
      await load();
    } catch (err) {
      console.error('Failed to revoke device:', err);
      toast.error('Failed to revoke device');
    } finally {
      setActioningDeviceId(null);
      setActioningType(null);
    }
  };

  const myDeviceId = getOrCreateDeviceId();
  const pending = devices.filter((d) => !d.approved && !d.revoked);
  const active = devices.filter((d) => d.approved && !d.revoked);

  return (
    <div style={{ backgroundColor: '#0b141a', minHeight: '100vh', color: '#e9edef' }}>
      <div
        style={{
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
          borderBottom: '1px solid #202c33',
          backgroundColor: '#0b141a',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <button
          onClick={() => navigate(-1)}
          style={{ background: 'none', border: 'none', color: '#e9edef', cursor: 'pointer', padding: 0 }}
        >
          <ArrowLeft size={24} />
        </button>
        <h1 style={{ fontSize: '20px', fontWeight: 500, margin: 0 }}>Linked Devices</h1>
      </div>

      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '16px' }}>
        {isLoading ? (
          <div style={{ color: '#8696a0', textAlign: 'center', padding: '32px' }}>Loading…</div>
        ) : (
          <>
            {pending.length > 0 && (
              <div style={{ marginBottom: '24px' }}>
                <div style={{ color: '#8696a0', fontSize: '14px', fontWeight: 500, marginBottom: '8px' }}>
                  Waiting for approval
                </div>
                {pending.map((device) => {
                  const Icon = platformIcon(device.platform);
                  const isSelf = device.deviceId === myDeviceId;
                  return (
                    <div
                      key={device.deviceId}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '12px',
                        backgroundColor: '#202c33',
                        borderRadius: '8px',
                        marginBottom: '8px',
                        gap: '12px',
                      }}
                    >
                      <Icon size={24} color="#8696a0" />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '15px' }}>
                          {isSelf ? 'This device' : platformLabel(device.platform)}
                        </div>
                        <div style={{ fontSize: '13px', color: '#8696a0' }}>
                          {isSelf
                            ? 'Waiting for approval from another device'
                            : `Requested ${new Date(device.createdAt).toLocaleString()}`}
                        </div>
                      </div>
                      {isSelf ? null : (
                      <button
                        disabled={actioningDeviceId === device.deviceId}
                        onClick={() => handleDecline(device.deviceId)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          background: 'none',
                          border: '1px solid #8696a0',
                          color: '#e9edef',
                          borderRadius: '6px',
                          padding: '6px 12px',
                          cursor: actioningDeviceId === device.deviceId ? 'default' : 'pointer',
                          opacity: actioningDeviceId === device.deviceId && actioningType === 'approve' ? 0.5 : 1,
                        }}
                      >
                        {actioningDeviceId === device.deviceId && actioningType === 'decline' && (
                          <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                        )}
                        Decline
                      </button>
                      )}
                      {isSelf ? null : (
                      <button
                        disabled={actioningDeviceId === device.deviceId}
                        onClick={() => handleApprove(device.deviceId)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          background: '#00a884',
                          border: 'none',
                          color: '#0b141a',
                          borderRadius: '6px',
                          padding: '6px 12px',
                          cursor: actioningDeviceId === device.deviceId ? 'default' : 'pointer',
                          fontWeight: 500,
                          opacity: actioningDeviceId === device.deviceId && actioningType === 'decline' ? 0.5 : 1,
                        }}
                      >
                        {actioningDeviceId === device.deviceId && actioningType === 'approve' && (
                          <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                        )}
                        {actioningDeviceId === device.deviceId && actioningType === 'approve' ? 'Approving…' : 'Approve'}
                      </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ color: '#8696a0', fontSize: '14px', fontWeight: 500, marginBottom: '8px' }}>
              Active devices
            </div>
            {active.length === 0 ? (
              <div style={{ color: '#8696a0', padding: '16px 0' }}>No active devices</div>
            ) : (
              active.map((device) => {
                const Icon = platformIcon(device.platform);
                return (
                  <div
                    key={device.deviceId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '12px',
                      borderBottom: '1px solid #202c33',
                      gap: '12px',
                    }}
                  >
                    <Icon size={24} color="#00a884" />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '15px' }}>{platformLabel(device.platform)}</div>
                      <div style={{ fontSize: '13px', color: '#8696a0' }}>
                        Last active {new Date(device.lastActiveAt).toLocaleString()}
                      </div>
                    </div>
                    <button
                      disabled={actioningDeviceId === device.deviceId}
                      onClick={() => handleRevoke(device.deviceId)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#ff5252',
                        cursor: 'pointer',
                        padding: '6px',
                      }}
                      title="Revoke device"
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>
                );
              })
            )}

            <div style={{ marginTop: '32px', paddingTop: '16px', borderTop: '1px solid #202c33' }}>
              <div style={{ color: '#8696a0', fontSize: '14px', fontWeight: 500, marginBottom: '8px' }}>
                Chat Backup
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '12px',
                  backgroundColor: '#202c33',
                  borderRadius: '8px',
                  gap: '12px',
                }}
              >
                <Lock size={22} color={backupInfo?.exists ? '#00a884' : '#8696a0'} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '15px' }}>
                    {backupInfo?.exists ? 'Backup created' : 'No backup yet'}
                  </div>
                  <div style={{ fontSize: '13px', color: '#8696a0' }}>
                    {backupInfo?.exists
                      ? `Updated ${new Date(backupInfo.updatedAt!).toLocaleString()}`
                      : "Encrypt a copy of your recent chats with a passphrase — a fallback if no other device is online to sync from"}
                  </div>
                </div>
                {backupInfo?.exists && (
                  <button
                    disabled={isBackupActionBusy}
                    onClick={handleDeleteBackup}
                    style={{ background: 'none', border: 'none', color: '#ff5252', cursor: 'pointer', padding: '6px' }}
                    title="Delete backup"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
                <button
                  disabled={isBackupActionBusy}
                  onClick={() => setBackupModalMode('create')}
                  style={{
                    background: '#00a884',
                    border: 'none',
                    color: '#0b141a',
                    borderRadius: '6px',
                    padding: '6px 12px',
                    cursor: 'pointer',
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {backupInfo?.exists ? 'Update' : 'Create'}
                </button>
                <button
                  disabled={isBackupActionBusy}
                  onClick={() => setBackupModalMode('restore')}
                  style={{
                    background: 'none',
                    border: '1px solid #8696a0',
                    color: '#e9edef',
                    borderRadius: '6px',
                    padding: '6px 12px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Restore
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {backupModalMode && (
        <BackupPassphraseModal
          mode={backupModalMode}
          onClose={() => setBackupModalMode(null)}
          onSubmit={async (passphrase) => {
            if (backupModalMode === 'create') {
              const count = await createOrUpdateBackup(passphrase);
              toast.success(`Backup created from ${count} message${count === 1 ? '' : 's'}`);
              await loadBackupInfo();
            } else {
              const count = await restoreBackup(passphrase);
              toast.success(`Restored ${count} message${count === 1 ? '' : 's'} from backup`);
            }
          }}
        />
      )}
    </div>
  );
};
