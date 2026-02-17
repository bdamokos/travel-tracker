# Travel Tracker – Agents Guide

## Project Snapshot
- Next.js 15 + React 19 + TypeScript + Tailwind CSS 4
- Maps via Leaflet/react-leaflet; data fetching with SWR; charts via Recharts
- Private cost tracker with YNAB import, backup management
- Primary UI modes: admin (editing) and public map views
- License: MIT (2025-2026, Bence Damokos)

## Stack
- Package manager: Bun (bun.lock, Docker uses oven/bun)
- Tests: Jest (unit: jsdom, integration: node)
- Linting: ESLint + TypeScript strict mode
- Path alias: `@/` points to `src/`

## Commands

### Development
- Install: `bun install`
- Dev server: `bun run dev` (port 3000; set NEXT_PUBLIC_APP_MODE=admin or embed for role-specific UIs)
- Build: `bun run build`
- Start production: `bun run start`

### Quality Checks
- Lint: `bun run lint`
- Run all tests: `bun run test`
- Unit tests: `bun run test:unit`
- Integration tests: `JEST_INTEGRATION_TESTS=true bun run test:integration`
- Run tests in watch mode: `bun run test:watch`
- Coverage: `bun run test:coverage`
- Accessibility tests: `bun run test:accessibility`

### Running Single Tests
- Unit: `bun run test:unit -- path/to/test.test.ts`
- Integration: `JEST_INTEGRATION_TESTS=true bun run test:integration -- path/to/test.integration.test.ts`
- By test name: `bun run test:unit -- --testNamePattern="test name"`

## Test Data Setup
For seeding a fresh server with sample map data (trips, locations, routes, cost tracking), see `TEST-DATA-SETUP.md`.

## Code Style Guidelines

### Imports
- Use `@/` alias for src imports: `import { Component } from '@/app/components/Component'`
- Group imports: React/external libraries first, then internal, then types
- Client components: `'use client'` directive at file top

### Types
- Strict TypeScript enabled (noImplicitAny, noImplicitReturns, strictNullChecks)
- Define types in `src/app/types/index.ts` (all core data models)
- Use `type` for object shapes, `interface` for extensible contracts
- Explicit return types on exported functions
- Avoid `any` - use `unknown` with type guards when necessary

### Naming Conventions
- Components: PascalCase (e.g., `LocationManager`, `RouteForm`)
- Functions/variables: camelCase (e.g., `getLocationById`, `tripData`)
- Constants: SCREAMING_SNAKE_CASE for true constants, lowercase for config
- Test files: `*.test.ts` or `*.test.tsx` (unit), `*.integration.test.ts` (integration)
- Interfaces: PascalCase with `I` prefix discouraged (use bare interface names)

### Formatting
- Use functional components with hooks (useState, useEffect, etc.)
- Destructure props in function signature
- Keep comments minimal; prefer self-documenting code
- Use template literals for string interpolation
- Arrow functions for callbacks, regular functions for methods

### Error Handling
- API routes: try/catch blocks with NextResponse.json({ error }, { status })
- Use proper HTTP status codes (400 for bad input, 500 for server errors)
- Log errors with context (avoid logging sensitive data)
- Provide user-friendly error messages in UI, technical details in console

### React Patterns
- Props interfaces defined above component
- Use React.Dispatch<React.SetStateAction<T>> for setState types
- Prefer controlled components for forms
- Use `const [value, setValue] = useState<T>(defaultValue)` for typed state

### Testing
- Unit tests: test pure functions, components with jest-axe for a11y
- Integration tests: test API endpoints, data flow, full user journeys
- Use test pyramids: integration tests build on each other (create → update → verify)
- Mock external APIs (routing, YNAB) in tests
- Set environment variable TEST_DATA_DIR to avoid writing to real data during tests

### Data Handling
- Use src/app/lib/dataDirectory.ts for data directory resolution
- Data stored in `data/` directory (JSON files and backups)
- Treat data directory contents as real user data
- Use getDataDir() for data paths to support test environment overrides

