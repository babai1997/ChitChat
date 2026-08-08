/**
 * Theme tokens — mirrors frontend/src/index.css's CSS variables exactly
 * (same names, same values), so mobile and web stay visually consistent.
 * React Native has no CSS custom properties, so this plain object is the
 * mobile equivalent: import `COLORS` and reference `COLORS.accent` instead
 * of a literal hex code, so a future re-theme is a one-file edit instead of
 * a repo-wide hunt. Currently: "Viber Purple" — backgrounds tinted toward
 * the accent hue rather than neutral gray.
 */
export const COLORS = {
  // Backgrounds — layered by depth, darkest to most elevated
  bgDeepest: '#0d0b16', // full-page screens, modal backdrops, selected/pressed rows
  bg: '#121022', // app shell, chat viewport
  surface: '#1c1830', // headers, sidebars, cards, panels
  surfaceElevated: '#201c38', // modals, popovers
  surfaceHover: '#251f40', // hover/pressed state on list rows

  // Borders / dividers
  border: '#2b2645',
  borderStrong: '#392f57',

  // Text
  textPrimary: '#f0eef7',
  textSecondary: '#9c93b3',
  textTertiary: '#b3abc7',
  white: '#ffffff',

  // Brand accent — Viber-style purple
  accent: '#6c5dd8', // primary buttons, active states, CTAs
  accentHover: '#7d6fe0', // hover/active accent, reply-quote borders
  accentSecondary: '#8b7fea', // logo mark, links, lighter highlights
  accentStrong: '#3d2f8f', // own-message bubble background
  accentDeep: '#5647c7', // gradient end, deep accent
  accentMutedBg: 'rgba(108, 93, 216, 0.14)', // subtle accent-tinted hover/banner backgrounds

  // Status
  danger: '#ef4444',
  warning: '#f0a500',
  info: '#4ec9e0',
  success: '#5fbf52', // echoes the reference image's own green CTA button
} as const;
