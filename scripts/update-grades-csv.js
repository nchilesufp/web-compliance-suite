import fs from 'fs';
import path from 'path';

const OUT_DIR = path.resolve('reports');
const CSV_PATH = path.join(OUT_DIR, 'grades.csv');

function csvEscape(val) {
  const s = (val ?? '').toString().replace(/\r?\n/g, ' ');
  return '"' + s.replace(/"/g, '""') + '"';
}

export function appendGradeCsv(row) {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  if (!fs.existsSync(CSV_PATH)) {
    fs.writeFileSync(
      CSV_PATH,
      ['Date','Quarter','Site','URL','Pages','Total Issues','Critical','Warnings','Passes','Score','Grade','Report Path'].map(csvEscape).join(',') + '\n',
      'utf8'
    );
  }
  const line = [
    row.date, row.quarter, row.site, row.url, row.pages,
    row.totalIssues, row.critical, row.warnings, row.passes,
    row.score, row.grade, row.reportPath
  ].map(csvEscape).join(',') + '\n';
  fs.appendFileSync(CSV_PATH, line, 'utf8');
  return CSV_PATH;
}