### Accessibility (Critical)
- All components must meet WCAG AA level (AAA ideal)
- Use React Aria (@react-aria/*) for accessible component primitives
- Include aria-label, aria-labelledby, aria-describedby appropriately
- Test with jest-axe in unit tests
- Keyboard navigation must work for all interactive elements
- No color-only indicators for information

## Before Finalizing
- Ensure build passes: `bun run build`
- Run linter: `bun run lint`
- Run relevant tests: unit + integration for affected features
- Verify accessibility: `bun run test:accessibility` or manual testing

## Git Workflow
- Remote awareness: github is push target, origin is forgejo
- Feature branches: use `deploy/start-worktree.sh` to create worktrees
- Worktrees created in `.worktrees/` folder - manually cd into them
- Commit only after tests pass and linting is clean

## Deployment
- Multi-stage Dockerfile with Bun runtime
- Standalone Next.js output served on port 3000
- docker-compose.yml: admin UI on 3001, embed maps on 3002
- Both services mount shared `travel-data` volume
- Production configs in `deploy/` directory

## Code Organization
- Pages: `src/app/` with Next.js App Router
- Components: `src/app/components/` and `src/app/admin/components/`
- Utilities: `src/app/lib/` for shared functions
- Tests: `src/app/__tests__/` with `unit/`, `integration/`, and `accessibility/` subdirectories
- Types: All core types in `src/app/types/index.ts`
- API Routes: `src/app/api/` following Next.js route conventions

## Important Patterns
- Data isolation: Tests use `TEST_DATA_DIR` env var to avoid modifying real data
- Mock external services: Routing and YNAB APIs are mocked in integration tests
- Test pyramids: Integration tests build incrementally (create → read → update → delete)
- Accessibility-first: Use React Aria primitives instead of raw HTML elements
- Type safety: All functions have explicit return types, no implicit any

## Philosophy
"Go to the Moon not because it is easy, but because it is hard" - do not compromise on testing or correctness even when difficult. Test thoroughly, write maintainable code, prioritize accessibility.

## New learnings
As you go, document new learnings, discoveries, important structural decisions in this AGENTS.md file.

- Added `distanceOverride` on travel route segments to support manual distance overrides in admin route editors and distance summaries.
- Date handling in admin trip/cost editors should use browser-local calendar-day semantics. Prefer helpers in `src/app/lib/localDateUtils.ts` (`parseDateAsLocalDay`, `formatLocalDateInput`, `getTodayLocalDay`, `getLocalDateSortValue`) over raw `new Date('YYYY-MM-DD')` and `toISOString().split('T')[0]` in editor flows.
- Running Jest in this repo may hit haste map collisions from `.worktrees/` and `.next/standalone`; when running targeted suites locally, pass `--modulePathIgnorePatterns="<rootDir>/.worktrees"` and `--modulePathIgnorePatterns="<rootDir>/.next"` if needed.
- Location duration calculations in admin editors should use controlled date-picker state and `calculateDurationInDays` from `src/app/lib/durationUtils.ts`; relying on stale form state or fallback-to-today logic can show incorrect day counts while nights remain correct.
- Trip autosave now supports `PATCH /api/travel-data?id=...` with a `deltaUpdate` payload (added/updated/removed-by-id + optional order per collection); server-side merge is defensive and never treats omitted fields as deletions, and clients should fallback to full `PUT` when delta save fails.
- Cost tracker autosave now supports `PATCH /api/cost-tracking?id=...` with `deltaUpdate`; backend reconstructs current cost state first and applies only explicit add/update/remove operations, so partial/dirty deltas cannot implicitly wipe budgets/expenses.
- Delta helper cloning must preserve `Date` instances (prefer `structuredClone` or JSON parse with `dateReviver` fallback); plain `JSON.parse(JSON.stringify(...))` breaks runtime date types in autosave snapshots and merge flows.
- Keep PATCH body parsing consistent between travel and cost endpoints: both should deserialize with `dateReviver` so delta merge/type semantics for date fields stay aligned across autosave APIs.
- Public embeddable map now merges repeated visits by normalized location name + coordinates, shows a count badge on the pin for repeat visits, and renders popup visit history grouped under one marker.
- Shared map-facing trip types now live in `src/app/types/index.ts` as `MapTravelData`/`MapTravelLocation`; avoid duplicating ad-hoc `TravelData` interfaces across map page, embed page, and embeddable map component.
- `createCountMarkerIcon` now supports an optional `highlighted` flag so merged multi-visit markers can preserve the closest-location visual highlight cue.
- Added a lightweight `public/sw.js` service worker + `ServiceWorkerRegistration` client component to cache app shell, Next static assets, OSM tiles, and key travel/cost API responses with stale-while-revalidate for offline-first behavior and automatic update checks on reconnect.
- Service worker caching should respect server cache intent (`Cache-Control: no-store`) and return explicit offline 503 responses when no cached entry exists, instead of throwing fetch-handler errors.
- Shared collection-delta logic now lives in `src/app/lib/collectionDelta.ts`; both travel and cost delta modules should import it to avoid divergence in add/update/remove/order semantics.
- Delta shape validators should enforce scalar field types (e.g., number/string/date-like) in addition to collection structure to reject malformed PATCH payloads early.
- Service worker updates now use `travel-tracker-service-worker-update-available` and `travel-tracker-service-worker-apply-update` window events, and defer activation/reload while `window.__TRAVEL_TRACKER_IS_DIRTY__` is truthy to avoid interrupting unsaved edits.
- Autosave flows must treat queued offline deltas as `queued` (not persisted): do not advance `lastSaved*Ref` until server confirmation, and guard repeated offline retries with `hasPendingOfflineDeltaFor*Id` checks.
- `syncOfflineDeltaQueue` may be called concurrently (service worker startup + editor hooks); concurrent callers must subscribe callbacks instead of dropping later `onConflict`/`onSynced`/`onError` handlers.
- Offline queue parsing must validate persisted metadata (`queuedAt`, `updatedAt`, optional `conflictDetectedAt`) and kind-specific delta schema, then discard malformed entries during read to prevent reconnect-time sync crash loops.
- Offline delta queue writes should monitor projected localStorage usage (fallback 5 MiB budget plus `navigator.storage.estimate()` when available) and emit warning/critical logs before quota exhaustion; quota exceptions should be logged explicitly with queue payload size metadata.
- Data API caching in `public/sw.js` should be freshness-first (`networkFirst`) and must invalidate `DATA_CACHE` on non-GET writes to `/api/travel-data*` and `/api/cost-tracking*` so post-save reloads cannot regress to stale snapshots.
- Offline editing now uses a local queued-delta model (`src/app/lib/offlineDeltaSync.ts`): autosave can queue travel/cost deltas when offline, sync retries on reconnect, server-base divergence is treated as a conflict (not auto-merged), and queue state is surfaced via a global banner (`OfflineDeltaBanner`) plus conflict popups.
- Integration test global setup (`jest.integration.setup.js`) starts `next dev`; Next may auto-rewrite `tsconfig.json` (for example forcing `compilerOptions.jsx` to `preserve`) via TypeScript setup verification, so test runs can dirty `tsconfig.json` if it diverges from Next-required defaults.
- `TravelItemSelector` supports an optional quick-link action (`showMostLikelyQuickLink`) that auto-selects the nearest dated travel item (preferring locations on tied day distance), while retaining manual dropdown selection for overrides.
- Nearest-day ranking in `TravelItemSelector` quick-link logic depends on `MS_PER_DAY`; keep this constant defined in the component when refactoring date distance calculations.
- `TravelItemSelector` route labels should resolve dates from `route.date`/`segment.date` first and only fallback to legacy `departureTime`; transport labels should prefer `transportType` with legacy `type` fallback for migrated trips.
- Service worker navigation/cache writes should ignore redirect responses; caching redirected documents can cause Safari offline loads to fail with "Response served by service worker has redirections".
- When service worker cache-safety rules change (for example excluding redirect responses), bump `CACHE_VERSION` in `public/sw.js` to evict previously stored incompatible entries.
- Service worker `activate` should defensively purge redirect responses from all active caches so legacy or manually inserted redirect entries cannot trigger Safari offline navigation errors.
- Critical app-shell precache entries (notably `'/'`) may still resolve through server redirects; pre-cache should follow same-origin `Location` hops manually and cache the final non-redirect response under the original key so install does not fail.
- `createCountMarkerIcon` now supports `badgeVariant` (`cluster`/`visit`) so repeat-visit count badges can stay visually distinct from cluster/spiderfy count badges while preserving counts during group expand/collapse transitions.
- In `EmbeddableMap`, use shared group-item icon selection for both normal and expanded (spiderfied) states so multi-visit locations keep their `visit` badge when groups are expanded/collapsed.
- For CSS lint compatibility, prefer modern color notation (e.g., `rgb(15 23 42 / 35%)`) over legacy `rgba(...)` in new marker styling rules.
- Marker badge colors and visit shadow are now defined as `:root` CSS variables in `globals.css`; new badge styling should use those variables instead of hardcoded literals.
- In Codex/CI-like environments, Turbopack may fail `next/font/google` fetches with TLS errors; set `experimental.turbopackUseSystemTlsCerts = true` in `next.config.js` to use system certs during build.
- Avoid top-level imports of Node-only modules in `instrumentation.ts`; use runtime-gated dynamic imports inside `register()` so Edge compilation doesn't traverse Node-only dependency graphs.
- Train/metro auto-routing now attempts OSM rail-network pathfinding via `src/app/lib/railRouting.ts` (Overpass rail graph + shortest-path) before OSRM road fallback; endpoints are configurable via `NEXT_PUBLIC_RAIL_OVERPASS_ENDPOINTS`/`RAIL_OVERPASS_ENDPOINTS` (comma-separated, CORS-capable endpoint first for client usage).
- In service worker install flows, `fetch(url, { redirect: 'manual' })` can return `opaqueredirect` for same-origin navigational redirects (like `'/' -> '/admin'`) without a readable `Location` header; pre-cache resolution must fallback to a same-origin followed fetch and cache a cloned non-redirect response, or registration may resolve then turn `redundant` with no active controller.
- Open-Meteo calls in `weatherService` now serialize through a shared in-process queue and honor `429` backoff hints from `Retry-After` plus `RateLimit-Reset`/`X-RateLimit-Reset` (with exponential fallback) to reduce repeated throttle failures under concurrent weather fetches.
- For strict TypeScript builds, async queue resolver callbacks should use a non-null gate object (`{ promise, release }`) instead of nullable closure vars to avoid `never` callable errors in `finally` blocks.
- Embeddable map transport legend clarity now depends on both `transportationConfig` styling (`color`, `dashArray`, `weight`, `opacity`) and `TRANSPORT_LEGEND_ORDER` in `src/app/map/[id]/components/EmbeddableMap.tsx`; update both when introducing new transport types.
- When route payloads contain both legacy (`type`, `fromCoordinates`, `toCoordinates`) and modern (`transportType`, `fromCoords`, `toCoords`) fields, map/shadow transforms should prefer modern fields first so inline edits immediately affect rendered styling/geometry.
- Cached `historical-average` entries for near-future dates should not force immediate re-fetch on every restart: refresh eligibility now uses a time-based staleness window (~6h) and expiry checks, and fallback near-future entries should use forecast-style TTL (`expirationForDate`) rather than immediate expiry timestamps.
- Startup preloading in `mapDataPreloader` remains the hot-path for location enrichment: it should continue calling both `wikipediaService.getLocationData` and `weatherService.getWeatherForLocation`, dedupe Wikipedia by location identity (name+coords), and dedupe weather by location stay key (coords+date range).
- Service worker fetch strategies in `public/sw.js` must treat Cache Storage access as best-effort (open/put/delete can fail in restricted browser contexts); fall back to network/offline responses instead of letting cache exceptions bubble into client-side `TypeError: Load failed`.
- `mapDataPreloader` should call `weatherService.getWeatherForLocation(..., { preferCache: true })` during startup warming so existing cached weather stays hot without triggering immediate upstream refresh churn on every server restart.
- Server-rendered map views (`/map/[id]` and `/embed/[id]`) should normalize map payloads through `normalizeMapTravelData` so route segments consistently prefer `transportType`/`fromCoords`/`toCoords` over legacy `type`/`fromCoordinates`/`toCoordinates` before styling.
- Public map marker enrichment currently requests `/api/weather/date` eagerly for each rendered marker, while `weatherService` serializes upstream Open-Meteo calls through a process-wide `rateLimitQueue` (`RATE_LIMIT_MS = 1000`); large marker fan-out and startup preloading contention can queue requests long enough to hit Cloudflare 524 origin timeouts.
- `weatherService.getWeatherForDate` now routes through `getWeatherForLocation` for single-day ranges first, so `/api/weather/date` reuses the same file-cache/prewarm path before attempting direct upstream fallback.
- Startup weather preloading now warms both stay-range summaries (`getWeatherForLocation`) and a deduped “today by coordinates” single-day set (`getWeatherForDate`) so popup weather requests can hit warm cache.
- `EmbeddableMap` debug mode is query-driven (`/map/[id]?debug=1`): route logs should include parent and leaf-segment point counts, and clicking a rendered segment should open a popup with parent route id/type, segment id/type, point source, and point count.
