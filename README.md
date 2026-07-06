# FitFlow

**Offline-first workout tracker that runs everywhere.**

FitFlow is a hybrid [Ionic](https://ionicframework.com/) + [Angular](https://angular.dev/) app for logging strength workouts, tracking personal records, and running progressive-overload routines. It is **fully usable with no network and no account** — every byte of data lives on your device — with **optional** two-way sync to a self-hosted [Supabase](https://supabase.com/) (or Firebase) that you own and control.

No paid services. No telemetry. No lock-in. MIT licensed.

---

## Why

Most workout apps demand an account, phone home constantly, gate features behind a subscription, and stop working the moment your gym's Wi-Fi drops. FitFlow flips that:

- **Offline-first by design.** All reads and writes hit a local store (IndexedDB in the browser / Capacitor WebView). The network is never on the critical path.
- **Your data is yours.** Export to JSON any time. Sync — if you turn it on — goes to *your* Supabase project, not ours.
- **Runs everywhere.** One codebase → PWA in any browser, or a native iOS/Android app via Capacitor.
- **Genuinely free.** The whole thing works on the free tier of everything, or with nothing at all.

## Features

- **Fast set logging** — weight/reps/RPE grid with one-tap "done", warm-up flagging, and previous-set prefill so logging a working set is two taps.
- **Live estimated 1RM** — every completed set shows its Epley one-rep-max estimate as you type; the classic Brzycki formula is also available in the math layer.
- **Animated rest timer** — a floating SVG progress-ring countdown that starts automatically when you complete a working set, survives navigation, adds/subtracts time, and buzzes + beeps when you're ready for the next set.
- **Personal records** — max weight, best estimated 1RM, and top single-set volume are computed automatically per exercise from your history.
- **Progressive-overload routines** — build multi-day templates with target sets/reps and a per-session increment. Starting a routine day pre-fills each set with the **next linear-progression weight**, computed from the last time you hit that lift.
- **Analytics** — dependency-free SVG charts for weekly training volume and per-exercise 1RM progression.
- **Exercise library** — 30 common lifts seeded on first run, plus inline creation of your own with muscle-group and equipment tagging, searchable and filterable.
- **Optional cloud sync** — last-write-wins two-way sync to Supabase (primary) or Firebase (alternative adapter, one active at a time). Soft-delete tombstones propagate correctly across devices.
- **JSON export** — one-tap full backup of everything.
- **Dark mode** — follows your OS preference automatically.

## Screens

| Tab | What it does |
| --- | --- |
| **Log** | Reverse-chronological workout history with quick per-session stats; the + button starts a new session. |
| **Routines** | Saved progressive-overload templates; start a day to launch a pre-filled workout. |
| **Stats** | Personal records, weekly volume bars, and a per-exercise 1RM progression line. |
| **Settings** | Storage status, data counts, JSON export, and optional sync configuration. |

## Tech stack

| Area | Choice |
| --- | --- |
| Framework | Angular 22 (standalone components, signals, new control flow) |
| UI kit | Ionic 8 (`@ionic/angular/standalone`) |
| Language | TypeScript 6 (strict mode, strict templates) |
| Styling | Sass / SCSS with CSS custom-property theming |
| Native shell | Capacitor 8 (Android / iOS) |
| Offline storage | IndexedDB via a swappable `KvStore` interface (SQLite-ready) |
| Optional sync | Supabase (`@supabase/supabase-js`) — Firebase REST alternative |
| Charts | Hand-rolled dependency-free SVG (no Chart.js / d3) |
| Tests | Jasmine + Karma (headless Chrome) |
| CI | GitHub Actions (build + test on Node 20 & 22) |

## Getting started

Requirements: **Node 20+** and **npm 10+**.

```bash
git clone https://github.com/xj16/fitflow.git
cd fitflow
npm install

# Run the dev server (http://localhost:4200)
npm start

# Production build → dist/fitflow
npm run build:prod

# Unit tests (headless Chrome)
npm test
```

That's it — open the dev server, tap **+**, and log a set. Data persists in your browser with zero configuration.

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

Sync is strictly opt-in and points at a backend **you** own.

### Supabase (primary)

1. Create a free project at [supabase.com](https://supabase.com/) or run [self-hosted Supabase](https://supabase.com/docs/guides/self-hosting).
2. Open the SQL editor and run [`supabase/schema.sql`](supabase/schema.sql). It creates three tables (`workouts`, `exercises`, `routines`) with row-level-security policies.
3. In FitFlow → **Settings → Cloud sync**, choose **Supabase**, paste your project **URL** and **anon public key**, then **Save & sync**.

Your anon key is stored only in the local offline store and is used only to talk to your project. Nothing is bundled with the app.

### Firebase (alternative)

Choose **Firebase** in Settings and paste your Realtime Database URL. FitFlow writes to `/<collection>/<id>` over the REST API — no extra SDK, works on the free Spark plan. Only one backend is ever active at a time.

### How sync works

Every record carries a client-generated UUID and an `updatedAt` timestamp. On sync, FitFlow pulls the remote copy of each collection, performs a **last-write-wins** three-way merge (`src/app/core/sync/merge.ts`), pushes back the records whose local copy won, and persists the reconciled set. Deletes are soft-delete tombstones, so a deletion on one device correctly removes the record everywhere. The merge is deterministic and idempotent, so a retried sync always converges.

## Project structure

```
src/app/
├── core/
│   ├── models/          # Workout, Exercise, Routine, PersonalRecord types
│   ├── storage/         # KvStore interface + IndexedDB / in-memory backends
│   ├── services/        # DataService (source of truth), RestTimerService
│   ├── sync/            # merge engine, Supabase & Firebase adapters, SyncService
│   ├── data/            # seed exercise library
│   └── utils/           # training math (1RM, volume, PRs), analytics, ids
├── components/          # rest timer, exercise picker, routine builder, mini-chart
└── pages/               # history (Log), workout, routines, stats, settings, tabs
```

## Testing

35 unit tests cover the load-bearing logic:

- **`training-math.spec.ts`** — Epley/Brzycki 1RM, volume, PR computation, linear-progression rules, unit conversion, plate rounding.
- **`merge.spec.ts`** — last-write-wins reconciliation, tombstones, idempotency.
- **`data.service.spec.ts`** — CRUD, seeding, soft-delete, offline persistence (against an in-memory store).
- **`rest-timer.spec.ts`** — countdown accuracy, progress, adjust/stop, formatting (with a mocked clock).

```bash
npm test        # local headless Chrome
npm run test:ci # CI (Chrome with --no-sandbox)
```

## License

MIT © 2026 xj16 — see [LICENSE](LICENSE).
