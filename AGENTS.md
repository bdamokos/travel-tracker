# Travel Tracker – Agents Guide

## Project Snapshot
- Next.js + TypeScript web app that visualizes trips on OpenStreetMap, pairs timelines with notes/Instagram/blog posts, and includes a private cost tracker with YNAB import and backup management.
- Primary UI modes: admin experience for editing journeys/costs and public map views.
- License: MIT (2025-2026, Bence Damokos).

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
- Use `deploy/start-worktree.sh` to create a new worktree; it copies `deploy/.env` into the worktree if available.

# Sample map data for a freshly set up server
Use the same trip/location/route payloads as the integration test in `src/app/__tests__/integration/map-functionality.test.ts` to seed a server with realistic map data. The workflow mirrors the test pyramid (create trip → add locations → add route points).

1. Start the app (admin or embed is fine) and export the variables used below:
   - Local dev: `http://localhost:3000`
   - Docker embed service: `http://localhost:3002`
   ```bash
   export BASE_URL="http://localhost:3000"
   export TRIP_ID=""
   export COST_ID=""
   ```
   - Update `BASE_URL` if you are using the docker embed service.
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
   - Capture the `id` from the response and export it for subsequent calls:
     ```bash
     export TRIP_ID="...response id..."
     ```
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
6. Initialize cost tracking data (based on `src/app/__tests__/integration/cost-tracking-api.integration.test.ts`):
   ```bash
   curl -X POST "$BASE_URL/api/cost-tracking" \
     -H "Content-Type: application/json" \
     -d '{
       "tripId": "'"$TRIP_ID"'",
       "tripTitle": "Sample Map Trip Costs",
       "tripStartDate": "2024-07-01T00:00:00.000Z",
       "tripEndDate": "2024-07-15T00:00:00.000Z",
       "overallBudget": 2500,
       "currency": "EUR",
       "countryBudgets": [
         {
           "id": "budget-france",
           "country": "France",
           "amount": 1200,
           "currency": "EUR",
           "notes": "France portion of trip"
         }
       ],
       "expenses": [
         {
           "id": "expense-test-1",
           "date": "2024-07-02T00:00:00.000Z",
           "amount": 150,
           "currency": "EUR",
           "category": "Accommodation",
           "country": "France",
           "description": "Hotel night 1",
           "expenseType": "actual"
         }
       ]
     }'
   ```
   - Capture the `id` from the response and export it:
     ```bash
     export COST_ID="...response id..."
     ```
7. Generate additional data by analogy to the integration tests:
   - Accommodations and linked travel items: see `src/app/__tests__/integration/travel-data-update-links-validation.integration.test.ts` for the payload shape and the `accommodations` array.
   - Social content fields (Instagram/blog posts): see `src/app/__tests__/integration/debug-frontend-flow.integration.test.ts` for `instagramPosts`, `blogPosts`, and `accommodationData` examples in the travel data payload.
   - The same API endpoints (`/api/travel-data` and `/api/cost-tracking`) accept expanded payloads, so you can extend the JSON bodies above with those fields as needed.

# Tests

Always run all relevant tests before finalising a PR/task.
