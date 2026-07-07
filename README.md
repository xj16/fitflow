<div align="center">

# FitFlow

**An offline-first, installable workout tracker — log lifts, track PRs, and run progressive-overload routines with zero account and zero network.**

[![CI](https://github.com/xj16/fitflow/actions/workflows/ci.yml/badge.svg)](https://github.com/xj16/fitflow/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/badge/coverage-80%25-brightgreen)](#testing)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Angular](https://img.shields.io/badge/Angular-22-dd0031)](https://angular.dev/)
[![Ionic](https://img.shields.io/badge/Ionic-8-3880ff)](https://ionicframework.com/)
[![PWA](https://img.shields.io/badge/PWA-installable-5b6cff)](#run-it-as-an-installable-pwa)

</div>

FitFlow is a hybrid [Ionic](https://ionicframework.com/) + [Angular](https://angular.dev/) app for logging strength workouts, tracking personal records, and running progressive-overload routines. It is **fully usable with no network and no account** — every byte of data lives on your device — installs as a real **PWA** for offline cold-starts, and offers **optional** two-way sync to a self-hosted [Supabase](https://supabase.com/) (or Firebase) that *you* own.

No paid services. No telemetry. No lock-in. MIT licensed.

> **Try it in 5 seconds:** run `npm ci && npm run build:demo`, serve `dist/fitflow/browser/`, and the app opens pre-loaded with 12 weeks of realistic history so every chart is populated. Or, in the running app, tap **Settings → Load demo data**.

---

## Why

Most workout apps demand an account, phone home constantly, gate features behind a subscription, and stop working the moment your gym's Wi-Fi drops. FitFlow flips that:

- **Offline-first by design.** All reads and writes hit a local store (IndexedDB in the browser / Capacitor WebView). The network is never on the critical path — and the app *shell* is service-worker cached, so it cold-starts offline too.
- **Your data is yours.** Versioned JSON export/import any time. Sync — if you turn it on — goes to *your* Supabase project, not ours, and credentials are stored (obfuscated) only on-device.
- **Runs everywhere.** One codebase → installable PWA in any browser, or a native iOS/Android app via Capacitor.
- **Genuinely free.** The whole thing works on the free tier of everything, or with nothing at all.

## Features

- **Fast set logging** — weight/reps/RPE grid with one-tap "done", warm-up flagging, and previous-set prefill so logging a working set is two taps.
- **Live estimated 1RM** — every completed set shows its Epley one-rep-max estimate as you type; the Brzycki formula is also available in the math layer.
- **Animated rest timer** — a floating SVG progress-ring countdown that starts automatically when you complete a working set, survives navigation, adds/subtracts time, and buzzes + beeps when you're ready for the next set.
- **Editable session date & duration** — back-date or fix a logged session; tracked duration shows on the workout header.
- **Personal records** — max weight, best estimated 1RM, and top single-set volume computed automatically per exercise from your history.
- **Progressive-overload routines** — build multi-day templates with target sets/reps and a per-session increment; starting a day pre-fills each set with the **next linear-progression weight**.
- **Interactive analytics** — dependency-free SVG charts (weekly volume bars, per-exercise 1RM line) with keyframe draw-in animation and hover/tap tooltips.
- **Installable PWA** — home-screen install, maskable icons, app shortcuts, and a service-worker-cached shell for true offline cold-start.
- **Optional cloud sync** — last-write-wins two-way sync to Supabase (primary) or Firebase (alternative). **Incremental delta** pulls after the first sync, background **auto-sync** on change / reconnect / app-resume, and soft-delete tombstones that propagate across devices.
- **Versioned JSON backup** — one-tap export *and* a validated, merge-based import (never a blind overwrite).
- **Dark mode** — follows your OS preference automatically.
- **Demo mode** — `?demo=1` or a Settings button seeds 12 weeks of realistic data.

## Screens

| Tab | What it does |
| --- | --- |
| **Log** | Reverse-chronological workout history with quick per-session stats; the + button starts a new session. |
| **Routines** | Saved progressive-overload templates; start a day to launch a pre-filled workout. |
| **Stats** | Personal records, weekly volume bars, and a per-exercise 1RM progression line with tooltips. |
| **Settings** | Storage status, data counts, demo seeding, versioned export/import, and optional sync configuration. |

## Architecture

FitFlow is a **local-first** app: a single `DataService` holds every collection in Angular signals and mirrors each mutation to a swappable `KvStore` (IndexedDB in browsers/WebView, in-memory fallback in tests). The UI reads synchronously off the signals, so it works with no network on the critical path.

Sync is a thin, optional layer bolted on top:

```
 UI (signals)                      SyncService (orchestrator)
     │  mutate                          │
     ▼                                  ▼
 DataService ──persist──► KvStore   pull(since) ─► SyncBackend (Supabase | Firebase)
     │                        ▲          │            server-side updated_at > since
     └── notifyLocalChange ───┘   mergeCollections()  (delta pull)
         (debounced auto-sync)   last-write-wins by updatedAt
                                        │
                                  push(changed) ─► SyncBackend
```

Every record carries a client-generated UUID and an `updatedAt` timestamp. On sync FitFlow pulls the remote **delta** for each collection (only rows changed since a stored high-water mark), performs a deterministic **last-write-wins** three-way merge (`src/app/core/sync/merge.ts`), pushes back only the records whose local copy actually changed, and persists the reconciled set. Deletes are soft-delete tombstones, so a deletion on one device removes the record everywhere. The merge is idempotent, so a retried sync always converges.

## Tech stack

| Area | Choice |
| --- | --- |
| Framework | Angular 22 (standalone components, signals, new control flow) |
| UI kit | Ionic 8 (`@ionic/angular/standalone`) |
| Language | TypeScript (strict mode, strict templates) |
| PWA | `@angular/service-worker` + `ngsw-config.json` + web app manifest |
| Native shell | Capacitor 8 (Android / iOS) |
| Offline storage | IndexedDB via a swappable `KvStore` interface (SQLite-ready) |
| Optional sync | Supabase (`@supabase/supabase-js`) — Firebase REST alternative |
| Charts | Hand-rolled dependency-free SVG (no Chart.js / d3) |
| Tests | Jasmine + Karma (headless Chrome), coverage-gated |
| CI | GitHub Actions (build + coverage on Node 22 & 24) |

## Getting started

Requirements: **Node 22+** and **npm 10+**.

```bash
git clone https://github.com/xj16/fitflow.git
cd fitflow
npm ci

# Run the dev server (http://localhost:4200)
npm start

# Production build (with service worker) → dist/fitflow/browser
npm run build:prod

# Unit tests (headless Chrome)
npm test

# Tests + coverage gate + badge
npm run test:coverage
```

Open the dev server, tap **+**, and log a set. Data persists in your browser with zero configuration. Don't want to log anything first? **Settings → Load demo data** fills it in.

### Live static demo

```bash
npm run build:demo          # relative base href, SPA 404 fallback, ?demo=1 auto-seed
npx http-server dist/fitflow/browser   # or any static host
```

`dist/fitflow/browser/` is a fully standalone bundle you can drop on GitHub Pages, Netlify, or any static host — it opens pre-populated with demo data.

## Run it as an installable PWA

A production build ships a web app manifest, maskable 192/512 icons, and a service worker (`ngsw-config.json`) that prefetches the app shell. Serve `dist/fitflow/browser/` over HTTPS (or `localhost`) and the browser will offer **Install** — the app then launches standalone and cold-starts offline. Registration is deferred until the app is stable and disabled in dev so live-reload keeps working.

## Running as a native app

FitFlow ships with a Capacitor config. After a production build:

```bash
npm run build:prod
npx cap add android      # and/or: npx cap add ios
npx cap sync
npx cap open android     # opens Android Studio / Xcode
```

The offline store uses IndexedDB inside the Capacitor WebView, which persists across app launches with no server. Because storage sits behind the `KvStore` interface (`src/app/core/storage/kv-store.ts`), a native SQLite backend (`@capacitor-community/sqlite`) can be dropped in without touching any UI or repository code.

## Optional cloud sync

Sync is strictly opt-in and points at a backend **you** own. Credentials are stored (obfuscated) only on-device.

### Supabase (primary)

1. Create a free project at [supabase.com](https://supabase.com/) or run [self-hosted Supabase](https://supabase.com/docs/guides/self-hosting).
2. Open the SQL editor and run [`supabase/schema.sql`](supabase/schema.sql). It creates three tables with `updated_at` indexes (used by delta sync) and row-level-security policies — including a copy-paste **multi-user** (`auth.uid()`) variant for shared deployments.
3. In FitFlow → **Settings → Cloud sync**, choose **Supabase**, paste your project **URL** and **anon public key**, toggle **Auto-sync**, then **Save & sync**.

### Firebase (alternative)

Choose **Firebase** in Settings and paste your Realtime Database URL. FitFlow writes to `/<collection>/<id>` over the REST API — no extra SDK, works on the free Spark plan. Only one backend is ever active at a time.

## Project structure

```
src/app/
├── core/
│   ├── models/          # Workout, Exercise, Routine, PersonalRecord types
│   ├── storage/         # KvStore interface + IndexedDB / in-memory backends
│   ├── services/        # DataService (source of truth), RestTimerService
│   ├── sync/            # merge engine, Supabase & Firebase adapters, SyncService, secret
│   ├── data/            # seed exercise library + deterministic demo generator
│   └── utils/           # training math (1RM, volume, PRs), analytics, ids
├── components/          # rest timer, exercise picker, routine builder, mini-chart
└── pages/               # history (Log), workout, routines, stats, settings, tabs
```

## Testing

**90 unit tests** cover the load-bearing logic and the whole data path:

- **`training-math.spec.ts`** — Epley/Brzycki 1RM, volume, PR computation, linear-progression rules, unit conversion, plate rounding.
- **`merge.spec.ts`** — last-write-wins reconciliation, tombstones, idempotency.
- **`sync.service.spec.ts`** — the sync engine against a fake backend: pull→merge→push→persist, unconfigured/offline/error branches, delta cursors, idempotency, pending-changes, credential obfuscation.
- **`supabase.backend.spec.ts` / `firebase.backend.spec.ts`** — row-shape mapping, the `updated_at` delta query, and error propagation (mocked client/`fetch`).
- **`analytics.spec.ts`** — weekly-volume bucketing, per-exercise 1RM series, session counting.
- **`mini-chart.component.spec.ts`** — SVG geometry (coords, polyline, area, bars) and tooltip activation.
- **`data.service.spec.ts`** — CRUD, seeding, soft-delete, offline persistence, demo seeding, versioned export, merge-based import.
- **`demo-data.spec.ts`** — deterministic, progressive, no-future-date demo history.
- **`secret.spec.ts`** — credential obfuscation round-trip.
- **`rest-timer.spec.ts`** — countdown accuracy, progress, adjust/stop, formatting (with a mocked clock).

```bash
npm test            # local headless Chrome
npm run test:ci     # CI (Chrome with --no-sandbox)
npm run test:coverage  # runs coverage, enforces a floor, writes coverage/badge.svg
```

## License

MIT © 2026 xj16 — see [LICENSE](LICENSE).
