import { useEffect, useState } from 'react';

/**
 * Whether this device currently has at least one video input. Used to
 * disable the video-call button up front rather than letting the user
 * click it, wait for getUserMedia to reject, and only then find out —
 * enumerateDevices() reports device KIND (though not label/deviceId)
 * even before any getUserMedia permission has ever been granted, so this
 * is reliable pre-permission.
 *
 * Defaults to `true` (optimistic) until the first check resolves, so the
 * button isn't incorrectly disabled during the brief window before we
 * actually know — a false negative here would be worse than a brief
 * false positive, since the getUserMedia failure path already has clear
 * user-facing error handling.
 */
export function useHasCamera(): boolean {
  const [hasCamera, setHasCamera] = useState(true);

  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    let cancelled = false;

    const check = () => {
      navigator.mediaDevices
        .enumerateDevices()
        .then((devices) => {
          if (!cancelled) setHasCamera(devices.some((d) => d.kind === 'videoinput'));
        })
        .catch(() => {
          // Can't determine — stay optimistic rather than incorrectly disabling the button.
        });
    };

    check();
    // Picks up a camera being plugged in/unplugged while the chat is open.
    navigator.mediaDevices.addEventListener('devicechange', check);
    return () => {
      cancelled = true;
      navigator.mediaDevices.removeEventListener('devicechange', check);
    };
  }, []);

  return hasCamera;
}
