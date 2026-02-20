# TanStack Start Migration Plan (Feature-Stable)

## Context

This document defines a feature-stable migration of `animated-svgs` from:

- CommonJS + Node `http` web server
- Vanilla DOM frontend (`web/app.js`, `web/grid.js`)

to:

- TanStack Start
- React
- TypeScript

As of **February 20, 2026**, the current migration branch behavior is stable and `npm run test:e2e` passes (`19/19`).

## Migration Goals

1. Preserve current user-visible behavior and API semantics.
2. Preserve current CLI commands and artifact output structure.
3. Migrate web runtime to TanStack Start + React + TypeScript incrementally.
4. Keep rollback points throughout migration on branch `codex/tanstack-migration`.

## Non-Goals

1. No product redesign during migration.
2. No major UX flow changes.
3. No changes to generation logic quality targets beyond strict parity.

## Implementation Status (Updated February 20, 2026)

### Completed

1. **Phase 0 completed:** API contract and route-alias smoke tests were added and are green.
2. **Phase 1 completed:** TanStack Start + TypeScript scaffold is in place with route tree generation and type checks.
3. **Phase 2 completed:** all listed `/api/*` endpoints are now served through Start server routes with parity-preserving behavior.
4. **Hard cutover completed:** `npm run web` is the only supported web runtime path (TanStack Start).
5. **Phase 3 slice 1 completed:** `/`, `/grid`, and `/library` now render through React routes with parity-preserving grid markup and runtime behavior.
6. **Phase 3 slice 1 verification completed:** focused parity checks were added for grid route hooks, grid action flows, and detail preview payload semantics.
7. **Phase 3 slice 2 completed:** `/generate` and `/workbench` now render through React routes with parity-preserving workbench markup and runtime behavior.
8. **Phase 3 slice 2 verification completed:** focused parity checks were added for workbench generation controls, preview hooks, and library integration flows.
9. **Legacy fallback removed:** `web:legacy`, `src/web-legacy-server.js`, and legacy static page serving were removed.

### Next Slice

1. Begin **Phase 3 (UI migration) slice 3**:
   - Start replacing transitional runtime scripts (`public/grid.js`, `public/app.js`) with React state incrementally.
   - Keep DOM hooks and CSS parity while extracting typed client modules for grid and workbench interactions.
   - Preserve existing keyboard shortcuts, URL-state behavior, and Discord export flows during each extraction slice.

## Baseline Scope To Preserve

### Web Routes and Aliases

- `/`
- `/grid`
- `/library`
- `/generate`
- `/workbench`

### API Endpoints

- `POST /api/next-prompt`
- `POST /api/next`
- `GET /api/prompts`
- `POST /api/save-prompt`
- `POST /api/generate`
- `POST /api/create-from-svg`
- `POST /api/polish-prompt`
- `GET /api/polish-template`
- `GET /api/discord-export/presets`
- `POST /api/discord-export`
- `GET /api/library`
- `GET /api/library/item`
- `GET /api/library/file`
- `POST /api/library/hide`
- `POST /api/library/unhide`
- `POST /api/library/delete`

### Functional Areas

1. Fixed prompt generation, selected prompt generation, and parallel generation.
2. Custom prompt + polish flow (including template placeholders).
3. Paste SVG import and sanitization.
4. Library listing/preview/hide/unhide/delete.
5. Discord export presets/config presets and exported file behavior.
6. Theme, cut modes, keyboard shortcuts, and URL-state behavior.
7. CLI commands: `check:key`, `pipeline`, `qa`, `iterate`, `dashboard`, `view`.

## Target Architecture

1. TanStack Start route-based app with React + TypeScript.
2. Start server routes for external REST-compatible `/api/*` handlers.
3. Server functions only for internal typed calls where they do not alter existing public API contracts.
4. Server-only modules for filesystem, env keys, ffmpeg, puppeteer, and provider integrations.
5. Shared typed domain modules for payload contracts and metadata schemas.

