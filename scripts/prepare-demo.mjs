// Post-process the `demo` build into a standalone static bundle the portfolio
// can drop anywhere (any subpath) and serve without a server:
//   1. Add a 404.html = index.html fallback so deep links resolve on static
//      hosts (GitHub Pages / Netlify) that have no SPA rewrite rule.
//   2. Add a tiny redirect on the root so first-time visitors land pre-seeded
//      with demo data (?demo=1) — the app itself no-ops if data already exists.
// The demo build already uses a relative <base href="./"> and ships no service
// worker, so the folder is fully portable.
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist', 'fitflow', 'browser');
const indexPath = join(out, 'index.html');

if (!existsSync(indexPath)) {
  console.error(`Expected build output at ${indexPath} — run the demo build first.`);
  process.exit(1);
}

// 1. SPA deep-link fallback.
copyFileSync(indexPath, join(out, '404.html'));

// 2. Auto-seed demo data on first visit by injecting a one-line bootstrap that
//    sets ?demo=1 if no query is present. Non-destructive: the app skips
//    seeding when real data already exists.
let html = readFileSync(indexPath, 'utf8');
const bootstrap = `<script>if(location.search===''&&!sessionStorage.getItem('ff-demo-redirected')){sessionStorage.setItem('ff-demo-redirected','1');location.replace(location.pathname+'?demo=1');}</script>`;
if (!html.includes('ff-demo-redirected')) {
  html = html.replace('</head>', `${bootstrap}</head>`);
  writeFileSync(indexPath, html);
  // keep 404.html in sync with the injected bootstrap
  copyFileSync(indexPath, join(out, '404.html'));
}

console.log(`Static demo ready → ${out}`);
console.log('Serve that folder (e.g. `npx http-server dist/fitflow/browser`).');
