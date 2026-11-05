// The wide (1200×630) share card as SVG, for link previews rendered on the server.
// Same layout and wording as the canvas card, without emoji (the server font has none).
import { useDictionary, t } from '../../js/i18n.js';
import { cardTiles, modelPersona } from '../../js/model.js';
import nl from '../../js/i18n/nl.js';
import sv from '../../js/i18n/sv.js';
import nb from '../../js/i18n/nb.js';
import da from '../../js/i18n/da.js';

const DICTS = { en: {}, nl, sv, nb, da };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Inter's average advance is about 0.56em (medium) and 0.6em (bold); good enough to fit text.
const width = (s, size, bold) => [...String(s)].length * size * (bold ? 0.6 : 0.56);
const fit = (s, maxW, size, min, bold) => { let z = size; while (z > min && width(s, z, bold) > maxW) z -= 1; return z; };

export function cardSvg(model, { brand, domain }) {
  useDictionary(model.l in DICTS ? model.l : 'en', DICTS[model.l] || {});
  try {
    const W = 1200, H = 630, pad = 64, tx = 620;
    const [bg, ink] = model.m === 'w' ? ['#2338e8', '#ffd9e6'] : ['#ff4f8b', '#3a0619']; // the app's two-tone card colours
    const persona = modelPersona(model);
    const l1 = t('Your {year},', { year: model.y }), l2 = model.m === 'w' ? t('in meetings.') : t('in plans.');
    const hs = Math.min(fit(l1, 500, 64, 40, true), fit(l2, 500, 64, 40, true));
    const months = Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat(model.l || 'en', { month: 'narrow' }).format(new Date(2021, i, 1)));
    const tiles = cardTiles(model).slice(0, 4);
    const colW = (W - pad - tx - 32) / 2;
    const parts = [];
    parts.push(`<rect width="${W}" height="${H}" fill="${bg}"/>`);
    parts.push(`<text x="${pad}" y="84" font-size="22" font-weight="700" fill="${ink}">${esc(brand)}</text>`);
    parts.push(`<text x="${tx - 40}" y="84" font-size="22" font-weight="500" fill="${ink}" fill-opacity="0.74" text-anchor="end">${model.y}</text>`);
    parts.push(`<text x="${pad - 3}" y="196" font-size="${hs}" font-weight="700" fill="${ink}" letter-spacing="${(-hs * 0.04).toFixed(1)}">${esc(l1)}</text>`);
    parts.push(`<text x="${pad - 3}" y="268" font-size="${hs}" font-weight="700" fill="${ink}" letter-spacing="${(-hs * 0.04).toFixed(1)}">${esc(l2)}</text>`);
    parts.push(`<rect x="${pad}" y="316" width="480" height="2" fill="${ink}" fill-opacity="0.28"/>`);
    parts.push(`<text x="${pad}" y="372" font-size="19" font-weight="500" fill="${ink}" fill-opacity="0.74">${esc(t('Your calendar persona'))}</text>`);
    const ps = fit(persona.name, 480, 42, 24, true);
    parts.push(`<text x="${pad}" y="418" font-size="${ps}" font-weight="700" fill="${ink}" letter-spacing="-1">${esc(persona.name)}</text>`);
    tiles.forEach(([v, l], i) => {
      const x = tx + (i % 2) * (colW + 32), y = 118 + Math.floor(i / 2) * 150;
      const numeric = /^[\d.,\s %]+$/.test(v);
      const vs = fit(v, colW - 8, numeric ? 54 : 36, 20, true), ls = fit(l, colW - 4, 18, 13, false);
      parts.push(`<rect x="${x}" y="${y}" width="${colW}" height="2" fill="${ink}" fill-opacity="0.28"/>`);
      parts.push(`<text x="${x}" y="${y + 70}" font-size="${vs}" font-weight="700" fill="${ink}" letter-spacing="${numeric ? -2 : -0.5}">${esc(v)}</text>`);
      parts.push(`<text x="${x}" y="${y + 102}" font-size="${ls}" font-weight="500" fill="${ink}" fill-opacity="0.74">${esc(l)}</text>`);
    });
    const mw = W - pad - tx, g = 12, bw = (mw - 11 * g) / 12;
    model.mo.forEach((v, i) => {
      const bh = Math.max(5, (v / 100) * 64);
      parts.push(`<rect x="${(tx + i * (bw + g)).toFixed(1)}" y="${(450 + 64 - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="5" fill="${ink}" fill-opacity="${i === model.hi ? 1 : 0.36}"/>`);
      parts.push(`<text x="${(tx + i * (bw + g) + bw / 2).toFixed(1)}" y="538" font-size="15" font-weight="500" fill="${ink}" fill-opacity="0.74" text-anchor="middle">${esc(months[i])}</text>`);
    });
    parts.push(`<text x="${pad}" y="${H - 44}" font-size="18" font-weight="500" fill="${ink}">${esc(t('Make yours at {domain}', { domain }))}</text>`);
    parts.push(`<text x="${W - pad}" y="${H - 44}" font-size="18" font-weight="500" fill="${ink}" fill-opacity="0.74" text-anchor="end">${esc(t('Nothing uploaded.'))}</text>`);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Inter">${parts.join('')}</svg>`;
  } finally {
    useDictionary('en', {});
  }
}

/** Title and description for link unfurls. */
export function cardMeta(model, { brand }) {
  useDictionary(model.l in DICTS ? model.l : 'en', DICTS[model.l] || {});
  try {
    const p = modelPersona(model);
    const who = model.w ? t('{name}’s {year}', { name: model.w, year: model.y }) : t('Their {year}', { year: model.y });
    return {
      title: `${p.emoji} ${p.name} · ${who}, ${model.m === 'w' ? t('in meetings.') : t('in plans.')}`.replace(/\.$/, ''),
      description: t('{brand}: your year in meetings, privately, in about thirty seconds. Make yours.', { brand }),
    };
  } finally {
    useDictionary('en', {});
  }
}
