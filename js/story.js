// Story player: progress, tap/swipe/keyboard navigation, per-slide animation,
// per-slide sharing, sound and haptics, and screen-reader narration.
import { h, stagger, countUp, toast } from './ui.js';
import { CONFIG } from './config.js';
import { t } from './i18n.js';
import { sound } from './sound.js';
import { renderSlideCard, canvasToBlob } from './card.js';
import { track } from './analytics.js';

const ICONS = {
  share: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>',
  on: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
  off: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="m22 9-6 6M16 9l6 6"/></svg>',
};

/** Pull a shareable spec out of a rendered slide, so every slide can be shared without extra wiring. */
function specFromSlide(el, year) {
  const text = (sel) => el.querySelector(sel)?.textContent.trim() || '';
  const bigEl = el.querySelector('.big');
  let big = null, unit = '';
  if (bigEl) {
    const n = bigEl.querySelector('[data-count]');
    big = n ? `${Number(n.dataset.count).toLocaleString('en-GB', { maximumFractionDigits: Number(n.dataset.decimals || 0) })}${n.dataset.suffix || ''}` : bigEl.childNodes[0]?.textContent || '';
    unit = bigEl.querySelector('small')?.textContent || '';
  }
  const ring = el.querySelector('.ring-num [data-count]');
  if (!big && ring) big = `${ring.dataset.count}%`;
  // Drop a trailing clause that points at a chart, since the image won't include it.
  const note = text('.note').replace(/\s*[^.]*:\s*$/, '').trim();
  return { year, cap: text('.cap'), big, unit, line: text('.line'), note, emoji: text('.persona-emoji'), image: el.querySelector('canvas.globe') || null };
}

