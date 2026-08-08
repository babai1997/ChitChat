import { SOCKET_EVENTS } from '../../constants/socket-events';
import { socketManager } from '../SocketManager';
import { getOrCreateDeviceId } from '../../../services/deviceId';
import {
  fetchPendingHistoryPayloads,
  handleIncomingHistoryChunk,
} from '../../../services/deviceLinkSync';
import { useDeviceLinkStore } from '../../../stores/useDeviceLinkStore';

// A new device just registered and is pending approval — every one of the
// user's sockets gets this, including the new device's own (which has
// nothing to approve about itself, so it's ignored here).
const handleDeviceLinkRequest = (payload: {
  newDeviceId: string;
  platform?: string;
  requestedAt?: string;
}) => {
  console.log('[Socket] device:link-request', payload.newDeviceId);
  if (payload.newDeviceId === getOrCreateDeviceId()) return;
  useDeviceLinkStore.getState().setPendingLinkRequest({
    deviceId: payload.newDeviceId,
    platform: payload.platform,
    requestedAt: payload.requestedAt ?? new Date().toISOString(),
  });
};

// A pending device was approved — only the device that WAS the pending one
// has anything to do here (pull whatever history got pushed while it
// waited); the approving device already pushed history synchronously
// right after its own approve() call, so it ignores this.
const handleDeviceLinkApproved = ({ deviceId }: { deviceId: string }) => {
  console.log('[Socket] device:link-approved', deviceId);
  if (deviceId !== getOrCreateDeviceId()) return;
  void fetchPendingHistoryPayloads();
};

const handleDeviceLinkDeclined = ({ deviceId }: { deviceId: string }) => {
  console.log('[Socket] device:link-declined', deviceId);
  if (deviceId === getOrCreateDeviceId()) {
    console.warn('[DeviceLink] This device link was declined');
  }
};

const handleDeviceHistoryChunk = (payload: {
  chatId: string;
  ciphertext: string;
  approvingDeviceId: string;
}) => {
  console.log('[Socket] device:history-chunk', payload.chatId);
  void handleIncomingHistoryChunk(payload);
};

export function registerDeviceLinkHandlers(): () => void {
  socketManager.on(SOCKET_EVENTS.DEVICE_LINK_REQUEST, handleDeviceLinkRequest as any);
  socketManager.on(SOCKET_EVENTS.DEVICE_LINK_APPROVED, handleDeviceLinkApproved as any);
  socketManager.on(SOCKET_EVENTS.DEVICE_LINK_DECLINED, handleDeviceLinkDeclined as any);
  socketManager.on(SOCKET_EVENTS.DEVICE_HISTORY_CHUNK, handleDeviceHistoryChunk as any);

  return () => {
    socketManager.off(SOCKET_EVENTS.DEVICE_LINK_REQUEST, handleDeviceLinkRequest as any);
    socketManager.off(SOCKET_EVENTS.DEVICE_LINK_APPROVED, handleDeviceLinkApproved as any);
    socketManager.off(SOCKET_EVENTS.DEVICE_LINK_DECLINED, handleDeviceLinkDeclined as any);
    socketManager.off(SOCKET_EVENTS.DEVICE_HISTORY_CHUNK, handleDeviceHistoryChunk as any);
  };
}
