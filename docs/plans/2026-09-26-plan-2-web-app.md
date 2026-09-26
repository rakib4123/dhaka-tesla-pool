# Plan 2 of 3 — Web App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Dhaka Tesla Pool web app on top of the merged REST API.
- **Passengers** (Nusrat, Rafiq, Shirin) request a ride, see both fare estimates, watch their ride progress live, cancel while it's still allowed, and read their history.
- **Drivers** (Jashim/Bullet, Monir/Toofan) go online in a zone, accept riders, run the trip (arrive → start → complete), and see past trips.

**Architecture:** A React single-page app built with Vite. It has three layers:
- `api/` holds a typed `fetch` client that mirrors the API's response shapes.
- `auth/` holds a context that owns the JWT and the signed-in user.
- `pages/` holds screens built from small `components/`.

Every data view uses one `useApi` hook, which handles loading, error-with-retry, empty states and optional 3-second polling. There is no global state library. Server state lives in `useApi`, and session state lives in `AuthContext`.

**Tech Stack:** React 19, React Router 7 (library mode), Vite 7, Tailwind CSS 4, TypeScript 5.9, Vitest 4 with jsdom 26, Testing Library (react 16, user-event 14, jest-dom 6), and ESLint 9 with typescript-eslint and react-hooks.

**Spec:** `docs/specs/2026-09-26-dhaka-tesla-pool-design.md`. Section §8 covers the frontend; §3 and §6 define the behaviour and API it consumes. The API response types are in `api/src/services/views.ts`.

**Follow-up:** Plan 3 covers delivery: the `web` Docker image with nginx, a full `docker compose up`, CI, the README, diagrams, deployment and the release branches.

## Global Constraints

- **Location.** The web app lives in `web/` at the repo root `/home/dextro/Desktop/dhaka-tesla-pool`. Run every `npm` and `npx` command from `web/` unless a step says otherwise.
- **Pinned versions.** Do not upgrade across majors:

  | Package | Version |
  |---|---|
  | `react` / `react-dom` | `19.x` |
  | `react-router` | `7.x` (not 8) |
  | `vite` | `7.x` (not 8) |
  | `@vitejs/plugin-react` | `5.x` |
  | `tailwindcss` / `@tailwindcss/vite` | `4.x` |
  | `typescript` | `~5.9.3` |
  | `vitest` | `4.x` |
  | `jsdom` | `26.x` |
  | `eslint` | `9.x` |

- **Money.** The API sends integer paisa. Only `formatTaka` in `src/lib/format.ts` turns paisa into text, for example `5250` → `৳52.50`. Never divide money anywhere else.
- **The cast.** Use it everywhere: in UI copy, demo buttons and test fixtures.
  - Passengers: Nusrat, Rafiq, Shirin.
  - Drivers: Jashim with Bullet (`DHK-TESLA-11`, 3 seats) and Monir with Toofan (`DHK-TESLA-22`, 2 seats).
  - Emails are `<name>@teslapool.test` and the demo password is `bullet123`.
  - Never use `user1`, `driver1` or similar.
- **Passenger status labels** (spec §3.4). Use them verbatim:

  | Status | Label |
  |---|---|
  | REQUESTED | "Waiting for a Tesla" |
  | MATCHED | "Matched" |
  | DRIVER_ARRIVED | "`<vehicle>` is here" (for example "Bullet is here") |
  | STARTED | "On the way" |
  | COMPLETED | "Completed" |
  | CANCELLED | "Cancelled" |

- **Copy the spec defines** (use these strings exactly):
  - Estimate: "৳70.00 solo · ৳52.50 if pooled"
  - Empty request list: "No one in Banani needs a Tesla right now." (with the driver's zone)
  - Full Tesla: "Bullet is full — ready to go"
  - Seat meter: shows ●●○ and "2/3 seats"
- **Screen states.** Every data view has an explicit loading state, an error state with a "Try again" button, and an empty state.
- **Polling.** Active-ride and driver screens poll every `POLL_MS = 3000` ms (`src/lib/polling.ts`). No WebSockets.
- **Business rules.** They live in the API. The UI only mirrors them to decide which buttons to show (`src/lib/status.ts`). The API response is always the source of truth, so after every action the screen refetches.
- **API base URL.** The client calls `${VITE_API_URL}/api/...`. `VITE_API_URL` is empty in development (Vite proxies `/api` to `http://localhost:4000`) and in Docker (nginx proxies it). It is set only when the web app is hosted apart from the API.
- **Commits.**
  - Format: `<type>(<scope>): <description>`, where type is one of `feat|fix|refactor|test|docs|chore|build`.
  - End every commit message with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - Commit exactly what each commit step lists.
- **Branches.** Never commit to `master`. Close each branch with the **Branch close procedure** below.
- **AI usage log.** When the human rejects or changes an AI suggestion, add a dated bullet to `docs/ai-usage-notes.md` in the next commit on the current branch.

### Branch close procedure

Run from the repo root, replacing `<branch>`, `<title>` and `<summary>`:

```bash
git push -u origin <branch>
gh pr create --base master --head <branch> --title "<title>" --body "<summary>

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
gh pr merge <branch> --merge          # merge commit (no fast-forward); keep the branch
git checkout master && git pull --ff-only
```

## Review Focus

These are inputs the spec implies but doesn't spell out, and a real user will hit them. Each one has a test in the task that owns the code.

1. **A saved token that the server no longer accepts.**
   - When it happens: an expired token, or a database that was reset after the token was issued.
   - Expected: the app returns to Sign in with "Your session ended. Please sign in again." It must not hang on a spinner or show a raw error.
   - Tested in Task 4.
2. **An API that is unreachable or returns HTML.**
   - When it happens: a Render cold start, a 502 from nginx, or a misconfigured `VITE_API_URL` that returns `index.html` with status 200.
   - Expected: a friendly "Can't reach the server" or "The server is having trouble" message with a retry. It must never crash on `JSON.parse`, and never treat HTML as data.
   - Tested in Task 2.
3. **Double-clicking an action button** ("Request ride", "Accept", "Start trip"…).
   - Expected: exactly one request is sent.
   - Tested in Tasks 6, 8 and 9.
4. **An action that loses a race.**
   - Example: Nusrat cancels just as Jashim starts, and the API replies 409.
   - Expected: the API's message is shown and the screen refetches, so it never shows a stale state as if it were current.
   - Tested in Tasks 5 and 8.
5. **A network blip while polling.**
   - Expected: the last good data stays on screen with a "Connection lost" banner, and it recovers automatically. The screen must not blank out.
   - Tested in Tasks 3 and 6.

---

## Task 1: Web scaffold — Vite, React, Tailwind, Vitest, ESLint, and pure helpers

**Branch:** `git checkout master && git pull --ff-only && git checkout -b feature/web-foundation`

**Files:**
- Create: `web/package.json`, `web/tsconfig.json`, `web/vite.config.ts`, `web/eslint.config.js`, `web/index.html`, `web/.env.example`
- Create: `web/src/main.tsx`, `web/src/App.tsx`, `web/src/index.css`, `web/src/vite-env.d.ts`, `web/src/test/setup.ts`
- Create: `web/src/api/types.ts`, `web/src/lib/format.ts`, `web/src/lib/status.ts`, `web/src/lib/polling.ts`
- Modify: `docs/ai-usage-notes.md`
- Test: `web/src/lib/format.test.ts`, `web/src/lib/status.test.ts`

**Interfaces:**
- Produces:
  - **Types** (mirroring the API): `Role`, `RideStatus`, `PoolStatus`, `PoolAction`, `ZoneRef`, `Zone`, `User`, `Vehicle`, `Me`, `AuthResult`, `FareBreakdown`, `FareEstimate`, `TripInput`, `RegisterInput`, `RidePool`, `Ride`, `RideEvent`, `RideDetail`, `DriverRider`, `DriverPool`, `RelevantRequest`.
  - **`formatTaka(paisa: number): string`.**
  - **Time formatters:** `formatTime(iso: string): string` and `formatDateTime(iso: string): string`.
  - **Ride status helpers:**
    - `RIDE_STEPS: { status: RideStatus; label: string }[]`
    - `rideStatusLabel(status: RideStatus, vehicleName?: string): string`
    - `isActiveRide(status: RideStatus): boolean`
    - `canCancelRide(status: RideStatus): boolean`
  - **Pool helpers:**
    - `NEXT_POOL_ACTION: Partial<Record<PoolStatus, { action: 'arrive' | 'start' | 'complete'; label: string }>>`
    - `canCancelPool(status: PoolStatus): boolean`
    - `isAcceptingRiders(pool: { status: PoolStatus; isFull: boolean }): boolean`
  - **`POLL_MS = 3000`.**

- [ ] **Step 1: Log the final-review fixes from Plan 1 in the AI usage notes**

Append to the `## Log` list in `docs/ai-usage-notes.md`:
```markdown
- 2026-09-26: **Accepted.** A fresh AI reviewer checked the finished API and found a torn read in passenger cancel: the ride and its membership were read in two SELECTs, so a cancelled ride could keep holding a seat. It also found three smaller bugs that caused 500s or showed the wrong status. We reproduced each one with a failing test before fixing it (PR #8). Four minor findings were deliberately deferred.
```

Commit:
```bash
cd /home/dextro/Desktop/dhaka-tesla-pool
git add docs/ai-usage-notes.md docs/plans/2026-09-26-plan-2-web-app.md
git commit -m "docs(plan): add web app plan and log the backend review fixes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 2: Scaffold the package**

`web/package.json`:
```json
{
  "name": "dhaka-tesla-pool-web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Web app for Dhaka Tesla Pool",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

Install:
```bash
cd /home/dextro/Desktop/dhaka-tesla-pool/web
npm install react@19 react-dom@19 react-router@7
npm install -D vite@7 @vitejs/plugin-react@5 typescript@~5.9.3 tailwindcss@4 @tailwindcss/vite@4 \
  vitest@4 jsdom@26 @testing-library/react@16 @testing-library/dom@10 @testing-library/user-event@14 \
  @testing-library/jest-dom@6 @types/react@19 @types/react-dom@19 \
  eslint@9 @eslint/js@9 typescript-eslint@8 eslint-plugin-react-hooks@7 globals
```

`web/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "types": ["vite/client"]
  },
  "include": ["src", "vite.config.ts"]
}
```

`web/vite.config.ts`:
```ts
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // In development the browser talks to Vite; Vite forwards /api to the API, so no CORS is needed.
    proxy: { '/api': 'http://localhost:4000' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
```

`web/eslint.config.js`:
```js
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  { ignores: ['dist'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    // Only the two classic hook rules; they catch real bugs without opinionated compiler rules.
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
]);
```

`web/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="Dhaka Tesla Pool — share a seat, split the fare, survive Dhaka traffic." />
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🛺</text></svg>" />
    <title>Dhaka Tesla Pool</title>
  </head>
  <body class="bg-stone-50 text-stone-900 antialiased">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`web/.env.example`:
```dotenv
# Leave empty for local dev (Vite proxies /api to localhost:4000) and for Docker (nginx proxies /api).
# Set it only when the web app is hosted separately from the API, e.g.:
# VITE_API_URL=https://dhaka-tesla-pool-api.onrender.com
VITE_API_URL=
```

`web/src/vite-env.d.ts`:
```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}
```

`web/src/index.css`:
```css
@import "tailwindcss";
```

`web/src/App.tsx` (replaced in Task 4):
```tsx
export function App() {
  return <h1 className="p-6 text-2xl font-semibold">Dhaka Tesla Pool</h1>;
}
```

`web/src/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
```

`web/src/test/setup.ts`:
```ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});
```

Check that the scaffold builds: run `npx vite build`. Expected: a `dist/` directory is written and there are no errors.

- [ ] **Step 3: Commit the scaffold**

```bash
cd /home/dextro/Desktop/dhaka-tesla-pool
git add web/package.json web/package-lock.json web/tsconfig.json web/vite.config.ts web/eslint.config.js web/index.html web/.env.example web/src
git commit -m "chore(web): scaffold react app with vite, tailwind, vitest and eslint

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Write the failing tests for the pure helpers**

`web/src/api/types.ts`:
```ts
// Mirrors api/src/services/views.ts: the JSON the API actually returns.

export type Role = 'PASSENGER' | 'DRIVER';
export type RideStatus = 'REQUESTED' | 'MATCHED' | 'DRIVER_ARRIVED' | 'STARTED' | 'COMPLETED' | 'CANCELLED';
export type PoolStatus = 'OPEN' | 'DRIVER_ARRIVED' | 'STARTED' | 'COMPLETED' | 'CANCELLED';
export type PoolAction = 'arrive' | 'start' | 'complete' | 'cancel';

export interface ZoneRef {
  id: number;
  name: string;
}

export interface Zone extends ZoneRef {
  gridX: number;
  gridY: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
}

export interface Vehicle {
  id: string;
  name: string;
  plate: string;
  capacity: number;
  isOnline: boolean;
  currentZone: ZoneRef | null;
}

export interface Me extends User {
  vehicle: Vehicle | null;
}

export interface AuthResult {
  token: string;
  user: User;
}

export interface RegisterInput {
  name: string;
  email: string;
  phone?: string;
  password: string;
}

export interface FareBreakdown {
  basePaisa: number;
  distancePaisa: number;
  discountPaisa: number;
  totalPaisa: number;
}

export interface FareEstimate {
  distanceKm: number;
  soloPaisa: number;
  pooledPaisa: number;
}

export interface TripInput {
  pickupZoneId: number;
  dropoffZoneId: number;
  seats: number;
}

export interface RidePool {
  id: string;
  status: PoolStatus;
  driverName: string;
  vehicleName: string;
  vehiclePlate: string;
  coRiderCount: number;
}

export interface Ride {
  id: string;
  status: RideStatus;
  seats: number;
  pickupZone: ZoneRef;
  dropoffZone: ZoneRef;
  distanceKm: number;
  estimate: { soloPaisa: number; pooledPaisa: number };
  fare: FareBreakdown | null;
  cancelledBy: 'PASSENGER' | 'DRIVER' | null;
  createdAt: string;
  pool: RidePool | null;
}

export interface RideEvent {
  type: string;
  fromStatus: string | null;
  toStatus: string | null;
  actor: 'PASSENGER' | 'DRIVER' | 'SYSTEM';
  createdAt: string;
}

export interface RideDetail extends Ride {
  events: RideEvent[];
}

export interface DriverRider {
  rideId: string;
  firstName: string;
  seats: number;
  dropoffZone: ZoneRef;
  status: RideStatus;
  estimatePaisa: number;
  fareTotalPaisa: number | null;
  leftReason: string | null;
}

export interface DriverPool {
  id: string;
  status: PoolStatus;
  capacity: number;
  seatsTaken: number;
  isFull: boolean;
  pickupZone: ZoneRef;
  vehicle: { name: string; plate: string };
  riders: DriverRider[];
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface RelevantRequest {
  rideId: string;
  firstName: string;
  seats: number;
  pickupZone: ZoneRef;
  dropoffZone: ZoneRef;
  distanceKm: number;
  estimateSoloPaisa: number;
  estimatePooledPaisa: number;
  requestedAt: string;
}
```

`web/src/lib/format.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { formatTaka } from './format';

describe('formatTaka (integer paisa → taka text)', () => {
  it.each([
    [5250, '৳52.50'], // Nusrat, pooled
    [6750, '৳67.50'], // Rafiq, pooled
    [7000, '৳70.00'],
    [13500, '৳135.00'],
    [123456, '৳1,234.56'],
    [5, '৳0.05'],
    [0, '৳0.00'],
  ])('%i paisa → %s', (paisa, text) => {
    expect(formatTaka(paisa)).toBe(text);
  });

  it('shows a discount as negative', () => {
    expect(formatTaka(-1750)).toBe('-৳17.50');
  });
});
```

