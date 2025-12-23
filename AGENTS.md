# Travel Tracker – Agents Guide

## Project Snapshot
- Next.js + TypeScript web app that visualizes trips on OpenStreetMap, pairs timelines with notes/Instagram/blog posts, and includes a private cost tracker with YNAB import and backup management.
- Primary UI modes: admin experience for editing journeys/costs and public map views.
- License: MIT (2025, Bence Damokos).

## Stack
- Next.js 15 + React 19, TypeScript, Tailwind CSS 4.
- Mapping via Leaflet/react-leaflet; data fetching with SWR; charts via Recharts.
- Bun is the package manager/runtime (`bun.lock`, Docker uses `oven/bun`).
- Jest for unit/integration tests (`@/` alias points to `src/`), ESLint + TypeScript config in repo.

## Before finalising a PR
- Ensure the app builds with `bun run build`

## Runbook (local)
- Install: `bun install`.
- Dev: `bun run dev` (defaults to port 3000; set `NEXT_PUBLIC_APP_MODE=admin` or `embed` for role-specific UIs).
- Quality: `bun run lint`, `bun run test:unit`, `JEST_INTEGRATION_TESTS=true bun run test:integration` (or `./run-integration-tests.sh` when a dev server is up on port 3002).
- Build/serve: `bun run build` then `bun run start`.

## Data & Storage
- App persists JSON data/backups under `data/`; Docker and compose mount this directory (`travel-data` volume) to keep journeys/costs across runs. Treat contents as real user data.
- Public assets/screenshots live in `public/`; Next image config allows OSM tiles.

## Deployment Notes
- Multi-stage Dockerfile installs/builds with Bun and runs the Next standalone output on port 3000 via `bun server.js`.
- `docker-compose.yml` defines two services: admin UI on host port 3001 and embeddable/public maps on 3002 (both mount the shared `travel-data` volume and set `NEXT_PUBLIC_APP_MODE`).
- For production setup references, see the `deploy/` directory. 

# Tests

Always run all relevant tests before finalising a PR/task.