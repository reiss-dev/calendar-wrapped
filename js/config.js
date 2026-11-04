// Edit this file to brand and price the product. No build step needed.
export const CONFIG = {
  brand: {
    name: 'Calendar Wrapped',
    // Shown on the share card watermark and in the footer. Change when you have a domain.
    domain: 'calendarwrapped.app',
    tagline: 'Your year, in meetings.',
  },
  pricing: {
    currency: 'GBP',
    symbol: '£',
    amount: 4,
    label: 'one-off',
    teamAmount: 29,
  },
  // Google Calendar connect. Leave clientId empty to hide the button.
  // Create an OAuth client (type: Web) in Google Cloud and add your domain as an
  // authorised JavaScript origin. See LAUNCH.md for the verification steps.
  google: {
    clientId: '',
  },
  // Counts funnel events (no cookies, no IDs) via /api/hit. Set false to disable.
  analytics: true,
  // Shared-link and share-card defaults.
  share: {
    hideNamesByDefault: true,
  },
  // Default working week used for the "share of your time" stat.
  workHoursPerWeek: 40,
  // When the /api/checkout endpoint is missing (local preview, static host without
  // functions), clicking Unlock shows a preview unlock instead of failing.
  allowPreviewUnlock: true,
  // Minimum time the "reading your year" screen stays up, so the moment lands.
  introMs: 2600,
};