`web/src/lib/status.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { RideStatus } from '../api/types';
import {
  canCancelPool,
  canCancelRide,
  isAcceptingRiders,
  isActiveRide,
  NEXT_POOL_ACTION,
  RIDE_STEPS,
  rideStatusLabel,
} from './status';

describe('ride status labels (spec §3.4)', () => {
  it.each([
    ['REQUESTED', 'Waiting for a Tesla'],
    ['MATCHED', 'Matched'],
    ['STARTED', 'On the way'],
    ['COMPLETED', 'Completed'],
    ['CANCELLED', 'Cancelled'],
  ] as const)('%s → %s', (status, label) => {
    expect(rideStatusLabel(status)).toBe(label);
  });

  it('names the Tesla when it has arrived', () => {
    expect(rideStatusLabel('DRIVER_ARRIVED', 'Bullet')).toBe('Bullet is here');
    expect(rideStatusLabel('DRIVER_ARRIVED')).toBe('Your Tesla is here');
  });

  it('lists the five progress steps in order', () => {
    expect(RIDE_STEPS.map((step) => step.status)).toEqual(['REQUESTED', 'MATCHED', 'DRIVER_ARRIVED', 'STARTED', 'COMPLETED']);
  });
});

describe('what a passenger can still do', () => {
  const all: RideStatus[] = ['REQUESTED', 'MATCHED', 'DRIVER_ARRIVED', 'STARTED', 'COMPLETED', 'CANCELLED'];

  it('treats everything before COMPLETED/CANCELLED as active', () => {
    expect(all.filter(isActiveRide)).toEqual(['REQUESTED', 'MATCHED', 'DRIVER_ARRIVED', 'STARTED']);
  });

  it('allows cancelling only before the trip starts (mirrors the API rule)', () => {
    expect(all.filter(canCancelRide)).toEqual(['REQUESTED', 'MATCHED', 'DRIVER_ARRIVED']);
  });
});

describe("what Jashim's next button is", () => {
  it('walks arrive → start → complete', () => {
    expect(NEXT_POOL_ACTION.OPEN).toEqual({ action: 'arrive', label: "I've arrived" });
    expect(NEXT_POOL_ACTION.DRIVER_ARRIVED).toEqual({ action: 'start', label: 'Start trip' });
    expect(NEXT_POOL_ACTION.STARTED).toEqual({ action: 'complete', label: 'Complete trip' });
    expect(NEXT_POOL_ACTION.COMPLETED).toBeUndefined();
  });

  it('allows cancelling the pool only before the start', () => {
    expect(canCancelPool('OPEN')).toBe(true);
    expect(canCancelPool('DRIVER_ARRIVED')).toBe(true);
    expect(canCancelPool('STARTED')).toBe(false);
  });

  it('takes more riders only while not started and not full', () => {
    expect(isAcceptingRiders({ status: 'OPEN', isFull: false })).toBe(true);
    expect(isAcceptingRiders({ status: 'OPEN', isFull: true })).toBe(false);
    expect(isAcceptingRiders({ status: 'STARTED', isFull: false })).toBe(false);
  });
});
```

Run: `npx vitest run src/lib`
Expected: FAIL, because `./format` and `./status` can't be resolved.

- [ ] **Step 5: Implement the helpers**

`web/src/lib/format.ts`:
```ts
/** The only place paisa becomes text. Integer maths only: 5250 → "৳52.50". */
export function formatTaka(paisa: number): string {
  const sign = paisa < 0 ? '-' : '';
  const abs = Math.abs(paisa);
  const taka = Math.floor(abs / 100).toLocaleString('en-US');
  const cents = String(abs % 100).padStart(2, '0');
  return `${sign}৳${taka}.${cents}`;
}

/** "08:41" in the viewer's time zone. */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/** "26 Sept, 08:41" in the viewer's time zone. */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
```

`web/src/lib/status.ts`:
```ts
import type { PoolStatus, RideStatus } from '../api/types';

// The API enforces these rules. The UI mirrors them only to decide which buttons to show.

export const RIDE_STEPS: { status: RideStatus; label: string }[] = [
  { status: 'REQUESTED', label: 'Requested' },
  { status: 'MATCHED', label: 'Matched' },
  { status: 'DRIVER_ARRIVED', label: 'Arrived' },
  { status: 'STARTED', label: 'On the way' },
  { status: 'COMPLETED', label: 'Done' },
];

export function rideStatusLabel(status: RideStatus, vehicleName = 'Your Tesla'): string {
  switch (status) {
    case 'REQUESTED':
      return 'Waiting for a Tesla';
    case 'MATCHED':
      return 'Matched';
    case 'DRIVER_ARRIVED':
      return `${vehicleName} is here`;
    case 'STARTED':
      return 'On the way';
    case 'COMPLETED':
      return 'Completed';
    case 'CANCELLED':
      return 'Cancelled';
  }
}

export function isActiveRide(status: RideStatus): boolean {
  return status !== 'COMPLETED' && status !== 'CANCELLED';
}

export function canCancelRide(status: RideStatus): boolean {
  return status === 'REQUESTED' || status === 'MATCHED' || status === 'DRIVER_ARRIVED';
}

export const NEXT_POOL_ACTION: Partial<Record<PoolStatus, { action: 'arrive' | 'start' | 'complete'; label: string }>> = {
  OPEN: { action: 'arrive', label: "I've arrived" },
  DRIVER_ARRIVED: { action: 'start', label: 'Start trip' },
  STARTED: { action: 'complete', label: 'Complete trip' },
};

export function canCancelPool(status: PoolStatus): boolean {
  return status === 'OPEN' || status === 'DRIVER_ARRIVED';
}

export function isAcceptingRiders(pool: { status: PoolStatus; isFull: boolean }): boolean {
  return canCancelPool(pool.status) && !pool.isFull;
}
```

`web/src/lib/polling.ts`:
```ts
/** How often live screens refresh. Tests replace this module with a much shorter interval. */
export const POLL_MS = 3000;
```

- [ ] **Step 6: Run the tests, type check and lint**

Run: `npx vitest run && npx tsc --noEmit && npx eslint .`
Expected: all tests pass, and `tsc` and `eslint` print nothing.

- [ ] **Step 7: Commit**

```bash
cd /home/dextro/Desktop/dhaka-tesla-pool
git add web/src
git commit -m "feat(web): add api types, taka formatting and ride status helpers

formatTaka is the only place paisa becomes text; status helpers mirror
the API's lifecycle rules to decide which buttons to show.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 2: API client — typed endpoints, error envelope, network and HTML failures

**Branch:** still `feature/web-foundation`

**Files:**
- Create: `web/src/api/client.ts`, `web/src/api/endpoints.ts`
- Create: `web/src/test/mockApi.ts`, `web/src/test/fixtures.ts`
- Test: `web/src/api/client.test.ts`

**Interfaces:**
- Consumes: the types from Task 1.
- Produces:
  - `class ApiError extends Error { status: number; code: string; details?: unknown }`
  - `toApiError(err: unknown): ApiError`
  - `tokenStore: { get(): string | null; set(token: string): void; clear(): void }`
  - `setUnauthorizedHandler(handler: () => void): () => void` (returns an unregister function)
  - `apiFetch<T>(path: string, options?: { method?: string; body?: unknown }): Promise<T>`
  - The `api` object, with these methods:

    | Method | Returns |
    |---|---|
    | `login(email, password)` | `AuthResult` |
    | `register(input)` | `AuthResult` |
    | `me()` | `Me` |
    | `zones()` | `Zone[]` |
    | `estimate(trip)` | `FareEstimate` |
    | `createRide(trip)` | `Ride` |
    | `rides()` | `Ride[]` |
    | `ride(id)` | `RideDetail` |
    | `cancelRide(id)` | `Ride` |
    | `setAvailability(input)` | `Vehicle` |
    | `relevantRequests()` | `RelevantRequest[]` |
    | `acceptRequest(rideId)` | `DriverPool` |
    | `driverPool()` | `{ pool: DriverPool \| null }` |
    | `driverHistory()` | `DriverPool[]` |
    | `poolAction(poolId, action)` | `DriverPool` |

  - Test helpers:
    - `mockApi(routes): { calls: MockCall[] }`, where routes are keyed `"METHOD /path"` (the path without `/api`) and each value is a `MockResponse` or a handler
    - `sequence(...responses)`
    - `type MockResponse = { status?: number; body?: unknown; raw?: string; networkError?: boolean; delayMs?: number }`
    - Cast fixtures: `ZONES`, `zoneRef`, `nusrat`, `tania`, `jashim`, `jashimOnline`, `bulletPool`, `nusratRide`, `NUSRAT_POOLED_FARE`, `rider`, `rafiqRider`, `driverPool`, `waitingRequest`

- [ ] **Step 1: Write the test helpers**

`web/src/test/mockApi.ts`:
```ts
import { vi } from 'vitest';

export interface MockCall {
  method: string;
  path: string;
  body: unknown;
  headers: Headers;
}

export interface MockResponse {
  status?: number;
  body?: unknown;
  /** Send this text verbatim instead of JSON (e.g. an HTML error page). */
  raw?: string;
  /** Make fetch reject, as it does when the server is unreachable. */
  networkError?: boolean;
  /** Hold the response back, to simulate a slow server. */
  delayMs?: number;
}

export type MockHandler = (call: MockCall) => MockResponse | Promise<MockResponse>;