## Cross-Cutting Workstream: Package Manager Migration (npm -> pnpm)

### Goal

Standardize the repository on `pnpm` for install/build/test/dev workflows while preserving behavior parity.

### Deliverables

1. Add `pnpm-lock.yaml` and set `packageManager` in `package.json`.
2. Update README and developer commands to use `pnpm` equivalents.
3. Update automation/CI scripts to use `pnpm install`, `pnpm run ...`.
4. Remove `package-lock.json` once all workflows are verified on `pnpm`.
5. Keep an explicit short transition window where `npm` commands are still documented for rollback if needed.

### Exit Criteria

1. `pnpm install` is clean on a fresh clone.
2. `pnpm run web`, `pnpm run web:build`, `pnpm run typecheck`, and `pnpm run test:e2e` all pass.
3. No workflow in docs or scripts depends on `npm` semantics.

### Recommended Timing

Run this workstream after Phase 3 parity is established, then complete before final cleanup.

## Phase Plan

## Phase 0: Contract Freeze and Safety Harness

### Deliverables

1. Add API contract tests for each endpoint (success + expected error cases).
2. Add route-alias smoke tests (`/`, `/grid`, `/library`, `/generate`, `/workbench`).
3. Snapshot key response payload shapes and status code behaviors.

### Exit Criteria

1. Existing tests remain green.
2. New contract tests are green and describe current truth.

## Phase 1: Scaffold TanStack Start + TypeScript (No Cutover)

### Deliverables

1. Add TanStack Start app scaffold with TypeScript.
2. Add root route and basic route tree generation.
3. Keep legacy server execution path intact.
4. Configure TS strictness and server/client boundary conventions.

### Exit Criteria

1. Start app boots locally.
2. Existing server still boots unchanged.
3. No feature behavior changes yet.

## Phase 2: Migrate `/api/*` to Start Server Routes

### Deliverables

1. Port all endpoint handlers to Start server routes while preserving existing route paths.
2. Reuse existing logic from `src/lib/*` with typed wrappers.
3. Preserve exact response semantics:
   - status codes
   - field names
   - error message text where user-visible behavior depends on it
4. Preserve file operations and seed marker behavior in `results/`.

### Suggested Sequence

1. Read-only routes:
   - `/api/prompts`
   - `/api/polish-template`
   - `/api/discord-export/presets`
   - `/api/library`
   - `/api/library/item`
   - `/api/library/file`
2. Mutating library/prompt routes:
   - `/api/save-prompt`
   - `/api/library/hide`
   - `/api/library/unhide`
   - `/api/library/delete`
   - `/api/create-from-svg`
3. Generation/provider routes:
   - `/api/next-prompt`
   - `/api/next`
   - `/api/generate`
   - `/api/polish-prompt`
   - `/api/discord-export`

### Exit Criteria

1. All API contract tests pass against Start routes.
2. Legacy server and Start API outputs are equivalent for tested cases.

## Phase 3: Migrate UI to React Routes

### Deliverables

1. Create React route for grid main view (`/` with aliases).
2. Create React route for workbench (`/generate` with alias `/workbench`).
3. Port UI behavior in slices while keeping CSS styling/parity:
   - state and controls
   - preview and library operations
   - Discord export actions
   - keyboard shortcuts
   - URL query-state behavior

### Exit Criteria

1. Manual parity checklist passes for both pages.
2. Contract tests remain green.
3. No functional regressions reported in primary workflows.

## Phase 4: Shared Module TypeScript Conversion

### Deliverables

1. Convert core modules from `.js` to `.ts` incrementally:
   - `gemini`
   - `preprocess`
   - `qa`
   - `discord-export`
   - supporting `utils/env/web-prompts/madlib`
2. Introduce strong types for:
   - generation request/config
   - endpoint payloads
   - saved asset metadata
   - QA reports
   - export presets/output
