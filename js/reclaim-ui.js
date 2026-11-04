// The reclaim list with its one-tap actions, shared by the summary and the full report.
import { h, fmt, toast } from './ui.js';
import { t } from './i18n.js';
import { suggestion } from './copy.js';
import { actionsFor } from './actions.js';
import { track } from './analytics.js';

const firstName = (email) => String(email || '').split('@')[0].split(/[._-]/)[0].replace(/^./, (c) => c.toUpperCase());

function download(filename, content, type = 'text/calendar') {
  const a = h('a', { href: URL.createObjectURL(new Blob([content], { type })), download: filename });
  document.body.append(a); a.click(); a.remove();
}
async function copy(text, done) {
  try { await navigator.clipboard.writeText(text); toast(done); } catch { prompt(t('Copy this text'), text); }
}

function actionRow(x, ctx) {
  const actions = actionsFor(x, ctx);
  if (!actions.length) return null;
  return h('div', { class: 'actions' }, actions.map((a) => {
    if (a.type === 'message') {
      return h('div', { class: 'action' },
        a.to ? h('a', { class: 'btn btn-sm', href: a.mailto, onClick: () => track('action_used') }, t('Email {name}', { name: firstName(a.to) })) : null,
        h('button', { class: `btn btn-sm ${a.to ? 'btn-secondary' : ''}`, onClick: () => { track('action_used'); copy(a.subject ? `${a.subject}\n\n${a.body}` : a.body, t('Message copied. Paste it into Slack, Teams or email.')); } }, a.to ? t('Copy message') : a.label));
    }
    if (a.type === 'ics') {
      return h('div', { class: 'action' },
        h('button', { class: 'btn btn-sm', onClick: () => { track('action_used'); download(a.filename, a.content); toast(t('Open the file to add it to your calendar.')); } }, a.label),
        a.hint ? h('span', { class: 'caption' }, a.hint) : null);
    }
    return h('details', { class: 'howto' }, h('summary', {}, a.label), h('ol', {}, a.steps.map((s) => h('li', {}, s))));
  }));
}

/**
 * The list. `locked` blurs everything but the featured suggestion.
 * ctx: { selfEmail, source } so messages can be signed and steps match the calendar app.
 */
export function reclaimList(s, { locked = false, limit = Infinity, ctx = {} } = {}) {
  const rec = s.reclaim;
  const featured = rec.featured ?? 0;
  const ordered = rec.suggestions.map((x, i) => ({ ...suggestion(x), i })).sort((a, b) => (a.i === featured ? -1 : b.i === featured ? 1 : a.i - b.i));
  const shown = ordered.slice(0, limit);
  const actionCtx = { senderName: firstName(ctx.selfEmail), calendar: ctx.source === 'outlook' ? 'outlook' : 'google' };
  return h('ol', { class: 'reclaim-list' }, shown.map((x, k) => {
    const isLocked = locked && k > 0;
    return h('li', { class: isLocked ? 'locked' : '' },
      h('h4', {}, x.title), h('p', {}, x.detail),
      x.hoursPerYear > 0 ? h('div', { class: 'hrs' }, t('{h} hrs', { h: fmt.int(x.hoursPerYear) }), h('small', {}, t('per year'))) : h('div', { class: 'hrs' }, ''),
      isLocked ? null : actionRow(x, actionCtx));
  }));
}