/** Replaces global fetch with a route table keyed "METHOD /path" (path without the /api prefix). */
export function mockApi(routes: Record<string, MockResponse | MockHandler>) {
  const calls: MockCall[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const call: MockCall = {
      method: (init?.method ?? 'GET').toUpperCase(),
      path: url.pathname.replace(/^\/api/, ''),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      headers: new Headers(init?.headers),
    };
    calls.push(call);

    const route = routes[`${call.method} ${call.path}`];
    const response: MockResponse = route
      ? typeof route === 'function'
        ? await route(call)
        : route
      : { status: 404, body: { error: { code: 'NOT_FOUND', message: `No mock for ${call.method} ${call.path}` } } };

    if (response.delayMs) await new Promise((resolve) => setTimeout(resolve, response.delayMs));
    if (response.networkError) throw new TypeError('Failed to fetch');
    const text = response.raw ?? (response.body === undefined ? null : JSON.stringify(response.body));
    return new Response(text, {
      status: response.status ?? 200,
      headers: { 'Content-Type': response.raw ? 'text/html' : 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls };
}

/** Returns the given responses one per call, then keeps repeating the last one. */
export function sequence(...responses: MockResponse[]): MockHandler {
  let index = 0;
  return () => responses[Math.min(index++, responses.length - 1)];
}
```

`web/src/test/fixtures.ts`:
```ts
import type { DriverPool, DriverRider, Me, RelevantRequest, Ride, RidePool, Zone, ZoneRef } from '../api/types';

// The story cast, as the API returns them.

export const ZONES: Zone[] = [
  { id: 1, name: 'Banani', gridX: 0, gridY: 0 },
  { id: 2, name: 'Mohakhali', gridX: 0, gridY: -2 },
  { id: 3, name: 'Gulshan 1', gridX: 1, gridY: -2 },
  { id: 4, name: 'Gulshan 2', gridX: 1, gridY: 0 },
  { id: 9, name: 'Uttara', gridX: -3, gridY: 9 },
];

export function zoneRef(name: string): ZoneRef {
  const zone = ZONES.find((z) => z.name === name);
  if (!zone) throw new Error(`Unknown zone in fixture: ${name}`);
  return { id: zone.id, name: zone.name };
}

export const nusrat: Me = {
  id: 'user-nusrat', name: 'Nusrat', email: 'nusrat@teslapool.test', phone: '+8801711000001', role: 'PASSENGER', vehicle: null,
};

/** A new passenger who registers through the app. */
export const tania: Me = {
  id: 'user-tania', name: 'Tania', email: 'tania@teslapool.test', phone: null, role: 'PASSENGER', vehicle: null,
};

export const jashim: Me = {
  id: 'user-jashim', name: 'Jashim', email: 'jashim@teslapool.test', phone: '+8801811000001', role: 'DRIVER',
  vehicle: { id: 'vehicle-bullet', name: 'Bullet', plate: 'DHK-TESLA-11', capacity: 3, isOnline: false, currentZone: null },
};

export const jashimOnline: Me = {
  ...jashim,
  vehicle: { ...jashim.vehicle!, isOnline: true, currentZone: zoneRef('Banani') },
};

export const bulletPool = (overrides: Partial<RidePool> = {}): RidePool => ({
  id: 'pool-1', status: 'OPEN', driverName: 'Jashim', vehicleName: 'Bullet', vehiclePlate: 'DHK-TESLA-11', coRiderCount: 0,
  ...overrides,
});

/** Nusrat's Banani → Mohakhali trip: 2 km, ৳70.00 solo, ৳52.50 pooled. */
export const nusratRide = (overrides: Partial<Ride> = {}): Ride => ({
  id: 'ride-nusrat', status: 'REQUESTED', seats: 1, pickupZone: zoneRef('Banani'), dropoffZone: zoneRef('Mohakhali'),
  distanceKm: 2, estimate: { soloPaisa: 7000, pooledPaisa: 5250 }, fare: null, cancelledBy: null,
  createdAt: '2026-09-26T02:41:00.000Z', pool: null,
  ...overrides,
});

export const NUSRAT_POOLED_FARE = { basePaisa: 3000, distancePaisa: 4000, discountPaisa: 1750, totalPaisa: 5250 };

export const rider = (overrides: Partial<DriverRider> = {}): DriverRider => ({
  rideId: 'ride-nusrat', firstName: 'Nusrat', seats: 1, dropoffZone: zoneRef('Mohakhali'), status: 'MATCHED',
  estimatePaisa: 7000, fareTotalPaisa: null, leftReason: null,
  ...overrides,
});

export const rafiqRider = (overrides: Partial<DriverRider> = {}): DriverRider =>
  rider({ rideId: 'ride-rafiq', firstName: 'Rafiq', dropoffZone: zoneRef('Gulshan 1'), estimatePaisa: 6750, ...overrides });

export const driverPool = (overrides: Partial<DriverPool> = {}): DriverPool => ({
  id: 'pool-1', status: 'OPEN', capacity: 3, seatsTaken: 1, isFull: false, pickupZone: zoneRef('Banani'),
  vehicle: { name: 'Bullet', plate: 'DHK-TESLA-11' }, riders: [rider()],
  createdAt: '2026-09-26T02:42:00.000Z', startedAt: null, completedAt: null,
  ...overrides,
});

export const waitingRequest = (overrides: Partial<RelevantRequest> = {}): RelevantRequest => ({
  rideId: 'ride-nusrat', firstName: 'Nusrat', seats: 1, pickupZone: zoneRef('Banani'), dropoffZone: zoneRef('Mohakhali'),
  distanceKm: 2, estimateSoloPaisa: 7000, estimatePooledPaisa: 5250, requestedAt: '2026-09-26T02:41:00.000Z',
  ...overrides,
});
```

- [ ] **Step 2: Write the failing client tests**

`web/src/api/client.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { nusratRide } from '../test/fixtures';
import { mockApi } from '../test/mockApi';
import { apiFetch, setUnauthorizedHandler, tokenStore } from './client';
import { api } from './endpoints';

describe('apiFetch', () => {
  it('sends JSON with the bearer token and returns the parsed body', async () => {
    tokenStore.set('token-nusrat');
    const { calls } = mockApi({ 'POST /rides': { status: 201, body: nusratRide() } });

    const ride = await apiFetch<{ id: string }>('/rides', { method: 'POST', body: { seats: 1 } });

    expect(ride.id).toBe('ride-nusrat');
    expect(calls[0].headers.get('Authorization')).toBe('Bearer token-nusrat');
    expect(calls[0].headers.get('Content-Type')).toBe('application/json');
    expect(calls[0].body).toEqual({ seats: 1 });
  });

  it("turns the API's error envelope into an ApiError", async () => {
    mockApi({
      'POST /rides': {
        status: 409,
        body: { error: { code: 'ACTIVE_RIDE_EXISTS', message: 'You already have an active ride. Cancel it or wait until it completes' } },
      },
    });
    await expect(apiFetch('/rides', { method: 'POST', body: {} })).rejects.toMatchObject({
      status: 409,
      code: 'ACTIVE_RIDE_EXISTS',
      message: 'You already have an active ride. Cancel it or wait until it completes',
    });
  });

  it('explains that the server is unreachable', async () => {
    mockApi({ 'GET /rides': { networkError: true } });
    await expect(apiFetch('/rides')).rejects.toMatchObject({
      status: 0,
      code: 'NETWORK',
      message: "Can't reach the server. Check your connection and try again.",
    });
  });

  it('explains an HTML error page from a proxy (e.g. 502 during a cold start)', async () => {
    mockApi({ 'GET /rides': { status: 502, raw: '<html><body>Bad gateway</body></html>' } });
    await expect(apiFetch('/rides')).rejects.toMatchObject({ status: 502, code: 'SERVER_UNAVAILABLE' });
  });

  it('refuses an HTML page returned with 200 (a misconfigured API URL), instead of treating it as data', async () => {
    mockApi({ 'GET /rides': { status: 200, raw: '<!doctype html><div id="root"></div>' } });
    await expect(apiFetch('/rides')).rejects.toMatchObject({ code: 'SERVER_UNAVAILABLE' });
  });

  it('reports an expired session once, when a signed-in request gets 401', async () => {
    tokenStore.set('stale-token');
    const onUnauthorized = vi.fn();
    const unregister = setUnauthorizedHandler(onUnauthorized);
    mockApi({ 'GET /me': { status: 401, body: { error: { code: 'UNAUTHENTICATED', message: 'Your session has expired' } } } });

    await expect(apiFetch('/me')).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    unregister();
  });

  it('does not treat a wrong password as an expired session', async () => {
    const onUnauthorized = vi.fn();
    const unregister = setUnauthorizedHandler(onUnauthorized);
    mockApi({ 'POST /auth/login': { status: 401, body: { error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect' } } } });

    await expect(api.login('nusrat@teslapool.test', 'nope')).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(onUnauthorized).not.toHaveBeenCalled();
    unregister();
  });
});

describe('endpoints', () => {
  it("drives Jashim's pool through its own action endpoints", async () => {
    const { calls } = mockApi({ 'POST /pools/pool-1/start': { body: {} } });
    await api.poolAction('pool-1', 'start');
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/pools/pool-1/start' });
  });
});
```

Run: `npx vitest run src/api`
Expected: FAIL, because `./client` can't be resolved.

- [ ] **Step 3: Implement the client and the endpoints**

`web/src/api/client.ts`:
```ts
/** An error we can show to a person: the API's own message, or a friendly one for transport failures. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function toApiError(err: unknown): ApiError {
  return err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Something went wrong. Please try again.');
}

const BASE_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
const TOKEN_KEY = 'teslapool.token';

/** localStorage can throw (private mode, blocked storage), so every access is guarded. */
export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string): void {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      // The session then lasts only for this page load.
    }
  },
  clear(): void {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      // Nothing stored, nothing to clear.
    }
  },
};

let onUnauthorized: () => void = () => {};

/** AuthContext registers a handler so an expired session anywhere sends the user back to sign in. */
export function setUnauthorizedHandler(handler: () => void): () => void {
  onUnauthorized = handler;
  return () => {
    if (onUnauthorized === handler) onUnauthorized = () => {};
  };
}

interface ErrorEnvelope {
  error?: { code?: string; message?: string; details?: unknown };
}

const SERVER_TROUBLE = 'The server is having trouble. Please try again in a moment.';

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined; // an HTML error page, or index.html from a misconfigured host
  }
}

export async function apiFetch<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = tokenStore.get();
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/api${path}`, {
      method: options.method ?? 'GET',
      headers: {
        ...(options.body !== undefined && { 'Content-Type': 'application/json' }),
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', "Can't reach the server. Check your connection and try again.");
  }

  const payload = await readJson(res);
  if (!res.ok) {
    const envelope = (payload as ErrorEnvelope | undefined)?.error;
    if (res.status === 401 && token) onUnauthorized();
    throw new ApiError(res.status, envelope?.code ?? 'SERVER_UNAVAILABLE', envelope?.message ?? SERVER_TROUBLE, envelope?.details);
  }
  if (payload === undefined) throw new ApiError(res.status, 'SERVER_UNAVAILABLE', SERVER_TROUBLE);
  return payload as T;
}
```

`web/src/api/endpoints.ts`:
```ts
import { apiFetch } from './client';
import type {
  AuthResult,
  DriverPool,
  FareEstimate,
  Me,
  PoolAction,
  RegisterInput,
  RelevantRequest,
  Ride,
  RideDetail,
  TripInput,
  Vehicle,
  Zone,
} from './types';

const id = (value: string) => encodeURIComponent(value);

/** One function per API endpoint (spec §6). */
export const api = {
  login: (email: string, password: string) =>
    apiFetch<AuthResult>('/auth/login', { method: 'POST', body: { email, password } }),
  register: (input: RegisterInput) => apiFetch<AuthResult>('/auth/register', { method: 'POST', body: input }),
  me: () => apiFetch<Me>('/me'),

  zones: () => apiFetch<Zone[]>('/zones'),
  estimate: (trip: TripInput) => apiFetch<FareEstimate>('/fares/estimate', { method: 'POST', body: trip }),

  createRide: (trip: TripInput) => apiFetch<Ride>('/rides', { method: 'POST', body: trip }),
  rides: () => apiFetch<Ride[]>('/rides'),
  ride: (rideId: string) => apiFetch<RideDetail>(`/rides/${id(rideId)}`),
  cancelRide: (rideId: string) => apiFetch<Ride>(`/rides/${id(rideId)}/cancel`, { method: 'POST' }),

  setAvailability: (input: { online: boolean; zoneId?: number }) =>
    apiFetch<Vehicle>('/driver/availability', { method: 'PUT', body: input }),
  relevantRequests: () => apiFetch<RelevantRequest[]>('/driver/requests'),
  acceptRequest: (rideId: string) => apiFetch<DriverPool>(`/driver/requests/${id(rideId)}/accept`, { method: 'POST' }),
  driverPool: () => apiFetch<{ pool: DriverPool | null }>('/driver/pool'),
  driverHistory: () => apiFetch<DriverPool[]>('/driver/history'),
  poolAction: (poolId: string, action: PoolAction) =>
    apiFetch<DriverPool>(`/pools/${id(poolId)}/${action}`, { method: 'POST' }),
};
```

- [ ] **Step 4: Run the tests, type check and lint**

Run: `npx vitest run && npx tsc --noEmit && npx eslint .`
Expected: all tests pass (8 of them in `client.test.ts`), with no type or lint errors.

- [ ] **Step 5: Commit**

```bash
cd /home/dextro/Desktop/dhaka-tesla-pool
git add web/src
git commit -m "feat(web): add typed api client with friendly transport errors

Parses the API's error envelope, explains unreachable servers and HTML
error pages instead of crashing on JSON.parse, refuses a 200 that isn't
JSON, and reports expired sessions to a single handler.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 3: `useApi` hook and the loading, error and empty views

**Branch:** still `feature/web-foundation`

**Files:**
- Create: `web/src/hooks/useApi.ts`, `web/src/components/StateViews.tsx`, `web/src/components/Button.tsx`
- Test: `web/src/hooks/useApi.test.tsx`, `web/src/components/StateViews.test.tsx`

**Interfaces:**
- Consumes: `ApiError` and `toApiError` from Task 2.
- Produces:
  - `useApi<T>(fetcher: () => Promise<T>, options?: { pollMs?: number }): { data: T | undefined; error: ApiError | null; loading: boolean; refetch: () => Promise<void> }`
  - `Loading({ label? })`
  - `ErrorState({ error, onRetry? })`
  - `EmptyState({ title, hint? })`
  - `InlineError({ message })`
  - `StaleBanner()`
  - `Button` (props: `ButtonHTMLAttributes` plus `variant?: 'primary' | 'secondary' | 'danger'`, defaulting to `type="button"`)
  - `Card({ children, className? })`

- [ ] **Step 1: Write the failing tests**

`web/src/hooks/useApi.test.tsx`:
```tsx
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { useApi } from './useApi';

const offline = () => new ApiError(0, 'NETWORK', "Can't reach the server. Check your connection and try again.");

describe('useApi', () => {
  it('starts loading, then shows the data', async () => {
    const fetcher = vi.fn().mockResolvedValue(['Banani', 'Mohakhali']);
    const { result } = renderHook(() => useApi(fetcher));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.data).toEqual(['Banani', 'Mohakhali']));
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('reports an error, then recovers when retried', async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(offline()).mockResolvedValueOnce(['Banani']);
    const { result } = renderHook(() => useApi(fetcher));

    await waitFor(() => expect(result.current.error?.code).toBe('NETWORK'));
    expect(result.current.data).toBeUndefined();

    await act(() => result.current.refetch());
    expect(result.current.data).toEqual(['Banani']);
    expect(result.current.error).toBeNull();
  });

  it('keeps the last good data on screen when one poll fails, then recovers', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce('Matched')
      .mockRejectedValueOnce(offline())
      .mockResolvedValue('Bullet is here');
    const { result } = renderHook(() => useApi(fetcher, { pollMs: 20 }));

    await waitFor(() => expect(result.current.error?.code).toBe('NETWORK'));
    expect(result.current.data).toBe('Matched');

    await waitFor(() => expect(result.current.data).toBe('Bullet is here'));
    expect(result.current.error).toBeNull();
  });

  it('stops polling after the screen is closed', async () => {
    const fetcher = vi.fn().mockResolvedValue('ok');
    const { unmount } = renderHook(() => useApi(fetcher, { pollMs: 20 }));
    await waitFor(() => expect(fetcher.mock.calls.length).toBeGreaterThanOrEqual(2));

    unmount();
    const callsAtUnmount = fetcher.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(fetcher.mock.calls.length).toBe(callsAtUnmount);
  });

  it('runs a refetch that was asked for mid-load right after it, instead of dropping it', async () => {
    let answer = 'no ride yet';
    const fetcher = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      return answer;
    });
    const { result } = renderHook(() => useApi(fetcher));
    answer = 'Waiting for a Tesla'; // Nusrat just booked while the first load was still running
    await act(() => result.current.refetch());
    await waitFor(() => expect(result.current.data).toBe('Waiting for a Tesla'));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('never runs two polls at once when the server is slow', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const fetcher = vi.fn(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 60));
      inFlight -= 1;
      return 'ok';
    });
    const { unmount } = renderHook(() => useApi(fetcher, { pollMs: 10 }));
    await new Promise((resolve) => setTimeout(resolve, 200));
    unmount();
    expect(maxInFlight).toBe(1);
  });
});
```

`web/src/components/StateViews.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { EmptyState, ErrorState, InlineError, Loading } from './StateViews';

