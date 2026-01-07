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

# Sample map data for a freshly set up server
Use the same trip/location/route payloads as the integration test in `src/app/__tests__/integration/map-functionality.test.ts` to seed a server with realistic map data. The workflow mirrors the test pyramid (create trip → add locations → add route points).

1. Start the app (admin or embed is fine) and note the API base URL:
   - Local dev: `http://localhost:3000`
   - Docker embed service: `http://localhost:3002`
2. Create a trip:
   ```bash
   curl -X POST "$BASE_URL/api/travel-data" \
     -H "Content-Type: application/json" \
     -d '{
       "title": "Sample Map Trip",
       "description": "Seeded from integration test data",
       "startDate": "2024-01-01T00:00:00.000Z",
       "endDate": "2024-01-31T00:00:00.000Z",
       "locations": [],
       "routes": []
     }'
   ```
   - Capture the `id` from the response; it is needed for subsequent calls.
3. Add two locations (London + Paris) using the same coordinates as the integration test:
   ```bash
   curl -X PUT "$BASE_URL/api/travel-data?id=$TRIP_ID" \
     -H "Content-Type: application/json" \
     -d '{
       "title": "Sample Map Trip",
       "description": "Seeded from integration test data",
       "startDate": "2024-01-01T00:00:00.000Z",
       "endDate": "2024-01-31T00:00:00.000Z",
       "locations": [
         {
           "id": "sample-loc-1",
           "name": "London",
           "coordinates": [51.5074, -0.1278],
           "date": "2024-01-01T00:00:00.000Z",
           "notes": "Starting point"
         },
         {
           "id": "sample-loc-2",
           "name": "Paris",
           "coordinates": [48.8566, 2.3522],
           "date": "2024-01-15T00:00:00.000Z",
           "notes": "Midpoint destination"
         }
       ],
       "routes": []
     }'
   ```
4. Add a route with route points. If you don’t want to call the external routing API, reuse the mocked route points from the integration tests (a straight line with an intermediate point is enough to render):
   ```bash
   curl -X PUT "$BASE_URL/api/travel-data?id=$TRIP_ID" \
     -H "Content-Type: application/json" \
     -d '{
       "title": "Sample Map Trip",
       "description": "Seeded from integration test data",
       "startDate": "2024-01-01T00:00:00.000Z",
       "endDate": "2024-01-31T00:00:00.000Z",
       "locations": [
         {
           "id": "sample-loc-1",
           "name": "London",
           "coordinates": [51.5074, -0.1278],
           "date": "2024-01-01T00:00:00.000Z",
           "notes": "Starting point"
         },
         {
           "id": "sample-loc-2",
           "name": "Paris",
           "coordinates": [48.8566, 2.3522],
           "date": "2024-01-15T00:00:00.000Z",
           "notes": "Midpoint destination"
         }
       ],
       "routes": [
         {
           "id": "sample-route-1",
           "from": "London",
           "to": "Paris",
           "fromCoords": [51.5074, -0.1278],
           "toCoords": [48.8566, 2.3522],
           "transportType": "train",
           "date": "2024-01-15T00:00:00.000Z",
           "duration": "2h 30min",
           "notes": "Eurostar connection",
           "routePoints": [
             [51.5074, -0.1278],
             [50.0, -1.0],
             [48.8566, 2.3522]
           ]
         }
       ]
     }'
   ```
5. Confirm the data rendered by loading the map view for the trip, or fetch it via:
   ```bash
   curl "$BASE_URL/api/travel-data?id=$TRIP_ID"
   ```

# Tests

Always run all relevant tests before finalising a PR/task.
