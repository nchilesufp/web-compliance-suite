import fs from 'fs';
import path from 'path';

const sevOrder = { low: 1, medium: 2, high: 3, critical: 4 };

export function loadIgnoreConfig(ignoreFile = 'config/ignore.json') {
  try {
    const p = path.resolve(ignoreFile);
    if (!fs.existsSync(p)) return { version: 1, rules: [] };
    const obj = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!obj || !Array.isArray(obj.rules)) return { version: 1, rules: [] };
    return obj;
  } catch {
    return { version: 1, rules: [] };
  }
}

function isExpired(expires) {
  if (!expires) return false;
  const d = new Date(expires);
  return Number.isFinite(+d) && d < new Date();
}

function urlMatches(rule, url) {
  try {
    const u = new URL(url);
    if (rule.scope === 'global') return true;
    if (rule.scope === 'domain') {
      return u.hostname === rule.pattern || u.hostname.endsWith(`.${rule.pattern}`);
    }
    if (rule.scope === 'url') {
      return u.href.startsWith(rule.pattern);
    }
  } catch {}
  return false;
}

export function shouldIgnore(issue, rules = []) {
  // issue = { id, url, category, type, severity, selector, text }
  for (const r of rules) {
    if (isExpired(r.expires)) continue;

    // Direct ID match wins
    if (r.id && issue.id && String(r.id).toLowerCase() === String(issue.id).toLowerCase()) {
      return true;
    }

    if (!urlMatches(r, issue.url)) continue;

    const catOk = !r.category || r.category === '*' || r.category === issue.category;
    if (!catOk) continue;

    const typeOk = !r.type || r.type === '*' || r.type === issue.type;
    if (!typeOk) continue;

    const sevOk = !r.severityAtMost || sevOrder[issue.severity || 'medium'] <= sevOrder[r.severityAtMost] || r.severityAtMost === '*';
    if (!sevOk) continue;

    const selOk = !r.selector || (issue.selector || '').includes(r.selector);
    if (!selOk) continue;

    const textOk = !r.textIncludes || (issue.text || '').toLowerCase().includes(String(r.textIncludes).toLowerCase());
    if (!textOk) continue;

    return true;
  }
  return false;
}