3. Enforce clean separation between client-safe and server-only code.

### Exit Criteria

1. Type check passes.
2. Existing test suite passes unchanged.
3. API and UI behavior remains stable.

## Phase 5: CLI Migration to TypeScript

### Deliverables

1. Convert CLI entrypoint and command plumbing to TypeScript.
2. Keep existing command names, flags, outputs, and artifact structure.

### Exit Criteria

1. `pipeline`, `qa`, `iterate`, `dashboard`, `view`, and `check:key` run with parity.
2. Existing e2e/CLI tests remain green.

## Phase 6: Cutover and Cleanup

### Deliverables

1. Switch `npm run web` to TanStack Start runtime.
2. Remove legacy web server/static serving code after parity confirmation.
3. Update README and developer commands.

### Exit Criteria

1. Full regression suite green.
2. Parity checklist complete.
3. Legacy path no longer needed for normal operation.

## Verification Plan

## Automated Gates

1. Existing `npm run test:e2e` must stay green (until pnpm cutover).
2. Added API contract tests must stay green.
3. Type checks and build checks must pass.
4. After pnpm cutover: `pnpm run test:e2e`, `pnpm run typecheck`, and `pnpm run web:build` must stay green.

## Manual Parity Checklist

1. Generate selected fixed prompt.
2. Generate parallel prompts.
3. Polish custom prompt and generate.
4. Paste SVG import and sanitization.
5. Preview and copy SVG.
6. Library hide/unhide/delete and metadata behavior.
7. Discord export for each preset/config preset.
8. Route aliases and URL-state persistence.
9. Keyboard shortcuts and theme/cut mode behavior.

## Risk Register and Mitigations

1. **Risk:** Server/client boundary leakage.
   - **Mitigation:** Server-only module boundaries + import protection + compile-time checks.
2. **Risk:** API behavior drift while porting handlers.
   - **Mitigation:** Contract tests first, then incremental endpoint migration.
3. **Risk:** React rewrite accidentally changes behavior.
   - **Mitigation:** Slice-by-slice port with explicit parity checklist.
4. **Risk:** TS/ESM conversion impacts CLI behavior.
   - **Mitigation:** Delay CLI cutover until web/API parity is complete.

## Suggested Commit Slices

1. Add parity contract tests and fixtures.
2. Add Start + TS scaffold.
3. Port read-only APIs.
4. Port mutating APIs.
5. Port generation and export APIs.
6. Port grid UI to React.
7. Port workbench UI to React.
8. Convert shared libs to TS.
9. Convert CLI to TS.
10. Switch package manager from npm to pnpm.
11. Cutover scripts and remove legacy server.

## Source Links (Full URLs)

1. https://tanstack.com/llms.txt
2. https://tanstack.com/start/latest/docs/framework/react/overview
3. https://tanstack.com/start/latest/docs/framework/react/getting-started
4. https://tanstack.com/start/latest/docs/framework/react/quick-start
5. https://tanstack.com/start/latest/docs/framework/react/build-from-scratch
6. https://tanstack.com/start/latest/docs/framework/react/guide/routing
7. https://tanstack.com/start/latest/docs/framework/react/guide/execution-model
8. https://tanstack.com/start/latest/docs/framework/react/guide/import-protection
9. https://tanstack.com/start/latest/docs/framework/react/guide/environment-variables
10. https://tanstack.com/start/latest/docs/framework/react/guide/server-functions
11. https://tanstack.com/start/latest/docs/framework/react/guide/server-routes
12. https://tanstack.com/start/latest/docs/framework/react/guide/selective-ssr
13. https://tanstack.com/start/latest/docs/framework/react/guide/spa-mode
14. https://tanstack.com/start/latest/docs/framework/react/guide/server-entry-point
15. https://tanstack.com/start/latest/docs/framework/react/guide/client-entry-point
