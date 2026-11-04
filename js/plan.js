// Plain-text version of the reclaim plan, for copying or emailing.
import { CONFIG } from './config.js';
import { fmt } from './ui.js';

export function planText(s) {
  const rec = s.reclaim;
  const lines = [];
  lines.push(`Your ${s.year} ${s.mode === 'work' ? 'reclaim plan' : 'nudges'}, from ${CONFIG.brand.name}`);
  lines.push('');
  lines.push(s.mode === 'work'
    ? `${fmt.int(s.meetings)} meetings, ${fmt.hours(s.totalHours)} hours, ${s.shareOfWork}% of working time.`
    : `${fmt.int(s.events)} plans, ${fmt.hours(s.totalHours)} hours of planned life.`);
  if (rec.totalHours > 0 && s.mode === 'work') lines.push(`Up to ${fmt.int(rec.totalHours)} hours a year back, about ${fmt.num(rec.workingDays)} working days.`);
  lines.push('');
  rec.suggestions.forEach((x, i) => {
    lines.push(`${i + 1}. ${x.title}${x.hoursPerYear > 0 ? ` (${fmt.int(x.hoursPerYear)} hrs a year)` : ''}`);
    lines.push(`   ${x.detail}`);
  });
  lines.push('');
  lines.push(`Made with ${CONFIG.brand.name}, ${CONFIG.brand.domain}`);
  return lines.join('\n');
}
