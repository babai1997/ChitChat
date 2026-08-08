import { create } from 'zustand';

interface PendingLinkRequest {
  deviceId: string;
  platform?: string;
  requestedAt: string;
}

interface DeviceLinkState {
  /** Drives DeviceLinkApprovalModal — set from the DEVICE_LINK_REQUEST socket handler. */
  pendingLinkRequest: PendingLinkRequest | null;
  setPendingLinkRequest: (request: PendingLinkRequest) => void;
  clearPendingLinkRequest: () => void;
  /**
   * Whether THIS device is approved — null until the first check resolves.
   * Unlike WhatsApp's QR-scan (an explicit "I am linking a device" ceremony
   * the user consciously starts), logging into a new device here looks
   * identical to any other login — nothing inherently signals "this is a
   * new device that needs approval." This flag drives a proactive banner
   * (see UnapprovedDeviceBanner) so that gap doesn't rely on the user
   * stumbling onto a decrypt-placeholder inside some chat to find out.
   */
  isThisDeviceApproved: boolean | null;
  setIsThisDeviceApproved: (approved: boolean) => void;
}

export const useDeviceLinkStore = create<DeviceLinkState>((set) => ({
  pendingLinkRequest: null,
  setPendingLinkRequest: (request) => set({ pendingLinkRequest: request }),
  clearPendingLinkRequest: () => set({ pendingLinkRequest: null }),
  isThisDeviceApproved: null,
  setIsThisDeviceApproved: (approved) => set({ isThisDeviceApproved: approved }),
}));
