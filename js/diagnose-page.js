// The diagnostics page: reads a calendar on this device and makes a redacted report.
import { setLocale, pickLocale, translateDom, t } from './i18n.js';
import { CONFIG } from './config.js';
import { parseICS, guessSelfEmail } from './ics.js';
import { computeStats } from './stats.js';
import { anonymiseIcs, diagnosticReport } from './anonymise.js';
await setLocale(pickLocale({ query: new URLSearchParams(location.search).get('lang'), languages: navigator.languages || [] }));
translateDom();
document.querySelectorAll('[data-brand-name]').forEach((n) => { n.textContent = CONFIG.brand.name; });
const input = document.getElementById('diag-file');
let text = '';
document.getElementById('diag-choose').onclick = () => input.click();
input.onchange = async () => {
  const f = input.files[0]; if (!f) return;
  text = await f.text();
  document.getElementById('diag-report').textContent = diagnosticReport(text, { parseICS, guessSelfEmail, computeStats });
  document.getElementById('diag-out').hidden = false;
};
document.getElementById('diag-copy').onclick = async () => {
  try { await navigator.clipboard.writeText(document.getElementById('diag-report').textContent); document.getElementById('diag-copy').textContent = t('Copied'); } catch { /* ignore */ }
};
document.getElementById('diag-anon').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([anonymiseIcs(text)], { type: 'text/calendar' }));
  a.download = 'calendar-anonymised.ics';
  document.body.append(a); a.click(); a.remove();
};
