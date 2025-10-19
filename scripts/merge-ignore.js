#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const IGNORE_PATH = path.resolve('config/ignore.json');

function loadJsonSafe(p) {
  try {
    if (!fs.existsSync(p)) return { version: 1, rules: [] };
    const raw = fs.readFileSync(p, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to read ignore file:', e.message);
    process.exit(1);
  }
}

function saveJsonPretty(p, obj) {
  const backup = p + '.bak';
  try {
    if (fs.existsSync(p)) fs.copyFileSync(p, backup);
  } catch {}
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

function parseArgs(argv) {
  // Simple arg parser: --id <id> [--url <url>] [--domain <domain>] [--category <name>] [--type <type>] [--selector <css>] [--textIncludes <substr>] [--severityAtMost <lvl>] [--expiry <YYYY-MM-DD>]
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    args[key] = val;
  }
  return args;
}

function validateRule(rule) {
  if (!rule) throw new Error('Empty rule');
  if (!rule.id && !rule.url && !rule.domain && !rule.selector && !rule.category && !rule.type) {
    throw new Error('Rule must include at least one of: id, url, domain, selector, category, type');
  }
  if (rule.expiry && !/^\d{4}-\d{2}-\d{2}$/.test(rule.expiry)) {
    throw new Error('expiry must be YYYY-MM-DD');
  }
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.id && !args.url && !args.domain && !args.selector && !args.category && !args.type) {
    console.error('Usage: node scripts/merge-ignore.js --id <issueId> [--url <url>] [--domain <domain>] [--category <name>] [--type <type>] [--selector <css>] [--textIncludes <substr>] [--severityAtMost <lvl>] [--expiry <YYYY-MM-DD>]');
    process.exit(2);
  }

  const cfg = loadJsonSafe(IGNORE_PATH);
  const rules = Array.isArray(cfg.rules) ? cfg.rules : [];

  const rule = {
    id: args.id,
    url: args.url,
    domain: args.domain,
    category: args.category,
    type: args.type,
    selector: args.selector,
    textIncludes: args.textIncludes,
    severityAtMost: args.severityAtMost,
    expiry: args.expiry
  };

  // Remove undefined keys
  Object.keys(rule).forEach(k => rule[k] === undefined && delete rule[k]);

  try {
    validateRule(rule);
  } catch (e) {
    console.error('Invalid rule:', e.message);
    process.exit(3);
  }

  // Prevent duplicate id rules
  const exists = rules.some(r => (rule.id && r.id === rule.id) || (r.id && r.id === rule.id));
  if (exists) {
    console.log('Rule with this id already exists. No changes made.');
    process.exit(0);
  }

  rules.push(rule);
  cfg.rules = rules;
  cfg.version = cfg.version || 1;
  saveJsonPretty(IGNORE_PATH, cfg);
  console.log('Ignore rule added to', IGNORE_PATH);
}

main();
