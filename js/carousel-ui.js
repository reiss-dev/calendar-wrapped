// The carousel sheet: every page as a thumbnail, then Save (PDF) or Share. Made on this device.
import { CONFIG } from './config.js';
import { t } from './i18n.js';
import { h, toast } from './ui.js';
import { track } from './analytics.js';

export function openCarouselModal(stats, { build = null, title = null, file: fileName = null } = {}) {
  const root = h('div', { class: 'modal-root', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'carousel-title' });
  const opener = document.activeElement;
  const close = () => {
    root.classList.remove('in'); document.removeEventListener('keydown', onKey);
    setTimeout(() => { root.remove(); opener?.focus?.(); }, 300);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const strip = h('div', { class: 'carousel-strip', tabindex: '0', 'aria-label': t('Carousel pages') });
  const buttons = h('div', { class: 'video-buttons' });
  const status = h('p', { class: 'video-status', 'aria-live': 'polite' }, t('Making your carousel…'));
  root.append(h('div', { class: 'modal modal-carousel' },
    h('h3', { id: 'carousel-title' }, t('A carousel for LinkedIn')),
    h('p', {}, t('One PDF, a page per slide. On LinkedIn, start a post and add it as a document.')),
    strip, status, buttons,
    h('button', { class: 'btn btn-secondary btn-block', onClick: close }, t('Not now'))));
  root.addEventListener('click', (e) => { if (e.target === root) close(); });
  document.addEventListener('keydown', onKey);
  document.body.append(root);
  requestAnimationFrame(() => root.classList.add('in'));
  track('carousel_started');

  (async () => {
    try {
      const { carouselPages, drawPage, makeCarousel } = await import('./carousel.js');
      const make = build || carouselPages;
      const pages = make(stats);
      pages.forEach((pg, i) => { const cv = drawPage(document.createElement('canvas'), pg, i, pages.length); cv.className = 'carousel-page'; cv.setAttribute('aria-hidden', 'true'); strip.append(cv); });
      const { blob, pages: n } = await makeCarousel(stats, { build: make, title });
      const name = fileName || `calendar-wrapped-${stats.year}-carousel.pdf`;
      status.textContent = t('{n} pages, ready.', { n });
      const file = new File([blob], name, { type: 'application/pdf' });
      buttons.append(
        h('button', { class: 'btn btn-block', id: 'carousel-save', onClick: () => {
          const a = h('a', { href: URL.createObjectURL(blob), download: name });
          document.body.append(a); a.click(); a.remove();
          track('carousel_saved');
          toast(t('Saved. Add it to a LinkedIn post as a document.'));
        } }, t('Save PDF')),
        navigator.canShare?.({ files: [file] }) ? h('button', { class: 'btn btn-secondary btn-block', onClick: async () => {
          try { await navigator.share({ files: [file], text: t('Made with {brand}', { brand: CONFIG.brand.name }) }); track('carousel_shared'); } catch { /* cancelled */ }
        } }, t('Share')) : null);
      track('carousel_made');
    } catch (err) {
      status.textContent = t('Something went wrong making the carousel.');
      console.warn('carousel', err);
    }
  })();
}
