// Plain-text version of the reclaim plan, for copying or emailing.
import { CONFIG } from './config.js';
import { t } from './i18n.js';
import { fmt } from './ui.js';
import { suggestion } from './copy.js';

export function planText(s, list = s.reclaim.suggestions) {
  const rec = s.reclaim;
  const lines = [];
  lines.push(s.mode === 'work' ? t('Your {year} reclaim plan, from {brand}', { year: s.year, brand: CONFIG.brand.name }) : t('Your {year} nudges, from {brand}', { year: s.year, brand: CONFIG.brand.name }));
  lines.push('');
  lines.push(s.mode === 'work'
    ? t('{m} meetings, {h} hours, {s}% of working time.', { m: fmt.int(s.meetings), h: fmt.hours(s.totalHours), s: s.shareOfWork })
    : t('{e} plans, {h} hours of planned life.', { e: fmt.int(s.events), h: fmt.hours(s.totalHours) }));
  if (rec.totalHours > 0 && s.mode === 'work') lines.push(t('Up to {h} hours a year back, about {d} working days.', { h: fmt.int(rec.totalHours), d: fmt.num(rec.workingDays) }));
  lines.push('');
  list.map(suggestion).forEach((x, i) => {
    lines.push(`${i + 1}. ${x.title}${x.hoursPerYear > 0 ? ` (${t('{h} hours a year', { h: fmt.int(x.hoursPerYear) })})` : ''}`);
    lines.push(`   ${x.detail}`);
  });
  lines.push('');
  lines.push(t('Made with {brand}, {domain}', { brand: CONFIG.brand.name, domain: CONFIG.brand.domain }));
  return lines.join('\n');
}
