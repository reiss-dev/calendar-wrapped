// Unlocks via Stripe Checkout (/api/checkout + /api/verify on Cloudflare Pages).
// Two products: 'personal' (full report, clean card) and 'team' (team report; includes personal).
// Without the API deployed, Unlock does a preview unlock so the product can be tried anywhere.
import { CONFIG } from './config.js';
import { h, toast, storage, store } from './ui.js';
import { track } from './analytics.js';

const KEY = 'cw:unlock';

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

/** Returns the unlocked kind when we have just come back from a paid checkout. */
export async function handleReturnFromCheckout() {
  const url = new URL(location.href);
  const sessionId = url.searchParams.get('session_id');
  const cancelled = url.searchParams.get('checkout') === 'cancelled';
  if (!sessionId && !cancelled) return null;
  url.searchParams.delete('session_id'); url.searchParams.delete('checkout');
  history.replaceState(null, '', url.pathname + url.search + url.hash);
  if (cancelled) { toast('No charge made. Everything is still here.'); return null; }
  try {
    const res = await fetch(`/api/verify?session_id=${encodeURIComponent(sessionId)}`);
    const data = await res.json();
    if (data.paid) {
      const kind = data.product === 'team' ? 'team' : 'personal';
      grant(kind, { token: data.token });
      track('unlock_paid');
      toast('Unlocked. Thank you.');
      return kind;
    }
    toast('Payment not confirmed yet. Try again in a moment.');
  } catch { toast('Could not confirm payment. Please refresh.'); }
  return null;
}

async function startCheckout(product) {
  const res = await fetch('/api/checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ product, returnTo: location.pathname }) });
  if (!res.ok) throw new Error(`checkout ${res.status}`);
  const { url } = await res.json();
  if (!url) throw new Error('no checkout url');
  location.href = url;
}

const COPY = {
  personal: {
    title: 'The full picture',
    points: ['Your complete reclaim plan, ranked by hours returned', 'The full report: every week, every recurring series, every person', 'A clean share card in every format, no watermark', 'Save it all as a PDF'],
  },
  team: {
    title: 'The team report',
    points: ['Every person’s load side by side', 'Every meeting the team shares, with person-hours per year', 'The single change that returns the most time, costed', 'Save it as a PDF for your next team meeting'],
  },
};

export function openUnlockModal({ product = 'personal', onUnlocked, beforeRedirect } = {}) {
  const amount = product === 'team' ? CONFIG.pricing.teamAmount : CONFIG.pricing.amount;
  const price = `${CONFIG.pricing.symbol}${amount}`;
  const copy = COPY[product];
  track('unlock_opened');
  const root = h('div', { class: 'modal-root', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'unlock-title' });
  const opener = document.activeElement;
  const close = () => { root.classList.remove('in'); document.removeEventListener('keydown', onKey); setTimeout(() => { root.remove(); opener?.focus?.(); }, 300); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const btn = h('button', { class: 'btn btn-lg btn-block' }, `Unlock for ${price}`);
  btn.addEventListener('click', async () => {
    btn.disabled = true; btn.textContent = 'Opening checkout…';
    try {
      beforeRedirect?.();
      await startCheckout(product);
    } catch {
      if (CONFIG.allowPreviewUnlock) {
        grant(product, { preview: true });
        toast('Payments aren’t configured here, so this is a preview unlock.');
        close(); onUnlocked?.();
      } else {
        btn.disabled = false; btn.textContent = `Unlock for ${price}`;
        toast('Checkout is unavailable right now.');
      }
    }
  });
  const modal = h('div', { class: 'modal' },
    h('h3', { id: 'unlock-title' }, copy.title),
    h('p', {}, `One payment, ${CONFIG.pricing.label}. Unlocks on this device.`),
    h('ul', {}, copy.points.map((p) => h('li', {}, p))),
    btn,
    h('button', { class: 'btn btn-secondary btn-block', style: 'margin-top:10px', onClick: close }, 'Not now'),
    h('p', { class: 'fine' }, 'Secure checkout by Stripe. Your calendar is never sent anywhere, including to us.'),
  );
  root.append(modal);
  root.addEventListener('click', (e) => { if (e.target === root) close(); });
  document.addEventListener('keydown', onKey);
  document.body.append(root);
  requestAnimationFrame(() => { root.classList.add('in'); btn.focus(); });
}
