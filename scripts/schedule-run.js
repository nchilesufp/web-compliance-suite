import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { computeGrade } from './grade.js';
import { appendGradeCsv } from './update-grades-csv.js';

const SITES_PATH = path.resolve('config/sites.json');
const STATE_PATH = path.resolve('data/last-run.json');
const REPORTS_DIR = path.resolve('reports');
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

function fmtDate(d = new Date()) { return d.toISOString().slice(0,10); }
function quarterOf(d = new Date()) { return `Q${Math.floor(d.getMonth()/3)+1} ${d.getFullYear()}`; }
function daysSince(dateStr) { if (!dateStr) return Infinity; const then = new Date(dateStr); return Math.floor((Date.now()-then.getTime())/86400000); }

async function runAudit(url) {
  if (DRY_RUN) { console.log(`[DRY_RUN] Skipping audit for ${url}`); return; }
  return new Promise((resolve, reject) => {
    const child = spawn('node', [
      'accessibility-audit.js', url,
      '--depth','2','--max-pages','25','--timeout','45000'
    ], { stdio: 'inherit' });
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`audit exited ${code}`)));
  });
}

async function findLatestReportDir(host) {
  const slug = host.replace(/\./g,'-');
  const entries = await fs.readdir(REPORTS_DIR, { withFileTypes: true }).catch(() => []);
  const dirs = entries.filter(e => e.isDirectory() && e.name.includes(slug)).map(e => e.name).sort();
  return dirs.length ? path.join(REPORTS_DIR, dirs[dirs.length - 1]) : null;
}

async function readStatsOrSummary(reportDir) {
  if (!reportDir) return null;
  const files = await fs.readdir(reportDir);
  const stats = files.find(f => f.endsWith('_statistics.json'));
  const summary = !stats && files.find(f => f.endsWith('_summary.json'));
  const file = stats || summary;
  if (!file) return null;
  const obj = JSON.parse(await fs.readFile(path.join(reportDir, file), 'utf8'));
  // Support both statistics.json and summary.json shapes
  if (obj.overall) {
    return {
      pages: obj.metadata?.pagesAudited || 1,
      totalIssues: obj.overall.totalIssues || 0,
      criticalIssues: obj.overall.criticalIssues || 0,
      warnings: (obj.overall.highPriorityIssues || 0) + (obj.overall.mediumPriorityIssues || 0) + (obj.overall.lowPriorityIssues || 0),
      passes: obj.overall.passes || 0
    };
  }
  const pages = Array.isArray(obj.pages) ? obj.pages.length : (obj.summary?.pages || 1);
  const s = obj.summary || obj;
  return { pages, totalIssues: s.totalIssues || 0, criticalIssues: s.criticalIssues || 0, warnings: s.warnings || 0, passes: s.passes || 0 };
}

async function ensureState() {
  try { await fs.access(STATE_PATH); } catch { await fs.mkdir(path.dirname(STATE_PATH), { recursive: true }); await fs.writeFile(STATE_PATH, '{}'); }
}

async function main() {
  await ensureState();
  const sites = JSON.parse(await fs.readFile(SITES_PATH, 'utf8'));
  const state = JSON.parse(await fs.readFile(STATE_PATH, 'utf8').catch(()=> '{}'));

  const due = sites.filter(s => daysSince(state[s.url]?.lastRun) >= 90);
  if (due.length === 0) { console.log('No sites due this cycle.'); return; }

  for (const site of due) {
    const start = Date.now();
    console.log(`Auditing ${site.url}...`);
    await runAudit(site.url);

    const host = new URL(site.url).host;
    const reportDir = await findLatestReportDir(host);
    const summary = await readStatsOrSummary(reportDir) || { pages: 1, totalIssues: 0, criticalIssues: 0, warnings: 0, passes: 0 };
    const grade = computeGrade(summary);

    appendGradeCsv({
      date: fmtDate(),
      quarter: quarterOf(),
      site: site.label || host,
      url: site.url,
      pages: summary.pages,
      totalIssues: summary.totalIssues,
      critical: summary.criticalIssues,
      warnings: summary.warnings,
      passes: summary.passes,
      score: grade.score,
      grade: grade.letter,
      reportPath: reportDir ? path.relative(process.cwd(), reportDir) : ''
    });

    state[site.url] = { lastRun: fmtDate(), lastDurationSec: Math.round((Date.now()-start)/1000) };
    await fs.writeFile(STATE_PATH, JSON.stringify(state, null, 2));
  }

  // Build static index for GitHub Pages
  await import('./build-index.js');
}

main().catch(err => { console.error(err); process.exit(1); });
