// The "Make a video" sheet: renders the story to a 9:16 video on this device, with a live preview,
// then offers Save and Share. The encoder and muxer load only when someone asks for a video.
import { CONFIG } from './config.js';
import { t } from './i18n.js';
import { h, toast } from './ui.js';
import { track } from './analytics.js';

export const videoSupported = () => typeof VideoEncoder === 'function' || (typeof MediaRecorder === 'function' && !!HTMLCanvasElement.prototype.captureStream);

export function openVideoModal(stats, { music = true } = {}) {
  const root = h('div', { class: 'modal-root', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'video-title' });
  const opener = document.activeElement;
  let closed = false, url = null;
  const close = () => {
    closed = true;
    root.classList.remove('in'); document.removeEventListener('keydown', onKey);
    setTimeout(() => { root.remove(); if (url) URL.revokeObjectURL(url); opener?.focus?.(); }, 300);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };

  const preview = h('canvas', { class: 'video-preview', width: 270, height: 480, 'aria-hidden': 'true' });
  const pctx = preview.getContext('2d');
  const stage = h('div', { class: 'video-stage' }, preview);
  const bar = h('i', {});
  const meter = h('div', { class: 'video-meter', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0' }, bar);
  const status = h('p', { class: 'video-status', 'aria-live': 'polite' }, t('Making your video…'));
  const buttons = h('div', { class: 'video-buttons' });
  const cancel = h('button', { class: 'btn btn-secondary btn-block', onClick: close }, t('Not now'));

  const modal = h('div', { class: 'modal modal-video' },
    h('h3', { id: 'video-title' }, t('Your story as a video')),
    h('p', {}, t('A 9:16 video for Stories, Reels and TikTok. It’s made here on your device.')),
    stage, meter, status, buttons, cancel);
  root.append(modal);
  root.addEventListener('click', (e) => { if (e.target === root) close(); });
  document.addEventListener('keydown', onKey);
  document.body.append(root);
  requestAnimationFrame(() => root.classList.add('in'));
  track('video_started');

  let lastPreview = 0;
  (async () => {
    try {
      const { makeVideo } = await import('./video.js');
      const out = await makeVideo(stats, { music,
        onProgress: (p) => {
          const pct = Math.min(100, Math.round(p * 100));
          bar.style.transform = `scaleX(${pct / 100})`;
          meter.setAttribute('aria-valuenow', String(pct));
          status.textContent = t('Making your video… {p}%', { p: pct });
        },
        preview: (src) => {
          const now = performance.now();
          if (now - lastPreview < 60) return;
          lastPreview = now;
          pctx.drawImage(src, 0, 0, preview.width, preview.height);
        },
      });
      if (closed) return;
      url = URL.createObjectURL(out.blob);
      const name = `calendar-wrapped-${stats.year}.${out.ext}`;
      const file = new File([out.blob], name, { type: out.type });
      const video = h('video', { class: 'video-preview', src: url, autoplay: true, muted: true, loop: true, playsinline: true, controls: true, 'aria-label': t('Your story as a video') });
      video.muted = true;
      stage.replaceChildren(video);
      meter.classList.add('done');
      status.textContent = out.audio ? t('{s} seconds with music, ready to post.', { s: out.seconds }) : t('{s} seconds, ready to post.', { s: out.seconds });
      root.dataset.audio = String(out.audio);
      root.dataset.ready = out.type;
      root.dataset.size = String(out.blob.size);
      track('video_made');

      const save = h('button', { class: 'btn btn-lg btn-block', onClick: () => {
        const a = h('a', { href: url, download: name });
        document.body.append(a); a.click(); a.remove();
        track('video_saved');
        toast(t('Saved.'));
      } }, t('Save video'));
      const canShareFile = navigator.canShare?.({ files: [file] });
      const share = canShareFile ? h('button', { class: 'btn btn-secondary btn-lg btn-block', onClick: async () => {
        try { await navigator.share({ files: [file], text: t('Made with {brand}', { brand: CONFIG.brand.name }) }); track('video_shared'); } catch { /* cancelled */ }
      } }, t('Share')) : null;
      // Some people add their own sound on Instagram or TikTok, so the music is optional.
      const again = h('button', { class: 'link', id: 'video-music', onClick: () => { close(); setTimeout(() => openVideoModal(stats, { music: !music }), 320); } }, music ? t('Make it without music') : t('Make it with music'));
      buttons.replaceChildren(...[canShareFile ? share : save, canShareFile ? save : null, again].filter(Boolean));
      cancel.textContent = t('Done');
      (canShareFile ? share : save).focus();
    } catch (err) {
      if (closed) return;
      meter.classList.add('failed');
      status.textContent = t('This browser can’t make videos. Try the latest Chrome, Edge or Safari.');
      track('video_failed');
      console.warn('video', err);
    }
  })();
}
