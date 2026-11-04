// Unlocks via Stripe Checkout (/api/checkout, /api/verify, /api/entitlement on Cloudflare Pages).
// 'personal' is a one-off unlock. 'team' is a monthly subscription, re-checked against Stripe
// at most once a day so a cancelled plan stops working without any account system.
// Without the API deployed, Unlock does a preview unlock so the product can be tried anywhere.
import { CONFIG } from './config.js';
import { t, localeInfo } from './i18n.js';
import { h, fmt, toast, storage, store } from './ui.js';
import { track } from './analytics.js';

const KEY = 'cw:unlock';
const DAY = 86400000;

function read() {
  const v = storage(KEY);
  if (!v) return { kinds: [] };
  if (!Array.isArray(v.kinds)) return { ...v, kinds: ['personal'] }; // older format
  return v;
}
export function getUnlock() { return read(); }
export function isUnlocked(kind = 'personal') {
  const k = read().kinds;
  return k.includes(kind) || (kind === 'personal' && k.includes('team'));
}
function grant(kind, extra = {}) {
  const cur = read();
  store(KEY, { ...cur, ...extra, kinds: [...new Set([...cur.kinds, kind])], at: Date.now() });
}
function revoke(kind) {
  const cur = read();
  store(KEY, { ...cur, kinds: cur.kinds.filter((k) => k !== kind) });
}

export function currency() {
  const c = localeInfo().currency;
  return CONFIG.pricing[c] ? c : 'GBP';
}
export function price(product) {
  const c = currency();
  return fmt.money(CONFIG.pricing[c][product], c);
}
export const priceLabel = (product) => (product === 'team' ? t('{price} a month', { price: price('team') }) : price('personal'));

/** Returns the unlocked kind when we've just come back from a paid checkout. */
export async function handleReturnFromCheckout() {
  const url = new URL(location.href);
  const sessionId = url.searchParams.get('session_id');
  const cancelled = url.searchParams.get('checkout') === 'cancelled';
  if (!sessionId && !cancelled) return null;
  url.searchParams.delete('session_id'); url.searchParams.delete('checkout');
  history.replaceState(null, '', url.pathname + url.search + url.hash);
  if (cancelled) { toast(t('No charge made. Everything is still here.')); return null; }
  try {
    const res = await fetch(`/api/verify?session_id=${encodeURIComponent(sessionId)}`);
    const data = await res.json();
    if (data.paid) {
      const kind = data.product === 'team' ? 'team' : 'personal';
      grant(kind, { token: data.token, ...(kind === 'team' ? { teamToken: data.token, checkedAt: Date.now() } : {}) });
      track('unlock_paid');
      toast(t('Unlocked. Thank you.'));
      return kind;
    }
    toast(t('Payment not confirmed yet. Try again in a moment.'));
  } catch { toast(t('Could not confirm payment. Please refresh.')); }
  return null;
}

/** For the team plan: check the subscription is still active, at most once a day. */
export async function checkTeamEntitlement() {
  const u = read();
  if (!u.kinds.includes('team') || u.preview || !u.teamToken) return isUnlocked('team');
  if (u.checkedAt && Date.now() - u.checkedAt < DAY) return true;
  try {
    const res = await fetch(`/api/entitlement?token=${encodeURIComponent(u.teamToken)}`);
    if (!res.ok) return true; // never lock people out because our endpoint hiccuped
    const data = await res.json();
    if (data.active) { store(KEY, { ...u, checkedAt: Date.now() }); return true; }
    revoke('team');
    toast(t('Your team plan has ended. Resubscribe to see the full report.'));
    return false;
  } catch { return true; }
}

/** Opens Stripe's billing portal so subscribers can update cards or cancel. */
export async function openBillingPortal() {
  const u = read();
  try {
    const res = await fetch('/api/portal', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: u.teamToken, returnTo: location.pathname }) });
    const data = await res.json();
    if (data.url) { location.href = data.url; return; }
  } catch { /* fall through */ }
  toast(t('Billing isn’t available right now.'));
}
export const hasBilling = () => !!read().teamToken && !read().preview;

async function startCheckout(product) {
  const res = await fetch('/api/checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ product, currency: currency().toLowerCase(), returnTo: location.pathname }) });
  if (!res.ok) throw new Error(`checkout ${res.status}`);
  const { url } = await res.json();
  if (!url) throw new Error('no checkout url');
  location.href = url;
}

const COPY = {
  personal: () => ({
    title: t('The full picture'),
    sub: t('One payment, {price}. Unlocks on this device.', { price: price('personal') }),
    points: [t('Your complete reclaim plan, with a one-tap action for each change'), t('The full report: every week, every recurring series, every person'), t('Clean share cards in every format, no watermark'), t('Save it all as a PDF')],
  }),
  team: () => ({
    title: t('The team plan'),
    sub: t('{price}. Cancel any time. Unlocks on this device.', { price: priceLabel('team') }),
    points: [t('Everyone’s load side by side'), t('Every meeting the team shares, with person-hours per year'), t('The single change that returns the most time, costed'), t('Quarter by quarter, so you can see whether changes stuck'), t('A reminder each quarter to run it again')],
  }),
};

export function openUnlockModal({ product = 'personal', onUnlocked, beforeRedirect } = {}) {
  const copy = COPY[product]();
  track('unlock_opened');
  const root = h('div', { class: 'modal-root', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'unlock-title' });
  const opener = document.activeElement;
  const close = () => { root.classList.remove('in'); document.removeEventListener('keydown', onKey); setTimeout(() => { root.remove(); opener?.focus?.(); }, 300); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const label = product === 'team' ? t('Start for {price}', { price: priceLabel('team') }) : t('Unlock for {price}', { price: price('personal') });
  const btn = h('button', { class: 'btn btn-lg btn-block' }, label);
  btn.addEventListener('click', async () => {
    btn.disabled = true; btn.textContent = t('Opening checkout…');
    try {
      beforeRedirect?.();
      await startCheckout(product);
    } catch {
      if (CONFIG.allowPreviewUnlock) {
        grant(product, { preview: true });
        toast(t('Payments aren’t configured here, so this is a preview unlock.'));
        close(); onUnlocked?.();
      } else {
        btn.disabled = false; btn.textContent = label;
        toast(t('Checkout is unavailable right now.'));
      }
    }
  });
  const modal = h('div', { class: 'modal' },
    h('h3', { id: 'unlock-title' }, copy.title),
    h('p', {}, copy.sub),
    h('ul', {}, copy.points.map((p) => h('li', {}, p))),
    btn,
    h('button', { class: 'btn btn-secondary btn-block', style: 'margin-top:10px', onClick: close }, t('Not now')),
    h('p', { class: 'fine' }, t('Secure checkout by Stripe. Your calendar is never sent anywhere, including to us.')),
  );
  root.append(modal);
  root.addEventListener('click', (e) => { if (e.target === root) close(); });
  document.addEventListener('keydown', onKey);
  document.body.append(root);
  requestAnimationFrame(() => { root.classList.add('in'); btn.focus(); });
}
