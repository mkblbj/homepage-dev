# uorakutensales Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Rakuten real-time sales widget below the existing attendance widget, with safe server-side token handling, manual sales refresh, and selectable snapshot polling intervals.

**Architecture:** Add a dedicated `uorakutensales` widget. The browser only calls Homepage's existing service proxy; the proxy reads the raw server-side widget config, injects the bearer token, and forwards snapshot or query requests to the local sales service.

**Tech Stack:** Next.js API routes, existing Homepage widget registry, SWR, React, `node:test`.

---

## File Structure

- Create `src/widgets/uorakutensales/sales-model.mjs`: pure data shaping for totals, shops, statuses, currency, and refresh interval options.
- Create `src/widgets/uorakutensales/sales-model.test.mjs`: tests for sorting, totals, error rows, and refresh interval fallback.
- Create `src/widgets/uorakutensales/proxy-config.mjs`: pure request construction for `snapshot` and `query` proxy calls.
- Create `src/widgets/uorakutensales/proxy-config.test.mjs`: tests for method, headers, body, and URL construction without touching the real service.
- Create `src/widgets/uorakutensales/proxy.js`: Next API proxy handler using `getServiceWidget()` and `httpProxy()`.
- Create `src/widgets/uorakutensales/widget.js`: widget metadata with custom proxy handler and allowed endpoints.
- Create `src/widgets/uorakutensales/component.jsx`: React UI with manual refresh and 5/10/15 minute polling selector.
- Modify `src/widgets/components.js`: dynamic component registration.
- Modify `src/widgets/widgets.js`: widget metadata registration.
- Modify `src/utils/config/service-helpers.js`: pass `refreshInterval` to the frontend for this widget, but do not pass `key` or `url`.
- Modify ignored local `config/services.yaml`: add the widget under `今日出勤中` using `{{HOMEPAGE_VAR_UO_EC_TOKEN}}`.

## Tasks

### Task 1: Red tests

- [ ] Add `sales-model.test.mjs` covering:
  - Snapshot totals become formatted display values.
  - Shops sort by `salesYen` descending, then `shopName`.
  - `lastError` and non-authenticated statuses are surfaced per shop.
  - Refresh interval options are exactly `5m`, `10m`, `15m`, and invalid config falls back to `15m`.
- [ ] Add `proxy-config.test.mjs` covering:
  - `snapshot` creates a `GET /api/sales` request with `Authorization: Bearer <token>`.
  - `query` creates a `POST /api/query` request with `Origin`, `Content-Type`, and body `{"all":true}`.
  - Missing token and unsupported endpoint throw clear errors.
- [ ] Run:

```bash
node --test src/widgets/uorakutensales/sales-model.test.mjs src/widgets/uorakutensales/proxy-config.test.mjs
```

Expected: FAIL because implementation files do not exist yet.

### Task 2: Model and proxy helpers

- [ ] Add `sales-model.mjs` with pure helpers and interval constants.
- [ ] Add `proxy-config.mjs` with pure request construction.
- [ ] Run the two node tests again.

Expected: PASS.

### Task 3: Runtime proxy

- [ ] Add `proxy.js` and `widget.js`.
- [ ] The proxy must:
  - Read `url` and `key` from the raw widget config.
  - Fall back to `process.env.HOMEPAGE_VAR_UO_EC_TOKEN` or `process.env.UO_EC_TOKEN` if `key` is absent.
  - Reject unsupported endpoints or methods.
  - Return parsed JSON and preserve existing snapshot data when query fails on the frontend.
- [ ] Do not expose `key` through frontend service cleaning.

### Task 4: Component and registration

- [ ] Add `component.jsx`.
- [ ] Register the component in `components.js`.
- [ ] Register widget metadata in `widgets.js`.
- [ ] Update `service-helpers.js` so only `refreshInterval` is available to the client for `uorakutensales`.

### Task 5: Local service config

- [ ] Add `楽天売上リアルタイム` immediately after `今日出勤中` in ignored `config/services.yaml`.
- [ ] Use `key: "{{HOMEPAGE_VAR_UO_EC_TOKEN}}"`.
- [ ] Use `refreshInterval: 900000` as the default 15-minute interval.

### Task 6: Verification

- [ ] Run the new node tests.
- [ ] Run lint if possible.
- [ ] Build if lint passes and the environment allows it.
- [ ] Start the dev server with the token in the process environment and report the local URL.
