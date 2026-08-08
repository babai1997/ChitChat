const STORAGE_KEY = 'chitchat_post_login_redirect';

/**
 * Resolves where to send the user after login/signup completes. Prefers
 * React Router's `location.state.from` (set by ProtectedRoute); falls back
 * to sessionStorage, which ProtectedRoute also writes to since a full-page
 * OAuth redirect can wipe in-memory router state before we get a chance to
 * read it. Always clears the sessionStorage entry so a stale value never
 * redirects a later, unrelated login.
 */
export function resolvePostLoginRedirect(locationState: unknown): string {
  const fromState = (locationState as { from?: { pathname?: string; search?: string } } | undefined)?.from;
  const stateTarget = fromState?.pathname ? `${fromState.pathname}${fromState.search ?? ''}` : null;

  let stored: string | null = null;
  try {
    stored = sessionStorage.getItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private-browsing/storage-disabled — state-based target still applies.
  }

  return stateTarget ?? stored ?? '/';
}
