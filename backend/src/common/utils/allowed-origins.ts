// Shared by main.ts's HTTP CORS and chat.gateway.ts's WebSocket CORS — both
// need the exact same allowlist, and both were previously reading
// `process.env.FRONTEND_URL` as a single hardcoded string independently,
// which meant a custom domain + its www variant + Render's own
// *.onrender.com default URL couldn't all be allowed at once, and a
// trailing slash on the configured value silently broke matching (the
// browser's Origin header never has one).
function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * FRONTEND_URL may be a comma-separated list. Always includes
 * localhost:5173 so local dev against a deployed backend never needs its
 * own override.
 */
export function getAllowedOrigins(): string[] {
  return Array.from(
    new Set([
      ...(process.env.FRONTEND_URL ?? '')
        .split(',')
        .map((s) => stripTrailingSlash(s.trim()))
        .filter(Boolean),
      'http://localhost:5173',
    ]),
  );
}
