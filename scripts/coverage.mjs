// Coverage runner + gate + badge — no custom karma.conf required.
//
// The Angular `@angular/build:karma` builder injects its test bundle through a
// custom middleware that a user karma.conf.js clobbers (it breaks the jasmine
// globals), so we cannot add coverage thresholds/reporters through Karma.
// Instead we run `ng test --code-coverage`, parse the istanbul text-summary it
// prints, enforce a floor here, and emit a self-contained SVG badge. This keeps
// the known-good builder config untouched while still gating coverage in CI.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Floors — a little under current numbers so ordinary refactors don't trip the
// gate, while still guarding the load-bearing data/sync/analytics layers.
const FLOORS = { statements: 75, branches: 58, functions: 68, lines: 75 };

const browser = process.env.COVERAGE_BROWSER || 'ChromeHeadless';
const args = [
  'test',
  '--watch=false',
  `--browsers=${browser}`,
  '--code-coverage',
  '--progress=false',
];

console.log(`> ng ${args.join(' ')}`);
const res = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['ng', ...args],
  { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' },
);

const output = `${res.stdout || ''}\n${res.stderr || ''}`;
process.stdout.write(output);

if (res.status !== 0) {
  console.error('\nTest run failed.');
  process.exit(res.status || 1);
}

// Parse the istanbul "text-summary" block, e.g.:
//   Statements   : 79.76% ( 623/781 )
function pct(metric) {
  const m = output.match(new RegExp(`${metric}\\s*:\\s*([\\d.]+)%`, 'i'));
  return m ? parseFloat(m[1]) : NaN;
}

const metrics = {
  statements: pct('Statements'),
  branches: pct('Branches'),
  functions: pct('Functions'),
  lines: pct('Lines'),
};

if (Object.values(metrics).some((v) => Number.isNaN(v))) {
  console.error('\nCould not parse coverage summary from test output.');
  process.exit(1);
}

console.log('\nCoverage:');
let failed = false;
for (const [k, floor] of Object.entries(FLOORS)) {
  const v = metrics[k];
  const ok = v >= floor;
  console.log(`  ${k.padEnd(11)} ${v.toFixed(2)}%  (floor ${floor}%)  ${ok ? 'OK' : 'FAIL'}`);
  if (!ok) failed = true;
}

// Emit an SVG badge keyed on line coverage.
const linePct = Math.round(metrics.lines);
const color =
  linePct >= 80 ? '#4c1' : linePct >= 70 ? '#a3c51c' : linePct >= 50 ? '#dfb317' : '#e05d44';
const value = `${linePct}%`;
const lw = 62;
const vw = value.length * 7 + 12;
const w = lw + vw;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="coverage: ${value}"><linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient><clipPath id="r"><rect width="${w}" height="20" rx="3" fill="#fff"/></clipPath><g clip-path="url(#r)"><rect width="${lw}" height="20" fill="#555"/><rect x="${lw}" width="${vw}" height="20" fill="${color}"/><rect width="${w}" height="20" fill="url(#s)"/></g><g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11"><text x="${lw / 2}" y="15" fill="#010101" fill-opacity=".3">coverage</text><text x="${lw / 2}" y="14">coverage</text><text x="${lw + vw / 2}" y="15" fill="#010101" fill-opacity=".3">${value}</text><text x="${lw + vw / 2}" y="14">${value}</text></g></svg>`;

mkdirSync(join(root, 'coverage'), { recursive: true });
writeFileSync(join(root, 'coverage', 'badge.svg'), svg);
writeFileSync(
  join(root, 'coverage', 'summary.json'),
  JSON.stringify(metrics, null, 2),
);
console.log(`\nBadge → coverage/badge.svg (${value} lines)`);

if (failed) {
  console.error('\nCoverage is below the configured floor.');
  process.exit(1);
}