export function createStory(host, slides, { onFinish, onExit, year } = {}) {
  host.innerHTML = '';
  host.classList.add('story');
  host.setAttribute('role', 'region');
  host.setAttribute('aria-roledescription', 'story');
  host.setAttribute('aria-label', t('{brand}, {n} slides', { brand: CONFIG.brand.name, n: slides.length }));
  host.tabIndex = -1;

  const progress = h('div', { class: 'story-progress', 'aria-hidden': 'true' }, slides.map(() => h('i')));
  const soundBtn = h('button', { class: 'story-icon', 'aria-label': sound.on ? t('Turn sound off') : t('Turn sound on'), 'aria-pressed': String(sound.on), html: sound.on ? ICONS.on : ICONS.off });
  soundBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const on = sound.toggle();
    soundBtn.innerHTML = on ? ICONS.on : ICONS.off;
    soundBtn.setAttribute('aria-pressed', String(on));
    soundBtn.setAttribute('aria-label', on ? t('Turn sound off') : t('Turn sound on'));
    if (on) sound.pop();
  });
  const shareBtn = h('button', { class: 'story-icon', 'aria-label': t('Share this slide'), html: ICONS.share });
  shareBtn.addEventListener('click', (e) => { e.stopPropagation(); shareSlide(); });
  const top = h('div', { class: 'story-top' },
    h('span', { class: 'brand' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }), CONFIG.brand.name),
    h('div', { class: 'story-actions' }, shareBtn, soundBtn, h('button', { class: 'story-icon story-close', 'aria-label': t('Close story'), onClick: (e) => { e.stopPropagation(); exit(); } }, '×')),
  );
  const stage = h('div', { class: 'story-stage' });
  const hint = h('div', { class: 'story-hint', 'aria-hidden': 'true' }, t('Tap to continue'));
  const live = h('div', { class: 'sr-only', 'aria-live': 'polite', 'aria-atomic': 'true' });
  const srNav = h('div', { class: 'sr-only' },
    h('button', { onClick: (e) => { e.stopPropagation(); back(); } }, t('Previous slide')),
    h('button', { onClick: (e) => { e.stopPropagation(); next(); } }, t('Next slide')));
  host.append(progress, top, stage, hint, live, srNav);

  const rendered = new Map();
  let index = -1;
  let destroyed = false;

  function slideEl(i) {
    if (!rendered.has(i)) {
      const def = slides[i];
      const el = h('div', { class: `slide ${def.theme || 'c-black'}`, 'aria-hidden': 'true' }, h('div', { class: 'slide-inner' }, def.render()));
      if (def.cta) el.append(h('div', { class: 'slide-cta' }, def.cta({ next, finish })));
      rendered.set(i, el);
      stage.append(el);
    }
    return rendered.get(i);
  }

  function enter(el) {
    el.querySelectorAll('[data-reveal], .bar i, .bar-rect, .heatstrip i, .ring .fill, .cell, .petal, .bubble, .tile-g, .picto, .arc, .dest, .dest-label, .dot, .m-dot, .wk-fill, .link, .joint, .race, .race-fill, .blk').forEach((n) => { n.style.animation = 'none'; void n.offsetWidth; n.style.animation = ''; });
    stagger(el);
    el.querySelectorAll('[data-count]').forEach((n) => {
      countUp(n, Number(n.dataset.count), { decimals: Number(n.dataset.decimals || 0), suffix: n.dataset.suffix || '', prefix: n.dataset.prefix || '', delay: 320 });
    });
  }

  function narrate(el, i) {
    const spec = specFromSlide(el, year);
    const parts = [spec.cap, spec.big && `${spec.big}${spec.unit ? ` ${spec.unit}` : ''}`, spec.line, el.querySelector('.note')?.textContent.trim()].filter(Boolean);
    const extra = [...el.querySelectorAll('.rows li, .equiv li, .tile, .chips span')].map((n) => n.textContent.replace(/\s+/g, ' ').trim()).slice(0, 6);
    live.textContent = `${t('Slide {i} of {n}', { i: i + 1, n: slides.length })}. ${[...parts, ...extra].map((p) => p.replace(/[.:\s]+$/, '')).join('. ')}.`;
  }

  function go(i) {
    if (destroyed) return;
    if (i >= slides.length) { finish(); return; }
    if (i < 0) i = 0;
    if (i === index) return;
    const prev = index >= 0 ? slideEl(index) : null;
    if (prev) slides[index].onLeave?.(prev);
    const forward = i > index;
    index = i;
    const cur = slideEl(i);
    if (prev) { prev.classList.remove('is-current'); prev.classList.add('is-leaving'); prev.dataset.dir = forward ? 'fwd' : 'back'; prev.setAttribute('aria-hidden', 'true'); setTimeout(() => prev.classList.remove('is-leaving'), 600); }
    cur.dataset.dir = forward ? 'fwd' : 'back';
    cur.classList.add('is-current');
    cur.removeAttribute('aria-hidden');
    host.className = `story ${slides[i].theme || 'c-black'}`;
    enter(cur);
    narrate(cur, i);
    slides[i].onEnter?.(cur);
    [...progress.children].forEach((seg, k) => { seg.classList.toggle('done', k < i); seg.classList.toggle('cur', k === i); });
    hint.style.opacity = i === 0 ? '1' : '0';
    if (i > 0) {
      if (cur.querySelector('.persona-emoji') || slides[i].cta) setTimeout(() => sound.chime(), 280);
      else forward ? sound.tick() : sound.back();
    }
  }
  const next = () => go(index + 1);
  const back = () => go(index - 1);
  function finish() { if (destroyed) return; track('story_finished'); destroy(); onFinish?.(); }
  function exit() { if (destroyed) return; destroy(); (onExit || onFinish)?.(); }

  async function shareSlide() {
    const el = slideEl(index);
    const canvas = document.createElement('canvas');
    renderSlideCard(canvas, specFromSlide(el, year), slides[index].theme || 'c-blue');
    const blob = await canvasToBlob(canvas);
    const file = new File([blob], `calendar-wrapped-${year}-${index + 1}.png`, { type: 'image/png' });
    track('slide_shared');
    try {
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], text: t('Made with {brand}', { brand: CONFIG.brand.name }) }); return; }
    } catch { return; /* cancelled */ }
    const a = h('a', { href: URL.createObjectURL(blob), download: file.name });
    document.body.append(a); a.click(); a.remove();
    toast(t('Slide saved as an image.'));
  }

  // Tap zones: left third goes back, the rest forward. Buttons and links are left alone.
  let downX = 0, downY = 0, downT = 0;
  const onDown = (e) => { downX = e.clientX; downY = e.clientY; downT = Date.now(); };
  const onUp = (e) => {
    if (e.target.closest('button, a, input')) return;
    const dx = e.clientX - downX, dy = e.clientY - downY;
    // Interactive areas (the globe): a drag belongs to them, a plain tap still advances.
    if (e.target.closest('[data-noadvance]')) { if (Math.abs(dx) < 10 && Math.abs(dy) < 10) next(); return; }
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5 && Date.now() - downT < 600) { dx < 0 ? next() : back(); return; }
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) { e.clientX < host.clientWidth * 0.32 ? back() : next(); }
  };
  const onKey = (e) => {
    if (e.target.closest?.('button') && (e.key === ' ' || e.key === 'Enter')) return;
    if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') { e.preventDefault(); next(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); back(); }
    else if (e.key === 'Escape') exit();
  };
  host.addEventListener('pointerdown', onDown);
  host.addEventListener('pointerup', onUp);
  window.addEventListener('keydown', onKey);
  document.body.classList.add('locked');

  function destroy() {
    if (index >= 0) slides[index]?.onLeave?.(rendered.get(index));
    destroyed = true;
    host.removeEventListener('pointerdown', onDown);
    host.removeEventListener('pointerup', onUp);
    window.removeEventListener('keydown', onKey);
    document.body.classList.remove('locked');
    host.className = '';
    host.removeAttribute('role'); host.removeAttribute('aria-roledescription'); host.removeAttribute('aria-label');
    host.innerHTML = '';
  }

  go(0);
  host.focus({ preventScroll: true });
  return { next, back, go, destroy };
}
