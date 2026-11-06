// Error messages are reduced to their shape before they leave the browser, and again on the
// server. Parsers quote the line they choked on, and that line can be a meeting title, a name or
// an email address, so anything quoted, any address, URL, email or number, and anything after a
// colon is dropped. What's left ("invalid line (no token … or …) …") is enough to find the bug.
export function scrubMessage(message) {
  return String(message || '')
    .replace(/(["'`“‘«])[\s\S]*?(["'`”’»])/g, '…')
    .replace(/https?:\/\/\S+|www\.\S+/gi, '…')
    .replace(/\S+@\S+/g, '…')
    .replace(/:\s.*$/s, ': …')
    .replace(/\d+/g, '#')
    .replace(/(…\s*)+/g, '… ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}