describe('state views', () => {
  it('announces loading', () => {
    render(<Loading label="Loading your ride…" />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading your ride…');
  });

  it("shows the error's message and retries on request", async () => {
    const onRetry = vi.fn();
    render(<ErrorState error={new ApiError(0, 'NETWORK', "Can't reach the server.")} onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent("Can't reach the server.");
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('shows an empty state with a hint', () => {
    render(<EmptyState title="No rides yet" hint="Your trips will show up here." />);
    expect(screen.getByText('No rides yet')).toBeInTheDocument();
    expect(screen.getByText('Your trips will show up here.')).toBeInTheDocument();
  });

  it('renders nothing for an empty inline error', () => {
    const { container } = render(<InlineError message={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

Run: `npx vitest run src/hooks src/components`
Expected: FAIL, because the modules can't be resolved.

- [ ] **Step 2: Implement the hook and the views**

`web/src/hooks/useApi.ts`:
```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { type ApiError, toApiError } from '../api/client';

export interface ApiState<T> {
  data: T | undefined;
  error: ApiError | null;
  loading: boolean;
  refetch: () => Promise<void>;
}

/**
 * Loads data once, and optionally polls it. A failed poll keeps the last good data (so the screen
 * never blanks on a network blip) and sets `error`; the next successful poll clears it.
 * Loads never overlap: a refetch asked for mid-load runs once, right after the current one.
 */
export function useApi<T>(fetcher: () => Promise<T>, options: { pollMs?: number } = {}): ApiState<T> {
  const { pollMs } = options;
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const queued = useRef(false);
  const [state, setState] = useState<{ data: T | undefined; error: ApiError | null; loading: boolean }>({
    data: undefined,
    error: null,
    loading: true,
  });

  const refetch = useCallback(async () => {
    if (inFlight.current) {
      queued.current = true; // never overlap, but don't drop it: e.g. "refresh after booking" must show the new ride
      return;
    }
    inFlight.current = true;
    setState((prev) => (prev.data === undefined ? { ...prev, loading: true } : prev));
    try {
      const data = await fetcherRef.current();
      if (mounted.current) setState({ data, error: null, loading: false });
    } catch (err) {
      if (mounted.current) setState((prev) => ({ ...prev, error: toApiError(err), loading: false }));
    } finally {
      inFlight.current = false;
      if (queued.current && mounted.current) {
        queued.current = false;
        void refetch();
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refetch();
    const timer = pollMs ? setInterval(() => void refetch(), pollMs) : undefined;
    return () => {
      mounted.current = false;
      if (timer) clearInterval(timer);
    };
  }, [refetch, pollMs]);

  return { ...state, refetch };
}
```

`web/src/components/Button.tsx`:
```tsx
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-red-700 text-white hover:bg-red-800',
  secondary: 'border border-stone-300 bg-white text-stone-800 hover:bg-stone-100',
  danger: 'border border-red-300 bg-white text-red-700 hover:bg-red-50',
};

export function Button({ variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`rounded-md px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-stone-200 bg-white p-5 shadow-sm ${className}`}>{children}</section>;
}
```

`web/src/components/StateViews.tsx`:
```tsx
import type { ApiError } from '../api/client';
import { Button, Card } from './Button';

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <p role="status" className="py-8 text-center text-sm text-stone-500">
      {label}
    </p>
  );
}

export function ErrorState({ error, onRetry }: { error: ApiError | Error; onRetry?: () => void }) {
  return (
    <Card className="border-red-200">
      <p role="alert" className="text-sm text-red-800">
        {error.message}
      </p>
      {onRetry && (
        <Button variant="secondary" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      )}
    </Card>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <Card className="text-center">
      <p className="font-medium text-stone-800">{title}</p>
      {hint && <p className="mt-1 text-sm text-stone-500">{hint}</p>}
    </Card>
  );
}

export function InlineError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
      {message}
    </p>
  );
}

/** Shown above live data when a poll fails: the data is the last good update, not current. */
export function StaleBanner() {
  return (
    <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
      Connection lost — showing the last update. Retrying…
    </p>
  );
}
```

- [ ] **Step 3: Run the tests, type check and lint**

Run: `npx vitest run && npx tsc --noEmit && npx eslint .`
Expected: all tests pass, with no type or lint errors.

- [ ] **Step 4: Commit**

```bash
cd /home/dextro/Desktop/dhaka-tesla-pool
git add web/src
git commit -m "feat(web): add useApi hook with polling and shared state views

Loading, error-with-retry and empty views for every screen. Polling
never overlaps and a failed poll keeps the last good data on screen.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 4: Auth — session context, sign-in with demo cast, register, route guards, layout

**Branch:** still `feature/web-foundation`

**Files:**
- Create: `web/src/auth/AuthContext.tsx`, `web/src/auth/RequireRole.tsx`, `web/src/auth/homePath.ts`, `web/src/auth/demoAccounts.ts`
- Create: `web/src/components/Layout.tsx`
- Create: `web/src/pages/LoginPage.tsx`, `web/src/pages/RegisterPage.tsx`, `web/src/pages/HomeRedirect.tsx`, `web/src/pages/NotFoundPage.tsx`
- Create (minimal pages, replaced in later tasks): `web/src/pages/passenger/RidePage.tsx`, `web/src/pages/passenger/HistoryPage.tsx`, `web/src/pages/driver/DriverPage.tsx`, `web/src/pages/driver/DriverHistoryPage.tsx`
- Create: `web/src/test/render.tsx`
- Modify: `web/src/App.tsx` (replace)
- Test: `web/src/auth/auth.test.tsx`

**Interfaces:**
- Consumes: `api`, `tokenStore`, `setUnauthorizedHandler`, `toApiError`, `ApiError`, `Loading`, `ErrorState`, `InlineError`, `Button`, `Card`.
- Produces:
  - `AuthProvider`
  - `useAuth(): AuthContextValue`, where the value is:
    ```ts
    {
      status: 'loading' | 'anonymous' | 'authenticated' | 'error';
      me: Me | null;
      notice: string | null;
      bootError: ApiError | null;
      login(email, password): Promise<Me>;
      register(input: RegisterInput): Promise<Me>;
      logout(notice?: string): void;
      refreshMe(): Promise<void>;
      retry(): Promise<void>;
    }
    ```
  - `SESSION_ENDED = 'Your session ended. Please sign in again.'`
  - `RequireRole({ role, children })`
  - `homePathFor(role: Role): '/ride' | '/driver'`
  - `DEMO_ACCOUNTS` and `DEMO_PASSWORD`
  - `Layout` (header plus `<Outlet/>`)
  - `App`
  - Test helpers: `renderApp(path?: string, options?: { signedIn?: boolean }): { user, ...RenderResult }` and `currentPath(): string | null`

- [ ] **Step 1: Write the render helper and the failing auth tests**

`web/src/test/render.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { tokenStore } from '../api/client';
import { App } from '../App';

function LocationProbe() {
  const { pathname } = useLocation();
  return <output data-testid="location">{pathname}</output>;
}

/** Renders the whole app (routing + auth) at `path`, like a browser tab would. */
export function renderApp(path = '/', { signedIn = false }: { signedIn?: boolean } = {}) {
  if (signedIn) tokenStore.set('test-token');
  const user = userEvent.setup();
  const utils = render(
    <MemoryRouter initialEntries={[path]}>
      <App />
      <LocationProbe />
    </MemoryRouter>,
  );
  return { user, ...utils };
}

export const currentPath = () => screen.getByTestId('location').textContent;
```

`web/src/auth/auth.test.tsx`:
```tsx
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { tokenStore } from '../api/client';
import { jashim, nusrat, tania } from '../test/fixtures';
import { mockApi, sequence } from '../test/mockApi';
import { currentPath, renderApp } from '../test/render';

const unauthorized = { status: 401, body: { error: { code: 'UNAUTHENTICATED', message: 'Your session has expired' } } };

describe('signing in', () => {
  it('sends anonymous visitors to the sign-in page', async () => {
    mockApi({});
    renderApp('/ride');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(currentPath()).toBe('/login');
  });

  it('signs Nusrat in with one tap and takes her to her ride', async () => {
    const { calls } = mockApi({
      'POST /auth/login': { body: { token: 'token-nusrat', user: nusrat } },
      'GET /me': { body: nusrat },
    });
    const { user } = renderApp('/login');

    await user.click(screen.getByRole('button', { name: /Sign in as Nusrat/ }));

    expect(await screen.findByText('Signed in as Nusrat')).toBeInTheDocument();
    expect(currentPath()).toBe('/ride');
    expect(tokenStore.get()).toBe('token-nusrat');
    expect(calls[0].body).toEqual({ email: 'nusrat@teslapool.test', password: 'bullet123' });
  });

  it('takes Jashim to the driver screen', async () => {
    mockApi({
      'POST /auth/login': { body: { token: 'token-jashim', user: jashim } },
      'GET /me': { body: jashim },
    });
    const { user } = renderApp('/login');

    await user.click(screen.getByRole('button', { name: /Sign in as Jashim/ }));

    expect(await screen.findByRole('link', { name: 'Drive' })).toBeInTheDocument();
    expect(currentPath()).toBe('/driver');
  });

  it("shows the API's message for a wrong password", async () => {
    mockApi({
      'POST /auth/login': { status: 401, body: { error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect' } } },
    });
    const { user } = renderApp('/login');

    await user.type(screen.getByLabelText('Email'), 'nusrat@teslapool.test');
    await user.type(screen.getByLabelText('Password'), 'not-it');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect');
    expect(currentPath()).toBe('/login');
  });
});

describe('saved sessions', () => {
  it('restores a saved session on reload', async () => {
    mockApi({ 'GET /me': { body: nusrat } });
    renderApp('/', { signedIn: true });
    await waitFor(() => expect(currentPath()).toBe('/ride'));
  });

  it('ends a session the server no longer accepts, with a clear message', async () => {
    mockApi({ 'GET /me': unauthorized });
    renderApp('/ride', { signedIn: true });

    expect(await screen.findByText('Your session ended. Please sign in again.')).toBeInTheDocument();
    expect(currentPath()).toBe('/login');
    expect(tokenStore.get()).toBeNull();
  });

  it('offers a retry when the server is unreachable at start-up', async () => {
    mockApi({ 'GET /me': sequence({ networkError: true }, { body: nusrat }) });
    const { user } = renderApp('/ride', { signedIn: true });

    expect(await screen.findByRole('alert')).toHaveTextContent("Can't reach the server");
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Signed in as Nusrat')).toBeInTheDocument();
  });

  it('keeps passengers out of the driver screens', async () => {
    mockApi({ 'GET /me': { body: nusrat } });
    renderApp('/driver', { signedIn: true });
    await waitFor(() => expect(currentPath()).toBe('/ride'));
  });

  it('signs out', async () => {
    mockApi({ 'GET /me': { body: nusrat } });
    const { user } = renderApp('/ride', { signedIn: true });

    await user.click(await screen.findByRole('button', { name: 'Sign out' }));

    expect(currentPath()).toBe('/login');
    expect(tokenStore.get()).toBeNull();
  });
});

describe('registering', () => {
  it('creates a passenger account and opens the ride screen', async () => {
    const { calls } = mockApi({
      'POST /auth/register': { status: 201, body: { token: 'token-tania', user: tania } },
      'GET /me': { body: tania },
    });
    const { user } = renderApp('/register');

    await user.type(screen.getByLabelText('Name'), 'Tania');
    await user.type(screen.getByLabelText('Email'), 'tania@teslapool.test');
    await user.type(screen.getByLabelText('Password'), 'rickshaw99');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(currentPath()).toBe('/ride'));
    expect(calls[0].body).toEqual({ name: 'Tania', email: 'tania@teslapool.test', password: 'rickshaw99' });
  });

  it('shows why registration failed', async () => {
    mockApi({
      'POST /auth/register': { status: 409, body: { error: { code: 'EMAIL_TAKEN', message: 'An account with this email already exists' } } },
    });
    const { user } = renderApp('/register');

    await user.type(screen.getByLabelText('Name'), 'Nusrat');
    await user.type(screen.getByLabelText('Email'), 'nusrat@teslapool.test');
    await user.type(screen.getByLabelText('Password'), 'rickshaw99');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('An account with this email already exists');
  });
});
```

Run: `npx vitest run src/auth`
Expected: FAIL, because the current `App` has no routes and `Sign in` is never rendered.

- [ ] **Step 2: Implement the auth context, guards and helpers**

`web/src/auth/homePath.ts`:
```ts
import type { Role } from '../api/types';

export const homePathFor = (role: Role) => (role === 'DRIVER' ? '/driver' : '/ride');
```

`web/src/auth/demoAccounts.ts`:
```ts
/** The story cast, one tap each. The demo password is the same seeded value documented in the README. */
export const DEMO_PASSWORD = 'bullet123';

export const DEMO_ACCOUNTS = [
  { name: 'Nusrat', email: 'nusrat@teslapool.test', blurb: 'Passenger · Banani → Mohakhali' },
  { name: 'Rafiq', email: 'rafiq@teslapool.test', blurb: 'Passenger · Banani → Gulshan 1' },
  { name: 'Shirin', email: 'shirin@teslapool.test', blurb: 'Passenger · wants the last seat' },
  { name: 'Jashim', email: 'jashim@teslapool.test', blurb: 'Driver · Bullet, 3 seats' },
  { name: 'Monir', email: 'monir@teslapool.test', blurb: 'Driver · Toofan, 2 seats' },
] as const;
```

`web/src/auth/AuthContext.tsx`:
```tsx
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { type ApiError, setUnauthorizedHandler, toApiError, tokenStore } from '../api/client';
import { api } from '../api/endpoints';
import type { Me, RegisterInput } from '../api/types';

export const SESSION_ENDED = 'Your session ended. Please sign in again.';

type AuthStatus = 'loading' | 'anonymous' | 'authenticated' | 'error';

export interface AuthContextValue {
  status: AuthStatus;
  me: Me | null;
  /** A message for the sign-in page, e.g. why the session ended. */
  notice: string | null;
  /** Why the saved session couldn't be checked (server unreachable). */
  bootError: ApiError | null;
  login(email: string, password: string): Promise<Me>;
  register(input: RegisterInput): Promise<Me>;
  logout(notice?: string): void;
  /** Reloads the signed-in user (e.g. after a driver goes online). Throws on failure. */
  refreshMe(): Promise<void>;
  /** Re-checks the saved session after a start-up failure. */
  retry(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(() => (tokenStore.get() ? 'loading' : 'anonymous'));
  const [me, setMe] = useState<Me | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [bootError, setBootError] = useState<ApiError | null>(null);

  const logout = useCallback((message?: string) => {
    tokenStore.clear();
    setMe(null);
    setStatus('anonymous');
    setNotice(message ?? null);
  }, []);

  /** Checks a saved token against the API: /me decides whether the session is still good. */
  const restoreSession = useCallback(async () => {
    if (!tokenStore.get()) {
      setStatus('anonymous');
      return;
    }
    setStatus('loading');
    try {
      setMe(await api.me());
      setBootError(null);
      setStatus('authenticated');
    } catch (err) {
      const error = toApiError(err);
      if (error.status === 401 || error.status === 404) logout(SESSION_ENDED); // expired, or the account is gone
      else {
        setBootError(error);
        setStatus('error');
      }
    }
  }, [logout]);

  useEffect(() => setUnauthorizedHandler(() => logout(SESSION_ENDED)), [logout]);

  useEffect(() => {
    void restoreSession();
  }, [restoreSession]);

  const startSession = useCallback(async (token: string) => {
    tokenStore.set(token);
    const current = await api.me(); // /me includes the driver's Tesla, which login's user doesn't
    setMe(current);
    setNotice(null);
    setStatus('authenticated');
    return current;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      me,
      notice,
      bootError,
      login: async (email, password) => startSession((await api.login(email, password)).token),
      register: async (input) => startSession((await api.register(input)).token),
      logout,
      refreshMe: async () => setMe(await api.me()),
      retry: restoreSession,
    }),
    [status, me, notice, bootError, startSession, logout, restoreSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
```

`web/src/auth/RequireRole.tsx`:
```tsx
import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import type { Role } from '../api/types';
import { ErrorState, Loading } from '../components/StateViews';
import { useAuth } from './AuthContext';
import { homePathFor } from './homePath';

/** Lets through only the given role. Everyone else goes to sign-in or to their own home screen. */
export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { status, me, bootError, retry } = useAuth();
  if (status === 'loading') return <Loading label="Checking your session…" />;
  if (status === 'error' && bootError) return <ErrorState error={bootError} onRetry={() => void retry()} />;
  if (!me) return <Navigate to="/login" replace />;
  if (me.role !== role) return <Navigate to={homePathFor(me.role)} replace />;
  return <>{children}</>;
}
```

- [ ] **Step 3: Implement the layout, pages and routes**

`web/src/components/Layout.tsx`:
```tsx
import { Link, NavLink, Outlet } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { Button } from './Button';

const PASSENGER_LINKS = [
  { to: '/ride', label: 'Ride' },
  { to: '/history', label: 'History' },
];
const DRIVER_LINKS = [
  { to: '/driver', label: 'Drive' },
  { to: '/driver/history', label: 'History' },
];

export function Layout() {
  const { me, logout } = useAuth();
  const links = me ? (me.role === 'DRIVER' ? DRIVER_LINKS : PASSENGER_LINKS) : [];

  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="font-semibold text-stone-900">
            🛺 Dhaka Tesla Pool
          </Link>
          {me && (
            <nav className="flex gap-1">
              {links.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end
                  className={({ isActive }) =>
                    `rounded-md px-3 py-1.5 text-sm ${isActive ? 'bg-red-50 font-medium text-red-800' : 'text-stone-600 hover:bg-stone-100'}`
                  }
                >
                  {link.label}
                </NavLink>
              ))}
            </nav>
          )}
          {me && (
            <div className="flex items-center gap-3 text-sm text-stone-600">
              <span>Signed in as {me.name}</span>
              <Button variant="secondary" onClick={() => logout()}>
                Sign out
              </Button>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
```

`web/src/pages/LoginPage.tsx`:
```tsx
import { type FormEvent, useState } from 'react';
import { Link, Navigate } from 'react-router';
import { toApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '../auth/demoAccounts';
import { homePathFor } from '../auth/homePath';
import { Button, Card } from '../components/Button';
import { InlineError } from '../components/StateViews';

const inputClass = 'mt-1 block w-full rounded-md border border-stone-300 px-3 py-2';

export function LoginPage() {
  const { status, me, notice, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === 'authenticated' && me) return <Navigate to={homePathFor(me.role)} replace />;

  async function signIn(emailToUse: string, passwordToUse: string) {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await login(emailToUse, passwordToUse); // once signed in, the <Navigate> above takes over
    } catch (err) {
      setError(toApiError(err).message);
      setPending(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void signIn(email, password);
  }

  return (
    <div className="mx-auto max-w-md space-y-4 px-4 py-10">
      <p className="text-center text-lg font-semibold">🛺 Dhaka Tesla Pool</p>
      <p className="text-center text-sm text-stone-500">Share a seat. Split the fare. Survive Dhaka traffic.</p>
      {notice && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{notice}</p>}

      <Card>
        <h1 className="text-xl font-semibold">Sign in</h1>
        <form className="mt-4 space-y-3" onSubmit={onSubmit}>
          <div>
            <label htmlFor="login-email" className="block text-sm font-medium">Email</label>
            <input id="login-email" type="email" autoComplete="email" required className={inputClass}
              value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label htmlFor="login-password" className="block text-sm font-medium">Password</label>
            <input id="login-password" type="password" autoComplete="current-password" required className={inputClass}
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
        <InlineError message={error} />
        <p className="mt-4 text-sm text-stone-600">
          New passenger? <Link to="/register" className="font-medium text-red-700 hover:underline">Create an account</Link>
        </p>
      </Card>

      <Card>
        <h2 className="font-medium">Try the story cast</h2>
        <p className="text-sm text-stone-500">Demo accounts, password <code>{DEMO_PASSWORD}</code>.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {DEMO_ACCOUNTS.map((account) => (
            <Button key={account.email} variant="secondary" disabled={pending} aria-label={`Sign in as ${account.name}`}
              className="text-left" onClick={() => void signIn(account.email, DEMO_PASSWORD)}>
              <span className="block font-medium">{account.name}</span>
              <span className="block text-xs font-normal text-stone-500">{account.blurb}</span>
            </Button>
          ))}
        </div>
      </Card>
    </div>
  );
}
```

`web/src/pages/RegisterPage.tsx`:
```tsx
import { type FormEvent, useState } from 'react';
import { Link, Navigate } from 'react-router';
import { type ApiError, toApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { homePathFor } from '../auth/homePath';
import { Button, Card } from '../components/Button';
import { InlineError } from '../components/StateViews';

const inputClass = 'mt-1 block w-full rounded-md border border-stone-300 px-3 py-2';

function fieldProblems(error: ApiError | null): string[] {
  if (!error || !Array.isArray(error.details)) return [];
  return (error.details as { path: string; message: string }[]).map((d) => `${d.path}: ${d.message}`);
}

export function RegisterPage() {
  const { status, me, register } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  if (status === 'authenticated' && me) return <Navigate to={homePathFor(me.role)} replace />;

  const update = (field: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [field]: e.target.value });

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await register({
        name: form.name,
        email: form.email,
        password: form.password,
        ...(form.phone.trim() && { phone: form.phone.trim() }),
      });
    } catch (err) {
      setError(toApiError(err));
      setPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-4 px-4 py-10">
      <Card>
        <h1 className="text-xl font-semibold">Create a passenger account</h1>
        <form className="mt-4 space-y-3" onSubmit={onSubmit}>
          <div>
            <label htmlFor="reg-name" className="block text-sm font-medium">Name</label>
            <input id="reg-name" required className={inputClass} value={form.name} onChange={update('name')} />
          </div>
          <div>
            <label htmlFor="reg-email" className="block text-sm font-medium">Email</label>
            <input id="reg-email" type="email" required autoComplete="email" className={inputClass} value={form.email} onChange={update('email')} />
          </div>
          <div>
            <label htmlFor="reg-phone" className="block text-sm font-medium">Phone (optional)</label>
            <input id="reg-phone" type="tel" autoComplete="tel" className={inputClass} value={form.phone} onChange={update('phone')} />
          </div>
          <div>
            <label htmlFor="reg-password" className="block text-sm font-medium">Password</label>
            <input id="reg-password" type="password" required minLength={8} autoComplete="new-password" className={inputClass}
              value={form.password} onChange={update('password')} />
          </div>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? 'Creating account…' : 'Create account'}
          </Button>
        </form>
        <InlineError message={error?.message ?? null} />
        {fieldProblems(error).length > 0 && (
          <ul className="mt-2 list-disc pl-5 text-sm text-red-800">
            {fieldProblems(error).map((problem) => <li key={problem}>{problem}</li>)}
          </ul>
        )}
        <p className="mt-4 text-sm text-stone-600">
          Already have an account? <Link to="/login" className="font-medium text-red-700 hover:underline">Sign in</Link>
        </p>
      </Card>
    </div>
  );
}
```

`web/src/pages/HomeRedirect.tsx`:
```tsx
import { Navigate } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { homePathFor } from '../auth/homePath';
import { ErrorState, Loading } from '../components/StateViews';

export function HomeRedirect() {
  const { status, me, bootError, retry } = useAuth();
  if (status === 'loading') return <Loading label="Checking your session…" />;
  if (status === 'error' && bootError) return <ErrorState error={bootError} onRetry={() => void retry()} />;
  return <Navigate to={me ? homePathFor(me.role) : '/login'} replace />;
}
```

`web/src/pages/NotFoundPage.tsx`:
```tsx
import { Link } from 'react-router';
import { EmptyState } from '../components/StateViews';

export function NotFoundPage() {
  return (
    <div className="space-y-3">
      <EmptyState title="Page not found" hint="That address doesn't exist in Dhaka Tesla Pool." />
      <p className="text-center text-sm">
        <Link to="/" className="font-medium text-red-700 hover:underline">Go home</Link>
      </p>
    </div>
  );
}
```

Minimal pages. Tasks 6, 7, 9 and 10 replace these:

`web/src/pages/passenger/RidePage.tsx`:
```tsx
export function RidePage() {
  return <h1 className="text-xl font-semibold">Your ride</h1>;
}
```

`web/src/pages/passenger/HistoryPage.tsx`:
```tsx
export function HistoryPage() {
  return <h1 className="text-xl font-semibold">Your rides</h1>;
}
```

`web/src/pages/driver/DriverPage.tsx`:
```tsx
export function DriverPage() {
  return <h1 className="text-xl font-semibold">Drive</h1>;
}
```

`web/src/pages/driver/DriverHistoryPage.tsx`:
```tsx
export function DriverHistoryPage() {
  return <h1 className="text-xl font-semibold">Past trips</h1>;
}
```

`web/src/App.tsx` (replace the whole file):
```tsx
import { Route, Routes } from 'react-router';
import { AuthProvider } from './auth/AuthContext';
import { RequireRole } from './auth/RequireRole';
import { Layout } from './components/Layout';
import { DriverHistoryPage } from './pages/driver/DriverHistoryPage';
import { DriverPage } from './pages/driver/DriverPage';
import { HomeRedirect } from './pages/HomeRedirect';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { HistoryPage } from './pages/passenger/HistoryPage';
import { RidePage } from './pages/passenger/RidePage';
import { RegisterPage } from './pages/RegisterPage';

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route element={<Layout />}>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/ride" element={<RequireRole role="PASSENGER"><RidePage /></RequireRole>} />
          <Route path="/history" element={<RequireRole role="PASSENGER"><HistoryPage /></RequireRole>} />
          <Route path="/driver" element={<RequireRole role="DRIVER"><DriverPage /></RequireRole>} />
          <Route path="/driver/history" element={<RequireRole role="DRIVER"><DriverHistoryPage /></RequireRole>} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
```

- [ ] **Step 4: Run the tests, type check and lint**

Run: `npx vitest run && npx tsc --noEmit && npx eslint .`
Expected: all tests pass (12 of them in `auth.test.tsx`), with no type or lint errors.

- [ ] **Step 5: Commit**

```bash
cd /home/dextro/Desktop/dhaka-tesla-pool
git add web/src
git commit -m "feat(auth): add sign-in with the demo cast, registration and route guards

A saved token is checked against /me on load; an expired or orphaned
session returns to sign-in with a clear message, and an unreachable
server offers a retry instead of a spinner. Passengers and drivers
only reach their own screens.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Close the branch**

Follow the Branch close procedure with:
- `<branch>`: `feature/web-foundation`
- `<title>`: `Web foundation: client, auth, layout, state views`
- `<summary>`: `React + Vite + Tailwind scaffold, typed API client with friendly transport errors, useApi with polling, sign-in with the story cast, route guards.`

---

## Task 5: Active ride card — status, pool, fare, cancel

**Branch:** `git checkout master && git pull --ff-only && git checkout -b feature/web-passenger`

**Files:**
- Create: `web/src/components/StatusStepper.tsx`, `web/src/components/FareBreakdown.tsx`, `web/src/pages/passenger/ActiveRideCard.tsx`
- Test: `web/src/pages/passenger/ActiveRideCard.test.tsx`

**Interfaces:**
- Consumes: `api.cancelRide`, `toApiError`, `rideStatusLabel`, `canCancelRide`, `RIDE_STEPS`, `formatTaka`, `Button`, `Card`, `InlineError`, and the fixtures.
- Produces:
  - `StatusStepper({ status: RideStatus })`
  - `FareBreakdown({ fare: FareBreakdown, distanceKm: number })`
  - `ActiveRideCard({ ride: Ride, onChanged: () => Promise<void> | void })`

- [ ] **Step 1: Write the failing tests**

`web/src/pages/passenger/ActiveRideCard.test.tsx`:
```tsx
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { bulletPool, NUSRAT_POOLED_FARE, nusratRide } from '../../test/fixtures';
import { mockApi } from '../../test/mockApi';
import { ActiveRideCard } from './ActiveRideCard';

describe('ActiveRideCard', () => {
  it('says it is still looking while no Tesla has matched', () => {
    render(<ActiveRideCard ride={nusratRide()} onChanged={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Waiting for a Tesla' })).toBeInTheDocument();
    expect(screen.getByText('Looking for a Tesla in Banani…')).toBeInTheDocument();
    expect(screen.getByText('Estimated fare: ৳70.00 solo · ৳52.50 if someone shares')).toBeInTheDocument();
  });

  it('shows who is driving and how many share the ride, but not who they are', () => {
    render(<ActiveRideCard ride={nusratRide({ status: 'MATCHED', pool: bulletPool({ coRiderCount: 1 }) })} onChanged={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Matched' })).toBeInTheDocument();
    expect(screen.getByText('Jashim is driving Bullet (DHK-TESLA-11)')).toBeInTheDocument();
    expect(screen.getByText('Sharing with 1 other passenger')).toBeInTheDocument();
    expect(screen.getByText('Estimated fare: ৳52.50 (pooled)')).toBeInTheDocument();
  });

  it('says "Bullet is here" when Jashim has arrived, and marks that step', () => {
    render(<ActiveRideCard ride={nusratRide({ status: 'DRIVER_ARRIVED', pool: bulletPool({ status: 'DRIVER_ARRIVED' }) })} onChanged={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Bullet is here' })).toBeInTheDocument();
    const progress = screen.getByRole('list', { name: 'Ride progress' });
    expect(within(progress).getByText('Arrived')).toHaveAttribute('aria-current', 'step');
  });

  it('shows the locked fare once the trip starts, and no cancel button', () => {
    render(
      <ActiveRideCard
        ride={nusratRide({ status: 'STARTED', fare: NUSRAT_POOLED_FARE, pool: bulletPool({ status: 'STARTED', coRiderCount: 1 }) })}
        onChanged={vi.fn()}
      />,
    );
    expect(screen.getByText('Base fare')).toBeInTheDocument();
    expect(screen.getByText('৳30.00')).toBeInTheDocument();
    expect(screen.getByText('Distance (2 km)')).toBeInTheDocument();
    expect(screen.getByText('৳40.00')).toBeInTheDocument();
    expect(screen.getByText('-৳17.50')).toBeInTheDocument();
    expect(screen.getByText('Pay ৳52.50 in cash at drop-off.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel ride' })).not.toBeInTheDocument();
  });

  it('asks for confirmation, then cancels and refreshes', async () => {
    const { calls } = mockApi({ 'POST /rides/ride-nusrat/cancel': { body: nusratRide({ status: 'CANCELLED' }) } });
    const onChanged = vi.fn();
    render(<ActiveRideCard ride={nusratRide({ status: 'MATCHED', pool: bulletPool() })} onChanged={onChanged} />);

    await userEvent.click(screen.getByRole('button', { name: 'Cancel ride' }));
    expect(calls).toHaveLength(0); // nothing is sent until the passenger confirms
    await userEvent.click(screen.getByRole('button', { name: 'Yes, cancel' }));

    expect(calls).toHaveLength(1);
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("explains a cancel that lost a race with Jashim's Start, and refreshes", async () => {
    mockApi({
      'POST /rides/ride-nusrat/cancel': {
        status: 409,
        body: { error: { code: 'INVALID_TRANSITION', message: 'Your ride changed while you were cancelling. Refresh and try again' } },
      },
    });
    const onChanged = vi.fn();
    render(<ActiveRideCard ride={nusratRide({ status: 'DRIVER_ARRIVED', pool: bulletPool() })} onChanged={onChanged} />);

    await userEvent.click(screen.getByRole('button', { name: 'Cancel ride' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, cancel' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Your ride changed while you were cancelling');
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });
});
```

Run: `npx vitest run src/pages/passenger`
Expected: FAIL, because `./ActiveRideCard` can't be resolved.

- [ ] **Step 2: Implement the stepper, the fare breakdown and the card**

`web/src/components/StatusStepper.tsx`:
```tsx
import type { RideStatus } from '../api/types';
import { RIDE_STEPS } from '../lib/status';

export function StatusStepper({ status }: { status: RideStatus }) {
  if (status === 'CANCELLED') return <p className="text-sm text-stone-500">This ride was cancelled.</p>;
  const current = RIDE_STEPS.findIndex((step) => step.status === status);
  return (
    <ol aria-label="Ride progress" className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
      {RIDE_STEPS.map((step, index) => (
        <li
          key={step.status}
          aria-current={index === current ? 'step' : undefined}
          className={index <= current ? 'font-medium text-red-700' : 'text-stone-400'}
        >
          {index > 0 && <span aria-hidden="true" className="mr-3 text-stone-300">→</span>}
          {step.label}
        </li>
      ))}
    </ol>
  );
}
```

`web/src/components/FareBreakdown.tsx`:
```tsx
import type { FareBreakdown as Fare } from '../api/types';
import { formatTaka } from '../lib/format';

export function FareBreakdown({ fare, distanceKm }: { fare: Fare; distanceKm: number }) {
  const rows = [
    { label: 'Base fare', value: formatTaka(fare.basePaisa) },
    { label: `Distance (${distanceKm} km)`, value: formatTaka(fare.distancePaisa) },
    ...(fare.discountPaisa > 0 ? [{ label: 'Pool discount', value: formatTaka(-fare.discountPaisa) }] : []),
  ];
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
      {rows.map((row) => (
        <div key={row.label} className="contents">
          <dt className="text-stone-600">{row.label}</dt>
          <dd className="text-right tabular-nums">{row.value}</dd>
        </div>
      ))}
      <dt className="border-t border-stone-200 pt-1 font-medium">Total</dt>
      <dd className="border-t border-stone-200 pt-1 text-right font-semibold tabular-nums">{formatTaka(fare.totalPaisa)}</dd>
    </dl>
  );
}
```

`web/src/pages/passenger/ActiveRideCard.tsx`:
```tsx
import { useRef, useState } from 'react';
import { toApiError } from '../../api/client';
import { api } from '../../api/endpoints';
import type { Ride } from '../../api/types';
import { Button, Card } from '../../components/Button';
import { FareBreakdown } from '../../components/FareBreakdown';
import { InlineError } from '../../components/StateViews';
import { StatusStepper } from '../../components/StatusStepper';
import { formatTaka } from '../../lib/format';
import { canCancelRide, rideStatusLabel } from '../../lib/status';

function sharingText(coRiderCount: number): string {
  if (coRiderCount === 0) return 'Just you so far. Riders heading your way can still join.';
  return `Sharing with ${coRiderCount} other ${coRiderCount === 1 ? 'passenger' : 'passengers'}`;
}

function estimateText(ride: Ride): string {
  const { soloPaisa, pooledPaisa } = ride.estimate;
  if (ride.pool && ride.pool.coRiderCount > 0) return `Estimated fare: ${formatTaka(pooledPaisa)} (pooled)`;
  return `Estimated fare: ${formatTaka(soloPaisa)} solo · ${formatTaka(pooledPaisa)} if someone shares`;
}

export function ActiveRideCard({ ride, onChanged }: { ride: Ride; onChanged: () => Promise<void> | void }) {
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function cancel() {
    if (inFlight.current) return;
    inFlight.current = true;
    setCancelling(true);
    setError(null);
    try {
      await api.cancelRide(ride.id);
    } catch (err) {
      setError(toApiError(err).message);
    } finally {
      inFlight.current = false;
      setCancelling(false);
      setConfirming(false);
      await onChanged(); // the API is the source of truth, so show whatever it says now
    }
  }

  return (
    <Card className="space-y-4">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">{rideStatusLabel(ride.status, ride.pool?.vehicleName)}</h1>
        <StatusStepper status={ride.status} />
      </div>

      <p className="text-sm text-stone-700">
        {ride.pickupZone.name} → {ride.dropoffZone.name} · {ride.distanceKm} km · {ride.seats} {ride.seats === 1 ? 'seat' : 'seats'}
      </p>

      {ride.pool ? (
        <div className="space-y-1 text-sm">
          <p className="font-medium">{`${ride.pool.driverName} is driving ${ride.pool.vehicleName} (${ride.pool.vehiclePlate})`}</p>
          <p className="text-stone-600">{sharingText(ride.pool.coRiderCount)}</p>
        </div>
      ) : (
        <p className="text-sm text-stone-600">{`Looking for a Tesla in ${ride.pickupZone.name}…`}</p>
      )}

      {ride.fare ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Your fare (locked when the trip started)</p>
          <FareBreakdown fare={ride.fare} distanceKm={ride.distanceKm} />
          <p className="text-sm text-stone-600">{`Pay ${formatTaka(ride.fare.totalPaisa)} in cash at drop-off.`}</p>
        </div>
      ) : (
        <p className="text-sm">{estimateText(ride)}</p>
      )}

      {canCancelRide(ride.status) &&
        (confirming ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm">Cancel this ride?</span>
            <Button variant="danger" disabled={cancelling} onClick={() => void cancel()}>
              {cancelling ? 'Cancelling…' : 'Yes, cancel'}
            </Button>
            <Button variant="secondary" disabled={cancelling} onClick={() => setConfirming(false)}>
              Keep my ride
            </Button>
          </div>
        ) : (
          <Button variant="danger" onClick={() => setConfirming(true)}>
            Cancel ride
          </Button>
        ))}

      <InlineError message={error} />
    </Card>
  );
}
```

- [ ] **Step 3: Run the tests, type check and lint**

Run: `npx vitest run && npx tsc --noEmit && npx eslint .`
Expected: all tests pass, with no type or lint errors.

- [ ] **Step 4: Commit**

```bash
cd /home/dextro/Desktop/dhaka-tesla-pool
git add web/src
git commit -m "feat(ride): show a passenger's active ride, fare and cancel option

Progress steps, who is driving, how many share (never who), estimate
before the start and the locked fare breakdown after it. Cancel needs
a confirmation and a lost race shows the API's message and refreshes.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 6: Request form and the live ride page

**Branch:** still `feature/web-passenger`

**Files:**
- Create: `web/src/components/ZoneSelect.tsx`, `web/src/pages/passenger/RequestRideForm.tsx`
- Modify: `web/src/pages/passenger/RidePage.tsx` (replace)
- Test: `web/src/pages/passenger/RidePage.test.tsx`

**Interfaces:**
- Consumes: `useApi`, `POLL_MS`, `api.zones`, `api.estimate`, `api.createRide`, `api.rides`, `ActiveRideCard`, `isActiveRide`, `rideStatusLabel`, `formatTaka`, the state views, `renderApp` and `mockApi`.
- Produces:
  - `ZoneSelect({ id, label, zones, value: number | '', onChange })`
  - `RequestRideForm({ onRequested, lastRide? })`
  - `RidePage`

- [ ] **Step 1: Write the failing page tests**

`web/src/pages/passenger/RidePage.test.tsx`:
```tsx
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Ride } from '../../api/types';
import { bulletPool, NUSRAT_POOLED_FARE, nusrat, nusratRide, ZONES } from '../../test/fixtures';
import { mockApi, sequence } from '../../test/mockApi';
import { renderApp } from '../../test/render';

vi.mock('../../lib/polling', () => ({ POLL_MS: 25 }));

const estimate = { body: { distanceKm: 2, soloPaisa: 7000, pooledPaisa: 5250 } };

describe('the passenger ride page', () => {
  it('quotes both prices and books Banani → Mohakhali', async () => {
    let rides: Ride[] = [];
    const { calls } = mockApi({
      'GET /me': { body: nusrat },
      'GET /rides': () => ({ body: rides }),
      'GET /zones': { body: ZONES },
      'POST /fares/estimate': estimate,
      'POST /rides': () => {
        rides = [nusratRide()];
        return { status: 201, body: rides[0] };
      },
    });
    const { user } = renderApp('/ride', { signedIn: true });

    await user.selectOptions(await screen.findByLabelText('Pickup'), 'Banani');
    await user.selectOptions(screen.getByLabelText('Drop-off'), 'Mohakhali');
    expect(await screen.findByText('৳70.00 solo · ৳52.50 if pooled')).toBeInTheDocument();
    expect(screen.getByText('2 km')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Request ride' }));

    expect(await screen.findByRole('heading', { name: 'Waiting for a Tesla' })).toBeInTheDocument();
    const booking = calls.find((call) => call.method === 'POST' && call.path === '/rides');
    expect(booking?.body).toEqual({ pickupZoneId: 1, dropoffZoneId: 2, seats: 1 });
  });

  it('will not book a trip that starts and ends in the same zone', async () => {
    const { calls } = mockApi({ 'GET /me': { body: nusrat }, 'GET /rides': { body: [] }, 'GET /zones': { body: ZONES } });
    const { user } = renderApp('/ride', { signedIn: true });

    await user.selectOptions(await screen.findByLabelText('Pickup'), 'Banani');
    await user.selectOptions(screen.getByLabelText('Drop-off'), 'Banani');

    expect(screen.getByText('Pick a different drop-off zone.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Request ride' })).toBeDisabled();
    expect(calls.some((call) => call.path === '/fares/estimate')).toBe(false);
  });

  it('sends exactly one booking when Request ride is double-clicked', async () => {
    const { calls } = mockApi({
      'GET /me': { body: nusrat },
      'GET /rides': { body: [] },
      'GET /zones': { body: ZONES },
      'POST /fares/estimate': estimate,
      'POST /rides': { status: 201, body: nusratRide(), delayMs: 100 },
    });
    const { user } = renderApp('/ride', { signedIn: true });

    await user.selectOptions(await screen.findByLabelText('Pickup'), 'Banani');
    await user.selectOptions(screen.getByLabelText('Drop-off'), 'Mohakhali');
    await user.dblClick(screen.getByRole('button', { name: 'Request ride' }));

    await waitFor(() => expect(calls.filter((call) => call.method === 'POST' && call.path === '/rides')).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(calls.filter((call) => call.method === 'POST' && call.path === '/rides')).toHaveLength(1);
  });

  it('shows why a booking failed', async () => {
    mockApi({
      'GET /me': { body: nusrat },
      'GET /rides': { body: [] },
      'GET /zones': { body: ZONES },
      'POST /fares/estimate': estimate,
      'POST /rides': {
        status: 409,
        body: { error: { code: 'ACTIVE_RIDE_EXISTS', message: 'You already have an active ride. Cancel it or wait until it completes' } },
      },
    });
    const { user } = renderApp('/ride', { signedIn: true });

    await user.selectOptions(await screen.findByLabelText('Pickup'), 'Banani');
    await user.selectOptions(screen.getByLabelText('Drop-off'), 'Mohakhali');
    await user.click(screen.getByRole('button', { name: 'Request ride' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('You already have an active ride');
  });

  it('shows the active ride instead of the form', async () => {
    mockApi({
      'GET /me': { body: nusrat },
      'GET /rides': { body: [nusratRide({ status: 'MATCHED', pool: bulletPool({ coRiderCount: 1 }) })] },
    });
    renderApp('/ride', { signedIn: true });

    expect(await screen.findByRole('heading', { name: 'Matched' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Request ride' })).not.toBeInTheDocument();
  });

  it('keeps the last update on screen when the connection drops', async () => {
    mockApi({
      'GET /me': { body: nusrat },
      'GET /rides': sequence({ body: [nusratRide({ status: 'MATCHED', pool: bulletPool() })] }, { networkError: true }),
    });
    renderApp('/ride', { signedIn: true });

    expect(await screen.findByText('Connection lost — showing the last update. Retrying…')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Matched' })).toBeInTheDocument();
  });

  it('shows how the last ride ended above the form', async () => {
    mockApi({
      'GET /me': { body: nusrat },
      'GET /rides': { body: [nusratRide({ status: 'COMPLETED', fare: NUSRAT_POOLED_FARE })] },
      'GET /zones': { body: ZONES },
    });
    renderApp('/ride', { signedIn: true });

    expect(await screen.findByText('Last ride: Banani → Mohakhali · Completed · ৳52.50')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Request ride' })).toBeInTheDocument();
  });

  it('offers a retry when the rides cannot be loaded', async () => {
    mockApi({ 'GET /me': { body: nusrat }, 'GET /rides': { networkError: true } });
    renderApp('/ride', { signedIn: true });
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
```

Run: `npx vitest run src/pages/passenger/RidePage.test.tsx`
Expected: FAIL. The minimal page from Task 4 has no Pickup field.

- [ ] **Step 2: Implement the zone picker, the form and the page**

`web/src/components/ZoneSelect.tsx`:
```tsx
import type { Zone } from '../api/types';

export function ZoneSelect({ id, label, zones, value, onChange, disabled }: {
  id: string;
  label: string;
  zones: Zone[];
  value: number | '';
  onChange: (zoneId: number | '') => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">{label}</label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value === '' ? '' : Number(event.target.value))}
        className="mt-1 block w-full rounded-md border border-stone-300 bg-white px-3 py-2"
      >
        <option value="">Choose a zone</option>
        {zones.map((zone) => (
          <option key={zone.id} value={zone.id}>{zone.name}</option>
        ))}
      </select>
    </div>
  );
}
```

`web/src/pages/passenger/RequestRideForm.tsx`:
```tsx
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { toApiError } from '../../api/client';
import { api } from '../../api/endpoints';
import type { FareEstimate, Ride } from '../../api/types';
import { Button, Card } from '../../components/Button';
import { ErrorState, InlineError, Loading } from '../../components/StateViews';
import { ZoneSelect } from '../../components/ZoneSelect';
import { useApi } from '../../hooks/useApi';
import { formatTaka } from '../../lib/format';
import { rideStatusLabel } from '../../lib/status';

function lastRideText(ride: Ride): string {
  const amount = ride.fare ? ` · ${formatTaka(ride.fare.totalPaisa)}` : '';
  return `Last ride: ${ride.pickupZone.name} → ${ride.dropoffZone.name} · ${rideStatusLabel(ride.status)}${amount}`;
}

export function RequestRideForm({ onRequested, lastRide }: { onRequested: () => Promise<void> | void; lastRide?: Ride }) {
  const zones = useApi(api.zones);
  const [pickupZoneId, setPickupZoneId] = useState<number | ''>('');
  const [dropoffZoneId, setDropoffZoneId] = useState<number | ''>('');
  const [seats, setSeats] = useState(1);
  const [estimate, setEstimate] = useState<FareEstimate | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const sameZone = pickupZoneId !== '' && pickupZoneId === dropoffZoneId;
  const ready = pickupZoneId !== '' && dropoffZoneId !== '' && !sameZone;

  useEffect(() => {
    if (pickupZoneId === '' || dropoffZoneId === '' || pickupZoneId === dropoffZoneId) {
      setEstimate(null);
      return;
    }
    let stale = false;
    api
      .estimate({ pickupZoneId, dropoffZoneId, seats })
      .then((result) => !stale && setEstimate(result))
      .catch(() => !stale && setEstimate(null));
    return () => {
      stale = true; // a newer choice replaced this one before the answer came back
    };
  }, [pickupZoneId, dropoffZoneId, seats]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!ready || inFlight.current) return; // a double click sends one booking
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await api.createRide({ pickupZoneId, dropoffZoneId, seats });
      await onRequested();
    } catch (err) {
      setError(toApiError(err).message);
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  if (zones.loading && !zones.data) return <Loading label="Loading Dhaka's zones…" />;
  if (!zones.data) return <ErrorState error={zones.error!} onRetry={() => void zones.refetch()} />;

  return (
    <div className="space-y-4">
      {lastRide && <p className="rounded-md bg-stone-100 px-3 py-2 text-sm text-stone-700">{lastRideText(lastRide)}</p>}
      <Card>
        <h1 className="text-xl font-semibold">Where to?</h1>
        <form className="mt-4 space-y-3" onSubmit={onSubmit}>
          <ZoneSelect id="pickup" label="Pickup" zones={zones.data} value={pickupZoneId} onChange={setPickupZoneId} />
          <ZoneSelect id="dropoff" label="Drop-off" zones={zones.data} value={dropoffZoneId} onChange={setDropoffZoneId} />
          {sameZone && <p className="text-sm text-red-700">Pick a different drop-off zone.</p>}
          <div>
            <label htmlFor="seats" className="block text-sm font-medium">Seats</label>
            <select id="seats" value={seats} onChange={(e) => setSeats(Number(e.target.value))}
              className="mt-1 block w-full rounded-md border border-stone-300 bg-white px-3 py-2">
              {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          {estimate && (
            <div className="rounded-md bg-stone-50 px-3 py-2 text-sm">
              <p className="font-medium">{`${formatTaka(estimate.soloPaisa)} solo · ${formatTaka(estimate.pooledPaisa)} if pooled`}</p>
              <p className="text-stone-500">{`${estimate.distanceKm} km`}</p>
            </div>
          )}

          <Button type="submit" disabled={!ready || submitting} className="w-full">
            {submitting ? 'Requesting…' : 'Request ride'}
          </Button>
        </form>
        <InlineError message={error} />
      </Card>
    </div>
  );
}
```

`web/src/pages/passenger/RidePage.tsx` (replace the whole file):
```tsx
import { api } from '../../api/endpoints';
import { ErrorState, Loading, StaleBanner } from '../../components/StateViews';
import { useApi } from '../../hooks/useApi';
import { POLL_MS } from '../../lib/polling';
import { isActiveRide } from '../../lib/status';
import { ActiveRideCard } from './ActiveRideCard';
import { RequestRideForm } from './RequestRideForm';

export function RidePage() {
  const rides = useApi(api.rides, { pollMs: POLL_MS });

  if (rides.loading && !rides.data) return <Loading label="Loading your ride…" />;
  if (!rides.data) return <ErrorState error={rides.error!} onRetry={() => void rides.refetch()} />;

  const active = rides.data.find((ride) => isActiveRide(ride.status));
  return (
    <>
      {rides.error && <StaleBanner />}
      {active ? (
        <ActiveRideCard ride={active} onChanged={rides.refetch} />
      ) : (
        <RequestRideForm onRequested={rides.refetch} lastRide={rides.data[0]} />
      )}
    </>
  );
}
```

- [ ] **Step 3: Run the tests, type check and lint**

Run: `npx vitest run && npx tsc --noEmit && npx eslint .`
Expected: all tests pass, with no type or lint errors.

- [ ] **Step 4: Commit**

```bash
cd /home/dextro/Desktop/dhaka-tesla-pool
git add web/src
git commit -m "feat(ride): let passengers request a ride and follow it live

Both fare estimates before booking, a same-zone guard, one booking per
double click, and a ride page that polls every 3 seconds and keeps the
last update on screen if the connection drops.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 7: Passenger history with the event timeline

**Branch:** still `feature/web-passenger`

**Files:**
- Create: `web/src/lib/events.ts`, `web/src/components/EventTimeline.tsx`
- Modify: `web/src/pages/passenger/HistoryPage.tsx` (replace)
- Test: `web/src/pages/passenger/HistoryPage.test.tsx`

**Interfaces:**
- Consumes: `api.rides`, `api.ride`, `useApi`, `formatTaka`, `formatDateTime`, `formatTime`, `rideStatusLabel`, `Button`, `Card` and the state views.
- Produces:
  - `describeEvent(event: RideEvent): string`
  - `EventTimeline({ events: RideEvent[] })`
  - `HistoryPage`

- [ ] **Step 1: Write the failing tests**

`web/src/pages/passenger/HistoryPage.test.tsx`:
```tsx
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { RideEvent } from '../../api/types';
import { bulletPool, NUSRAT_POOLED_FARE, nusrat, nusratRide } from '../../test/fixtures';
import { mockApi, sequence } from '../../test/mockApi';
import { renderApp } from '../../test/render';

const at = (minute: number) => `2026-09-25T02:${String(minute).padStart(2, '0')}:00.000Z`;
const yesterdaysEvents: RideEvent[] = [
  { type: 'RIDE_REQUESTED', fromStatus: null, toStatus: 'REQUESTED', actor: 'PASSENGER', createdAt: at(41) },
  { type: 'RIDE_MATCHED', fromStatus: 'REQUESTED', toStatus: 'MATCHED', actor: 'DRIVER', createdAt: at(42) },
  { type: 'RIDE_STATUS_CHANGED', fromStatus: 'MATCHED', toStatus: 'DRIVER_ARRIVED', actor: 'DRIVER', createdAt: at(44) },
  { type: 'RIDE_STATUS_CHANGED', fromStatus: 'DRIVER_ARRIVED', toStatus: 'STARTED', actor: 'DRIVER', createdAt: at(46) },
  { type: 'RIDE_STATUS_CHANGED', fromStatus: 'STARTED', toStatus: 'COMPLETED', actor: 'DRIVER', createdAt: at(58) },
];
const completed = nusratRide({ status: 'COMPLETED', fare: NUSRAT_POOLED_FARE, pool: bulletPool({ status: 'COMPLETED', coRiderCount: 1 }) });

describe('passenger history', () => {
  it('says so when there are no rides yet', async () => {
    mockApi({ 'GET /me': { body: nusrat }, 'GET /rides': { body: [] } });
    renderApp('/history', { signedIn: true });
    expect(await screen.findByText('No rides yet')).toBeInTheDocument();
  });

  it("lists yesterday's pooled ride with its fare, and explains exactly what happened", async () => {
    mockApi({
      'GET /me': { body: nusrat },
      'GET /rides': { body: [completed] },
      'GET /rides/ride-nusrat': { body: { ...completed, events: yesterdaysEvents } },
    });
    const { user } = renderApp('/history', { signedIn: true });

    expect(await screen.findByText('Banani → Mohakhali')).toBeInTheDocument();
    expect(screen.getByText('Completed · ৳52.50')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Details' }));

    expect(await screen.findByText('You requested the ride')).toBeInTheDocument();
    expect(screen.getByText('The driver accepted your ride')).toBeInTheDocument();
    expect(screen.getByText('Your Tesla arrived at the pickup')).toBeInTheDocument();
    expect(screen.getByText('Trip started and your fare was locked')).toBeInTheDocument();
    expect(screen.getByText('Trip completed')).toBeInTheDocument();
  });

  it('describes an automatic match and a driver cancellation in plain words', async () => {
    const requeued = nusratRide();
    mockApi({
      'GET /me': { body: nusrat },
      'GET /rides': { body: [nusratRide({ status: 'CANCELLED', cancelledBy: 'PASSENGER' })] },
      'GET /rides/ride-nusrat': {
        body: {
          ...requeued,
          events: [
            { type: 'RIDE_MATCHED', fromStatus: 'REQUESTED', toStatus: 'MATCHED', actor: 'SYSTEM', createdAt: at(43) },
            { type: 'RIDE_REQUEUED', fromStatus: 'MATCHED', toStatus: 'REQUESTED', actor: 'DRIVER', createdAt: at(45) },
            { type: 'RIDE_CANCELLED', fromStatus: 'REQUESTED', toStatus: 'CANCELLED', actor: 'PASSENGER', createdAt: at(47) },
          ],
        },
      },
    });
    const { user } = renderApp('/history', { signedIn: true });

    expect(await screen.findByText('Cancelled · no charge')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Details' }));
    expect(await screen.findByText('Matched into a shared Tesla automatically')).toBeInTheDocument();
    expect(screen.getByText('The driver cancelled, so you went back in the queue')).toBeInTheDocument();
    expect(screen.getByText('You cancelled the ride')).toBeInTheDocument();
  });

  it('offers a retry when history cannot be loaded', async () => {
    mockApi({ 'GET /me': { body: nusrat }, 'GET /rides': sequence({ networkError: true }, { body: [] }) });
    const { user } = renderApp('/history', { signedIn: true });
    await user.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No rides yet')).toBeInTheDocument();
  });
});
```

Run: `npx vitest run src/pages/passenger/HistoryPage.test.tsx`
Expected: FAIL, because the minimal page shows only a heading.

- [ ] **Step 2: Implement the event wording, the timeline and the page**

`web/src/lib/events.ts`:
```ts
import type { RideEvent } from '../api/types';

/** Turns an audit event into a sentence a passenger understands. */
export function describeEvent(event: RideEvent): string {
  switch (event.type) {
    case 'RIDE_REQUESTED':
      return 'You requested the ride';
    case 'RIDE_MATCHED':
      return event.actor === 'SYSTEM' ? 'Matched into a shared Tesla automatically' : 'The driver accepted your ride';
    case 'RIDE_CANCELLED':
      return 'You cancelled the ride';
    case 'RIDE_REQUEUED':
      return 'The driver cancelled, so you went back in the queue';
    case 'RIDE_STATUS_CHANGED':
      if (event.toStatus === 'DRIVER_ARRIVED') return 'Your Tesla arrived at the pickup';
      if (event.toStatus === 'STARTED') return 'Trip started and your fare was locked';
      if (event.toStatus === 'COMPLETED') return 'Trip completed';
      return `Status changed to ${event.toStatus ?? 'unknown'}`;
    default:
      return event.type;
  }
}
```

`web/src/components/EventTimeline.tsx`:
```tsx
import type { RideEvent } from '../api/types';
import { describeEvent } from '../lib/events';
import { formatTime } from '../lib/format';

export function EventTimeline({ events }: { events: RideEvent[] }) {
  return (
    <ol className="space-y-1 border-l-2 border-stone-200 pl-4 text-sm">
      {events.map((event, index) => (
        <li key={`${event.createdAt}-${index}`} className="flex gap-3">
          <time dateTime={event.createdAt} className="w-12 shrink-0 tabular-nums text-stone-500">
            {formatTime(event.createdAt)}
          </time>
          <span>{describeEvent(event)}</span>
        </li>
      ))}
    </ol>
  );
}
```

`web/src/pages/passenger/HistoryPage.tsx` (replace the whole file):
```tsx
import { useState } from 'react';
import { api } from '../../api/endpoints';
import type { Ride } from '../../api/types';
import { Button, Card } from '../../components/Button';
import { EventTimeline } from '../../components/EventTimeline';
import { EmptyState, ErrorState, Loading } from '../../components/StateViews';
import { useApi } from '../../hooks/useApi';
import { formatDateTime, formatTaka } from '../../lib/format';
import { rideStatusLabel } from '../../lib/status';

function outcome(ride: Ride): string {
  if (ride.fare) return `${rideStatusLabel(ride.status)} · ${formatTaka(ride.fare.totalPaisa)}`;
  if (ride.status === 'CANCELLED') return 'Cancelled · no charge';
  return `${rideStatusLabel(ride.status)} · est. ${formatTaka(ride.estimate.soloPaisa)}`;
}

function RideTimeline({ rideId }: { rideId: string }) {
  const detail = useApi(() => api.ride(rideId));
  if (detail.loading && !detail.data) return <Loading label="Loading what happened…" />;
  if (!detail.data) return <ErrorState error={detail.error!} onRetry={() => void detail.refetch()} />;
  return <EventTimeline events={detail.data.events} />;
}

function RideHistoryItem({ ride }: { ride: Ride }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{`${ride.pickupZone.name} → ${ride.dropoffZone.name}`}</p>
          <p className="text-sm text-stone-500">
            {formatDateTime(ride.createdAt)}
            {ride.pool ? ` · ${ride.pool.vehicleName} with ${ride.pool.driverName}` : ''}
          </p>
          <p className="text-sm">{outcome(ride)}</p>
        </div>
        <Button variant="secondary" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          {open ? 'Hide details' : 'Details'}
        </Button>
      </div>
      {open && <RideTimeline rideId={ride.id} />}
    </Card>
  );
}

export function HistoryPage() {
  const rides = useApi(api.rides);

  if (rides.loading && !rides.data) return <Loading label="Loading your rides…" />;
  if (!rides.data) return <ErrorState error={rides.error!} onRetry={() => void rides.refetch()} />;

  return (
    <>
      <h1 className="text-xl font-semibold">Your rides</h1>
      {rides.data.length === 0 ? (
        <EmptyState title="No rides yet" hint="Your trips will show up here." />
      ) : (
        rides.data.map((ride) => <RideHistoryItem key={ride.id} ride={ride} />)
      )}
    </>
  );
}
```

- [ ] **Step 3: Run the tests, type check and lint**

Run: `npx vitest run && npx tsc --noEmit && npx eslint .`
Expected: all tests pass, with no type or lint errors.

- [ ] **Step 4: Commit**

```bash
cd /home/dextro/Desktop/dhaka-tesla-pool
git add web/src
git commit -m "feat(ride): add ride history with a plain-language event timeline

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Close the branch**

Follow the Branch close procedure with:
- `<branch>`: `feature/web-passenger`
- `<title>`: `Passenger screens: request, live ride, history`
- `<summary>`: `Request form with both estimates, live ride card with cancel, polling with a stale-data banner, and ride history with an event timeline.`

---

## Task 8: Pool manifest — seat meter, riders, next action, cancel pool

**Branch:** `git checkout master && git pull --ff-only && git checkout -b feature/web-driver`

**Files:**
- Create: `web/src/components/SeatMeter.tsx`, `web/src/pages/driver/PoolManifest.tsx`
- Test: `web/src/pages/driver/PoolManifest.test.tsx`

**Interfaces:**
- Consumes: `api.poolAction`, `toApiError`, `NEXT_POOL_ACTION`, `canCancelPool`, `formatTaka`, `Button`, `Card`, `InlineError`, and the fixtures.
- Produces:
  - `SeatMeter({ taken: number, capacity: number })`
  - `PoolManifest({ pool: DriverPool, onChanged: () => Promise<void> | void })`

- [ ] **Step 1: Write the failing tests**

`web/src/pages/driver/PoolManifest.test.tsx`:
```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { driverPool, rafiqRider, rider } from '../../test/fixtures';
import { mockApi } from '../../test/mockApi';
import { PoolManifest } from './PoolManifest';

const withRafiq = (overrides = {}) =>
  driverPool({ seatsTaken: 2, riders: [rider({ estimatePaisa: 5250 }), rafiqRider()], ...overrides });

describe("Jashim's pool manifest", () => {
  it('shows who is aboard, where they go, and what each will pay', () => {
    render(<PoolManifest pool={withRafiq()} onChanged={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Picking up in Banani' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '2 of 3 seats taken' })).toBeInTheDocument();
    expect(screen.getByText('2/3 seats')).toBeInTheDocument();
    expect(screen.getByText('Nusrat')).toBeInTheDocument();
    expect(screen.getByText('1 seat · to Mohakhali')).toBeInTheDocument();
    expect(screen.getByText('৳52.50 (est.)')).toBeInTheDocument();
    expect(screen.getByText('Rafiq')).toBeInTheDocument();
    expect(screen.getByText('৳67.50 (est.)')).toBeInTheDocument();
  });

  it('marks Bullet as full and ready to go', () => {
    render(<PoolManifest pool={withRafiq({ seatsTaken: 3, isFull: true })} onChanged={vi.fn()} />);
    expect(screen.getByText('Bullet is full — ready to go')).toBeInTheDocument();
  });

  it.each([
    ['OPEN', "I've arrived", 'arrive'],
    ['DRIVER_ARRIVED', 'Start trip', 'start'],
    ['STARTED', 'Complete trip', 'complete'],
  ] as const)('from %s, the next button is "%s"', async (status, label, action) => {
    const { calls } = mockApi({ [`POST /pools/pool-1/${action}`]: { body: withRafiq() } });
    const onChanged = vi.fn();
    render(<PoolManifest pool={withRafiq({ status })} onChanged={onChanged} />);

    await userEvent.click(screen.getByRole('button', { name: label }));

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: 'POST', path: `/pools/pool-1/${action}` });
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('tells Jashim how much cash to collect once fares are locked', () => {
    const started = withRafiq({
      status: 'STARTED',
      riders: [rider({ status: 'STARTED', fareTotalPaisa: 5250 }), rafiqRider({ status: 'STARTED', fareTotalPaisa: 6750 })],
    });
    render(<PoolManifest pool={started} onChanged={vi.fn()} />);
    expect(screen.getByText('৳52.50')).toBeInTheDocument();
    expect(screen.getByText('Collect ৳120.00 in cash at drop-off')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel trip' })).not.toBeInTheDocument();
  });

  it('sends one request when Start trip is double-clicked', async () => {
    const { calls } = mockApi({ 'POST /pools/pool-1/start': { body: withRafiq(), delayMs: 80 } });
    render(<PoolManifest pool={withRafiq({ status: 'DRIVER_ARRIVED' })} onChanged={vi.fn()} />);

    await userEvent.dblClick(screen.getByRole('button', { name: 'Start trip' }));
    await new Promise((resolve) => setTimeout(resolve, 120));

    expect(calls).toHaveLength(1);
  });

  it('cancels the trip only after confirmation', async () => {
    const { calls } = mockApi({ 'POST /pools/pool-1/cancel': { body: withRafiq({ status: 'CANCELLED' }) } });
    render(<PoolManifest pool={withRafiq()} onChanged={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Cancel trip' }));
    expect(calls).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'Yes, cancel trip' }));
    expect(calls[0]).toMatchObject({ path: '/pools/pool-1/cancel' });
  });

  it("shows the API's reason when an action is refused, and refreshes", async () => {
    mockApi({
      'POST /pools/pool-1/start': {
        status: 409,
        body: { error: { code: 'INVALID_TRANSITION', message: "You can't start a trip that is open" } },
      },
    });
    const onChanged = vi.fn();
    render(<PoolManifest pool={withRafiq({ status: 'DRIVER_ARRIVED' })} onChanged={onChanged} />);

    await userEvent.click(screen.getByRole('button', { name: 'Start trip' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("You can't start a trip that is open");
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });
});
```

Run: `npx vitest run src/pages/driver`
Expected: FAIL, because `./PoolManifest` can't be resolved.

- [ ] **Step 2: Implement the seat meter and the manifest**

`web/src/components/SeatMeter.tsx`:
```tsx
export function SeatMeter({ taken, capacity }: { taken: number; capacity: number }) {
  return (
    <div className="flex items-center gap-2">
      <span role="img" aria-label={`${taken} of ${capacity} seats taken`} className="text-lg tracking-widest text-red-700">
        {'●'.repeat(taken)}
        {'○'.repeat(Math.max(capacity - taken, 0))}
      </span>
      <span className="text-sm text-stone-600">{`${taken}/${capacity} seats`}</span>
    </div>
  );
}
```

`web/src/pages/driver/PoolManifest.tsx`:
```tsx
import { useRef, useState } from 'react';
import { toApiError } from '../../api/client';
import { api } from '../../api/endpoints';
import type { DriverPool, PoolAction } from '../../api/types';
import { Button, Card } from '../../components/Button';
import { SeatMeter } from '../../components/SeatMeter';
import { InlineError } from '../../components/StateViews';
import { formatTaka } from '../../lib/format';
import { canCancelPool, NEXT_POOL_ACTION } from '../../lib/status';

function heading(pool: DriverPool): string {
  switch (pool.status) {
    case 'OPEN':
      return `Picking up in ${pool.pickupZone.name}`;
    case 'DRIVER_ARRIVED':
      return `Waiting at ${pool.pickupZone.name}`;
    case 'STARTED':
      return 'On the way';
    case 'COMPLETED':
      return 'Trip completed';
    case 'CANCELLED':
      return 'Trip cancelled';
  }
}

export function PoolManifest({ pool, onChanged }: { pool: DriverPool; onChanged: () => Promise<void> | void }) {
  const [pending, setPending] = useState<PoolAction | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const next = NEXT_POOL_ACTION[pool.status];
  const fareLocked = pool.status === 'STARTED';
  const cashToCollect = pool.riders.reduce((sum, r) => sum + (r.fareTotalPaisa ?? r.estimatePaisa), 0);

  async function run(action: PoolAction) {
    if (inFlight.current) return; // one request per double click
    inFlight.current = true;
    setPending(action);
    setError(null);
    try {
      await api.poolAction(pool.id, action);
    } catch (err) {
      setError(toApiError(err).message);
    } finally {
      inFlight.current = false;
      setPending(null);
      setConfirmingCancel(false);
      await onChanged(); // show what the API says now, not what we hoped
    }
  }

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{heading(pool)}</h1>
        <SeatMeter taken={pool.seatsTaken} capacity={pool.capacity} />
      </div>

      {pool.isFull && canCancelPool(pool.status) && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm font-medium text-green-800">
          {`${pool.vehicle.name} is full — ready to go`}
        </p>
      )}

      <ul className="divide-y divide-stone-100">
        {pool.riders.map((rider) => (
          <li key={rider.rideId} className="flex items-center justify-between gap-3 py-2">
            <div>
              <p className="font-medium">{rider.firstName}</p>
              <p className="text-sm text-stone-500">{`${rider.seats} ${rider.seats === 1 ? 'seat' : 'seats'} · to ${rider.dropoffZone.name}`}</p>
            </div>
            <span className="tabular-nums">
              {rider.fareTotalPaisa === null ? `${formatTaka(rider.estimatePaisa)} (est.)` : formatTaka(rider.fareTotalPaisa)}
            </span>
          </li>
        ))}
      </ul>

      {fareLocked && <p className="text-sm font-medium">{`Collect ${formatTaka(cashToCollect)} in cash at drop-off`}</p>}

      <div className="flex flex-wrap gap-2">
        {next && (
          <Button disabled={pending !== null} onClick={() => void run(next.action)}>
            {pending === next.action ? 'Saving…' : next.label}
          </Button>
        )}
        {canCancelPool(pool.status) &&
          (confirmingCancel ? (
            <>
              <Button variant="danger" disabled={pending !== null} onClick={() => void run('cancel')}>
                Yes, cancel trip
              </Button>
              <Button variant="secondary" disabled={pending !== null} onClick={() => setConfirmingCancel(false)}>
                Keep trip
              </Button>
            </>
          ) : (
            <Button variant="danger" disabled={pending !== null} onClick={() => setConfirmingCancel(true)}>
              Cancel trip
            </Button>
          ))}
      </div>
      {confirmingCancel && (
        <p className="text-sm text-stone-600">Your riders go back in the queue so another Tesla can pick them up.</p>
      )}

      <InlineError message={error} />
    </Card>
  );
}
```

- [ ] **Step 3: Run the tests, type check and lint**

Run: `npx vitest run && npx tsc --noEmit && npx eslint .`
Expected: all tests pass, with no type or lint errors.

- [ ] **Step 4: Commit**

```bash
cd /home/dextro/Desktop/dhaka-tesla-pool
git add web/src
git commit -m "feat(driver): add pool manifest with seat meter and next action

Jashim sees riders, drop-offs and expected cash, one next-step button
(arrive, start, complete), a full-Tesla notice, and a confirmed cancel
that re-queues riders. Double clicks send one request.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 9: Driver screen — availability, waiting riders, accept

**Branch:** still `feature/web-driver`

**Files:**
- Create: `web/src/pages/driver/AvailabilityBar.tsx`, `web/src/pages/driver/RequestList.tsx`
- Modify: `web/src/pages/driver/DriverPage.tsx` (replace)
- Test: `web/src/pages/driver/DriverPage.test.tsx`

**Interfaces:**
- Consumes:
  - From the auth context: `useAuth` (`me`, `refreshMe`).
  - From the API client: `api.zones`, `api.setAvailability`, `api.relevantRequests`, `api.acceptRequest`, `api.driverPool`.
  - `useApi`, `POLL_MS`, `PoolManifest`, `isAcceptingRiders`, `ZoneSelect`, `formatTaka`, and the state views.
- Produces:
  - `AvailabilityBar({ vehicle: Vehicle, hasActivePool: boolean, onChanged })`
  - `RequestList({ zoneName: string, onAccepted })`
  - `DriverPage`

- [ ] **Step 1: Write the failing tests**

`web/src/pages/driver/DriverPage.test.tsx`:
```tsx
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DriverPool, Me } from '../../api/types';
import { driverPool, jashim, jashimOnline, waitingRequest, ZONES } from '../../test/fixtures';
import { mockApi } from '../../test/mockApi';
import { renderApp } from '../../test/render';

vi.mock('../../lib/polling', () => ({ POLL_MS: 25 }));

describe("Jashim's driver screen", () => {
  it('goes online in Banani and shows that nobody is waiting yet', async () => {
    let me: Me = jashim;
    const { calls } = mockApi({
      'GET /me': () => ({ body: me }),
      'GET /zones': { body: ZONES },
      'GET /driver/pool': { body: { pool: null } },
      'GET /driver/requests': { body: [] },
      'PUT /driver/availability': () => {
        me = jashimOnline;
        return { body: jashimOnline.vehicle };
      },
    });
    const { user } = renderApp('/driver', { signedIn: true });

    expect(await screen.findByText("You're offline")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Your zone'), 'Banani');
    await user.click(screen.getByRole('button', { name: 'Go online' }));

    expect(await screen.findByText('Online in Banani')).toBeInTheDocument();
    expect(await screen.findByText('No one in Banani needs a Tesla right now.')).toBeInTheDocument();
    expect(calls.find((call) => call.method === 'PUT')?.body).toEqual({ online: true, zoneId: 1 });
  });

  it("accepts Nusrat and switches to Bullet's manifest", async () => {
    let pool: DriverPool | null = null;
    const { calls } = mockApi({
      'GET /me': { body: jashimOnline },
      'GET /driver/pool': () => ({ body: { pool } }),
      'GET /driver/requests': () => ({ body: pool ? [] : [waitingRequest()] }),
      'POST /driver/requests/ride-nusrat/accept': () => {
        pool = driverPool();
        return { body: pool };
      },
    });
    const { user } = renderApp('/driver', { signedIn: true });

    expect(await screen.findByText('Nusrat')).toBeInTheDocument();
    expect(screen.getByText('1 seat · Banani → Mohakhali · 2 km')).toBeInTheDocument();
    expect(screen.getByText('৳70.00 solo · ৳52.50 pooled')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Accept Nusrat' }));

    expect(await screen.findByRole('button', { name: "I've arrived" })).toBeInTheDocument();
    expect(calls.filter((call) => call.path === '/driver/requests/ride-nusrat/accept')).toHaveLength(1);
  });

  it('explains when another Tesla got the rider first, and refreshes the list', async () => {
    const { calls } = mockApi({
      'GET /me': { body: jashimOnline },
      'GET /driver/pool': { body: { pool: null } },
      'GET /driver/requests': { body: [waitingRequest()] },
      'POST /driver/requests/ride-nusrat/accept': {
        status: 409,
        body: { error: { code: 'ALREADY_MATCHED', message: 'Another Tesla already picked up this rider' } },
      },
    });
    const { user } = renderApp('/driver', { signedIn: true });

    await user.click(await screen.findByRole('button', { name: 'Accept Nusrat' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Another Tesla already picked up this rider');
    const listLoads = calls.filter((call) => call.path === '/driver/requests').length;
    await waitFor(() => expect(calls.filter((call) => call.path === '/driver/requests').length).toBeGreaterThan(listLoads));
  });

  it('keeps Jashim online while he has riders', async () => {
    mockApi({
      'GET /me': { body: jashimOnline },
      'GET /driver/pool': { body: { pool: driverPool() } },
      'GET /driver/requests': { body: [] },
    });
    renderApp('/driver', { signedIn: true });

    expect(await screen.findByRole('button', { name: 'Go offline' })).toBeDisabled();
    expect(screen.getByText('Finish or cancel your trip first.')).toBeInTheDocument();
  });

  it('stops listing waiting riders once Bullet is full', async () => {
    mockApi({
      'GET /me': { body: jashimOnline },
      'GET /driver/pool': { body: { pool: driverPool({ seatsTaken: 3, isFull: true }) } },
      'GET /driver/requests': { body: [waitingRequest({ firstName: 'Shirin', rideId: 'ride-shirin' })] },
    });
    renderApp('/driver', { signedIn: true });

    expect(await screen.findByText('Bullet is full — ready to go')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Riders waiting in Banani' })).not.toBeInTheDocument();
  });
});
```

Run: `npx vitest run src/pages/driver/DriverPage.test.tsx`
Expected: FAIL, because the minimal page shows only a heading.

- [ ] **Step 2: Implement the availability bar, the request list and the page**

`web/src/pages/driver/AvailabilityBar.tsx`:
```tsx
import { useState } from 'react';
import { toApiError } from '../../api/client';
import { api } from '../../api/endpoints';
import type { Vehicle } from '../../api/types';
import { Button, Card } from '../../components/Button';
import { InlineError } from '../../components/StateViews';
import { ZoneSelect } from '../../components/ZoneSelect';
import { useApi } from '../../hooks/useApi';

export function AvailabilityBar({ vehicle, hasActivePool, onChanged }: {
  vehicle: Vehicle;
  hasActivePool: boolean;
  onChanged: () => Promise<void>;
}) {
  const zones = useApi(api.zones);
  const [zoneId, setZoneId] = useState<number | ''>(vehicle.currentZone?.id ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setOnline(online: boolean) {
    if (pending || (online && zoneId === '')) return;
    setPending(true);
    setError(null);
    try {
      await api.setAvailability(online ? { online, zoneId: zoneId as number } : { online });
      await onChanged();
    } catch (err) {
      setError(toApiError(err).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-stone-500">{`${vehicle.name} · ${vehicle.plate} · ${vehicle.capacity} seats`}</p>
          <p className="font-medium">{vehicle.isOnline ? `Online in ${vehicle.currentZone?.name ?? ''}` : 'Offline'}</p>
        </div>
        {vehicle.isOnline ? (
          <div className="text-right">
            <Button variant="secondary" disabled={pending || hasActivePool} onClick={() => void setOnline(false)}>
              Go offline
            </Button>
            {hasActivePool && <p className="mt-1 text-xs text-stone-500">Finish or cancel your trip first.</p>}
          </div>
        ) : (
          <div className="flex items-end gap-2">
            <ZoneSelect id="driver-zone" label="Your zone" zones={zones.data ?? []} value={zoneId} onChange={setZoneId}
              disabled={!zones.data} />
            <Button disabled={pending || zoneId === ''} onClick={() => void setOnline(true)}>
              {pending ? 'Going online…' : 'Go online'}
            </Button>
          </div>
        )}
      </div>
      {!vehicle.isOnline && zones.error && !zones.data && <InlineError message={zones.error.message} />}
      <InlineError message={error} />
    </Card>
  );
}
```

`web/src/pages/driver/RequestList.tsx`:
```tsx
import { useRef, useState } from 'react';
import { toApiError } from '../../api/client';
import { api } from '../../api/endpoints';
import { Button, Card } from '../../components/Button';
import { EmptyState, ErrorState, InlineError, Loading } from '../../components/StateViews';
import { useApi } from '../../hooks/useApi';
import { formatTaka } from '../../lib/format';
import { POLL_MS } from '../../lib/polling';

export function RequestList({ zoneName, onAccepted }: { zoneName: string; onAccepted: () => Promise<void> | void }) {
  const requests = useApi(api.relevantRequests, { pollMs: POLL_MS });
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function accept(rideId: string) {
    if (inFlight.current) return; // one accept per double click
    inFlight.current = true;
    setAcceptingId(rideId);
    setError(null);
    try {
      await api.acceptRequest(rideId);
      await onAccepted();
    } catch (err) {
      setError(toApiError(err).message);
    } finally {
      inFlight.current = false;
      setAcceptingId(null);
      await requests.refetch();
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{`Riders waiting in ${zoneName}`}</h2>
      <InlineError message={error} />
      {requests.loading && !requests.data ? (
        <Loading label="Looking for riders…" />
      ) : !requests.data ? (
        <ErrorState error={requests.error!} onRetry={() => void requests.refetch()} />
      ) : requests.data.length === 0 ? (
        <EmptyState title={`No one in ${zoneName} needs a Tesla right now.`} hint="New requests appear here automatically." />
      ) : (
        requests.data.map((request) => (
          <Card key={request.rideId} className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium">{request.firstName}</p>
              <p className="text-sm text-stone-600">
                {`${request.seats} ${request.seats === 1 ? 'seat' : 'seats'} · ${request.pickupZone.name} → ${request.dropoffZone.name} · ${request.distanceKm} km`}
              </p>
              <p className="text-sm text-stone-500">
                {`${formatTaka(request.estimateSoloPaisa)} solo · ${formatTaka(request.estimatePooledPaisa)} pooled`}
              </p>
            </div>
            <Button aria-label={`Accept ${request.firstName}`} disabled={acceptingId !== null} onClick={() => void accept(request.rideId)}>
              {acceptingId === request.rideId ? 'Accepting…' : 'Accept'}
            </Button>
          </Card>
        ))
      )}
    </section>
  );
}
```

`web/src/pages/driver/DriverPage.tsx` (replace the whole file):
```tsx
import { ApiError } from '../../api/client';
import { api } from '../../api/endpoints';
import { useAuth } from '../../auth/AuthContext';
import { EmptyState, ErrorState, Loading, StaleBanner } from '../../components/StateViews';
import { useApi } from '../../hooks/useApi';
import { POLL_MS } from '../../lib/polling';
import { isAcceptingRiders } from '../../lib/status';
import { AvailabilityBar } from './AvailabilityBar';
import { PoolManifest } from './PoolManifest';
import { RequestList } from './RequestList';

export function DriverPage() {
  const { me, refreshMe } = useAuth();
  const pool = useApi(api.driverPool, { pollMs: POLL_MS });
  const vehicle = me?.vehicle;

  if (!vehicle) return <ErrorState error={new ApiError(404, 'NOT_FOUND', 'No Tesla is linked to this account.')} />;

  const current = pool.data?.pool ?? null;

  function body() {
    if (!vehicle!.isOnline) {
      return <EmptyState title="You're offline" hint="Go online in your zone to see riders waiting nearby." />;
    }
    if (pool.loading && !pool.data) return <Loading label="Loading your trip…" />;
    if (!pool.data) return <ErrorState error={pool.error!} onRetry={() => void pool.refetch()} />;
    return (
      <>
        {pool.error && <StaleBanner />}
        {current && <PoolManifest pool={current} onChanged={pool.refetch} />}
        {(!current || isAcceptingRiders(current)) && (
          <RequestList zoneName={current?.pickupZone.name ?? vehicle!.currentZone?.name ?? 'your zone'} onAccepted={pool.refetch} />
        )}
      </>
    );
  }

  return (
    <>
      <AvailabilityBar vehicle={vehicle} hasActivePool={current !== null} onChanged={refreshMe} />
      {body()}
    </>
  );
}
```

- [ ] **Step 3: Run the tests, type check and lint**

Run: `npx vitest run && npx tsc --noEmit && npx eslint .`
Expected: all tests pass, with no type or lint errors.

- [ ] **Step 4: Commit**

```bash
cd /home/dextro/Desktop/dhaka-tesla-pool
git add web/src
git commit -m "feat(driver): let drivers go online, see waiting riders and accept them

Riders are listed only for the driver's zone and while the Tesla can
take more; a lost accept race shows the API's reason and refreshes.
Going offline is blocked while a trip is active.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 10: Driver history and an end-to-end smoke test against the real API

**Branch:** still `feature/web-driver`

**Files:**
- Modify: `web/src/pages/driver/DriverHistoryPage.tsx` (replace)
- Test: `web/src/pages/driver/DriverHistoryPage.test.tsx`

**Interfaces:**
- Consumes: `api.driverHistory`, `useApi`, `formatTaka`, `formatDateTime`, `Card`, and the state views.
- Produces: `DriverHistoryPage`

- [ ] **Step 1: Write the failing tests**

`web/src/pages/driver/DriverHistoryPage.test.tsx`:
```tsx
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { driverPool, jashim, rafiqRider, rider } from '../../test/fixtures';
import { mockApi } from '../../test/mockApi';
import { renderApp } from '../../test/render';

describe("Jashim's past trips", () => {
  it('says so when there are none', async () => {
    mockApi({ 'GET /me': { body: jashim }, 'GET /driver/history': { body: [] } });
    renderApp('/driver/history', { signedIn: true });
    expect(await screen.findByText('No finished trips yet')).toBeInTheDocument();
  });

  it("shows yesterday's Banani pool and the cash collected", async () => {
    mockApi({
      'GET /me': { body: jashim },
      'GET /driver/history': {
        body: [
          driverPool({
            status: 'COMPLETED',
            seatsTaken: 2,
            completedAt: '2026-09-25T02:58:00.000Z',
            riders: [
              rider({ status: 'COMPLETED', fareTotalPaisa: 5250 }),
              rafiqRider({ status: 'COMPLETED', fareTotalPaisa: 6750 }),
            ],
          }),
        ],
      },
    });
    renderApp('/driver/history', { signedIn: true });

    expect(await screen.findByText('Completed · from Banani')).toBeInTheDocument();
    expect(screen.getByText('Nusrat → Mohakhali')).toBeInTheDocument();
    expect(screen.getByText('Rafiq → Gulshan 1')).toBeInTheDocument();
    expect(screen.getByText('Collected ৳120.00')).toBeInTheDocument();
  });

  it('shows a cancelled trip and who was re-queued', async () => {
    mockApi({
      'GET /me': { body: jashim },
      'GET /driver/history': {
        body: [driverPool({ status: 'CANCELLED', seatsTaken: 0, riders: [rider({ status: 'REQUESTED', leftReason: 'DRIVER_CANCELLED' })] })],
      },
    });
    renderApp('/driver/history', { signedIn: true });

    expect(await screen.findByText('Cancelled · from Banani')).toBeInTheDocument();
    expect(screen.getByText('back in the queue')).toBeInTheDocument();
  });
});
```

Run: `npx vitest run src/pages/driver/DriverHistoryPage.test.tsx`
Expected: FAIL, because the minimal page shows only a heading.

- [ ] **Step 2: Implement the page**

`web/src/pages/driver/DriverHistoryPage.tsx` (replace the whole file):
```tsx
import { api } from '../../api/endpoints';
import type { DriverRider } from '../../api/types';
import { Card } from '../../components/Button';
import { EmptyState, ErrorState, Loading } from '../../components/StateViews';
import { useApi } from '../../hooks/useApi';
import { formatDateTime, formatTaka } from '../../lib/format';

const LEFT_REASONS: Record<string, string> = {
  DRIVER_CANCELLED: 'back in the queue',
  PASSENGER_CANCELLED: 'cancelled',
};

function riderOutcome(rider: DriverRider): string {
  if (rider.leftReason) return LEFT_REASONS[rider.leftReason] ?? rider.leftReason.toLowerCase();
  return rider.fareTotalPaisa === null ? '—' : formatTaka(rider.fareTotalPaisa);
}

export function DriverHistoryPage() {
  const history = useApi(api.driverHistory);

  if (history.loading && !history.data) return <Loading label="Loading your trips…" />;
  if (!history.data) return <ErrorState error={history.error!} onRetry={() => void history.refetch()} />;

  return (
    <>
      <h1 className="text-xl font-semibold">Past trips</h1>
      {history.data.length === 0 ? (
        <EmptyState title="No finished trips yet" hint="Completed and cancelled trips show up here." />
      ) : (
        history.data.map((pool) => {
          const collected = pool.riders
            .filter((rider) => rider.leftReason === null)
            .reduce((sum, rider) => sum + (rider.fareTotalPaisa ?? 0), 0);
          return (
            <Card key={pool.id} className="space-y-2">
              <p className="text-sm text-stone-500">{formatDateTime(pool.completedAt ?? pool.createdAt)}</p>
              <p className="font-medium">{`${pool.status === 'COMPLETED' ? 'Completed' : 'Cancelled'} · from ${pool.pickupZone.name}`}</p>
              <ul className="text-sm">
                {pool.riders.map((rider) => (
                  <li key={rider.rideId} className="flex justify-between gap-3">
                    <span>{`${rider.firstName} → ${rider.dropoffZone.name}`}</span>
                    <span className="tabular-nums text-stone-600">{riderOutcome(rider)}</span>
                  </li>
                ))}
              </ul>
              {pool.status === 'COMPLETED' && <p className="text-sm font-medium">{`Collected ${formatTaka(collected)}`}</p>}
            </Card>
          );
        })
      )}
    </>
  );
}
```

- [ ] **Step 3: Run the tests, type check and lint**

Run: `npx vitest run && npx tsc --noEmit && npx eslint .`
Expected: all tests pass, with no type or lint errors.

- [ ] **Step 4: Commit**

```bash
cd /home/dextro/Desktop/dhaka-tesla-pool
git add web/src
git commit -m "feat(driver): add past trips with cash collected per pool

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Smoke-test against the real API through the Vite proxy**

Postgres must be running (`docker compose up -d db` from the repo root), and the dev database must be seeded (`cd api && npm run db:seed`). From the repo root:
```bash
(cd api && npm run dev > /tmp/claude-1000/api-dev.log 2>&1 &)
(cd web && npx vite --port 5173 --strictPort > /tmp/claude-1000/web-dev.log 2>&1 &)
for i in $(seq 1 40); do curl -sf localhost:5173/api/health >/dev/null && break; sleep 0.5; done
curl -s localhost:5173/api/health
TOKEN=$(curl -s localhost:5173/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"jashim@teslapool.test","password":"bullet123"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
curl -s localhost:5173/api/driver/history -H "Authorization: Bearer $TOKEN" | node -pe 'JSON.parse(require("fs").readFileSync(0)).map(p=>p.status+" "+p.riders.map(r=>r.firstName).join("+"))'
curl -s localhost:5173/ | grep -o '<title>.*</title>'
```

Expected:
- `{"status":"ok","db":"up"}`
- a history line containing `COMPLETED Nusrat+Rafiq`
- `<title>Dhaka Tesla Pool</title>`

Then stop both servers by port. Don't use `pkill -f`, because its pattern would also match this shell:
```bash
kill $(lsof -t -i:4000 -i:5173) 2>/dev/null; sleep 1; curl -s -m 2 localhost:5173 || echo "stopped"
```

Build the production bundle: `cd web && npm run build`. Expected: `dist/index.html` and hashed assets under `dist/assets/`, with no errors.

- [ ] **Step 6: Close the branch**

Follow the Branch close procedure with:
- `<branch>`: `feature/web-driver`
- `<title>`: `Driver screens: availability, accept, pool manifest, history`
- `<summary>`: `Go online in a zone, accept waiting riders, run the trip with a seat meter and next-action button, and review past trips with cash collected.`
