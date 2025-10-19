import fs from 'fs/promises';
import path from 'path';

const REPORTS_DIR = path.resolve('reports');
const DOCS_DIR = path.resolve('docs');
const DOCS_REPORTS_DIR = path.join(DOCS_DIR, 'reports');

function htmlesc(s) { return (s||'').toString().replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c])); }

async function main() {
  await fs.mkdir(DOCS_DIR, { recursive: true });
  let dirs = [];
  try {
    const entries = await fs.readdir(REPORTS_DIR, { withFileTypes: true });
    dirs = entries.filter(e => e.isDirectory()).map(d => d.name).sort();
  } catch {}
  // Mirror reports into docs/reports for GitHub Pages hosting
  await fs.mkdir(DOCS_REPORTS_DIR, { recursive: true });
  for (const d of dirs) {
    const src = path.join(REPORTS_DIR, d);
    const dst = path.join(DOCS_REPORTS_DIR, d);
    await fs.mkdir(dst, { recursive: true });
    const files = await fs.readdir(src).catch(() => []);
    for (const f of files) {
      try {
        await fs.copyFile(path.join(src, f), path.join(dst, f));
      } catch {}
    }
  }
  const rows = await Promise.all(dirs.map(async d => {
    const p = path.join(REPORTS_DIR, d);
    const files = await fs.readdir(p).catch(() => []);
    const summary = files.find(f => f.endsWith('_statistics.json')) || files.find(f => f.endsWith('_summary.json')) || '';
    const detailed = files.find(f => f.endsWith('_detailed.csv')) || '';
    const md = files.find(f => f.endsWith('_summary.md')) || files.find(f => f.endsWith('.md')) || '';
    return {
      folder: d,
      summary: summary ? `reports/${d}/${summary}` : '',
      detailed: detailed ? `reports/${d}/${detailed}` : '',
      md: md ? `reports/${d}/${md}` : ''
    };
  }));

  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Accessibility Reports</title>
<style>
body{font:14px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:24px;color:#222}
table{border-collapse:collapse;width:100%} th,td{border:1px solid #ddd;padding:8px} th{background:#f5f5f5;text-align:left}
code{background:#f2f2f2;padding:2px 4px;border-radius:3px}
</style></head><body>
<h1>Accessibility Reports</h1>
<p>Latest runs are listed below. Click through to CSV/JSON/MD artifacts.</p>
<table>
  <thead><tr><th>Run Folder</th><th>Statistics JSON</th><th>Detailed CSV</th><th>Markdown</th></tr></thead>
  <tbody>
    ${rows.reverse().map(r => `<tr>
      <td><code>${htmlesc(r.folder)}</code></td>
      <td>${r.summary ? `<a href="./${htmlesc(r.summary)}">statistics</a>` : '-'}</td>
      <td>${r.detailed ? `<a href="./${htmlesc(r.detailed)}">detailed</a>` : '-'}</td>
      <td>${r.md ? `<a href="./${htmlesc(r.md)}">report</a>` : '-'}</td>
    </tr>`).join('\n')}
  </tbody>
  </table>
  <p>Grades CSV: ${await fs.stat(path.join(REPORTS_DIR, 'grades.csv')).then(async ()=>{
    try { await fs.copyFile(path.join(REPORTS_DIR, 'grades.csv'), path.join(DOCS_REPORTS_DIR, 'grades.csv')); } catch {}
    return '<a href="./reports/grades.csv">reports/grades.csv</a>';
  }).catch(()=>'-')}</p>
</body></html>`;
  await fs.writeFile(path.join(DOCS_DIR, 'index.html'), html, 'utf8');
}

main().catch(err => { console.error(err); process.exit(1); });
