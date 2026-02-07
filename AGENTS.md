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