# Changelog

All notable changes to FitFlow are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] — 2026-07-07

The "make the pitch true" release: FitFlow is now an actually-installable PWA,
sync runs in the background, and there's a one-tap populated demo. No breaking
changes to stored data.

### Added

- **Installable PWA.** Added `@angular/service-worker` with an `ngsw-config.json`
  that prefetches the app shell (and lazy-caches fonts/icons), a linked
  `manifest.webmanifest` with 192/512 `any` **and** `maskable` PNG icons, Apple
  touch-icon meta, and app shortcuts. The service worker is registered in
  `main.ts` (production only, deferred until app-stable). FitFlow now installs to
  the home screen and cold-starts fully offline — closing the biggest
  pitch-vs-reality gap.
- **One-tap demo mode.** A "Load demo data" button in Settings and a `?demo=1`
  deep link seed ~12 weeks of deterministic progressive-overload history, so the
  Stats tab, PR cards, weekly-volume bars and per-exercise 1RM line render fully
  populated. Non-destructive — it never overwrites real history.
- **Working two-way auto-sync.** The previously-dead `autoSync` config is now
  consumed: a debounced post-mutation trigger, a `window` `online` listener, and
  a document-visibility (app-resume) listener each fire `syncNow()` when
  auto-sync is on. A **pending-changes** count is surfaced in Settings.
- **Incremental (delta) sync.** `SyncBackend.pull(collection, since?)` now does a
  server-side `updated_at > since` query (Supabase `.gt(...)`, Firebase
  `orderBy`/`startAfter`) using the indexes `schema.sql` already builds, with a
  persisted per-collection high-water mark. Stops re-downloading the entire
  history every sync.
- **JSON import + versioned export.** Exports are now stamped with a
  `schemaVersion` and an `app` tag; a new import flow validates the file and
  **merges** it via the last-write-wins engine (never a blind overwrite). A
  storage-migration hook in `DataService.init()` lets the format evolve safely.
- **Editable session date & duration.** The workout screen can now back-date or
  fix a session's date/time, and shows the tracked `durationSec` on the header.
- **Interactive charts.** The dependency-free SVG mini-chart gained hover/tap
  tooltips (value + date), an active-point guide line and marker, on top of the
  existing keyframe draw-in animations.
- **Multi-user RLS recipe.** `supabase/schema.sql` now documents a copy-paste
  `user_id = auth.uid()` row-level-security variant for multi-device
  deployments.
- **Tests & coverage.** Added flagship specs for the sync engine (fake backend:
  pull→merge→push→persist, offline/error branches, delta cursors, idempotency),
  the Supabase & Firebase adapters (mocked client/fetch), analytics
  (weekly-volume bucketing, 1RM series), the mini-chart geometry, the demo
  generator, credential obfuscation, and import/export — 35 → 90 tests. Added a
  coverage gate (`npm run test:coverage`) and a generated coverage badge.
- **CI:** a coverage-gated test step and a job that builds and uploads the
  standalone static demo bundle.

### Changed

- Supabase anon key and Firebase config values are now **obfuscated at rest** in
  the local store instead of sitting as clear text; Settings notes that
  credentials live on-device.
- README overhauled: badge row, honest feature/architecture sections, corrected
  Node matrix (22 & 24), PWA + demo + import quickstart.

### Fixed

- **Delta-sync double-push bug** (found by the new tests): with an incremental
  pull, already-synced records looked "local-only" to the merge and were
  re-pushed every sync. Push is now restricted to records changed since the
  cursor, so a repeated sync pushes nothing new.
- Saving new sync credentials now resets the delta cursors, forcing a correct
  full re-pull against the new backend.

## [1.0.0] — 2026-07-07

Initial release: offline-first Ionic + Angular workout tracker with fast set
logging, live estimated 1RM, an animated rest timer, progressive-overload
routines, dependency-free SVG analytics, a 30-lift seed library, JSON export,
and optional last-write-wins Supabase/Firebase sync.

[1.1.0]: https://github.com/xj16/fitflow/releases/tag/v1.1.0
[1.0.0]: https://github.com/xj16/fitflow/releases/tag/v1.0.0
