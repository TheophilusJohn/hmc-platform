// client/src/design/tokens.js
// HMC Design System — All color and font tokens

export const colors = {
  // Navy (Primary)
  navy: '#0F2B4A',
  navyMid: '#163A60',
  navyLight: '#1E4D7B',
  navyBg: '#EEF4FA',

  // Gold (Accent)
  gold: '#C9920A',
  goldLight: '#F5E6BE',
  goldBg: '#FFFBF0',

  // Neutrals
  cream: '#FDFBF7',
  white: '#FFFFFF',
  bg: '#F8F9FA',
  g50: '#F4F5F7',
  g100: '#EBEDF2',
  g200: '#DDE1E7',
  g300: '#C8CDD5',
  g400: '#A0A8B4',
  g500: '#7B8494',
  g600: '#5A6272',
  g700: '#3D4450',
  g900: '#1A1D23',

  // Semantic
  green: '#166534',
  greenBg: '#F0FDF4',
  greenBd: '#BBF7D0',
  greenMid: '#16A34A',

  red: '#991B1B',
  redBg: '#FEF2F2',
  redBd: '#FECACA',
  redMid: '#DC2626',

  amber: '#92400E',
  amberBg: '#FFFBEB',
  amberBd: '#FDE68A',
  amberMid: '#D97706',

  teal: '#0F766E',
  tealBg: '#F0FDFA',
  tealBd: '#99F6E4',
  tealMid: '#0D9488',

  purple: '#6D28D9',
  purpleBg: '#F5F3FF',
  purpleBd: '#DDD6FE',
  purpleMid: '#7C3AED',
};

export const fonts = {
  display: "'Playfair Display', Georgia, serif",
  body: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
};

export const radius = {
  sm: '6px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  full: '9999px',
};

export const shadow = {
  sm: '0 1px 2px rgba(0,0,0,0.05)',
  md: '0 2px 8px rgba(0,0,0,0.08)',
  lg: '0 4px 16px rgba(0,0,0,0.12)',
  overlay: '0 8px 32px rgba(0,0,0,0.16)',
};

// Semantic badge colors
export const badgeColors = {
  green: { bg: colors.greenBg, border: colors.greenBd, text: colors.green },
  red: { bg: colors.redBg, border: colors.redBd, text: colors.red },
  amber: { bg: colors.amberBg, border: colors.amberBd, text: colors.amber },
  navy: { bg: colors.navyBg, border: '#93C5FD', text: colors.navy },
  teal: { bg: colors.tealBg, border: colors.tealBd, text: colors.teal },
  purple: { bg: colors.purpleBg, border: colors.purpleBd, text: colors.purple },
  gold: { bg: colors.goldBg, border: colors.goldLight, text: colors.gold },
  gray: { bg: colors.g50, border: colors.g200, text: colors.g600 },
};

// Pipeline stage colors
export const stageColors = {
  RECEIVED: badgeColors.gray,
  DOCS_REVIEW: badgeColors.amber,
  INTERVIEW_SCHEDULED: badgeColors.navy,
  INTERVIEW_DONE: badgeColors.teal,
  WAITLISTED: badgeColors.purple,
  ACCEPTED: badgeColors.green,
  REJECTED: badgeColors.red,
  ENROLLED: { bg: '#F0FDF4', border: '#4ADE80', text: '#166534' },
};

export const CSS = `
  :root {
    --navy: ${colors.navy};
    --navy-mid: ${colors.navyMid};
    --navy-light: ${colors.navyLight};
    --navy-bg: ${colors.navyBg};
    --gold: ${colors.gold};
    --gold-light: ${colors.goldLight};
    --bg: ${colors.bg};
    --white: ${colors.white};
    --g200: ${colors.g200};
    --g500: ${colors.g500};
    --g700: ${colors.g700};
    --font-display: ${fonts.display};
    --font-body: ${fonts.body};
    --radius-md: ${radius.md};
    --radius-lg: ${radius.lg};
    --shadow-md: ${shadow.md};
  }
`;
