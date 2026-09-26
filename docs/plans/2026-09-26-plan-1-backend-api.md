# Plan 1 of 3 — Backend API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Dhaka Tesla Pool REST API: auth, zones and fares, ride requests, pooling with strict seat capacity under concurrency, driver lifecycle, and an audit history. It is backed by Postgres and covered by unit and integration tests that use the story cast.

**Architecture:** An Express 5 app with three layers:
- `routes/` handles HTTP concerns only, including Zod validation.
- `services/` holds business rules and transactions.
- `domain/` holds pure functions: fares, geography, matching, and state transitions.

Postgres, accessed through Prisma 6, stores everything. One raw-SQL conditional `UPDATE` takes seats, and a `CHECK` constraint backs it up. Every state change writes a `ride_events` row in the same transaction.

**Tech Stack:** Node 24, TypeScript 5.9 (CommonJS output), Express 5, Prisma 6.19, PostgreSQL 16, Zod 4, bcryptjs, jsonwebtoken, pino/pino-http, helmet, cors, express-rate-limit, Vitest 4, Supertest 7.

**Spec:** `docs/specs/2026-09-26-dhaka-tesla-pool-design.md`

**Follow-up plans:**
- Plan 2: web app (React + Vite)
- Plan 3: delivery (full `docker compose`, CI, README, diagrams, deployment, release branches)

## Global Constraints

- **Repo root:** `/home/dextro/Desktop/dhaka-tesla-pool`. The API lives in `api/`. Run every `npm`/`npx` command from `api/` unless a step says otherwise.
- **Versions (pinned):**

  | Package | Version | Note |
  |---|---|---|
  | `typescript` | `5.9.x` | Not 7.x. |
  | `prisma` / `@prisma/client` | `6.19.x` | Not 7/8. |
  | `express` | `5.x` | |
  | `zod` | `4.x` | Use the `z.email()` and `z.uuid()` APIs. |
  | `vitest` | `4.x` | |

  Node must be ≥ 22.
- **Money:** always integer paisa. Columns end in `_paisa`; fields end in `Paisa`. Never store money as a float or a decimal.
- **Cast:** always use these exact values.

  | Role | Name | Details |
  |---|---|---|
  | Driver | **Jashim** | Tesla **Bullet**, plate `DHK-TESLA-11`, 3 seats |
  | Driver | **Monir** | Tesla **Toofan**, plate `DHK-TESLA-22`, 2 seats |
  | Passenger | **Nusrat** | |
  | Passenger | **Rafiq** | |
  | Passenger | **Shirin** | |

  Emails are `<lowercase first name>@teslapool.test`. The demo password is `bullet123`. Never use `user1`, `driver1`, or similar placeholders.
- **Zones:** the grid values below, copied verbatim from spec §3.1.

  | Zone | (x, y) |
  |---|---|
  | Banani | (0, 0) |
  | Mohakhali | (0, −2) |
  | Gulshan 1 | (1, −2) |
  | Gulshan 2 | (1, 0) |
  | Bashundhara | (5, 3) |
  | Farmgate | (−2, −4) |
  | Dhanmondi | (−3, −5) |
  | Mirpur | (−4, 1) |
  | Uttara | (−3, 9) |
- **Fare constants:**

  | Constant | Value |
  |---|---|
  | `BASE_FARE_PAISA` | `3000` |
  | `PER_KM_PAISA` | `2000` |
  | `POOL_DISCOUNT_PCT` | `25` |
  | `MAX_SEATS_PER_REQUEST` | `3` |
  | `DESTINATION_CLUSTER_KM` | `2` |
- **Error response shape:** `{ "error": { "code": string, "message": string, "details"?: unknown } }`. Another user's resources return **404**, never 403.
- **Business rules** live only in `src/services/` and `src/domain/`. Route handlers parse input, call one service function, and send the result.
- **Lock order** in every transaction: vehicle row, then pool row, then ride-request rows.
- **Events:** every state change writes a `ride_events` row inside the same transaction.
- **Commits:**
  - Format: `<type>(<scope>): <description>`, where type is one of `feat|fix|refactor|test|docs|chore|build`.
  - Every commit message ends with a blank line and then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - Commit exactly what each task's commit step lists, and no more.
- **Branches:** never commit to `master` after Task 0. Each branch closes with the **Branch close procedure** below.
- **No new infrastructure:** no Redis, queues, microservices, or other new infrastructure.
- **AI usage log:** when the human rejects or changes an AI suggestion, add a dated bullet to `docs/ai-usage-notes.md` in the next commit on the current branch. The README's AI Usage section will quote from this file.
- **Database for tests:** tests need Postgres running (`docker compose up -d db` from the repo root). The test database is `tesla_pool_test`.

### Branch close procedure

Run from the repo root. Replace `<branch>`, `<title>`, and `<summary>`.

```bash
git push -u origin <branch>
gh pr create --base master --head <branch> --title "<title>" --body "<summary>

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
gh pr merge <branch> --merge          # creates a merge commit (no fast-forward); keep the branch
git checkout master && git pull --ff-only
```

If the human hasn't approved a GitHub remote yet, run this instead:

```bash
git checkout master && git merge --no-ff <branch> -m "Merge branch '<branch>'"
```

## Review Focus

These are inputs the spec implies but doesn't spell out, and a real user will hit them. Each one has a test in the task that owns the code.

1. **Double-submitting "Request ride"** (double click or two tabs). The result must be exactly one active ride; the second request gets `409 ACTIVE_RIDE_EXISTS`, not a 500. Tested in Task 8.
2. **Malformed IDs in URLs** (`/api/rides/not-a-uuid`, `/api/pools/123/start`). These must return `404 NOT_FOUND`, not a Prisma 500. Tested in Tasks 8 and 14.
3. **Malformed JSON or oversized bodies.** These must return `400 VALIDATION_ERROR` or `413 PAYLOAD_TOO_LARGE` as JSON, not HTML. Tested in Task 1.
4. **Garbage, expired, or wrong-secret tokens.** These must return `401 UNAUTHENTICATED`. Tested in Task 4.
5. **A passenger cancelling at the same moment a driver accepts.** The seat count and membership must stay consistent: either the ride is cancelled with no seat held, or it's matched and the cancel gets a 409. Tested in Task 13.

---

## Task 0: Prepare master (human approval needed for GitHub)

**Files:**
- Create: `docs/ai-usage-notes.md`
- Already present: `docs/specs/…`, `docs/plans/…`

- [ ] **Step 1: Create the AI usage log**

`docs/ai-usage-notes.md`:
```markdown
# AI usage notes

This is a running log that feeds the README's "AI Usage" section. Add a dated entry whenever an AI
suggestion is accepted, rejected, or changed in a way that's worth mentioning.

## Tools
- Claude Code (Claude Opus 5.5): used for requirements analysis, design brainstorming, the spec and plans, and implementation help.

## Log
- 2026-09-26: **Accepted.** Split the PRD's single lifecycle into a pool state machine and a ride-request state machine, so per-passenger status and privacy stay simple.
- 2026-09-26: **Changed.** The AI's first stack suggestion was framed around "what I'd pick". I asked instead which stack would be easiest to *explain*. That moved us to Express over NestJS and React + Vite over the Next.js App Router.
```

- [ ] **Step 2: Commit the plan, the spec corrections, and the log on master**

```bash
cd /home/dextro/Desktop/dhaka-tesla-pool
git add docs/specs docs/plans docs/ai-usage-notes.md
git commit -m "docs(plan): add backend implementation plan and AI usage log

Also corrects the Mohakhali-Uttara distance, lists all API error codes,
and documents per-attempt transactions for auto-join.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 3: Ask the human before creating the public GitHub repository**

Ask: "OK to create the public repo `rakib4123/dhaka-tesla-pool` and push master?" Only on a yes:

```bash
gh repo create rakib4123/dhaka-tesla-pool --public --source . --remote origin --push \
  --description "Dhaka Tesla Pool — ride-pooling MVP (share a seat, split the fare)"
```
Expected: the repo URL is printed and `git branch -vv` shows `master` tracking `origin/master`.

---

## Task 1: API foundation — Express app, config, errors, logging

**Branch:** `git checkout -b feature/api-foundation`

**Files:**
- Create: `api/package.json`, `api/tsconfig.json`, `api/tsconfig.build.json`, `api/vitest.config.mts`, `api/.env.example`
- Create: `api/src/config.ts`, `api/src/lib/AppError.ts`, `api/src/lib/logger.ts`, `api/src/middleware/errorHandler.ts`, `api/src/routes/index.ts`, `api/src/app.ts`, `api/src/server.ts`
- Test: `api/test/http/app.test.ts`

**Interfaces:**
- Produces:
  - `createApp(): express.Express`
  - `config: Config`, with keys `NODE_ENV, PORT, DATABASE_URL, JWT_SECRET, JWT_EXPIRES_IN, CORS_ORIGIN, LOG_LEVEL, AUTH_RATE_LIMIT_MAX`
  - `corsOrigins: string[]`
  - `class AppError(status: number, code: ErrorCode, message: string, details?: unknown)`
  - `notFound(what?: string): AppError`
  - `conflict(code: ErrorCode, message: string): AppError`
  - `type ErrorCode`
  - `logger`
  - `apiRouter: Router`, which later tasks mount routers on
  - `errorHandler`, `notFoundHandler`

- [ ] **Step 1: Scaffold the package**

`api/package.json`:
```json
{
  "name": "dhaka-tesla-pool-api",
  "version": "0.1.0",
  "private": true,
  "description": "REST API for Dhaka Tesla Pool",
  "main": "dist/server.js",
  "engines": { "node": ">=22" },
  "scripts": {
    "dev": "tsx watch --env-file=.env src/server.ts",
    "build": "tsc -p tsconfig.build.json",
    "start": "node dist/server.js",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

`api/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src", "test"]
}
```

`api/tsconfig.build.json`:
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "noEmit": false, "rootDir": "src", "outDir": "dist" },
  "include": ["src"]
}
```

`api/vitest.config.mts`:
```ts
import { defineConfig } from 'vitest/config';

// One place defines where the test database lives. globalSetup (added in Task 2) reads it too.
process.env.TEST_DATABASE_URL ??= 'postgresql://tesla:tesla@localhost:5432/tesla_pool_test';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    fileParallelism: false, // integration tests share one database
    testTimeout: 20_000,
    hookTimeout: 30_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL,
      JWT_SECRET: 'test-only-secret-not-for-production',
      LOG_LEVEL: 'silent',
      AUTH_RATE_LIMIT_MAX: '10000',
    },
  },
});
```

`api/.env.example`:
```dotenv
# Local (non-Docker) development. Copy to api/.env
NODE_ENV=development
PORT=4000
DATABASE_URL=postgresql://tesla:tesla@localhost:5432/tesla_pool
JWT_SECRET=change-me-to-a-long-random-string
JWT_EXPIRES_IN=12h
CORS_ORIGIN=http://localhost:5173
LOG_LEVEL=info
AUTH_RATE_LIMIT_MAX=20
```

Install:
```bash
cd /home/dextro/Desktop/dhaka-tesla-pool/api
npm install express@5 zod@4 pino@10 pino-http@11 helmet@8 cors@2
npm install -D typescript@5.9 tsx@4 vitest@4 supertest@7 @types/supertest @types/express@5 @types/cors @types/node@24
```

- [ ] **Step 2: Commit the scaffold**

```bash
git add api/package.json api/package-lock.json api/tsconfig.json api/tsconfig.build.json api/vitest.config.mts api/.env.example
git commit -m "chore(api): scaffold typescript project with vitest

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 3: Write the failing HTTP foundation test**

`api/test/http/app.test.ts`:
```ts
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';

const app = createApp();

describe('HTTP foundation', () => {
  it('returns a JSON 404 for unknown routes', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'No route for GET /api/nope' } });
  });

  it('rejects malformed JSON with 400 VALIDATION_ERROR', async () => {
    const res = await request(app).post('/api/rides').set('Content-Type', 'application/json').send('{"seats": ');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects bodies larger than 10kb with 413', async () => {
    const res = await request(app).post('/api/rides').send({ note: 'x'.repeat(20_000) });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('sets security headers and a request id', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});
```

- [ ] **Step 4: Run the test and confirm it fails**

Run: `npx vitest run test/http/app.test.ts`
Expected: FAIL, with `Failed to load url ../../src/app` (module not found).

- [ ] **Step 5: Implement config, errors, logging, and the app**

`api/src/config.ts`:
```ts
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('12h'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
});

export type Config = z.infer<typeof EnvSchema>;

function loadConfig(): Config {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return parsed.data;
}

export const config = loadConfig();
export const corsOrigins = config.CORS_ORIGIN.split(',').map((origin) => origin.trim());
```

`api/src/lib/AppError.ts`:
```ts
export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'INVALID_CREDENTIALS'
  | 'FORBIDDEN_ROLE'
  | 'NOT_FOUND'
  | 'EMAIL_TAKEN'
  | 'INVALID_TRANSITION'
  | 'NO_SEATS'
  | 'POOL_CLOSED'
  | 'ALREADY_MATCHED'
  | 'INCOMPATIBLE'
  | 'ACTIVE_RIDE_EXISTS'
  | 'ACTIVE_POOL_EXISTS'
  | 'DRIVER_OFFLINE'
  | 'WRONG_ZONE'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'PAYLOAD_TOO_LARGE'
  | 'INTERNAL';

/** An error we expect and can explain to the client. Anything else becomes a 500. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = (what = 'Resource') => new AppError(404, 'NOT_FOUND', `${what} not found`);
export const conflict = (code: ErrorCode, message: string) => new AppError(409, code, message);
```

`api/src/lib/logger.ts`:
```ts
import pino from 'pino';
import { config } from '../config';

export const logger = pino({
  level: config.LOG_LEVEL,
  redact: ['req.headers.authorization', 'password', '*.password', 'passwordHash', '*.passwordHash'],
});
```

`api/src/middleware/errorHandler.ts`:
```ts
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from '../lib/AppError';
import { logger } from '../lib/logger';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError(404, 'NOT_FOUND', `No route for ${req.method} ${req.path}`));
};

interface BodyParserError extends Error {
  type?: string;
}

function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  const bodyError = err as BodyParserError | undefined;
  if (bodyError?.type === 'entity.parse.failed') {
    return new AppError(400, 'VALIDATION_ERROR', 'Request body is not valid JSON');
  }
  if (bodyError?.type === 'entity.too.large') {
    return new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
  }
  return new AppError(500, 'INTERNAL', 'Something went wrong on our side');
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const appError = toAppError(err);
  if (appError.status >= 500) {
    logger.error({ err, reqId: req.id }, 'Unhandled error');
  }
  res.status(appError.status).json({
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details !== undefined && { details: appError.details }),
    },
  });
};
```

`api/src/routes/index.ts`:
```ts
import { Router } from 'express';

export const apiRouter = Router();
```

`api/src/app.ts`:
```ts
import { randomUUID } from 'node:crypto';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { corsOrigins } from './config';
import { logger } from './lib/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { apiRouter } from './routes';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // one proxy hop (nginx locally, Render in production) so client IPs are real
  app.use(helmet());
  app.use(cors({ origin: corsOrigins }));
  app.use(
    pinoHttp({
      logger,
      genReqId: (_req, res) => {
        const id = randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
    }),
  );
  app.use(express.json({ limit: '10kb' }));
  app.use('/api', apiRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
```

`api/src/server.ts`:
```ts
import { createApp } from './app';
import { config } from './config';
import { logger } from './lib/logger';

const server = createApp().listen(config.PORT, () => {
  logger.info({ port: config.PORT }, 'Dhaka Tesla Pool API listening');
});

function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
```

- [ ] **Step 6: Run the tests and the type check**

Run: `npx vitest run test/http/app.test.ts && npx tsc --noEmit`
Expected: 4 tests pass, and `tsc` prints nothing.

- [ ] **Step 7: Commit**

```bash
git add api/src api/test
git commit -m "feat(api): add express app with error handling and request logging

JSON errors for unknown routes, malformed and oversized bodies; helmet,
CORS allow-list, pino request ids; env validated with zod at startup.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 8: Close the branch**

Follow the Branch close procedure with `<branch>` = `feature/api-foundation`, `<title>` = `API foundation: express app, config, errors, logging`, and `<summary>` = `Express 5 skeleton with validated env config, JSON error handling, request ids and security headers.`

---

## Task 2: Postgres, Prisma schema, migration, and health check

**Branch:** `git checkout -b feature/database-schema`

**Files:**
- Create: `docker-compose.yml`, `.env.example` (repo root), `docker/postgres/init/01-create-test-db.sql`
- Create: `api/prisma/schema.prisma`, `api/prisma/migrations/<timestamp>_init/migration.sql` (generated, then edited)
- Create: `api/src/lib/prisma.ts`, `api/src/lib/prismaErrors.ts`, `api/src/routes/health.ts`, `api/test/globalSetup.ts`
- Modify: `api/src/routes/index.ts`, `api/src/middleware/errorHandler.ts`, `api/src/server.ts`, `api/vitest.config.mts`, `api/package.json` (scripts)
- Test: `api/test/integration/health.test.ts`

**Interfaces:**
- Consumes: `apiRouter`, `AppError`, `logger` from Task 1.
- Produces:
  - `prisma: PrismaClient`
  - `type Db = Prisma.TransactionClient`
  - `isUniqueViolation(err: unknown): boolean`
  - Prisma models `User, Zone, Vehicle, RideRequest, Pool, PoolMember, RideEvent`
  - Enums `UserRole, RideStatus, PoolStatus, CancelActor`
  - `GET /api/health` returns `{ status: 'ok', db: 'up' }` or `503 { status: 'degraded', db: 'down' }`

- [ ] **Step 1: Add Postgres to docker compose**

`docker-compose.yml` (repo root; Plan 3 adds the `api` and `web` services):
```yaml
services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-tesla}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-tesla}
      POSTGRES_DB: ${POSTGRES_DB:-tesla_pool}
    ports:
      - "${POSTGRES_PORT:-5432}:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./docker/postgres/init:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
      interval: 5s
      timeout: 3s
      retries: 10

volumes:
  pgdata:
```

`docker/postgres/init/01-create-test-db.sql`:
```sql
-- Runs once, the first time the volume is created. The integration tests use this separate database.
CREATE DATABASE tesla_pool_test;
```

`.env.example` (repo root):
```dotenv
# Copy to .env — read by docker compose
POSTGRES_USER=tesla
POSTGRES_PASSWORD=tesla
POSTGRES_DB=tesla_pool
POSTGRES_PORT=5432
```

Start the database and check it:
```bash
cd /home/dextro/Desktop/dhaka-tesla-pool
ss -ltn | grep -q ':5432 ' && echo "PORT 5432 BUSY"   # if busy: set POSTGRES_PORT=5433 in .env and use port 5433 in api/.env and TEST_DATABASE_URL
cp .env.example .env
docker compose up -d db
docker compose exec db psql -U tesla -d tesla_pool -c '\l' | grep tesla_pool_test
```
Expected: the output includes a line for `tesla_pool_test`.

Also create `api/.env` from the example (`cp api/.env.example api/.env`). Git ignores this file.

- [ ] **Step 2: Commit the compose setup**

```bash
git add docker-compose.yml .env.example docker/postgres/init/01-create-test-db.sql
git commit -m "build(docker): add postgres service with healthcheck and test database

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 3: Write the Prisma schema**

Install:
```bash
cd api && npm install @prisma/client@6.19 && npm install -D prisma@6.19
```

`api/prisma/schema.prisma`:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum UserRole {
  PASSENGER
  DRIVER

  @@map("user_role")
}

enum RideStatus {
  REQUESTED
  MATCHED
  DRIVER_ARRIVED
  STARTED
  COMPLETED
  CANCELLED

  @@map("ride_status")
}

enum PoolStatus {
  OPEN
  DRIVER_ARRIVED
  STARTED
  COMPLETED
  CANCELLED

  @@map("pool_status")
}

enum CancelActor {
  PASSENGER
  DRIVER

  @@map("cancel_actor")
}

/// Anyone who can sign in: passengers self-register, drivers are seeded.
model User {
  id           String        @id @default(uuid()) @db.Uuid
  name         String
  email        String        @unique
  phone        String?
  passwordHash String        @map("password_hash")
  role         UserRole
  createdAt    DateTime      @default(now()) @map("created_at") @db.Timestamptz(3)
  vehicle      Vehicle?
  rideRequests RideRequest[]
  events       RideEvent[]

  @@map("users")
}

/// Seeded reference data: named Dhaka areas on a 1 km grid (Manhattan distance).
model Zone {
  id       Int           @id @default(autoincrement())
  name     String        @unique
  gridX    Int           @map("grid_x")
  gridY    Int           @map("grid_y")
  vehicles Vehicle[]
  pickups  RideRequest[] @relation("PickupZone")
  dropoffs RideRequest[] @relation("DropoffZone")
  pools    Pool[]

  @@map("zones")
}

/// A driver's Tesla (exactly one per driver) and its availability.
model Vehicle {
  id            String  @id @default(uuid()) @db.Uuid
  driverId      String  @unique @map("driver_id") @db.Uuid
  driver        User    @relation(fields: [driverId], references: [id])
  name          String
  plate         String  @unique
  capacity      Int
  isOnline      Boolean @default(false) @map("is_online")
  currentZoneId Int?    @map("current_zone_id")
  currentZone   Zone?   @relation(fields: [currentZoneId], references: [id])
  pools         Pool[]

  @@map("vehicles")
}

/// One passenger's ticket. Fare columns stay NULL until the pool STARTS, then they are locked.
model RideRequest {
  id                  String       @id @default(uuid()) @db.Uuid
  passengerId         String       @map("passenger_id") @db.Uuid
  passenger           User         @relation(fields: [passengerId], references: [id])
  pickupZoneId        Int          @map("pickup_zone_id")
  pickupZone          Zone         @relation("PickupZone", fields: [pickupZoneId], references: [id])
  dropoffZoneId       Int          @map("dropoff_zone_id")
  dropoffZone         Zone         @relation("DropoffZone", fields: [dropoffZoneId], references: [id])
  seats               Int
  distanceKm          Int          @map("distance_km")
  status              RideStatus   @default(REQUESTED)
  cancelledBy         CancelActor? @map("cancelled_by")
  estimateSoloPaisa   Int          @map("estimate_solo_paisa")
  estimatePooledPaisa Int          @map("estimate_pooled_paisa")
  fareBasePaisa       Int?         @map("fare_base_paisa")
  fareDistancePaisa   Int?         @map("fare_distance_paisa")
  fareDiscountPaisa   Int?         @map("fare_discount_paisa")
  fareTotalPaisa      Int?         @map("fare_total_paisa")
  createdAt           DateTime     @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt           DateTime     @updatedAt @map("updated_at") @db.Timestamptz(3)
  memberships         PoolMember[]
  events              RideEvent[]

  @@index([status, pickupZoneId])
  @@index([passengerId, createdAt])
  @@map("ride_requests")
}

/// One shared trip in one Tesla. capacity is copied from the vehicle so a CHECK can guard seats_taken.
model Pool {
  id           String       @id @default(uuid()) @db.Uuid
  vehicleId    String       @map("vehicle_id") @db.Uuid
  vehicle      Vehicle      @relation(fields: [vehicleId], references: [id])
  pickupZoneId Int          @map("pickup_zone_id")
  pickupZone   Zone         @relation(fields: [pickupZoneId], references: [id])
  capacity     Int
  seatsTaken   Int          @default(0) @map("seats_taken")
  status       PoolStatus   @default(OPEN)
  createdAt    DateTime     @default(now()) @map("created_at") @db.Timestamptz(3)
  startedAt    DateTime?    @map("started_at") @db.Timestamptz(3)
  completedAt  DateTime?    @map("completed_at") @db.Timestamptz(3)
  members      PoolMember[]
  events       RideEvent[]

  @@index([status, pickupZoneId])
  @@index([vehicleId, createdAt])
  @@map("pools")
}

/// Who is (left_at NULL) or was (left_at set) in which pool.
model PoolMember {
  id            String      @id @default(uuid()) @db.Uuid
  poolId        String      @map("pool_id") @db.Uuid
  pool          Pool        @relation(fields: [poolId], references: [id])
  rideRequestId String      @map("ride_request_id") @db.Uuid
  rideRequest   RideRequest @relation(fields: [rideRequestId], references: [id])
  seats         Int
  joinedAt      DateTime    @default(now()) @map("joined_at") @db.Timestamptz(3)
  leftAt        DateTime?   @map("left_at") @db.Timestamptz(3)
  leftReason    String?     @map("left_reason")

  @@index([poolId])
  @@map("pool_members")
}

/// Append-only audit trail. actor_user_id NULL means "the system" (e.g. auto-join).
model RideEvent {
  id            BigInt       @id @default(autoincrement())
  rideRequestId String?      @map("ride_request_id") @db.Uuid
  rideRequest   RideRequest? @relation(fields: [rideRequestId], references: [id])
  poolId        String?      @map("pool_id") @db.Uuid
  pool          Pool?        @relation(fields: [poolId], references: [id])
  actorUserId   String?      @map("actor_user_id") @db.Uuid
  actor         User?        @relation(fields: [actorUserId], references: [id])
  type          String
  fromStatus    String?      @map("from_status")
  toStatus      String?      @map("to_status")
  metadata      Json?
  createdAt     DateTime     @default(now()) @map("created_at") @db.Timestamptz(3)

  @@index([rideRequestId, createdAt])
  @@index([poolId, createdAt])
  @@map("ride_events")
}
```

- [ ] **Step 4: Generate the migration and add the constraints Prisma can't express**

```bash
cd api && npx prisma migrate dev --name init --create-only
```
Expected: `prisma/migrations/<timestamp>_init/migration.sql` is created.

Append this to the **end** of that `migration.sql`:
```sql
-- ---------------------------------------------------------------------------
-- Integrity rules Prisma's schema language can't express (hand-written).
-- These are the database's last line of defence; services enforce the same rules first.
-- ---------------------------------------------------------------------------
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_capacity_check" CHECK ("capacity" BETWEEN 1 AND 6);
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_online_needs_zone_check" CHECK (NOT "is_online" OR "current_zone_id" IS NOT NULL);

ALTER TABLE "ride_requests" ADD CONSTRAINT "ride_requests_seats_check" CHECK ("seats" >= 1);
ALTER TABLE "ride_requests" ADD CONSTRAINT "ride_requests_distinct_zones_check" CHECK ("pickup_zone_id" <> "dropoff_zone_id");
ALTER TABLE "ride_requests" ADD CONSTRAINT "ride_requests_money_check" CHECK (
  "estimate_solo_paisa" >= 0 AND "estimate_pooled_paisa" >= 0 AND ("fare_total_paisa" IS NULL OR "fare_total_paisa" >= 0)
);

-- Bullet can never carry more seats than it has.
ALTER TABLE "pools" ADD CONSTRAINT "pools_seats_check" CHECK ("seats_taken" BETWEEN 0 AND "capacity");
ALTER TABLE "pool_members" ADD CONSTRAINT "pool_members_seats_check" CHECK ("seats" >= 1);

-- A passenger has at most one active ride.
CREATE UNIQUE INDEX "ride_requests_one_active_per_passenger" ON "ride_requests" ("passenger_id")
  WHERE "status" IN ('REQUESTED', 'MATCHED', 'DRIVER_ARRIVED', 'STARTED');
-- A Tesla has at most one active pool.
CREATE UNIQUE INDEX "pools_one_active_per_vehicle" ON "pools" ("vehicle_id")
  WHERE "status" IN ('OPEN', 'DRIVER_ARRIVED', 'STARTED');
-- A ride request sits in at most one pool at a time.
CREATE UNIQUE INDEX "pool_members_one_current_membership" ON "pool_members" ("ride_request_id")
  WHERE "left_at" IS NULL;
```

Apply it:
```bash
npx prisma migrate dev
```
Expected: `Your database is now in sync with your schema` and `Generated Prisma Client`.

> **Warning:** Prisma doesn't know about the partial indexes above. If a **later** migration is ever generated, always use `--create-only` and delete any `DROP INDEX` lines for these three indexes before applying it.

- [ ] **Step 5: Write the failing health test and the test-DB global setup**

`api/test/globalSetup.ts`:
```ts
import { execSync } from 'node:child_process';

/** Brings the test database schema up to date before any test file runs. */
export default function setup() {
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
  });
}
```

In `api/vitest.config.mts`, add `globalSetup` inside `test` (just below `include`):
```ts
    globalSetup: ['test/globalSetup.ts'],
```

`api/test/integration/health.test.ts`:
```ts
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';

describe('GET /api/health', () => {
  it('reports the database as up', async () => {
    const res = await request(createApp()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', db: 'up' });
  });
});
```

Run: `npx vitest run test/integration/health.test.ts`
Expected: the migration applies to `tesla_pool_test`, then the test FAILS with a 404 (the route doesn't exist yet).

- [ ] **Step 6: Implement the Prisma client, the health route, and P2002 mapping**

`api/src/lib/prisma.ts`:
```ts
import { PrismaClient, type Prisma } from '@prisma/client';

// Generous transaction limits: concurrent seat claims wait on each other's row locks by design.
export const prisma = new PrismaClient({ transactionOptions: { maxWait: 10_000, timeout: 15_000 } });

/** Either the root client or an interactive-transaction client. */
export type Db = Prisma.TransactionClient;
```

`api/src/lib/prismaErrors.ts`:
```ts
import { Prisma } from '@prisma/client';

/** Postgres unique_violation (23505), surfaced by Prisma as P2002. Also covers our partial unique indexes. */
export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}
```

`api/src/routes/health.ts`:
```ts
import { Router } from 'express';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', db: 'up' });
  } catch (err) {
    logger.warn({ err }, 'Health check: database unreachable');
    res.status(503).json({ status: 'degraded', db: 'down' });
  }
});
```

`api/src/routes/index.ts` (whole file):
```ts
import { Router } from 'express';
import { healthRouter } from './health';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
```

In `api/src/middleware/errorHandler.ts`, add the import `import { isUniqueViolation } from '../lib/prismaErrors';`. Then, in `toAppError`, add this line right after `if (err instanceof AppError) return err;`:
```ts
  if (isUniqueViolation(err)) return new AppError(409, 'CONFLICT', 'That conflicts with existing data');
```

In `api/src/server.ts`, import `prisma` and disconnect it on shutdown. Replace the `shutdown` function with:
```ts
function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down');
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
```
and add `import { prisma } from './lib/prisma';` to the imports.

Add these scripts to `api/package.json`:
```json
    "db:migrate": "prisma migrate deploy",
    "db:migrate:dev": "prisma migrate dev",
    "db:generate": "prisma generate"
```

- [ ] **Step 7: Run all tests and the type check**

Run: `npx vitest run && npx tsc --noEmit`
Expected: 5 tests pass (4 HTTP + 1 health), and `tsc` prints nothing.

- [ ] **Step 8: Commit**

```bash
git add api/prisma api/src api/test api/vitest.config.mts api/package.json api/package-lock.json
git commit -m "feat(db): add schema for users, teslas, rides, pools and audit events

Seven tables with CHECK constraints (seat capacity, distinct zones,
non-negative money) and partial unique indexes (one active ride per
passenger, one active pool per tesla, one current pool per ride).
Adds GET /api/health with a database ping.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 3: Seed the story cast, test DB helpers, and constraint tests

**Branch:** still `feature/database-schema`

**Files:**
- Create: `api/src/db/cast.ts`, `api/src/db/seedData.ts`, `api/src/db/seed.ts`
- Create: `api/test/helpers/db.ts`
- Modify: `api/package.json` (scripts and the `prisma.seed` key)
- Test: `api/test/integration/constraints.test.ts`

**Interfaces:**
- Consumes: `prisma` and the Prisma models from Task 2.
- Produces:
  - `DEMO_PASSWORD = 'bullet123'`
  - `ZONES` (readonly array of `{name, gridX, gridY}`) and `type ZoneName`
  - `type CastKey = 'jashim'|'monir'|'nusrat'|'rafiq'|'shirin'`
  - `PASSENGERS`, `DRIVERS`
  - `castEmail(key: CastKey): string`
  - `CAST_EMAILS: string[]`
  - `seedReferenceData(db: PrismaClient): Promise<void>`
  - Test helpers: `resetDatabase(): Promise<void>` (truncates everything and reseeds the cast), `resetRideData(): Promise<void>` (clears rides, pools, and events, sets vehicles offline, and deletes non-cast users), `zoneId(name: ZoneName): Promise<number>`

- [ ] **Step 1: Write the failing constraint tests**

`api/test/helpers/db.ts`:
```ts
import { CAST_EMAILS, type ZoneName } from '../../src/db/cast';
import { seedReferenceData } from '../../src/db/seedData';
import { prisma } from '../../src/lib/prisma';

const zoneIds = new Map<ZoneName, number>();

/** Empties every table and reseeds zones plus the story cast. Call once per test file (beforeAll). */
export async function resetDatabase(): Promise<void> {
  zoneIds.clear();
  await prisma.$executeRaw`TRUNCATE ride_events, pool_members, pools, ride_requests, vehicles, users, zones RESTART IDENTITY CASCADE`;
  await seedReferenceData(prisma);
}

/** Clears rides, pools and events between tests; keeps zones and the cast. */
export async function resetRideData(): Promise<void> {
  await prisma.$executeRaw`TRUNCATE ride_events, pool_members, pools, ride_requests RESTART IDENTITY CASCADE`;
  await prisma.vehicle.updateMany({ data: { isOnline: false, currentZoneId: null } });
  await prisma.user.deleteMany({ where: { email: { notIn: CAST_EMAILS } } });
}

export async function zoneId(name: ZoneName): Promise<number> {
  const cached = zoneIds.get(name);
  if (cached !== undefined) return cached;
  const zone = await prisma.zone.findUniqueOrThrow({ where: { name } });
  zoneIds.set(name, zone.id);
  return zone.id;
}
```

`api/test/integration/constraints.test.ts`:
```ts
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { castEmail, type ZoneName } from '../../src/db/cast';
import { prisma } from '../../src/lib/prisma';
import { resetDatabase, resetRideData, zoneId } from '../helpers/db';

const bullet = () => prisma.vehicle.findUniqueOrThrow({ where: { plate: 'DHK-TESLA-11' } });

async function openBulletPool(seatsTaken = 0) {
  const vehicle = await bullet();
  return prisma.pool.create({
    data: { vehicleId: vehicle.id, pickupZoneId: await zoneId('Banani'), capacity: vehicle.capacity, seatsTaken },
  });
}

async function insertRide(who: 'nusrat' | 'rafiq' | 'shirin', dropoff: ZoneName = 'Mohakhali') {
  const passenger = await prisma.user.findUniqueOrThrow({ where: { email: castEmail(who) } });
  return prisma.rideRequest.create({
    data: {
      passengerId: passenger.id,
      pickupZoneId: await zoneId('Banani'),
      dropoffZoneId: await zoneId(dropoff),
      seats: 1,
      distanceKm: 2,
      estimateSoloPaisa: 7000,
      estimatePooledPaisa: 5250,
    },
  });
}

describe('database constraints: the last line of defence', () => {
  beforeAll(resetDatabase);
  beforeEach(resetRideData);

  it('seeds Bullet with three seats for Jashim', async () => {
    const vehicle = await prisma.vehicle.findUniqueOrThrow({ where: { plate: 'DHK-TESLA-11' }, include: { driver: true } });
    expect(vehicle).toMatchObject({ name: 'Bullet', capacity: 3 });
    expect(vehicle.driver.name).toBe('Jashim');
  });

  it('never lets Bullet carry more seats than it has', async () => {
    const pool = await openBulletPool(3);
    await expect(prisma.$executeRaw`UPDATE pools SET seats_taken = 4 WHERE id = ${pool.id}::uuid`).rejects.toThrow();
    const after = await prisma.pool.findUniqueOrThrow({ where: { id: pool.id } });
    expect(after.seatsTaken).toBe(3);
  });

  it('allows only one active pool per Tesla', async () => {
    const first = await openBulletPool();
    await expect(openBulletPool()).rejects.toThrow();
    await prisma.pool.update({ where: { id: first.id }, data: { status: 'COMPLETED' } });
    await expect(openBulletPool()).resolves.toMatchObject({ status: 'OPEN' });
  });

  it('allows only one active ride per passenger', async () => {
    const first = await insertRide('nusrat');
    await expect(insertRide('nusrat')).rejects.toThrow();
    await prisma.rideRequest.update({ where: { id: first.id }, data: { status: 'CANCELLED' } });
    await expect(insertRide('nusrat')).resolves.toMatchObject({ status: 'REQUESTED' });
  });

  it('rejects a ride that starts and ends in the same zone', async () => {
    await expect(insertRide('rafiq', 'Banani')).rejects.toThrow();
  });

  it('rejects an online Tesla that has no zone', async () => {
    await expect(
      prisma.vehicle.update({ where: { plate: 'DHK-TESLA-11' }, data: { isOnline: true, currentZoneId: null } }),
    ).rejects.toThrow();
  });
});
```

Run: `npx vitest run test/integration/constraints.test.ts`
Expected: FAIL, because `../../src/db/cast` can't be resolved.

- [ ] **Step 2: Implement the cast and the seed**

Install: `npm install bcryptjs@3`

`api/src/db/cast.ts`:
```ts
/** The story cast from the brief. Seed data, tests and the demo all use these same people. */
export const DEMO_PASSWORD = 'bullet123';

export const ZONES = [
  { name: 'Banani', gridX: 0, gridY: 0 },
  { name: 'Mohakhali', gridX: 0, gridY: -2 },
  { name: 'Gulshan 1', gridX: 1, gridY: -2 },
  { name: 'Gulshan 2', gridX: 1, gridY: 0 },
  { name: 'Bashundhara', gridX: 5, gridY: 3 },
  { name: 'Farmgate', gridX: -2, gridY: -4 },
  { name: 'Dhanmondi', gridX: -3, gridY: -5 },
  { name: 'Mirpur', gridX: -4, gridY: 1 },
  { name: 'Uttara', gridX: -3, gridY: 9 },
] as const;

export type ZoneName = (typeof ZONES)[number]['name'];

export type CastKey = 'jashim' | 'monir' | 'nusrat' | 'rafiq' | 'shirin';

export const castEmail = (key: CastKey) => `${key}@teslapool.test`;

export const PASSENGERS = [
  { key: 'nusrat', name: 'Nusrat', phone: '+8801711000001' },
  { key: 'rafiq', name: 'Rafiq', phone: '+8801711000002' },
  { key: 'shirin', name: 'Shirin', phone: '+8801711000003' },
] as const;

export const DRIVERS = [
  { key: 'jashim', name: 'Jashim', phone: '+8801811000001', vehicle: { name: 'Bullet', plate: 'DHK-TESLA-11', capacity: 3 } },
  // Monir and Toofan are our addition to the cast. The multi-driver scenarios need a second driver.
  { key: 'monir', name: 'Monir', phone: '+8801811000002', vehicle: { name: 'Toofan', plate: 'DHK-TESLA-22', capacity: 2 } },
] as const;

export const CAST_EMAILS: string[] = [...PASSENGERS, ...DRIVERS].map((person) => castEmail(person.key));
```

`api/src/db/seedData.ts`:
```ts
import bcrypt from 'bcryptjs';
import type { PrismaClient } from '@prisma/client';
import { castEmail, DEMO_PASSWORD, DRIVERS, PASSENGERS, ZONES } from './cast';

/** Zones, passengers, drivers and their Teslas. Idempotent: upserts, never duplicates. */
export async function seedReferenceData(db: PrismaClient): Promise<void> {
  for (const zone of ZONES) {
    await db.zone.upsert({
      where: { name: zone.name },
      update: { gridX: zone.gridX, gridY: zone.gridY },
      create: { name: zone.name, gridX: zone.gridX, gridY: zone.gridY },
    });
  }

  for (const passenger of PASSENGERS) {
    const email = castEmail(passenger.key);
    await db.user.upsert({
      where: { email },
      update: {},
      create: {
        name: passenger.name,
        email,
        phone: passenger.phone,
        passwordHash: await bcrypt.hash(DEMO_PASSWORD, 10),
        role: 'PASSENGER',
      },
    });
  }

  for (const driver of DRIVERS) {
    const email = castEmail(driver.key);
    const user = await db.user.upsert({
      where: { email },
      update: {},
      create: {
        name: driver.name,
        email,
        phone: driver.phone,
        passwordHash: await bcrypt.hash(DEMO_PASSWORD, 10),
        role: 'DRIVER',
      },
    });
    await db.vehicle.upsert({
      where: { driverId: user.id },
      update: {},
      create: { driverId: user.id, ...driver.vehicle },
    });
  }
}
```

`api/src/db/seed.ts`:
```ts
import { PrismaClient } from '@prisma/client';
import { seedReferenceData } from './seedData';

async function main() {
  const prisma = new PrismaClient();
  try {
    await seedReferenceData(prisma);
    console.log('Seeded zones and the story cast (Jashim/Bullet, Monir/Toofan, Nusrat, Rafiq, Shirin).');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

Add to `api/package.json`:
- In `scripts`: `"db:seed": "tsx src/db/seed.ts"`
- At the top level: `"prisma": { "seed": "tsx src/db/seed.ts" }`

- [ ] **Step 3: Run the tests, then seed the dev database**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all tests pass, including the 6 in `constraints.test.ts`.

Run: `npm run db:seed` (uses `api/.env`)
Expected: `Seeded zones and the story cast …`. Run it a second time and expect the same output with no errors, which confirms it's idempotent.

- [ ] **Step 4: Commit**

```bash
git add api/src/db api/test api/package.json api/package-lock.json
git commit -m "feat(db): seed zones and the story cast with idempotent upserts

Jashim drives Bullet (3 seats), Monir drives Toofan (2 seats); Nusrat,
Rafiq and Shirin are passengers. Tests prove the CHECK constraints and
partial unique indexes reject overbooking and duplicate active rides.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Close the branch**

Follow the Branch close procedure with `<branch>` = `feature/database-schema`, `<title>` = `Database schema, constraints and story-cast seed`, and `<summary>` = `Prisma schema (7 tables), hand-written CHECKs and partial unique indexes, health check, idempotent seed, constraint tests.`

---

## Task 4: Passenger auth — register, login, me, role guard

**Branch:** `git checkout -b feature/passenger-auth`

**Files:**
- Create: `api/src/middleware/validate.ts`, `api/src/middleware/authenticate.ts`, `api/src/services/authService.ts`, `api/src/services/views.ts`, `api/src/routes/auth.ts`
- Create: `api/test/helpers/http.ts`
- Modify: `api/src/routes/index.ts`
- Test: `api/test/integration/auth.test.ts`

**Interfaces:**
- Consumes: `prisma`, `isUniqueViolation`, `AppError`, `config`, `seedReferenceData`, `castEmail`, `DEMO_PASSWORD`.
- Produces:
  - `parseBody<S extends z.ZodType>(schema: S, body: unknown): z.output<S>`. Throws 400 `VALIDATION_ERROR` with `details: {path, message}[]`.
  - `parseId(value: unknown, what: string): string`. Throws 404 if the value isn't a UUID.
  - `authenticate` middleware, which sets `req.user: AuthUser` where `AuthUser = { id: string; role: 'PASSENGER'|'DRIVER'; name: string }`
  - `requireRole(role)`
  - `currentUser(req): AuthUser`
  - `signToken(user)`, `verifyToken(token): TokenPayload`
  - `registerPassenger(input)` and `login(input)`, both returning `Promise<{ token: string; user: UserView }>`
  - `getMe(userId): Promise<MeView>`
  - In `views.ts`: `ZoneRef`, `UserView`, `VehicleView`, `MeView`, and `toVehicleView(vehicle)`
  - Test helpers: `api()`, `loginAs(key: CastKey): Promise<string>`, `bearer(token)`

- [ ] **Step 1: Write the failing auth tests**

`api/test/helpers/http.ts`:
```ts
import request from 'supertest';
import { createApp } from '../../src/app';
import { castEmail, DEMO_PASSWORD, type CastKey } from '../../src/db/cast';

export const app = createApp();
export const api = () => request(app);

const tokens = new Map<CastKey, string>();

/** Logs in a cast member once per test file and reuses the token. */
export async function loginAs(who: CastKey): Promise<string> {
  const cached = tokens.get(who);
  if (cached) return cached;
  const res = await api().post('/api/auth/login').send({ email: castEmail(who), password: DEMO_PASSWORD });
  if (res.status !== 200) throw new Error(`loginAs(${who}) failed: ${res.status} ${JSON.stringify(res.body)}`);
  tokens.set(who, res.body.token);
  return res.body.token as string;
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
```

`api/test/integration/auth.test.ts`:
```ts
import jwt from 'jsonwebtoken';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase, resetRideData } from '../helpers/db';
import { api, bearer, loginAs } from '../helpers/http';

describe('auth', () => {
  beforeAll(resetDatabase);
  beforeEach(resetRideData);

  it('registers a new passenger and never returns the password hash', async () => {
    const res = await api().post('/api/auth/register').send({
      name: 'Tania', email: 'tania@teslapool.test', phone: '+8801711000099', password: 'rickshaw99',
    });
    expect(res.status).toBe(201);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ name: 'Tania', email: 'tania@teslapool.test', role: 'PASSENGER' });
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
  });

  it('ignores an attempt to self-register as a driver', async () => {
    const res = await api().post('/api/auth/register').send({
      name: 'Sneaky', email: 'sneaky@teslapool.test', password: 'rickshaw99', role: 'DRIVER',
    });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('PASSENGER');
  });

  it('rejects a duplicate email with 409 EMAIL_TAKEN', async () => {
    const res = await api().post('/api/auth/register').send({ name: 'Nusrat Again', email: 'nusrat@teslapool.test', password: 'rickshaw99' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('rejects an invalid body with field details', async () => {
    const res = await api().post('/api/auth/register').send({ name: 'T', email: 'not-an-email', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toEqual(expect.arrayContaining(['name', 'email', 'password']));
  });

  it('logs Nusrat in (email is case-insensitive) and returns her profile from /me', async () => {
    const login = await api().post('/api/auth/login').send({ email: 'NUSRAT@teslapool.test', password: 'bullet123' });
    expect(login.status).toBe(200);
    const me = await api().get('/api/me').set(bearer(login.body.token));
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ name: 'Nusrat', role: 'PASSENGER', vehicle: null });
  });

  it("shows Jashim's Tesla on /me", async () => {
    const me = await api().get('/api/me').set(bearer(await loginAs('jashim')));
    expect(me.body).toMatchObject({
      name: 'Jashim',
      role: 'DRIVER',
      vehicle: { name: 'Bullet', plate: 'DHK-TESLA-11', capacity: 3, isOnline: false, currentZone: null },
    });
  });

  it('gives the same 401 for a wrong password and an unknown email', async () => {
    const wrong = await api().post('/api/auth/login').send({ email: 'rafiq@teslapool.test', password: 'nope-nope' });
    const unknown = await api().post('/api/auth/login').send({ email: 'ghost@teslapool.test', password: 'nope-nope' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it.each([
    ['no header', undefined],
    ['a garbage token', 'Bearer not.a.jwt'],
    ['a token signed with another secret', `Bearer ${jwt.sign({ role: 'PASSENGER', name: 'X' }, 'some-other-secret-value', { subject: '00000000-0000-4000-8000-000000000000' })}`],
    ['an expired token', `Bearer ${jwt.sign({ role: 'PASSENGER', name: 'X' }, 'test-only-secret-not-for-production', { subject: '00000000-0000-4000-8000-000000000000', expiresIn: -10 })}`],
  ])('rejects /me with %s as 401', async (_label, header) => {
    const req = api().get('/api/me');
    const res = header ? await req.set('Authorization', header) : await req;
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });
});
```

Install the auth dependencies first so the test file can compile: `npm install jsonwebtoken@9 express-rate-limit@8 && npm install -D @types/jsonwebtoken`

Run: `npx vitest run test/integration/auth.test.ts`
Expected: FAIL, because the auth routes don't exist yet and return 404.

- [ ] **Step 2: Implement validation helpers, views, the auth service, middleware, and routes**

`api/src/middleware/validate.ts`:
```ts
import { z } from 'zod';
import { AppError, notFound } from '../lib/AppError';

/** Validates a request body against a Zod schema or throws 400 with per-field details. */
export function parseBody<S extends z.ZodType>(schema: S, body: unknown): z.output<S> {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Some fields are missing or invalid',
      result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  return result.data;
}

const UuidSchema = z.uuid();

/** A malformed id can't match any row, so it is a 404 (and never reaches Prisma). */
export function parseId(value: unknown, what: string): string {
  const result = UuidSchema.safeParse(value);
  if (!result.success) throw notFound(what);
  return result.data;
}
```

`api/src/services/views.ts`:
```ts
import type { UserRole, Vehicle, Zone } from '@prisma/client';

// Response shapes. The web app mirrors these types (Plan 2).

export interface ZoneRef {
  id: number;
  name: string;
}

export interface UserView {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: UserRole;
}

export interface VehicleView {
  id: string;
  name: string;
  plate: string;
  capacity: number;
  isOnline: boolean;
  currentZone: ZoneRef | null;
}

export interface MeView extends UserView {
  vehicle: VehicleView | null;
}

export const toZoneRef = (zone: Zone): ZoneRef => ({ id: zone.id, name: zone.name });

export function toVehicleView(vehicle: Vehicle & { currentZone: Zone | null }): VehicleView {
  return {
    id: vehicle.id,
    name: vehicle.name,
    plate: vehicle.plate,
    capacity: vehicle.capacity,
    isOnline: vehicle.isOnline,
    currentZone: vehicle.currentZone ? toZoneRef(vehicle.currentZone) : null,
  };
}
```

`api/src/services/authService.ts`:
```ts
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { User, UserRole } from '@prisma/client';
import { config } from '../config';
import { AppError, notFound } from '../lib/AppError';
import { prisma } from '../lib/prisma';
import { isUniqueViolation } from '../lib/prismaErrors';
import { toVehicleView, type MeView, type UserView } from './views';

export interface TokenPayload {
  sub: string;
  role: UserRole;
  name: string;
}

export interface AuthResult {
  token: string;
  user: UserView;
}

const toUserView = (user: User): UserView => ({
  id: user.id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: user.role,
});

export function signToken(user: Pick<User, 'id' | 'role' | 'name'>): string {
  return jwt.sign({ role: user.role, name: user.name }, config.JWT_SECRET, {
    subject: user.id,
    algorithm: 'HS256',
    expiresIn: config.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

/** Throws if the token is missing a subject, has an unknown role, is expired, or has a bad signature. */
export function verifyToken(token: string): TokenPayload {
  const decoded = jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'] });
  if (typeof decoded === 'string' || !decoded.sub || (decoded.role !== 'PASSENGER' && decoded.role !== 'DRIVER')) {
    throw new Error('Malformed token payload');
  }
  return { sub: decoded.sub, role: decoded.role, name: String(decoded.name) };
}

export async function registerPassenger(input: {
  name: string;
  email: string;
  phone?: string;
  password: string;
}): Promise<AuthResult> {
  try {
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email.toLowerCase(),
        phone: input.phone ?? null,
        passwordHash: await bcrypt.hash(input.password, 10),
        role: 'PASSENGER',
      },
    });
    return { token: signToken(user), user: toUserView(user) };
  } catch (err) {
    if (isUniqueViolation(err)) throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists');
    throw err;
  }
}

export async function login(input: { email: string; password: string }): Promise<AuthResult> {
  const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
  const passwordOk = user ? await bcrypt.compare(input.password, user.passwordHash) : false;
  if (!user || !passwordOk) throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
  return { token: signToken(user), user: toUserView(user) };
}

export async function getMe(userId: string): Promise<MeView> {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { vehicle: { include: { currentZone: true } } } });
  if (!user) throw notFound('User');
  return { ...toUserView(user), vehicle: user.vehicle ? toVehicleView(user.vehicle) : null };
}
```

`api/src/middleware/authenticate.ts`:
```ts
import type { Request, RequestHandler } from 'express';
import type { UserRole } from '@prisma/client';
import { AppError } from '../lib/AppError';
import { verifyToken } from '../services/authService';

export interface AuthUser {
  id: string;
  role: UserRole;
  name: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw new AppError(401, 'UNAUTHENTICATED', 'Sign in to continue');
  try {
    const payload = verifyToken(header.slice('Bearer '.length));
    req.user = { id: payload.sub, role: payload.role, name: payload.name };
  } catch {
    throw new AppError(401, 'UNAUTHENTICATED', 'Your session has expired or is invalid. Please sign in again');
  }
  next();
};

export function requireRole(role: UserRole): RequestHandler {
  return (req, _res, next) => {
    if (req.user?.role !== role) {
      throw new AppError(403, 'FORBIDDEN_ROLE', `Only a ${role.toLowerCase()} can do this`);
    }
    next();
  };
}

export function currentUser(req: Request): AuthUser {
  if (!req.user) throw new AppError(401, 'UNAUTHENTICATED', 'Sign in to continue');
  return req.user;
}
```

`api/src/routes/auth.ts`:
```ts
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config';
import { authenticate, currentUser } from '../middleware/authenticate';
import { parseBody } from '../middleware/validate';
import * as authService from '../services/authService';

const RegisterSchema = z.object({
  name: z.string().trim().min(2).max(60),
  email: z.email().max(120),
  phone: z.string().trim().regex(/^\+?[0-9]{10,15}$/, 'Phone must be 10–15 digits').optional(),
  password: z.string().min(8).max(72), // bcrypt ignores bytes after 72
});

const LoginSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(72),
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.AUTH_RATE_LIMIT_MAX,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many attempts. Try again in a few minutes' } });
  },
});

export const authRouter = Router();

authRouter.post('/register', authLimiter, async (req, res) => {
  const input = parseBody(RegisterSchema, req.body);
  res.status(201).json(await authService.registerPassenger(input));
});

authRouter.post('/login', authLimiter, async (req, res) => {
  const input = parseBody(LoginSchema, req.body);
  res.json(await authService.login(input));
});

export const meRouter = Router();

meRouter.get('/', authenticate, async (req, res) => {
  res.json(await authService.getMe(currentUser(req).id));
});
```

`api/src/routes/index.ts` (whole file):
```ts
import { Router } from 'express';
import { authRouter, meRouter } from './auth';
import { healthRouter } from './health';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/me', meRouter);
```

- [ ] **Step 3: Run all tests and the type check**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all tests pass, including the 11 in `auth.test.ts`.

- [ ] **Step 4: Commit**

```bash
git add api/src api/test api/package.json api/package-lock.json
git commit -m "feat(auth): add passenger registration, login and role guard

bcrypt password hashes, HS256 JWT with expiry, rate-limited auth routes,
passenger-only self-registration (drivers are seeded), /api/me with the
driver's Tesla.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Close the branch**

Follow the Branch close procedure with `<branch>` = `feature/passenger-auth`, `<title>` = `Passenger auth: register, login, me, role guard`, and `<summary>` = `JWT auth with bcrypt, zod validation helpers, rate limiting, and tests for invalid/expired tokens.`

---

## Task 5: Domain — geography and the fare model (pure functions)

**Branch:** `git checkout -b feature/fare-and-zones`

**Files:**
- Create: `api/src/domain/constants.ts`, `api/src/domain/geo.ts`, `api/src/domain/fare.ts`
- Test: `api/test/unit/geo.test.ts`, `api/test/unit/fare.test.ts`

**Interfaces:**
- Produces:
  - Constants: `BASE_FARE_PAISA`, `PER_KM_PAISA`, `POOL_DISCOUNT_PCT`, `MAX_SEATS_PER_REQUEST`, `DESTINATION_CLUSTER_KM`
  - `interface GridPoint { gridX: number; gridY: number }`
  - `distanceKm(from: GridPoint, to: GridPoint): number`
  - `fitsDestinationCluster(dropoff: GridPoint, existing: GridPoint[]): boolean`
  - `interface FareBreakdown { basePaisa; distancePaisa; discountPaisa; totalPaisa }`
  - `calculateFare({ distanceKm, seats, pooled }): FareBreakdown`
  - `estimateFares(distanceKm, seats): { soloPaisa; pooledPaisa }`

- [ ] **Step 1: Write the failing unit tests**

`api/test/unit/geo.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { distanceKm, fitsDestinationCluster } from '../../src/domain/geo';

const Banani = { gridX: 0, gridY: 0 };
const Mohakhali = { gridX: 0, gridY: -2 };
const Gulshan1 = { gridX: 1, gridY: -2 };
const Gulshan2 = { gridX: 1, gridY: 0 };
const Uttara = { gridX: -3, gridY: 9 };

describe('distanceKm (Manhattan distance on the 1 km zone grid)', () => {
  it.each([
    ['Banani → Mohakhali (Nusrat)', Banani, Mohakhali, 2],
    ['Banani → Gulshan 1 (Rafiq)', Banani, Gulshan1, 3],
    ['Mohakhali ↔ Gulshan 1', Mohakhali, Gulshan1, 1],
    ['Mohakhali → Uttara', Mohakhali, Uttara, 14],
    ['Banani → Banani', Banani, Banani, 0],
  ])('%s = %i km', (_label, from, to, km) => {
    expect(distanceKm(from, to)).toBe(km);
    expect(distanceKm(to, from)).toBe(km);
  });
});

describe('fitsDestinationCluster (drop-offs within 2 km of every existing drop-off)', () => {
  it("lets Rafiq (Gulshan 1) share with Nusrat (Mohakhali): 1 km apart", () => {
    expect(fitsDestinationCluster(Gulshan1, [Mohakhali])).toBe(true);
  });
  it('rejects an Uttara drop-off next to Mohakhali: 14 km apart', () => {
    expect(fitsDestinationCluster(Uttara, [Mohakhali])).toBe(false);
  });
  it('checks against every member, not just the first', () => {
    expect(fitsDestinationCluster(Gulshan2, [Gulshan1, Mohakhali])).toBe(false); // 2 km and 3 km
  });
  it('accepts anyone into an empty pool', () => {
    expect(fitsDestinationCluster(Uttara, [])).toBe(true);
  });
});
```

`api/test/unit/fare.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { calculateFare, estimateFares } from '../../src/domain/fare';

describe('calculateFare: the README worked example', () => {
  it("Nusrat, Banani → Mohakhali (2 km), pooled: ৳52.50", () => {
    expect(calculateFare({ distanceKm: 2, seats: 1, pooled: true })).toEqual({
      basePaisa: 3000, distancePaisa: 4000, discountPaisa: 1750, totalPaisa: 5250,
    });
  });
  it("Rafiq, Banani → Gulshan 1 (3 km), pooled: ৳67.50", () => {
    expect(calculateFare({ distanceKm: 3, seats: 1, pooled: true })).toEqual({
      basePaisa: 3000, distancePaisa: 6000, discountPaisa: 2250, totalPaisa: 6750,
    });
  });
  it('solo rides get no discount: Nusrat ৳70.00, Rafiq ৳90.00', () => {
    expect(calculateFare({ distanceKm: 2, seats: 1, pooled: false }).totalPaisa).toBe(7000);
    expect(calculateFare({ distanceKm: 3, seats: 1, pooled: false })).toMatchObject({ discountPaisa: 0, totalPaisa: 9000 });
  });
  it('multiplies by seats: Rafiq with 2 seats, pooled, pays ৳135.00', () => {
    expect(calculateFare({ distanceKm: 3, seats: 2, pooled: true })).toEqual({
      basePaisa: 6000, distancePaisa: 12000, discountPaisa: 4500, totalPaisa: 13500,
    });
  });
  it.each([
    [{ distanceKm: -1, seats: 1, pooled: false }],
    [{ distanceKm: 1.5, seats: 1, pooled: false }],
    [{ distanceKm: 2, seats: 0, pooled: false }],
  ])('rejects impossible input %o', (input) => {
    expect(() => calculateFare(input)).toThrow(RangeError);
  });
});

describe('estimateFares', () => {
  it('shows Nusrat both prices before she books', () => {
    expect(estimateFares(2, 1)).toEqual({ soloPaisa: 7000, pooledPaisa: 5250 });
  });
});
```

Run: `npx vitest run test/unit`
Expected: FAIL, because the domain modules can't be resolved.

- [ ] **Step 2: Implement the domain modules**

`api/src/domain/constants.ts`:
```ts
/** Fare model (spec §3.3). Money is always integer paisa: 100 paisa = ৳1. */
export const BASE_FARE_PAISA = 3000; // ৳30 per seat
export const PER_KM_PAISA = 2000; // ৳20 per km per seat
export const POOL_DISCOUNT_PCT = 25; // applied only if the ride is actually pooled at STARTED

/** Matching (spec §3.2). */
export const DESTINATION_CLUSTER_KM = 2;

/** The largest Tesla in the fleet (Bullet) has 3 seats. */
export const MAX_SEATS_PER_REQUEST = 3;
```

`api/src/domain/geo.ts`:
```ts
import { DESTINATION_CLUSTER_KM } from './constants';

export interface GridPoint {
  gridX: number;
  gridY: number;
}

/** Manhattan distance in km on the 1 km zone grid. Dhaka traffic doesn't travel in straight lines. */
export function distanceKm(from: GridPoint, to: GridPoint): number {
  return Math.abs(from.gridX - to.gridX) + Math.abs(from.gridY - to.gridY);
}

/** A drop-off fits a pool only if it is close to every drop-off already in it. */
export function fitsDestinationCluster(dropoff: GridPoint, existingDropoffs: GridPoint[]): boolean {
  return existingDropoffs.every((other) => distanceKm(dropoff, other) <= DESTINATION_CLUSTER_KM);
}
```

`api/src/domain/fare.ts`:
```ts
import { BASE_FARE_PAISA, PER_KM_PAISA, POOL_DISCOUNT_PCT } from './constants';

export interface FareBreakdown {
  basePaisa: number;
  distancePaisa: number;
  discountPaisa: number;
  totalPaisa: number;
}

/**
 * passengerFare = (base + perKm × km) × seats − poolDiscount
 * Every value is integer paisa. The only rounding step is the percentage discount.
 */
export function calculateFare({ distanceKm, seats, pooled }: { distanceKm: number; seats: number; pooled: boolean }): FareBreakdown {
  if (!Number.isInteger(distanceKm) || distanceKm < 0) throw new RangeError('distanceKm must be a non-negative integer');
  if (!Number.isInteger(seats) || seats < 1) throw new RangeError('seats must be a positive integer');

  const basePaisa = BASE_FARE_PAISA * seats;
  const distancePaisa = PER_KM_PAISA * distanceKm * seats;
  const subtotal = basePaisa + distancePaisa;
  const discountPaisa = pooled ? Math.round((subtotal * POOL_DISCOUNT_PCT) / 100) : 0;
  return { basePaisa, distancePaisa, discountPaisa, totalPaisa: subtotal - discountPaisa };
}

/** What a passenger sees before booking: the solo price and the price if the ride ends up pooled. */
export function estimateFares(distanceKm: number, seats: number): { soloPaisa: number; pooledPaisa: number } {
  return {
    soloPaisa: calculateFare({ distanceKm, seats, pooled: false }).totalPaisa,
    pooledPaisa: calculateFare({ distanceKm, seats, pooled: true }).totalPaisa,
  };
}
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run test/unit && npx tsc --noEmit`
Expected: all unit tests pass.

- [ ] **Step 4: Commit**

```bash
git add api/src/domain api/test/unit
git commit -m "feat(fare): add zone-grid distance and integer-paisa fare model

Manhattan distance on a 1 km grid; fare = (base + per-km x km) x seats
minus a 25% pool discount. Unit tests pin the README worked example:
Nusrat 5250 paisa, Rafiq 6750 paisa when pooled.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 6: Zones and fare-estimate endpoints

**Branch:** still `feature/fare-and-zones`

**Files:**
- Create: `api/src/routes/schemas.ts`, `api/src/services/fareService.ts`, `api/src/routes/zones.ts`, `api/src/routes/fares.ts`
- Modify: `api/src/routes/index.ts`
- Test: `api/test/integration/fares.test.ts`

**Interfaces:**
- Consumes: `distanceKm`, `estimateFares`, `MAX_SEATS_PER_REQUEST`, `parseBody`, `authenticate`, `requireRole`, `prisma`.
- Produces:
  - `TripSchema`, which parses `{ pickupZoneId: number; dropoffZoneId: number; seats: number }`
  - `type TripInput`
  - `resolveTrip(input: TripInput): Promise<{ pickup: Zone; dropoff: Zone; distanceKm: number }>`, which throws 400 for an unknown zone
  - `estimateTrip(input: TripInput): Promise<{ distanceKm; soloPaisa; pooledPaisa }>`
  - `GET /api/zones`, which returns `Array<{ id; name; gridX; gridY }>`
  - `POST /api/fares/estimate`

- [ ] **Step 1: Write the failing endpoint tests**

`api/test/integration/fares.test.ts`:
```ts
import { beforeAll, describe, expect, it } from 'vitest';
import { resetDatabase, zoneId } from '../helpers/db';
import { api, bearer, loginAs } from '../helpers/http';

describe('zones and fare estimates', () => {
  beforeAll(resetDatabase);

  it('lists all nine zones with grid coordinates', async () => {
    const res = await api().get('/api/zones').set(bearer(await loginAs('nusrat')));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(9);
    expect(res.body).toContainEqual({ id: await zoneId('Banani'), name: 'Banani', gridX: 0, gridY: 0 });
  });

  it("quotes Nusrat's Banani → Mohakhali trip: ৳70.00 solo, ৳52.50 pooled", async () => {
    const res = await api()
      .post('/api/fares/estimate')
      .set(bearer(await loginAs('nusrat')))
      .send({ pickupZoneId: await zoneId('Banani'), dropoffZoneId: await zoneId('Mohakhali'), seats: 1 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ distanceKm: 2, soloPaisa: 7000, pooledPaisa: 5250 });
  });

  it.each([
    ['the same pickup and drop-off', async () => ({ pickupZoneId: await zoneId('Banani'), dropoffZoneId: await zoneId('Banani'), seats: 1 })],
    ['more seats than any Tesla has', async () => ({ pickupZoneId: await zoneId('Banani'), dropoffZoneId: await zoneId('Mohakhali'), seats: 4 })],
    ['zero seats', async () => ({ pickupZoneId: await zoneId('Banani'), dropoffZoneId: await zoneId('Mohakhali'), seats: 0 })],
    ['an unknown zone', async () => ({ pickupZoneId: 99999, dropoffZoneId: await zoneId('Mohakhali'), seats: 1 })],
    ['a string seat count', async () => ({ pickupZoneId: await zoneId('Banani'), dropoffZoneId: await zoneId('Mohakhali'), seats: '1' })],
  ])('rejects %s with 400', async (_label, body) => {
    const res = await api().post('/api/fares/estimate').set(bearer(await loginAs('nusrat'))).send(await body());
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('is for passengers only (403 for Jashim) and needs sign-in (401)', async () => {
    const body = { pickupZoneId: await zoneId('Banani'), dropoffZoneId: await zoneId('Mohakhali'), seats: 1 };
    expect((await api().post('/api/fares/estimate').set(bearer(await loginAs('jashim'))).send(body)).status).toBe(403);
    expect((await api().post('/api/fares/estimate').send(body)).status).toBe(401);
  });
});
```

Run: `npx vitest run test/integration/fares.test.ts`
Expected: FAIL with 404s.

- [ ] **Step 2: Implement the endpoints**

`api/src/routes/schemas.ts`:
```ts
import { z } from 'zod';
import { MAX_SEATS_PER_REQUEST } from '../domain/constants';

export const TripSchema = z
  .object({
    pickupZoneId: z.number().int().positive(),
    dropoffZoneId: z.number().int().positive(),
    seats: z.number().int().min(1).max(MAX_SEATS_PER_REQUEST),
  })
  .refine((trip) => trip.pickupZoneId !== trip.dropoffZoneId, {
    message: 'Pickup and drop-off must be different zones',
    path: ['dropoffZoneId'],
  });

export type TripInput = z.output<typeof TripSchema>;
```

`api/src/services/fareService.ts`:
```ts
import type { Zone } from '@prisma/client';
import { estimateFares } from '../domain/fare';
import { distanceKm } from '../domain/geo';
import { AppError } from '../lib/AppError';
import { prisma } from '../lib/prisma';
import type { TripInput } from '../routes/schemas';

export async function resolveTrip(input: TripInput): Promise<{ pickup: Zone; dropoff: Zone; distanceKm: number }> {
  const [pickup, dropoff] = await Promise.all([
    prisma.zone.findUnique({ where: { id: input.pickupZoneId } }),
    prisma.zone.findUnique({ where: { id: input.dropoffZoneId } }),
  ]);
  if (!pickup || !dropoff) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Unknown pickup or drop-off zone', [
      ...(pickup ? [] : [{ path: 'pickupZoneId', message: 'Unknown zone' }]),
      ...(dropoff ? [] : [{ path: 'dropoffZoneId', message: 'Unknown zone' }]),
    ]);
  }
  return { pickup, dropoff, distanceKm: distanceKm(pickup, dropoff) };
}

export async function estimateTrip(input: TripInput): Promise<{ distanceKm: number; soloPaisa: number; pooledPaisa: number }> {
  const trip = await resolveTrip(input);
  return { distanceKm: trip.distanceKm, ...estimateFares(trip.distanceKm, input.seats) };
}
```

`api/src/routes/zones.ts`:
```ts
import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/authenticate';

export const zonesRouter = Router();

zonesRouter.get('/', authenticate, async (_req, res) => {
  const zones = await prisma.zone.findMany({ orderBy: { name: 'asc' } });
  res.json(zones.map(({ id, name, gridX, gridY }) => ({ id, name, gridX, gridY })));
});
```

`api/src/routes/fares.ts`:
```ts
import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/authenticate';
import { parseBody } from '../middleware/validate';
import { estimateTrip } from '../services/fareService';
import { TripSchema } from './schemas';

export const faresRouter = Router();

faresRouter.post('/estimate', authenticate, requireRole('PASSENGER'), async (req, res) => {
  res.json(await estimateTrip(parseBody(TripSchema, req.body)));
});
```

`api/src/routes/index.ts` (whole file):
```ts
import { Router } from 'express';
import { authRouter, meRouter } from './auth';
import { faresRouter } from './fares';
import { healthRouter } from './health';
import { zonesRouter } from './zones';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/me', meRouter);
apiRouter.use('/zones', zonesRouter);
apiRouter.use('/fares', faresRouter);
```

- [ ] **Step 3: Run all tests**

Run: `npx vitest run && npx tsc --noEmit`
Expected: everything passes.

- [ ] **Step 4: Commit**

```bash
git add api/src api/test
git commit -m "feat(fare): add zones list and fare estimate endpoints

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Close the branch**

Follow the Branch close procedure with `<branch>` = `feature/fare-and-zones`, `<title>` = `Fare model and zones`, and `<summary>` = `Pure distance/fare functions with the Nusrat & Rafiq worked example, plus GET /api/zones and POST /api/fares/estimate.`

---

## Task 7: Domain — lifecycle state machines

**Branch:** `git checkout -b feature/ride-requests`

**Files:**
- Create: `api/src/domain/transitions.ts`
- Test: `api/test/unit/transitions.test.ts`

**Interfaces:**
- Produces:
  - `RIDE_STATUSES`, `type RideStatus`, `POOL_STATUSES`, `type PoolStatus`
  - `ACTIVE_RIDE_STATUSES: RideStatus[]`
  - `PASSENGER_CANCELLABLE_STATUSES: RideStatus[]`
  - `ACTIVE_POOL_STATUSES: PoolStatus[]`
  - `JOINABLE_POOL_STATUSES: PoolStatus[]`
  - `type PoolAction = 'arrive'|'start'|'complete'|'cancel'`
  - `POOL_ACTIONS: PoolAction[]`
  - `nextPoolStatus(current: PoolStatus, action: PoolAction): PoolStatus | null`
  - `memberRideStatusAfter(action: PoolAction): RideStatus`
  - `canPassengerCancel(status: RideStatus): boolean`
  - `isJoinable(status: PoolStatus): boolean`

- [ ] **Step 1: Write the failing test**

`api/test/unit/transitions.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  canPassengerCancel,
  isJoinable,
  memberRideStatusAfter,
  nextPoolStatus,
  POOL_ACTIONS,
  POOL_STATUSES,
  type PoolAction,
  type PoolStatus,
} from '../../src/domain/transitions';

const ALLOWED: Record<PoolAction, Partial<Record<PoolStatus, PoolStatus>>> = {
  arrive: { OPEN: 'DRIVER_ARRIVED' },
  start: { DRIVER_ARRIVED: 'STARTED' },
  complete: { STARTED: 'COMPLETED' },
  cancel: { OPEN: 'CANCELLED', DRIVER_ARRIVED: 'CANCELLED' },
};

const cases = POOL_ACTIONS.flatMap((action) =>
  POOL_STATUSES.map((status) => [action, status, ALLOWED[action][status] ?? null] as const),
);

describe('pool state machine', () => {
  it.each(cases)('%s from %s → %s', (action, status, expected) => {
    expect(nextPoolStatus(status, action)).toBe(expected);
  });

  it('moves member rides along with the pool; a driver cancel re-queues them', () => {
    expect(memberRideStatusAfter('arrive')).toBe('DRIVER_ARRIVED');
    expect(memberRideStatusAfter('start')).toBe('STARTED');
    expect(memberRideStatusAfter('complete')).toBe('COMPLETED');
    expect(memberRideStatusAfter('cancel')).toBe('REQUESTED');
  });

  it('accepts new riders only until the trip starts', () => {
    expect(POOL_STATUSES.filter(isJoinable)).toEqual(['OPEN', 'DRIVER_ARRIVED']);
  });
});

describe('passenger cancellation', () => {
  it.each([
    ['REQUESTED', true],
    ['MATCHED', true],
    ['DRIVER_ARRIVED', true],
    ['STARTED', false],
    ['COMPLETED', false],
    ['CANCELLED', false],
  ] as const)('%s → cancellable: %s', (status, expected) => {
    expect(canPassengerCancel(status)).toBe(expected);
  });
});
```

Run: `npx vitest run test/unit/transitions.test.ts`
Expected: FAIL, because the module can't be resolved.

- [ ] **Step 2: Implement it**

`api/src/domain/transitions.ts`:
```ts
/** Ride request = one passenger's ticket. Pool = one Tesla's trip. See spec §3.4. */
export const RIDE_STATUSES = ['REQUESTED', 'MATCHED', 'DRIVER_ARRIVED', 'STARTED', 'COMPLETED', 'CANCELLED'] as const;
export type RideStatus = (typeof RIDE_STATUSES)[number];

export const POOL_STATUSES = ['OPEN', 'DRIVER_ARRIVED', 'STARTED', 'COMPLETED', 'CANCELLED'] as const;
export type PoolStatus = (typeof POOL_STATUSES)[number];

export const ACTIVE_RIDE_STATUSES: RideStatus[] = ['REQUESTED', 'MATCHED', 'DRIVER_ARRIVED', 'STARTED'];
export const PASSENGER_CANCELLABLE_STATUSES: RideStatus[] = ['REQUESTED', 'MATCHED', 'DRIVER_ARRIVED'];
export const ACTIVE_POOL_STATUSES: PoolStatus[] = ['OPEN', 'DRIVER_ARRIVED', 'STARTED'];
export const JOINABLE_POOL_STATUSES: PoolStatus[] = ['OPEN', 'DRIVER_ARRIVED'];

export type PoolAction = 'arrive' | 'start' | 'complete' | 'cancel';
export const POOL_ACTIONS: PoolAction[] = ['arrive', 'start', 'complete', 'cancel'];

const POOL_TRANSITIONS: Record<PoolAction, { from: PoolStatus[]; to: PoolStatus }> = {
  arrive: { from: ['OPEN'], to: 'DRIVER_ARRIVED' },
  start: { from: ['DRIVER_ARRIVED'], to: 'STARTED' },
  complete: { from: ['STARTED'], to: 'COMPLETED' },
  cancel: { from: ['OPEN', 'DRIVER_ARRIVED'], to: 'CANCELLED' },
};

const MEMBER_RIDE_STATUS: Record<PoolAction, RideStatus> = {
  arrive: 'DRIVER_ARRIVED',
  start: 'STARTED',
  complete: 'COMPLETED',
  cancel: 'REQUESTED', // a driver cancelling puts riders back in the queue
};

/** The status a pool moves to, or null if the action isn't allowed from `current`. */
export function nextPoolStatus(current: PoolStatus, action: PoolAction): PoolStatus | null {
  const rule = POOL_TRANSITIONS[action];
  return rule.from.includes(current) ? rule.to : null;
}

export function memberRideStatusAfter(action: PoolAction): RideStatus {
  return MEMBER_RIDE_STATUS[action];
}

export function canPassengerCancel(status: RideStatus): boolean {
  return PASSENGER_CANCELLABLE_STATUSES.includes(status);
}

export function isJoinable(status: PoolStatus): boolean {
  return JOINABLE_POOL_STATUSES.includes(status);
}
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run test/unit && npx tsc --noEmit`
Expected: all unit tests pass (the 20 transition cases plus the rest).

- [ ] **Step 4: Commit**

```bash
git add api/src/domain/transitions.ts api/test/unit/transitions.test.ts
git commit -m "feat(ride): define pool and ride-request state machines

Two machines instead of one: the pool (Jashim's trip) and each ride
request (a passenger's ticket). Table-driven tests cover every allowed
and rejected transition.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 8: Ride requests — create, list, detail, cancel (unmatched), audit events

**Branch:** still `feature/ride-requests`

**Files:**
- Create: `api/src/services/events.ts`, `api/src/services/rideService.ts`, `api/src/routes/rides.ts`
- Create: `api/test/helpers/scenario.ts`
- Modify: `api/src/services/views.ts` (append types), `api/src/routes/index.ts`
- Test: `api/test/integration/rides.test.ts`

**Interfaces:**
- Consumes: `resolveTrip`, `TripSchema`, `TripInput`, `estimateFares`, `canPassengerCancel`, `parseBody`, `parseId`, `authenticate`, `requireRole`, `currentUser`, `isUniqueViolation`, `conflict`, `notFound`, `Db`.
- Produces:
  - `recordEvent(db: Db, event: NewRideEvent): Promise<void>` and `type RideEventType`
  - In `views.ts`: `RidePoolView`, `RideView`, `RideEventView`, `RideDetailView`
  - `rideService`:
    - `createRide(passengerId, input: TripInput): Promise<RideView>`
    - `getRideForPassenger(rideId, passengerId): Promise<RideView>`
    - `getRideDetail(rideId, passengerId): Promise<RideDetailView>`
    - `listRides(passengerId): Promise<RideView[]>`
    - `cancelRide(rideId, passengerId): Promise<RideView>`
  - Test helpers: `type PassengerKey`, `requestRide(who, from, to, seats?)`, `cancelRide(who, rideId)`, `getRide(who, rideId)`. Each returns a supertest `Response`.

- [ ] **Step 1: Write the failing tests**

`api/test/helpers/scenario.ts`:
```ts
import type { ZoneName } from '../../src/db/cast';
import { zoneId } from './db';
import { api, bearer, loginAs } from './http';

export type PassengerKey = 'nusrat' | 'rafiq' | 'shirin';

export async function requestRide(who: PassengerKey, from: ZoneName, to: ZoneName, seats = 1) {
  return api()
    .post('/api/rides')
    .set(bearer(await loginAs(who)))
    .send({ pickupZoneId: await zoneId(from), dropoffZoneId: await zoneId(to), seats });
}

export async function cancelRide(who: PassengerKey, rideId: string) {
  return api().post(`/api/rides/${rideId}/cancel`).set(bearer(await loginAs(who)));
}

export async function getRide(who: PassengerKey, rideId: string) {
  return api().get(`/api/rides/${rideId}`).set(bearer(await loginAs(who)));
}
```

`api/test/integration/rides.test.ts`:
```ts
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase, resetRideData, zoneId } from '../helpers/db';
import { api, bearer, loginAs } from '../helpers/http';
import { cancelRide, getRide, requestRide } from '../helpers/scenario';

describe('ride requests', () => {
  beforeAll(resetDatabase);
  beforeEach(resetRideData);

  it('lets Nusrat request Banani → Mohakhali and shows both price estimates', async () => {
    const res = await requestRide('nusrat', 'Banani', 'Mohakhali');
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      status: 'REQUESTED',
      seats: 1,
      pickupZone: { name: 'Banani' },
      dropoffZone: { name: 'Mohakhali' },
      distanceKm: 2,
      estimate: { soloPaisa: 7000, pooledPaisa: 5250 },
      fare: null,
      pool: null,
      cancelledBy: null,
    });
  });

  it('allows only one active ride at a time (409 ACTIVE_RIDE_EXISTS)', async () => {
    await requestRide('nusrat', 'Banani', 'Mohakhali');
    const second = await requestRide('nusrat', 'Banani', 'Gulshan 1');
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('ACTIVE_RIDE_EXISTS');
  });

  it('survives a double-clicked Request button: exactly one ride is created', async () => {
    const [a, b] = await Promise.all([
      requestRide('shirin', 'Banani', 'Mohakhali'),
      requestRide('shirin', 'Banani', 'Mohakhali'),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const list = await api().get('/api/rides').set(bearer(await loginAs('shirin')));
    expect(list.body).toHaveLength(1);
  });

  it('lists only my own rides, newest first', async () => {
    const first = await requestRide('rafiq', 'Banani', 'Gulshan 1');
    await cancelRide('rafiq', first.body.id);
    const second = await requestRide('rafiq', 'Banani', 'Mohakhali');
    await requestRide('nusrat', 'Banani', 'Mohakhali');
    const list = await api().get('/api/rides').set(bearer(await loginAs('rafiq')));
    expect(list.body.map((r: { id: string }) => r.id)).toEqual([second.body.id, first.body.id]);
  });

  it('shows the event history on the ride detail', async () => {
    const ride = await requestRide('nusrat', 'Banani', 'Mohakhali');
    const detail = await getRide('nusrat', ride.body.id);
    expect(detail.status).toBe(200);
    expect(detail.body.events).toEqual([
      expect.objectContaining({ type: 'RIDE_REQUESTED', fromStatus: null, toStatus: 'REQUESTED', actor: 'PASSENGER' }),
    ]);
  });

  it("hides Nusrat's ride from Rafiq: 404 on read and on cancel, and the ride is untouched", async () => {
    const ride = await requestRide('nusrat', 'Banani', 'Mohakhali');
    expect((await getRide('rafiq', ride.body.id)).status).toBe(404);
    expect((await cancelRide('rafiq', ride.body.id)).status).toBe(404);
    expect((await getRide('nusrat', ride.body.id)).body.status).toBe('REQUESTED');
  });

  it('answers malformed ride ids with 404, not 500', async () => {
    expect((await getRide('nusrat', 'not-a-uuid')).status).toBe(404);
    expect((await cancelRide('nusrat', '123')).status).toBe(404);
  });

  it('lets Nusrat cancel a waiting ride exactly once, then book again', async () => {
    const ride = await requestRide('nusrat', 'Banani', 'Mohakhali');
    const cancelled = await cancelRide('nusrat', ride.body.id);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body).toMatchObject({ status: 'CANCELLED', cancelledBy: 'PASSENGER' });
    const again = await cancelRide('nusrat', ride.body.id);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('INVALID_TRANSITION');
    expect((await requestRide('nusrat', 'Banani', 'Mohakhali')).status).toBe(201);
  });

  it('does not let a driver book rides (403)', async () => {
    const res = await api()
      .post('/api/rides')
      .set(bearer(await loginAs('jashim')))
      .send({ pickupZoneId: await zoneId('Banani'), dropoffZoneId: await zoneId('Mohakhali'), seats: 1 });
    expect(res.status).toBe(403);
  });
});
```

Run: `npx vitest run test/integration/rides.test.ts`
Expected: FAIL with 404s from the missing routes.

- [ ] **Step 2: Implement events, views, the ride service, and routes**

`api/src/services/events.ts`:
```ts
import type { Prisma } from '@prisma/client';
import { logger } from '../lib/logger';
import type { Db } from '../lib/prisma';

export type RideEventType =
  | 'RIDE_REQUESTED'
  | 'RIDE_MATCHED'
  | 'RIDE_STATUS_CHANGED'
  | 'RIDE_CANCELLED'
  | 'RIDE_REQUEUED'
  | 'POOL_OPENED'
  | 'POOL_STATUS_CHANGED'
  | 'POOL_MEMBER_JOINED'
  | 'POOL_MEMBER_LEFT';

export interface NewRideEvent {
  type: RideEventType;
  rideRequestId?: string;
  poolId?: string;
  /** null = the system acted (e.g. auto-join) */
  actorUserId: string | null;
  fromStatus?: string | null;
  toStatus?: string | null;
  metadata?: Prisma.InputJsonValue;
}

/** Append-only audit trail. Always call inside the same transaction as the change it describes. */
export async function recordEvent(db: Db, event: NewRideEvent): Promise<void> {
  await db.rideEvent.create({
    data: {
      type: event.type,
      rideRequestId: event.rideRequestId ?? null,
      poolId: event.poolId ?? null,
      actorUserId: event.actorUserId,
      fromStatus: event.fromStatus ?? null,
      toStatus: event.toStatus ?? null,
      metadata: event.metadata,
    },
  });
  // Every state change also goes to the structured log (spec §7). If the surrounding
  // transaction later rolls back, the error log that follows explains why.
  logger.info(
    { event: event.type, rideRequestId: event.rideRequestId, poolId: event.poolId, from: event.fromStatus, to: event.toStatus },
    'state change',
  );
}
```

Append to `api/src/services/views.ts`:
```ts
import type { FareBreakdown } from '../domain/fare';
import type { PoolStatus, RideStatus } from '../domain/transitions';

/** What a passenger may see about their pool: no other riders' names, destinations or fares. */
export interface RidePoolView {
  id: string;
  status: PoolStatus;
  driverName: string;
  vehicleName: string;
  vehiclePlate: string;
  coRiderCount: number;
}

export interface RideView {
  id: string;
  status: RideStatus;
  seats: number;
  pickupZone: ZoneRef;
  dropoffZone: ZoneRef;
  distanceKm: number;
  estimate: { soloPaisa: number; pooledPaisa: number };
  /** Locked when the trip starts; null before that. */
  fare: FareBreakdown | null;
  cancelledBy: 'PASSENGER' | 'DRIVER' | null;
  createdAt: string;
  pool: RidePoolView | null;
}

export interface RideEventView {
  type: string;
  fromStatus: string | null;
  toStatus: string | null;
  actor: 'PASSENGER' | 'DRIVER' | 'SYSTEM';
  createdAt: string;
}

export interface RideDetailView extends RideView {
  events: RideEventView[];
}
```
(Move the two new `import type` lines to the top of the file, next to the existing import.)

`api/src/services/rideService.ts`:
```ts
import type { Prisma } from '@prisma/client';
import { estimateFares } from '../domain/fare';
import { canPassengerCancel } from '../domain/transitions';
import { conflict, notFound } from '../lib/AppError';
import { prisma } from '../lib/prisma';
import { isUniqueViolation } from '../lib/prismaErrors';
import type { TripInput } from '../routes/schemas';
import { recordEvent } from './events';
import { resolveTrip } from './fareService';
import { toZoneRef, type RideDetailView, type RideView } from './views';

const rideInclude = {
  pickupZone: true,
  dropoffZone: true,
  memberships: {
    where: { leftAt: null },
    include: {
      pool: {
        include: {
          vehicle: { include: { driver: true } },
          _count: { select: { members: { where: { leftAt: null } } } },
        },
      },
    },
  },
} satisfies Prisma.RideRequestInclude;

type RideWithRelations = Prisma.RideRequestGetPayload<{ include: typeof rideInclude }>;

function toRideView(ride: RideWithRelations): RideView {
  const pool = ride.memberships[0]?.pool;
  return {
    id: ride.id,
    status: ride.status,
    seats: ride.seats,
    pickupZone: toZoneRef(ride.pickupZone),
    dropoffZone: toZoneRef(ride.dropoffZone),
    distanceKm: ride.distanceKm,
    estimate: { soloPaisa: ride.estimateSoloPaisa, pooledPaisa: ride.estimatePooledPaisa },
    fare:
      ride.fareTotalPaisa === null
        ? null
        : {
            basePaisa: ride.fareBasePaisa ?? 0,
            distancePaisa: ride.fareDistancePaisa ?? 0,
            discountPaisa: ride.fareDiscountPaisa ?? 0,
            totalPaisa: ride.fareTotalPaisa,
          },
    cancelledBy: ride.cancelledBy,
    createdAt: ride.createdAt.toISOString(),
    pool: pool
      ? {
          id: pool.id,
          status: pool.status,
          driverName: pool.vehicle.driver.name,
          vehicleName: pool.vehicle.name,
          vehiclePlate: pool.vehicle.plate,
          coRiderCount: Math.max(pool._count.members - 1, 0),
        }
      : null,
  };
}

export async function createRide(passengerId: string, input: TripInput): Promise<RideView> {
  const trip = await resolveTrip(input);
  const estimate = estimateFares(trip.distanceKm, input.seats);

  let rideId: string;
  try {
    rideId = await prisma.$transaction(async (tx) => {
      const ride = await tx.rideRequest.create({
        data: {
          passengerId,
          pickupZoneId: trip.pickup.id,
          dropoffZoneId: trip.dropoff.id,
          seats: input.seats,
          distanceKm: trip.distanceKm,
          estimateSoloPaisa: estimate.soloPaisa,
          estimatePooledPaisa: estimate.pooledPaisa,
        },
      });
      await recordEvent(tx, {
        type: 'RIDE_REQUESTED',
        rideRequestId: ride.id,
        actorUserId: passengerId,
        toStatus: 'REQUESTED',
        metadata: { distanceKm: trip.distanceKm, ...estimate },
      });
      return ride.id;
    });
  } catch (err) {
    // The partial unique index is the source of truth, including for double-clicks racing each other.
    if (isUniqueViolation(err)) throw conflict('ACTIVE_RIDE_EXISTS', 'You already have an active ride. Cancel it or wait until it completes');
    throw err;
  }

  return getRideForPassenger(rideId, passengerId);
}

async function findOwnRide(rideId: string, passengerId: string): Promise<RideWithRelations> {
  const ride = await prisma.rideRequest.findFirst({ where: { id: rideId, passengerId }, include: rideInclude });
  if (!ride) throw notFound('Ride'); // someone else's ride is indistinguishable from a missing one
  return ride;
}

export async function getRideForPassenger(rideId: string, passengerId: string): Promise<RideView> {
  return toRideView(await findOwnRide(rideId, passengerId));
}

export async function getRideDetail(rideId: string, passengerId: string): Promise<RideDetailView> {
  const ride = await findOwnRide(rideId, passengerId);
  const events = await prisma.rideEvent.findMany({
    where: { rideRequestId: rideId, type: { startsWith: 'RIDE_' } },
    orderBy: { id: 'asc' },
    include: { actor: { select: { role: true } } },
  });
  return {
    ...toRideView(ride),
    events: events.map((event) => ({
      type: event.type,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      actor: event.actor?.role ?? 'SYSTEM',
      createdAt: event.createdAt.toISOString(),
    })),
  };
}

export async function listRides(passengerId: string): Promise<RideView[]> {
  const rides = await prisma.rideRequest.findMany({
    where: { passengerId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: rideInclude,
  });
  return rides.map(toRideView);
}

export async function cancelRide(rideId: string, passengerId: string): Promise<RideView> {
  const ride = await findOwnRide(rideId, passengerId);
  if (!canPassengerCancel(ride.status)) {
    throw conflict('INVALID_TRANSITION', `A ride that is ${ride.status.toLowerCase().replace('_', ' ')} can no longer be cancelled`);
  }

  await prisma.$transaction(async (tx) => {
    // Guarded update: if the ride changed since we read it, touch nothing.
    const { count } = await tx.rideRequest.updateMany({
      where: { id: rideId, status: 'REQUESTED' },
      data: { status: 'CANCELLED', cancelledBy: 'PASSENGER' },
    });
    if (count === 0) throw conflict('INVALID_TRANSITION', 'Your ride changed while you were cancelling. Refresh and try again');
    await recordEvent(tx, {
      type: 'RIDE_CANCELLED',
      rideRequestId: rideId,
      actorUserId: passengerId,
      fromStatus: 'REQUESTED',
      toStatus: 'CANCELLED',
    });
  });

  return getRideForPassenger(rideId, passengerId);
}
```

`api/src/routes/rides.ts`:
```ts
import { Router } from 'express';
import { authenticate, currentUser, requireRole } from '../middleware/authenticate';
import { parseBody, parseId } from '../middleware/validate';
import * as rideService from '../services/rideService';
import { TripSchema } from './schemas';

export const ridesRouter = Router();

ridesRouter.use(authenticate, requireRole('PASSENGER'));

ridesRouter.post('/', async (req, res) => {
  const input = parseBody(TripSchema, req.body);
  res.status(201).json(await rideService.createRide(currentUser(req).id, input));
});

ridesRouter.get('/', async (req, res) => {
  res.json(await rideService.listRides(currentUser(req).id));
});

ridesRouter.get('/:id', async (req, res) => {
  res.json(await rideService.getRideDetail(parseId(req.params.id, 'Ride'), currentUser(req).id));
});

ridesRouter.post('/:id/cancel', async (req, res) => {
  res.json(await rideService.cancelRide(parseId(req.params.id, 'Ride'), currentUser(req).id));
});
```

In `api/src/routes/index.ts`, add `import { ridesRouter } from './rides';` and `apiRouter.use('/rides', ridesRouter);` after the fares line.

- [ ] **Step 3: Run all tests**

Run: `npx vitest run && npx tsc --noEmit`
Expected: everything passes.

- [ ] **Step 4: Commit**

```bash
git add api/src api/test
git commit -m "feat(ride): let passengers request, view and cancel rides

Stores both fare estimates, writes an append-only event per change,
returns 404 for other passengers' rides, and relies on the partial
unique index so a double-clicked request creates exactly one ride.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Close the branch**

Follow the Branch close procedure with `<branch>` = `feature/ride-requests`, `<title>` = `Ride requests and lifecycle state machines`, and `<summary>` = `Pool/ride state machines, POST/GET /api/rides, cancel while waiting, audit events, ownership checks.`

---

## Task 9: Driver availability (online/offline in a zone)

**Branch:** `git checkout -b feature/tesla-pooling`

**Files:**
- Create: `api/src/services/locks.ts`, `api/src/services/driverService.ts`, `api/src/routes/driver.ts`
- Modify: `api/src/routes/index.ts`, `api/test/helpers/scenario.ts`
- Test: `api/test/integration/driver-availability.test.ts`

**Interfaces:**
- Consumes: `prisma`, `Db`, `toVehicleView`, `ACTIVE_POOL_STATUSES`, `conflict`, `notFound`, `AppError`, `parseBody`.
- Produces:
  - `lockVehicleForDriver(tx: Db, driverId: string): Promise<Vehicle & { currentZone: Zone | null }>`, which takes a row lock
  - `lockPool(tx: Db, poolId: string): Promise<void>`, which takes a row lock
  - `setAvailability(driverId, { online, zoneId? }): Promise<VehicleView>`
  - `PUT /api/driver/availability`
  - `driverRouter`, which later tasks add routes to
  - Test helpers: `type DriverKey`, `goOnline(driver, zone)`, `goOffline(driver)`

- [ ] **Step 1: Write the failing tests**

Append to `api/test/helpers/scenario.ts`:
```ts
export type DriverKey = 'jashim' | 'monir';

export async function goOnline(driver: DriverKey, zone: ZoneName) {
  return api().put('/api/driver/availability').set(bearer(await loginAs(driver))).send({ online: true, zoneId: await zoneId(zone) });
}

export async function goOffline(driver: DriverKey) {
  return api().put('/api/driver/availability').set(bearer(await loginAs(driver))).send({ online: false });
}
```

`api/test/integration/driver-availability.test.ts`:
```ts
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase, resetRideData } from '../helpers/db';
import { api, bearer, loginAs } from '../helpers/http';
import { goOffline, goOnline } from '../helpers/scenario';

describe('driver availability', () => {
  beforeAll(resetDatabase);
  beforeEach(resetRideData);

  it('puts Jashim and Bullet online at Banani Road 11', async () => {
    const res = await goOnline('jashim', 'Banani');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Bullet', isOnline: true, currentZone: { name: 'Banani' } });
    const me = await api().get('/api/me').set(bearer(await loginAs('jashim')));
    expect(me.body.vehicle.isOnline).toBe(true);
  });

  it('takes Jashim offline again', async () => {
    await goOnline('jashim', 'Banani');
    const res = await goOffline('jashim');
    expect(res.body).toMatchObject({ isOnline: false, currentZone: null });
  });

  it('needs a zone to go online', async () => {
    const res = await api().put('/api/driver/availability').set(bearer(await loginAs('jashim'))).send({ online: true });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe('zoneId');
  });

  it('rejects an unknown zone', async () => {
    const res = await api().put('/api/driver/availability').set(bearer(await loginAs('jashim'))).send({ online: true, zoneId: 99999 });
    expect(res.status).toBe(400);
  });

  it('is for drivers only', async () => {
    const res = await api().put('/api/driver/availability').set(bearer(await loginAs('nusrat'))).send({ online: false });
    expect(res.status).toBe(403);
  });
});
```

Run: `npx vitest run test/integration/driver-availability.test.ts`
Expected: FAIL with 404s.

- [ ] **Step 2: Implement locks, the availability service, and the route**

`api/src/services/locks.ts`:
```ts
import type { Vehicle, Zone } from '@prisma/client';
import { notFound } from '../lib/AppError';
import type { Db } from '../lib/prisma';

/**
 * Row locks (SELECT … FOR UPDATE) held until the transaction ends.
 * Lock order everywhere: vehicle → pool → ride requests. A single order means no deadlocks.
 */
export async function lockVehicleForDriver(tx: Db, driverId: string): Promise<Vehicle & { currentZone: Zone | null }> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM vehicles WHERE driver_id = ${driverId}::uuid FOR UPDATE`;
  const row = rows[0];
  if (!row) throw notFound('Vehicle');
  return tx.vehicle.findUniqueOrThrow({ where: { id: row.id }, include: { currentZone: true } });
}

export async function lockPool(tx: Db, poolId: string): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM pools WHERE id = ${poolId}::uuid FOR UPDATE`;
  if (rows.length === 0) throw notFound('Pool');
}
```

`api/src/services/driverService.ts`:
```ts
import { ACTIVE_POOL_STATUSES } from '../domain/transitions';
import { AppError, conflict } from '../lib/AppError';
import { prisma } from '../lib/prisma';
import { lockVehicleForDriver } from './locks';
import { toVehicleView, type VehicleView } from './views';

export async function setAvailability(driverId: string, input: { online: boolean; zoneId?: number }): Promise<VehicleView> {
  return prisma.$transaction(async (tx) => {
    const vehicle = await lockVehicleForDriver(tx, driverId);

    const activePool = await tx.pool.findFirst({ where: { vehicleId: vehicle.id, status: { in: ACTIVE_POOL_STATUSES } } });
    if (activePool) throw conflict('ACTIVE_POOL_EXISTS', 'Finish or cancel your current trip before changing availability');

    if (input.online) {
      const zone = input.zoneId === undefined ? null : await tx.zone.findUnique({ where: { id: input.zoneId } });
      if (!zone) throw new AppError(400, 'VALIDATION_ERROR', 'Unknown zone', [{ path: 'zoneId', message: 'Unknown zone' }]);
    }

    const updated = await tx.vehicle.update({
      where: { id: vehicle.id },
      data: input.online ? { isOnline: true, currentZoneId: input.zoneId } : { isOnline: false, currentZoneId: null },
      include: { currentZone: true },
    });
    return toVehicleView(updated);
  });
}
```

`api/src/routes/driver.ts`:
```ts
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, currentUser, requireRole } from '../middleware/authenticate';
import { parseBody } from '../middleware/validate';
import * as driverService from '../services/driverService';

const AvailabilitySchema = z
  .object({ online: z.boolean(), zoneId: z.number().int().positive().optional() })
  .refine((body) => !body.online || body.zoneId !== undefined, { message: 'Choose a zone to go online', path: ['zoneId'] });

export const driverRouter = Router();

driverRouter.use(authenticate, requireRole('DRIVER'));

driverRouter.put('/availability', async (req, res) => {
  res.json(await driverService.setAvailability(currentUser(req).id, parseBody(AvailabilitySchema, req.body)));
});
```

In `api/src/routes/index.ts`, add `import { driverRouter } from './driver';` and `apiRouter.use('/driver', driverRouter);`.

- [ ] **Step 3: Run all tests**

Run: `npx vitest run && npx tsc --noEmit`
Expected: everything passes.

- [ ] **Step 4: Commit**

```bash
git add api/src api/test
git commit -m "feat(driver): let drivers go online in a zone or offline

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 10: Seat claiming, driver accept, and the driver's pool view

**Branch:** still `feature/tesla-pooling`

**Files:**
- Create: `api/src/domain/matching.ts`, `api/src/services/claimSeats.ts`
- Modify: `api/src/services/views.ts` (append), `api/src/services/driverService.ts` (append), `api/src/routes/driver.ts` (append), `api/test/helpers/scenario.ts` (append)
- Test: `api/test/unit/matching.test.ts`, `api/test/integration/pool-accept.test.ts`

**Interfaces:**
- Consumes: `fitsDestinationCluster`, `GridPoint`, `isJoinable`, `PoolStatus`, `ACTIVE_POOL_STATUSES`, `recordEvent`, `lockVehicleForDriver`, `prisma`, `Db`, `conflict`, `notFound`, `parseId`.
- Produces:
  - `domain/matching.ts`:
    - `interface JoinRequest { pickupZoneId: number; dropoff: GridPoint; seats: number }`
    - `interface PoolSnapshot { pickupZoneId; status: PoolStatus; capacity; seatsTaken; memberDropoffs: GridPoint[] }`
    - `type JoinVerdict = 'OK'|'POOL_CLOSED'|'INCOMPATIBLE'|'NO_SEATS'`
    - `checkJoin(req, pool): JoinVerdict`
  - `services/claimSeats.ts`:
    - `type ClaimFailure = 'NO_SEATS'|'POOL_CLOSED'|'INCOMPATIBLE'|'ALREADY_MATCHED'`
    - `class ClaimRejected extends Error { reason: ClaimFailure }`
    - `CLAIM_MESSAGES: Record<ClaimFailure, string>`
    - `interface ClaimArgs { poolId; rideRequestId; actorUserId: string | null; via: 'AUTO_JOIN'|'DRIVER_ACCEPT' }`
    - `claimSeatsInTx(tx: Db, args: ClaimArgs): Promise<void>`, which throws `ClaimRejected`
    - `claimSeats(args): Promise<{ ok: true } | { ok: false; reason: ClaimFailure }>`
  - In `views.ts`: `DriverRiderView`, `DriverPoolView`
  - `driverService`:
    - `acceptRequest(driverId, rideRequestId): Promise<DriverPoolView>`
    - `getDriverPool(driverId): Promise<DriverPoolView | null>`
    - `getDriverPoolById(poolId, opts?: { includeLeft?: boolean }): Promise<DriverPoolView>`
    - `driverPoolInclude`
    - `toDriverPoolView(pool, includeLeft)`
  - Routes: `POST /api/driver/requests/:id/accept` and `GET /api/driver/pool`, which returns `{ pool: DriverPoolView | null }`
  - Test helpers: `acceptRide(driver, rideId)`, `driverPool(driver)`, `seatInvariant(poolId): Promise<{ seatsTaken: number; activeSeats: number }>`

- [ ] **Step 1: Write the failing matching unit test**

`api/test/unit/matching.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { checkJoin, type PoolSnapshot } from '../../src/domain/matching';

const BANANI = 1;
const GULSHAN_2 = 4;
const Mohakhali = { gridX: 0, gridY: -2 };
const Gulshan1 = { gridX: 1, gridY: -2 };
const Uttara = { gridX: -3, gridY: 9 };

const bulletWithNusrat: PoolSnapshot = {
  pickupZoneId: BANANI, status: 'OPEN', capacity: 3, seatsTaken: 1, memberDropoffs: [Mohakhali],
};

describe('checkJoin', () => {
  it("lets Rafiq (Banani → Gulshan 1) join Nusrat's pool", () => {
    expect(checkJoin({ pickupZoneId: BANANI, dropoff: Gulshan1, seats: 1 }, bulletWithNusrat)).toBe('OK');
  });
  it('rejects a Banani → Uttara rider as INCOMPATIBLE', () => {
    expect(checkJoin({ pickupZoneId: BANANI, dropoff: Uttara, seats: 1 }, bulletWithNusrat)).toBe('INCOMPATIBLE');
  });
  it('rejects a rider waiting in another zone as INCOMPATIBLE', () => {
    expect(checkJoin({ pickupZoneId: GULSHAN_2, dropoff: Mohakhali, seats: 1 }, bulletWithNusrat)).toBe('INCOMPATIBLE');
  });
  it('rejects anyone once the trip has STARTED', () => {
    expect(checkJoin({ pickupZoneId: BANANI, dropoff: Mohakhali, seats: 1 }, { ...bulletWithNusrat, status: 'STARTED' })).toBe('POOL_CLOSED');
  });
  it('still accepts riders while Jashim waits at pickup (DRIVER_ARRIVED)', () => {
    expect(checkJoin({ pickupZoneId: BANANI, dropoff: Mohakhali, seats: 1 }, { ...bulletWithNusrat, status: 'DRIVER_ARRIVED' })).toBe('OK');
  });
  it('rejects a 2-seat request when one seat is left', () => {
    expect(checkJoin({ pickupZoneId: BANANI, dropoff: Mohakhali, seats: 2 }, { ...bulletWithNusrat, seatsTaken: 2 })).toBe('NO_SEATS');
  });
  it('accepts anyone who fits into an empty pool', () => {
    expect(checkJoin({ pickupZoneId: BANANI, dropoff: Uttara, seats: 3 }, { ...bulletWithNusrat, seatsTaken: 0, memberDropoffs: [] })).toBe('OK');
  });
});
```

Run: `npx vitest run test/unit/matching.test.ts`
Expected: FAIL, because the module can't be resolved.

- [ ] **Step 2: Implement the matching domain**

`api/src/domain/matching.ts`:
```ts
import { fitsDestinationCluster, type GridPoint } from './geo';
import { isJoinable, type PoolStatus } from './transitions';

export interface JoinRequest {
  pickupZoneId: number;
  dropoff: GridPoint;
  seats: number;
}

export interface PoolSnapshot {
  pickupZoneId: number;
  status: PoolStatus;
  capacity: number;
  seatsTaken: number;
  memberDropoffs: GridPoint[];
}

export type JoinVerdict = 'OK' | 'POOL_CLOSED' | 'INCOMPATIBLE' | 'NO_SEATS';

/** The spec §3.2 compatibility rule. Pure: used to pick candidates and to list relevant requests. */
export function checkJoin(request: JoinRequest, pool: PoolSnapshot): JoinVerdict {
  if (!isJoinable(pool.status)) return 'POOL_CLOSED';
  if (request.pickupZoneId !== pool.pickupZoneId) return 'INCOMPATIBLE';
  if (!fitsDestinationCluster(request.dropoff, pool.memberDropoffs)) return 'INCOMPATIBLE';
  if (pool.seatsTaken + request.seats > pool.capacity) return 'NO_SEATS';
  return 'OK';
}
```

Run: `npx vitest run test/unit/matching.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 3: Write the failing accept and capacity integration tests**

Append to `api/test/helpers/scenario.ts`:
```ts
import { prisma } from '../../src/lib/prisma';

export async function acceptRide(driver: DriverKey, rideId: string) {
  return api().post(`/api/driver/requests/${rideId}/accept`).set(bearer(await loginAs(driver)));
}

export async function driverPool(driver: DriverKey) {
  return api().get('/api/driver/pool').set(bearer(await loginAs(driver)));
}

/** seats_taken must always equal the seats of the pool's current members. */
export async function seatInvariant(poolId: string): Promise<{ seatsTaken: number; activeSeats: number }> {
  const pool = await prisma.pool.findUniqueOrThrow({ where: { id: poolId } });
  const active = await prisma.poolMember.aggregate({ where: { poolId, leftAt: null }, _sum: { seats: true } });
  return { seatsTaken: pool.seatsTaken, activeSeats: active._sum.seats ?? 0 };
}
```
(Move the `prisma` import to the top of the file.)

`api/test/integration/pool-accept.test.ts`:
```ts
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase, resetRideData } from '../helpers/db';
import { acceptRide, driverPool, getRide, goOffline, goOnline, requestRide, seatInvariant } from '../helpers/scenario';

describe('driver accepts rides into a pool', () => {
  beforeAll(resetDatabase);
  beforeEach(resetRideData);

  it('opens a pool in Bullet when Jashim accepts Nusrat', async () => {
    await goOnline('jashim', 'Banani');
    const nusrat = await requestRide('nusrat', 'Banani', 'Mohakhali');
    const accepted = await acceptRide('jashim', nusrat.body.id);
    expect(accepted.status).toBe(200);
    expect(accepted.body).toMatchObject({
      status: 'OPEN', capacity: 3, seatsTaken: 1, isFull: false, pickupZone: { name: 'Banani' },
      vehicle: { name: 'Bullet', plate: 'DHK-TESLA-11' },
      riders: [{ firstName: 'Nusrat', seats: 1, dropoffZone: { name: 'Mohakhali' }, status: 'MATCHED', estimatePaisa: 7000 }],
    });
    const ride = await getRide('nusrat', nusrat.body.id);
    expect(ride.body).toMatchObject({ status: 'MATCHED', pool: { driverName: 'Jashim', vehicleName: 'Bullet', coRiderCount: 0 } });
    expect(ride.body.events.map((e: { type: string }) => e.type)).toEqual(['RIDE_REQUESTED', 'RIDE_MATCHED']);
    expect((await driverPool('jashim')).body.pool.id).toBe(accepted.body.id);
  });

  it('fills Bullet to exactly three seats and refuses a fourth', async () => {
    await goOnline('jashim', 'Banani');
    const rafiq = await requestRide('rafiq', 'Banani', 'Gulshan 1', 2);
    const nusrat = await requestRide('nusrat', 'Banani', 'Mohakhali');
    const shirin = await requestRide('shirin', 'Banani', 'Mohakhali');
    await acceptRide('jashim', rafiq.body.id);
    const full = await acceptRide('jashim', nusrat.body.id);
    expect(full.body).toMatchObject({ seatsTaken: 3, isFull: true });
    const overflow = await acceptRide('jashim', shirin.body.id);
    expect(overflow.status).toBe(409);
    expect(overflow.body.error.code).toBe('NO_SEATS');
    expect(await seatInvariant(full.body.id)).toEqual({ seatsTaken: 3, activeSeats: 3 });
    expect((await getRide('shirin', shirin.body.id)).body.status).toBe('REQUESTED');
  });

  it('refuses an incompatible rider into an existing pool', async () => {
    await goOnline('jashim', 'Banani');
    const nusrat = await requestRide('nusrat', 'Banani', 'Mohakhali');
    const shirin = await requestRide('shirin', 'Banani', 'Uttara');
    await acceptRide('jashim', nusrat.body.id);
    const res = await acceptRide('jashim', shirin.body.id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INCOMPATIBLE');
  });

  it('refuses when the driver is offline', async () => {
    const nusrat = await requestRide('nusrat', 'Banani', 'Mohakhali');
    const res = await acceptRide('jashim', nusrat.body.id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DRIVER_OFFLINE');
  });

  it('refuses a rider waiting in a different zone', async () => {
    await goOnline('jashim', 'Gulshan 2');
    const nusrat = await requestRide('nusrat', 'Banani', 'Mohakhali');
    const res = await acceptRide('jashim', nusrat.body.id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('WRONG_ZONE');
  });

  it('leaves no empty pool behind when Toofan (2 seats) cannot fit a 3-seat request', async () => {
    await goOnline('monir', 'Banani');
    const rafiq = await requestRide('rafiq', 'Banani', 'Gulshan 1', 3);
    const res = await acceptRide('monir', rafiq.body.id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NO_SEATS');
    expect((await driverPool('monir')).body.pool).toBeNull();
  });

  it('tells a second driver the rider is already taken', async () => {
    await goOnline('jashim', 'Banani');
    await goOnline('monir', 'Banani');
    const nusrat = await requestRide('nusrat', 'Banani', 'Mohakhali');
    await acceptRide('jashim', nusrat.body.id);
    const res = await acceptRide('monir', nusrat.body.id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_MATCHED');
  });

  it('keeps Jashim online while he has riders', async () => {
    await goOnline('jashim', 'Banani');
    const nusrat = await requestRide('nusrat', 'Banani', 'Mohakhali');
    await acceptRide('jashim', nusrat.body.id);
    const res = await goOffline('jashim');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ACTIVE_POOL_EXISTS');
  });

  it('answers unknown or malformed request ids with 404', async () => {
    await goOnline('jashim', 'Banani');
    expect((await acceptRide('jashim', '7d3c1b7e-0000-4000-8000-000000000000')).status).toBe(404);
    expect((await acceptRide('jashim', 'nope')).status).toBe(404);
  });
});
```

Run: `npx vitest run test/integration/pool-accept.test.ts`
Expected: FAIL with 404s, because the routes are missing.

- [ ] **Step 4: Implement seat claiming, accept, and the driver pool view**

`api/src/services/claimSeats.ts`:
```ts
import { fitsDestinationCluster } from '../domain/geo';
import { isJoinable } from '../domain/transitions';
import { prisma, type Db } from '../lib/prisma';
import { recordEvent } from './events';

export type ClaimFailure = 'NO_SEATS' | 'POOL_CLOSED' | 'INCOMPATIBLE' | 'ALREADY_MATCHED';

export class ClaimRejected extends Error {
  constructor(readonly reason: ClaimFailure) {
    super(`Seat claim rejected: ${reason}`);
    this.name = 'ClaimRejected';
  }
}

export const CLAIM_MESSAGES: Record<ClaimFailure, string> = {
  NO_SEATS: 'Not enough free seats for this request',
  POOL_CLOSED: 'This trip has already started. No new riders',
  INCOMPATIBLE: "This rider's trip doesn't fit the current pool",
  ALREADY_MATCHED: 'Another Tesla already picked up this rider',
};

export interface ClaimArgs {
  poolId: string;
  rideRequestId: string;
  actorUserId: string | null;
  via: 'AUTO_JOIN' | 'DRIVER_ACCEPT';
}

/**
 * Seats a REQUESTED ride in a pool. Must run inside a transaction. Throws ClaimRejected
 * (so the caller's transaction rolls back) when the ride can't be seated.
 * This function is the only place seats are ever taken.
 */
export async function claimSeatsInTx(tx: Db, args: ClaimArgs): Promise<void> {
  const ride = await tx.rideRequest.findUniqueOrThrow({ where: { id: args.rideRequestId }, include: { dropoffZone: true } });

  // 1. Take the seats atomically. This UPDATE locks the pool row. A concurrent claim waits here,
  //    and once we commit, Postgres re-checks its WHERE against the new seats_taken.
  const claimed = await tx.$queryRaw<{ id: string }[]>`
    UPDATE pools
       SET seats_taken = seats_taken + ${ride.seats}::int
     WHERE id = ${args.poolId}::uuid
       AND status IN ('OPEN', 'DRIVER_ARRIVED')
       AND seats_taken + ${ride.seats}::int <= capacity
    RETURNING id`;
  if (claimed.length === 0) {
    const pool = await tx.pool.findUniqueOrThrow({ where: { id: args.poolId } });
    throw new ClaimRejected(isJoinable(pool.status) ? 'NO_SEATS' : 'POOL_CLOSED');
  }

  // 2. We hold the pool lock, so nobody else can join right now. This compatibility check is race-free.
  const pool = await tx.pool.findUniqueOrThrow({
    where: { id: args.poolId },
    include: { members: { where: { leftAt: null }, include: { rideRequest: { include: { dropoffZone: true } } } } },
  });
  const memberDropoffs = pool.members.map((member) => member.rideRequest.dropoffZone);
  if (ride.pickupZoneId !== pool.pickupZoneId || !fitsDestinationCluster(ride.dropoffZone, memberDropoffs)) {
    throw new ClaimRejected('INCOMPATIBLE');
  }

  // 3. Guarded status change: exactly one pool can win this ride.
  const { count } = await tx.rideRequest.updateMany({
    where: { id: ride.id, status: 'REQUESTED' },
    data: { status: 'MATCHED' },
  });
  if (count === 0) throw new ClaimRejected('ALREADY_MATCHED');

  await tx.poolMember.create({ data: { poolId: pool.id, rideRequestId: ride.id, seats: ride.seats } });
  await recordEvent(tx, {
    type: 'RIDE_MATCHED',
    rideRequestId: ride.id,
    poolId: pool.id,
    actorUserId: args.actorUserId,
    fromStatus: 'REQUESTED',
    toStatus: 'MATCHED',
    metadata: { via: args.via },
  });
  await recordEvent(tx, {
    type: 'POOL_MEMBER_JOINED',
    rideRequestId: ride.id,
    poolId: pool.id,
    actorUserId: args.actorUserId,
    metadata: { seats: ride.seats, seatsTaken: pool.seatsTaken, capacity: pool.capacity },
  });
}

/** Standalone claim in its own transaction; reports failure instead of throwing. */
export async function claimSeats(args: ClaimArgs): Promise<{ ok: true } | { ok: false; reason: ClaimFailure }> {
  try {
    await prisma.$transaction((tx) => claimSeatsInTx(tx, args));
    return { ok: true };
  } catch (err) {
    if (err instanceof ClaimRejected) return { ok: false, reason: err.reason };
    throw err;
  }
}
```

Append to `api/src/services/views.ts`:
```ts
/** What Jashim sees about each rider: enough to pick up, drop off and collect cash. */
export interface DriverRiderView {
  rideId: string;
  firstName: string;
  seats: number;
  dropoffZone: ZoneRef;
  status: RideStatus;
  /** Expected cash: the pooled estimate if 2+ riders are aboard, else solo. Replaced by the locked fare at start. */
  estimatePaisa: number;
  fareTotalPaisa: number | null;
  leftReason: string | null;
}

export interface DriverPoolView {
  id: string;
  status: PoolStatus;
  capacity: number;
  seatsTaken: number;
  isFull: boolean;
  pickupZone: ZoneRef;
  vehicle: { name: string; plate: string };
  riders: DriverRiderView[];
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}
```

Append to `api/src/services/driverService.ts` (and merge these imports into the top of the file):
```ts
import type { Prisma } from '@prisma/client';
import { notFound } from '../lib/AppError';
import { CLAIM_MESSAGES, ClaimRejected, claimSeatsInTx } from './claimSeats';
import { recordEvent } from './events';
import { toZoneRef, type DriverPoolView } from './views';

export const driverPoolInclude = {
  pickupZone: true,
  vehicle: true,
  members: {
    orderBy: { joinedAt: 'asc' },
    include: { rideRequest: { include: { passenger: true, dropoffZone: true } } },
  },
} satisfies Prisma.PoolInclude;

type PoolWithRiders = Prisma.PoolGetPayload<{ include: typeof driverPoolInclude }>;

export function toDriverPoolView(pool: PoolWithRiders, includeLeft = false): DriverPoolView {
  const current = pool.members.filter((member) => member.leftAt === null);
  const shown = includeLeft ? pool.members : current;
  const pooled = current.length >= 2;
  return {
    id: pool.id,
    status: pool.status,
    capacity: pool.capacity,
    seatsTaken: pool.seatsTaken,
    isFull: pool.seatsTaken >= pool.capacity,
    pickupZone: toZoneRef(pool.pickupZone),
    vehicle: { name: pool.vehicle.name, plate: pool.vehicle.plate },
    riders: shown.map(({ rideRequest: ride, leftReason }) => ({
      rideId: ride.id,
      firstName: ride.passenger.name.split(' ')[0] ?? ride.passenger.name,
      seats: ride.seats,
      dropoffZone: toZoneRef(ride.dropoffZone),
      status: ride.status,
      estimatePaisa: pooled ? ride.estimatePooledPaisa : ride.estimateSoloPaisa,
      fareTotalPaisa: ride.fareTotalPaisa,
      leftReason,
    })),
    createdAt: pool.createdAt.toISOString(),
    startedAt: pool.startedAt?.toISOString() ?? null,
    completedAt: pool.completedAt?.toISOString() ?? null,
  };
}

export async function getDriverPool(driverId: string): Promise<DriverPoolView | null> {
  const pool = await prisma.pool.findFirst({
    where: { vehicle: { driverId }, status: { in: ACTIVE_POOL_STATUSES } },
    include: driverPoolInclude,
  });
  return pool ? toDriverPoolView(pool) : null;
}

export async function getDriverPoolById(poolId: string, opts: { includeLeft?: boolean } = {}): Promise<DriverPoolView> {
  const pool = await prisma.pool.findUnique({ where: { id: poolId }, include: driverPoolInclude });
  if (!pool) throw notFound('Pool');
  return toDriverPoolView(pool, opts.includeLeft ?? false);
}

/** Jashim accepts a waiting rider: into his open pool, or into a new pool if he has none. */
export async function acceptRequest(driverId: string, rideRequestId: string): Promise<DriverPoolView> {
  let poolId: string;
  try {
    poolId = await prisma.$transaction(async (tx) => {
      const vehicle = await lockVehicleForDriver(tx, driverId); // lock order: vehicle → pool → ride
      if (!vehicle.isOnline || vehicle.currentZoneId === null) throw conflict('DRIVER_OFFLINE', 'Go online before accepting rides');

      const ride = await tx.rideRequest.findUnique({ where: { id: rideRequestId } });
      if (!ride) throw notFound('Ride request');
      if (ride.status !== 'REQUESTED') throw conflict('ALREADY_MATCHED', CLAIM_MESSAGES.ALREADY_MATCHED);

      let pool = await tx.pool.findFirst({ where: { vehicleId: vehicle.id, status: { in: ACTIVE_POOL_STATUSES } } });
      if (!pool) {
        if (ride.pickupZoneId !== vehicle.currentZoneId) throw conflict('WRONG_ZONE', 'This rider is waiting in a different zone');
        pool = await tx.pool.create({
          data: { vehicleId: vehicle.id, pickupZoneId: ride.pickupZoneId, capacity: vehicle.capacity },
        });
        await recordEvent(tx, {
          type: 'POOL_OPENED',
          poolId: pool.id,
          actorUserId: driverId,
          toStatus: 'OPEN',
          metadata: { vehicle: vehicle.name, capacity: vehicle.capacity },
        });
      }

      await claimSeatsInTx(tx, { poolId: pool.id, rideRequestId, actorUserId: driverId, via: 'DRIVER_ACCEPT' });
      return pool.id;
    });
  } catch (err) {
    // A rejected claim rolled everything back, including a freshly opened pool.
    if (err instanceof ClaimRejected) throw conflict(err.reason, CLAIM_MESSAGES[err.reason]);
    throw err;
  }
  return getDriverPoolById(poolId);
}
```

Append to `api/src/routes/driver.ts` (and add `parseId` to the `validate` import):
```ts
driverRouter.post('/requests/:id/accept', async (req, res) => {
  res.json(await driverService.acceptRequest(currentUser(req).id, parseId(req.params.id, 'Ride request')));
});

driverRouter.get('/pool', async (req, res) => {
  res.json({ pool: await driverService.getDriverPool(currentUser(req).id) });
});
```

- [ ] **Step 5: Run all tests**

Run: `npx vitest run && npx tsc --noEmit`
Expected: everything passes.

- [ ] **Step 6: Commit (in two logical commits)**

```bash
git add api/src/domain/matching.ts api/test/unit/matching.test.ts
git commit -m "feat(pool): add pure compatibility rule for joining a pool

Same pickup zone, drop-off within 2 km of every member, enough seats,
and the trip not yet started.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"

git add api/src api/test
git commit -m "feat(pool): enforce Bullet's seat capacity when drivers accept riders

claimSeats is the single place seats are taken: a conditional UPDATE
locks the pool row, compatibility is re-checked under the lock, and a
guarded status change lets only one pool win a ride. Accept opens a
pool when the driver has none and rolls it back if the claim fails.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 11: Auto-join on request, and the driver's relevant-requests list

**Branch:** still `feature/tesla-pooling`

**Files:**
- Create: `api/src/services/matchingService.ts`
- Modify: `api/src/services/rideService.ts` (`createRide`), `api/src/services/views.ts` (append), `api/src/routes/driver.ts` (append)
- Test: `api/test/integration/pool-autojoin.test.ts`

**Interfaces:**
- Consumes: `checkJoin`, `PoolSnapshot`, `claimSeats`, `ACTIVE_POOL_STATUSES`, `JOINABLE_POOL_STATUSES`, `isJoinable`, `toZoneRef`.
- Produces:
  - `tryAutoJoin(rideRequestId: string): Promise<boolean>`
  - `listRelevantRequests(driverId: string): Promise<RelevantRequestView[]>`
  - `RelevantRequestView`, with fields `{ rideId; firstName; seats; pickupZone; dropoffZone; distanceKm; estimateSoloPaisa; estimatePooledPaisa; requestedAt }`
  - `GET /api/driver/requests`

- [ ] **Step 1: Write the failing tests**

`api/test/integration/pool-autojoin.test.ts`:
```ts
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase, resetRideData } from '../helpers/db';
import { api, bearer, loginAs } from '../helpers/http';
import { acceptRide, driverPool, getRide, goOnline, requestRide } from '../helpers/scenario';

async function relevantFor(driver: 'jashim' | 'monir') {
  const res = await api().get('/api/driver/requests').set(bearer(await loginAs(driver)));
  return res.body.map((r: { firstName: string }) => r.firstName);
}

describe('auto-join: the Banani rush-hour story', () => {
  beforeAll(resetDatabase);
  beforeEach(resetRideData);

  it('seats Rafiq in Bullet the moment he books, beside Nusrat', async () => {
    await goOnline('jashim', 'Banani');
    const nusrat = await requestRide('nusrat', 'Banani', 'Mohakhali');
    await acceptRide('jashim', nusrat.body.id);

    const rafiq = await requestRide('rafiq', 'Banani', 'Gulshan 1');
    expect(rafiq.status).toBe(201);
    expect(rafiq.body).toMatchObject({ status: 'MATCHED', pool: { vehicleName: 'Bullet', coRiderCount: 1 } });

    const pool = (await driverPool('jashim')).body.pool;
    expect(pool.seatsTaken).toBe(2);
    expect(pool.riders.map((r: { firstName: string }) => r.firstName)).toEqual(['Nusrat', 'Rafiq']);
    expect(pool.riders.map((r: { estimatePaisa: number }) => r.estimatePaisa)).toEqual([5250, 6750]);

    const events = (await getRide('rafiq', rafiq.body.id)).body.events;
    expect(events[1]).toMatchObject({ type: 'RIDE_MATCHED', actor: 'SYSTEM' });
  });

  it("keeps Rafiq's identity away from Nusrat: she only sees a count", async () => {
    await goOnline('jashim', 'Banani');
    const nusrat = await requestRide('nusrat', 'Banani', 'Mohakhali');
    await acceptRide('jashim', nusrat.body.id);
    await requestRide('rafiq', 'Banani', 'Gulshan 1');
    const view = await getRide('nusrat', nusrat.body.id);
    expect(view.body.pool.coRiderCount).toBe(1);
    const body = JSON.stringify(view.body);
    expect(body).not.toContain('Rafiq');
    expect(body).not.toContain('Gulshan 1');
    expect(body).not.toContain('6750');
  });

  it('gives Shirin the last seat 30 seconds later, and Bullet is full', async () => {
    await goOnline('jashim', 'Banani');
    const nusrat = await requestRide('nusrat', 'Banani', 'Mohakhali');
    await acceptRide('jashim', nusrat.body.id);
    await requestRide('rafiq', 'Banani', 'Gulshan 1');
    const shirin = await requestRide('shirin', 'Banani', 'Mohakhali');
    expect(shirin.body.status).toBe('MATCHED');
    expect((await driverPool('jashim')).body.pool).toMatchObject({ seatsTaken: 3, isFull: true });
  });

  it('leaves an incompatible or elsewhere-waiting rider in the queue', async () => {
    await goOnline('jashim', 'Banani');
    const nusrat = await requestRide('nusrat', 'Banani', 'Mohakhali');
    await acceptRide('jashim', nusrat.body.id);
    expect((await requestRide('shirin', 'Banani', 'Uttara')).body.status).toBe('REQUESTED');
    expect((await requestRide('rafiq', 'Gulshan 2', 'Mohakhali')).body.status).toBe('REQUESTED');
  });

  it('prefers the fuller pool', async () => {
    await goOnline('jashim', 'Banani');
    await goOnline('monir', 'Banani');
    const rafiq = await requestRide('rafiq', 'Banani', 'Gulshan 1', 2);
    const nusrat = await requestRide('nusrat', 'Banani', 'Mohakhali');
    // Both wait (no pools exist yet). Jashim takes Rafiq (Bullet 2/3), Monir takes Nusrat (Toofan 1/2).
    await acceptRide('jashim', rafiq.body.id);
    await acceptRide('monir', nusrat.body.id);
    const shirin = await requestRide('shirin', 'Banani', 'Mohakhali');
    expect(shirin.body.pool.vehicleName).toBe('Bullet');
  });
});

describe("the driver's relevant-requests list", () => {
  beforeAll(resetDatabase);
  beforeEach(resetRideData);

  it('shows riders waiting in his zone that fit Bullet, and only compatible ones once he has a pool', async () => {
    const nusrat = await requestRide('nusrat', 'Banani', 'Mohakhali');
    await requestRide('rafiq', 'Banani', 'Uttara');
    await requestRide('shirin', 'Gulshan 2', 'Mohakhali');

    expect(await relevantFor('jashim')).toEqual([]); // offline
    await goOnline('jashim', 'Banani');
    expect(await relevantFor('jashim')).toEqual(['Nusrat', 'Rafiq']); // not Shirin: she waits in Gulshan 2

    await acceptRide('jashim', nusrat.body.id);
    expect(await relevantFor('jashim')).toEqual([]); // Rafiq's Uttara trip doesn't fit Nusrat's
  });

  it("hides requests bigger than the driver's free seats", async () => {
    await requestRide('rafiq', 'Banani', 'Gulshan 1', 3);
    await goOnline('monir', 'Banani');
    expect(await relevantFor('monir')).toEqual([]); // Toofan has 2 seats
    await goOnline('jashim', 'Banani');
    expect(await relevantFor('jashim')).toEqual(['Rafiq']);
  });
});
```

Run: `npx vitest run test/integration/pool-autojoin.test.ts`
Expected: FAIL, because Rafiq stays `REQUESTED` and `/api/driver/requests` returns 404.

- [ ] **Step 2: Implement the matching service**

Append to `api/src/services/views.ts`:
```ts
export interface RelevantRequestView {
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

`api/src/services/matchingService.ts`:
```ts
import type { Prisma } from '@prisma/client';
import { checkJoin, type PoolSnapshot } from '../domain/matching';
import { ACTIVE_POOL_STATUSES, JOINABLE_POOL_STATUSES, isJoinable } from '../domain/transitions';
import { prisma } from '../lib/prisma';
import { claimSeats } from './claimSeats';
import { toZoneRef, type RelevantRequestView } from './views';

const withMemberDropoffs = {
  members: { where: { leftAt: null }, include: { rideRequest: { include: { dropoffZone: true } } } },
} satisfies Prisma.PoolInclude;

type PoolWithDropoffs = Prisma.PoolGetPayload<{ include: typeof withMemberDropoffs }>;

function toSnapshot(pool: PoolWithDropoffs): PoolSnapshot {
  return {
    pickupZoneId: pool.pickupZoneId,
    status: pool.status,
    capacity: pool.capacity,
    seatsTaken: pool.seatsTaken,
    memberDropoffs: pool.members.map((member) => member.rideRequest.dropoffZone),
  };
}

/**
 * Tries to seat a waiting ride in an open, compatible pool: fullest pool first, then oldest.
 * Each attempt is its own transaction, so losing a race on one pool never undoes the ride itself.
 */
export async function tryAutoJoin(rideRequestId: string): Promise<boolean> {
  const ride = await prisma.rideRequest.findUniqueOrThrow({ where: { id: rideRequestId }, include: { dropoffZone: true } });
  if (ride.status !== 'REQUESTED') return false;

  const pools = await prisma.pool.findMany({
    where: { status: { in: JOINABLE_POOL_STATUSES }, pickupZoneId: ride.pickupZoneId },
    include: withMemberDropoffs,
    orderBy: [{ seatsTaken: 'desc' }, { createdAt: 'asc' }],
  });
  const request = { pickupZoneId: ride.pickupZoneId, dropoff: ride.dropoffZone, seats: ride.seats };
  const candidates = pools.filter((pool) => checkJoin(request, toSnapshot(pool)) === 'OK');

  for (const pool of candidates) {
    const result = await claimSeats({ poolId: pool.id, rideRequestId: ride.id, actorUserId: null, via: 'AUTO_JOIN' });
    if (result.ok) return true;
    if (result.reason === 'ALREADY_MATCHED') return false; // someone else seated this ride
  }
  return false;
}

/** Waiting riders a driver could accept right now: same zone, fits free seats, compatible with his pool. */
export async function listRelevantRequests(driverId: string): Promise<RelevantRequestView[]> {
  const vehicle = await prisma.vehicle.findUnique({ where: { driverId } });
  if (!vehicle || !vehicle.isOnline || vehicle.currentZoneId === null) return [];

  const pool = await prisma.pool.findFirst({
    where: { vehicleId: vehicle.id, status: { in: ACTIVE_POOL_STATUSES } },
    include: withMemberDropoffs,
  });
  if (pool && !isJoinable(pool.status)) return [];

  const snapshot: PoolSnapshot = pool
    ? toSnapshot(pool)
    : { pickupZoneId: vehicle.currentZoneId, status: 'OPEN', capacity: vehicle.capacity, seatsTaken: 0, memberDropoffs: [] };

  const waiting = await prisma.rideRequest.findMany({
    where: { status: 'REQUESTED', pickupZoneId: snapshot.pickupZoneId },
    include: { passenger: true, pickupZone: true, dropoffZone: true },
    orderBy: { createdAt: 'asc' },
    take: 50,
  });

  return waiting
    .filter((ride) => checkJoin({ pickupZoneId: ride.pickupZoneId, dropoff: ride.dropoffZone, seats: ride.seats }, snapshot) === 'OK')
    .map((ride) => ({
      rideId: ride.id,
      firstName: ride.passenger.name.split(' ')[0] ?? ride.passenger.name,
      seats: ride.seats,
      pickupZone: toZoneRef(ride.pickupZone),
      dropoffZone: toZoneRef(ride.dropoffZone),
      distanceKm: ride.distanceKm,
      estimateSoloPaisa: ride.estimateSoloPaisa,
      estimatePooledPaisa: ride.estimatePooledPaisa,
      requestedAt: ride.createdAt.toISOString(),
    }));
}
```

In `api/src/services/rideService.ts`, import `tryAutoJoin` from `./matchingService`. In `createRide`, replace the final `return getRideForPassenger(rideId, passengerId);` with:
```ts
  // "Figure it out in about a second": try to seat the rider right away.
  await tryAutoJoin(rideId);
  return getRideForPassenger(rideId, passengerId);
```

Append to `api/src/routes/driver.ts` (and import `listRelevantRequests` from `../services/matchingService`):
```ts
driverRouter.get('/requests', async (req, res) => {
  res.json(await listRelevantRequests(currentUser(req).id));
});
```

- [ ] **Step 3: Run all tests**

Run: `npx vitest run && npx tsc --noEmit`
Expected: everything passes.

- [ ] **Step 4: Commit**

```bash
git add api/src api/test
git commit -m "feat(pool): auto-join compatible riders and list relevant requests

A new request immediately tries open pools (fullest first) through the
same claimSeats path; Rafiq joins Nusrat in Bullet within his booking
request. Drivers see only waiting riders they could actually take.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 12: Passenger cancel of a matched ride (release seats, auto-cancel empty pool)

**Branch:** still `feature/tesla-pooling`

**Files:**
- Modify: `api/src/services/rideService.ts` (replace `cancelRide`)
- Test: `api/test/integration/pool-cancel.test.ts`

**Interfaces:**
- Consumes: `lockPool`, `recordEvent`, `canPassengerCancel`, `conflict`.
- Produces: the final `cancelRide(rideId, passengerId): Promise<RideView>`, which releases seats and auto-cancels an empty pool. Also `releaseSeats(tx, membership, actorUserId, reason)`, internal to `rideService`.

- [ ] **Step 1: Write the failing tests**

`api/test/integration/pool-cancel.test.ts`:
```ts
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase, resetRideData } from '../helpers/db';
import { acceptRide, cancelRide, driverPool, getRide, goOffline, goOnline, requestRide, seatInvariant } from '../helpers/scenario';

async function bulletWithNusratAndRafiq() {
  await goOnline('jashim', 'Banani');
  const nusrat = await requestRide('nusrat', 'Banani', 'Mohakhali');
  await acceptRide('jashim', nusrat.body.id);
  const rafiq = await requestRide('rafiq', 'Banani', 'Gulshan 1');
  return { nusratId: nusrat.body.id as string, rafiqId: rafiq.body.id as string, poolId: rafiq.body.pool.id as string };
}

describe('passenger cancels a matched ride', () => {
  beforeAll(resetDatabase);
  beforeEach(resetRideData);

  it("frees Rafiq's seat and leaves Nusrat riding alone", async () => {
    const { nusratId, rafiqId, poolId } = await bulletWithNusratAndRafiq();
    const res = await cancelRide('rafiq', rafiqId);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'CANCELLED', cancelledBy: 'PASSENGER', pool: null });

    expect((await getRide('nusrat', nusratId)).body).toMatchObject({ status: 'MATCHED', pool: { coRiderCount: 0 } });
    const pool = (await driverPool('jashim')).body.pool;
    expect(pool.riders.map((r: { firstName: string }) => r.firstName)).toEqual(['Nusrat']);
    expect(await seatInvariant(poolId)).toEqual({ seatsTaken: 1, activeSeats: 1 });
  });

  it('makes the freed seat available to the next rider', async () => {
    const { rafiqId } = await bulletWithNusratAndRafiq();
    await requestRide('shirin', 'Banani', 'Mohakhali'); // Bullet is now full
    await cancelRide('rafiq', rafiqId);
    const rafiqAgain = await requestRide('rafiq', 'Banani', 'Gulshan 1');
    expect(rafiqAgain.body.status).toBe('MATCHED');
  });

  it('cancels the pool when the last rider leaves, freeing Jashim', async () => {
    const { nusratId, rafiqId } = await bulletWithNusratAndRafiq();
    await cancelRide('rafiq', rafiqId);
    await cancelRide('nusrat', nusratId);
    expect((await driverPool('jashim')).body.pool).toBeNull();
    expect((await goOffline('jashim')).status).toBe(200);
  });

  it('records the cancellation in the ride history', async () => {
    const { rafiqId } = await bulletWithNusratAndRafiq();
    await cancelRide('rafiq', rafiqId);
    const events = (await getRide('rafiq', rafiqId)).body.events.map((e: { type: string }) => e.type);
    expect(events).toEqual(['RIDE_REQUESTED', 'RIDE_MATCHED', 'RIDE_CANCELLED']);
  });
});
```

Run: `npx vitest run test/integration/pool-cancel.test.ts`
Expected: FAIL. Cancelling a MATCHED ride returns 409, because the Task 8 version only handles REQUESTED.

- [ ] **Step 2: Replace `cancelRide` in `api/src/services/rideService.ts`**

Add these imports: `import type { PoolMember } from '@prisma/client';`, `import type { Db } from '../lib/prisma';`, and `import { lockPool } from './locks';`. Then replace the whole `cancelRide` function with:
```ts
const RETRY_MESSAGE = 'Your ride changed while you were cancelling. Refresh and try again';

export async function cancelRide(rideId: string, passengerId: string): Promise<RideView> {
  const ride = await findOwnRide(rideId, passengerId);
  if (!canPassengerCancel(ride.status)) {
    throw conflict('INVALID_TRANSITION', `A ride that is ${ride.status.toLowerCase().replace('_', ' ')} can no longer be cancelled`);
  }
  const membership = ride.memberships[0];

  await prisma.$transaction(async (tx) => {
    if (membership) await lockPool(tx, membership.poolId); // same lock order as claimSeats: pool first

    // Guarded update: only succeeds if the ride is still in the status we read.
    const { count } = await tx.rideRequest.updateMany({
      where: { id: rideId, status: ride.status },
      data: { status: 'CANCELLED', cancelledBy: 'PASSENGER' },
    });
    if (count === 0) throw conflict('INVALID_TRANSITION', RETRY_MESSAGE);

    await recordEvent(tx, {
      type: 'RIDE_CANCELLED',
      rideRequestId: rideId,
      poolId: membership?.poolId,
      actorUserId: passengerId,
      fromStatus: ride.status,
      toStatus: 'CANCELLED',
    });
    if (membership) await releaseSeats(tx, membership, passengerId);
  });

  return getRideForPassenger(rideId, passengerId);
}

/** Gives a leaving rider's seats back to the pool; an emptied pool is cancelled so the driver is free. */
async function releaseSeats(tx: Db, membership: PoolMember, actorUserId: string): Promise<void> {
  const { count } = await tx.poolMember.updateMany({
    where: { id: membership.id, leftAt: null },
    data: { leftAt: new Date(), leftReason: 'PASSENGER_CANCELLED' },
  });
  if (count === 0) throw conflict('INVALID_TRANSITION', RETRY_MESSAGE); // membership changed under us

  const pool = await tx.pool.update({
    where: { id: membership.poolId },
    data: { seatsTaken: { decrement: membership.seats } },
  });
  await recordEvent(tx, {
    type: 'POOL_MEMBER_LEFT',
    poolId: pool.id,
    rideRequestId: membership.rideRequestId,
    actorUserId,
    metadata: { seats: membership.seats, seatsTaken: pool.seatsTaken, reason: 'PASSENGER_CANCELLED' },
  });

  if (pool.seatsTaken === 0) {
    await tx.pool.update({ where: { id: pool.id }, data: { status: 'CANCELLED' } });
    await recordEvent(tx, {
      type: 'POOL_STATUS_CHANGED',
      poolId: pool.id,
      actorUserId: null,
      fromStatus: pool.status,
      toStatus: 'CANCELLED',
      metadata: { reason: 'EMPTY' },
    });
  }
}
```

- [ ] **Step 3: Run all tests**

Run: `npx vitest run && npx tsc --noEmit`
Expected: everything passes, including the earlier `rides.test.ts` cancellation tests.

- [ ] **Step 4: Commit**

```bash
git add api/src/services/rideService.ts api/test/integration/pool-cancel.test.ts
git commit -m "feat(pool): release seats when a matched passenger cancels

Locks the pool first (same order as claimSeats), marks the membership
as left, decrements seats_taken, and cancels a pool left empty so the
driver can go offline.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 13: Concurrency — prove Bullet can't be overbooked

**Branch:** still `feature/tesla-pooling`

**Files:**
- Test: `api/test/integration/pool-concurrency.test.ts`

**Interfaces:**
- Consumes: the helpers from `test/helpers/*` and the endpoints from Tasks 8–12.
- Produces: nothing new. This task proves the guarantees.

- [ ] **Step 1: Write the concurrency tests**

`api/test/integration/pool-concurrency.test.ts`:
```ts
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { resetDatabase, resetRideData, zoneId } from '../helpers/db';
import { api, bearer } from '../helpers/http';
import { acceptRide, cancelRide, getRide, goOnline, requestRide, seatInvariant } from '../helpers/scenario';

/** Bullet with Rafiq holding 2 seats: exactly one seat left (spec §5 scenario). */
async function bulletWithOneSeatLeft(): Promise<string> {
  await goOnline('jashim', 'Banani');
  const rafiq = await requestRide('rafiq', 'Banani', 'Gulshan 1', 2);
  const pool = await acceptRide('jashim', rafiq.body.id);
  return pool.body.id as string;
}

describe('concurrency: two riders, one seat', () => {
  beforeAll(resetDatabase);
  beforeEach(resetRideData);

  it('gives the last seat to exactly one of Nusrat and Shirin (5 rounds)', async () => {
    for (let round = 0; round < 5; round++) {
      await resetRideData();
      const poolId = await bulletWithOneSeatLeft();

      const [nusrat, shirin] = await Promise.all([
        requestRide('nusrat', 'Banani', 'Mohakhali'),
        requestRide('shirin', 'Banani', 'Mohakhali'),
      ]);

      expect([nusrat.status, shirin.status]).toEqual([201, 201]);
      expect([nusrat.body.status, shirin.body.status].sort()).toEqual(['MATCHED', 'REQUESTED']);
      expect(await seatInvariant(poolId)).toEqual({ seatsTaken: 3, activeSeats: 3 });
    }
  });

  it('seats exactly two of ten commuters rushing for two free seats', async () => {
    await goOnline('jashim', 'Banani');
    const rafiq = await requestRide('rafiq', 'Banani', 'Gulshan 1');
    const pool = await acceptRide('jashim', rafiq.body.id);

    const tokens = await Promise.all(
      Array.from({ length: 10 }, async (_, i) => {
        const res = await api().post('/api/auth/register').send({
          name: `Banani Commuter ${i + 1}`, email: `commuter${i + 1}@teslapool.test`, password: 'bullet123',
        });
        return res.body.token as string;
      }),
    );
    const body = { pickupZoneId: await zoneId('Banani'), dropoffZoneId: await zoneId('Mohakhali'), seats: 1 };
    const results = await Promise.all(tokens.map((token) => api().post('/api/rides').set(bearer(token)).send(body)));

    const statuses = results.map((res) => res.body.status);
    expect(statuses.filter((s) => s === 'MATCHED')).toHaveLength(2);
    expect(statuses.filter((s) => s === 'REQUESTED')).toHaveLength(8);
    expect(await seatInvariant(pool.body.id)).toEqual({ seatsTaken: 3, activeSeats: 3 });
  });

  it('lets only one of two drivers win the same rider', async () => {
    await goOnline('jashim', 'Banani');
    await goOnline('monir', 'Banani');
    const nusrat = await requestRide('nusrat', 'Banani', 'Mohakhali');

    const [byJashim, byMonir] = await Promise.all([acceptRide('jashim', nusrat.body.id), acceptRide('monir', nusrat.body.id)]);

    expect([byJashim.status, byMonir.status].sort()).toEqual([200, 409]);
    const loser = byJashim.status === 409 ? byJashim : byMonir;
    expect(loser.body.error.code).toBe('ALREADY_MATCHED');
    const memberships = await prisma.poolMember.count({ where: { rideRequestId: nusrat.body.id, leftAt: null } });
    expect(memberships).toBe(1);
    expect(await prisma.pool.count({ where: { status: 'OPEN' } })).toBe(1); // the loser's new pool was rolled back
  });

  it('keeps seats consistent when Nusrat cancels while Jashim accepts her', async () => {
    await goOnline('jashim', 'Banani');
    const nusrat = await requestRide('nusrat', 'Banani', 'Mohakhali');

    const [accept, cancel] = await Promise.all([acceptRide('jashim', nusrat.body.id), cancelRide('nusrat', nusrat.body.id)]);

    const final = (await getRide('nusrat', nusrat.body.id)).body;
    const pool = await prisma.pool.findFirst({ where: { vehicle: { plate: 'DHK-TESLA-11' } }, orderBy: { createdAt: 'desc' } });
    if (final.status === 'CANCELLED') {
      expect(cancel.status).toBe(200);
      expect(accept.status).toBe(409);
      expect(pool ? (await seatInvariant(pool.id)).seatsTaken : 0).toBe(0);
    } else {
      expect(final.status).toBe('MATCHED');
      expect(accept.status).toBe(200);
      expect(cancel.status).toBe(409);
      expect(await seatInvariant(pool!.id)).toEqual({ seatsTaken: 1, activeSeats: 1 });
    }
  });
});
```

- [ ] **Step 2: Run the concurrency tests**

Run: `npx vitest run test/integration/pool-concurrency.test.ts`
Expected: all 4 pass. If any fail, stop and use superpowers:systematic-debugging. Don't loosen the assertions.

- [ ] **Step 3: Prove the test catches a broken guard (mutation check, not committed)**

Temporarily remove the line `AND seats_taken + ${ride.seats}::int <= capacity` from `api/src/services/claimSeats.ts`, then run:
`npx vitest run test/integration/pool-concurrency.test.ts -t "Nusrat and Shirin"`
Expected: FAIL. The losing request now hits the `pools_seats_check` CHECK constraint and gets a 500, not a clean `REQUESTED`. That also shows the database backstop working.

Restore the line (`git checkout api/src/services/claimSeats.ts`) and re-run. Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add api/test/integration/pool-concurrency.test.ts
git commit -m "test(pool): prove concurrent claims cannot overbook Bullet

Nusrat and Shirin race for the last seat (5 rounds), ten commuters rush
two seats, two drivers accept one rider, and a cancel races an accept.
Every case keeps seats_taken equal to the seats actually held.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Close the branch**

Follow the Branch close procedure with `<branch>` = `feature/tesla-pooling`, `<title>` = `Tesla pooling: seat claims, auto-join, capacity under concurrency`, and `<summary>` = `Driver availability, accept, auto-join, relevant requests, seat release on cancel, and concurrency tests for the last-seat race.`

---

## Task 14: Pool lifecycle — arrive, start (lock fares), complete, driver cancel (re-queue)

**Branch:** `git checkout -b feature/driver-flow`

**Files:**
- Create: `api/src/services/poolService.ts`, `api/src/routes/pools.ts`
- Modify: `api/src/routes/index.ts`, `api/test/helpers/scenario.ts` (append)
- Test: `api/test/integration/driver-flow.test.ts`

**Interfaces:**
- Consumes: `nextPoolStatus`, `memberRideStatusAfter`, `PoolAction`, `PoolStatus`, `POOL_ACTIONS`, `calculateFare`, `recordEvent`, `getDriverPoolById`, `tryAutoJoin`, `parseId`.
- Produces:
  - `transitionPool(driverId, poolId, action: PoolAction): Promise<DriverPoolView>`
  - Routes: `POST /api/pools/:id/arrive|start|complete|cancel`
  - Test helper: `poolAction(driver, poolId, action)`

- [ ] **Step 1: Write the failing tests**

Append to `api/test/helpers/scenario.ts`:
```ts
export async function poolAction(driver: DriverKey | PassengerKey, poolId: string, action: 'arrive' | 'start' | 'complete' | 'cancel') {
  return api().post(`/api/pools/${poolId}/${action}`).set(bearer(await loginAs(driver)));
}
```

`api/test/integration/driver-flow.test.ts`:
```ts
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase, resetRideData } from '../helpers/db';
import { api, bearer, loginAs } from '../helpers/http';
import {
  acceptRide, cancelRide, driverPool, getRide, goOffline, goOnline, poolAction, requestRide,
} from '../helpers/scenario';

async function storyPool() {
  await goOnline('jashim', 'Banani');
  const nusrat = await requestRide('nusrat', 'Banani', 'Mohakhali');
  const pool = await acceptRide('jashim', nusrat.body.id);
  const rafiq = await requestRide('rafiq', 'Banani', 'Gulshan 1');
  return { poolId: pool.body.id as string, nusratId: nusrat.body.id as string, rafiqId: rafiq.body.id as string };
}

describe('pool lifecycle', () => {
  beforeAll(resetDatabase);
  beforeEach(resetRideData);

  it('runs the whole story and locks the pooled fares: Nusrat ৳52.50, Rafiq ৳67.50', async () => {
    const { poolId, nusratId, rafiqId } = await storyPool();

    const arrived = await poolAction('jashim', poolId, 'arrive');
    expect(arrived.body.status).toBe('DRIVER_ARRIVED');
    expect((await getRide('nusrat', nusratId)).body.status).toBe('DRIVER_ARRIVED');

    const started = await poolAction('jashim', poolId, 'start');
    expect(started.body.status).toBe('STARTED');
    expect(started.body.riders.map((r: { fareTotalPaisa: number }) => r.fareTotalPaisa)).toEqual([5250, 6750]);
    expect((await getRide('nusrat', nusratId)).body.fare).toEqual({ basePaisa: 3000, distancePaisa: 4000, discountPaisa: 1750, totalPaisa: 5250 });
    expect((await getRide('rafiq', rafiqId)).body.fare).toEqual({ basePaisa: 3000, distancePaisa: 6000, discountPaisa: 2250, totalPaisa: 6750 });

    const completed = await poolAction('jashim', poolId, 'complete');
    expect(completed.body).toMatchObject({ status: 'COMPLETED', completedAt: expect.any(String) });
    expect((await getRide('rafiq', rafiqId)).body.status).toBe('COMPLETED');
    expect((await driverPool('jashim')).body.pool).toBeNull();
    expect((await goOffline('jashim')).status).toBe(200);
  });

  it('charges the solo fare when Rafiq cancels before the start', async () => {
    const { poolId, nusratId, rafiqId } = await storyPool();
    await cancelRide('rafiq', rafiqId);
    await poolAction('jashim', poolId, 'arrive');
    await poolAction('jashim', poolId, 'start');
    expect((await getRide('nusrat', nusratId)).body.fare).toMatchObject({ discountPaisa: 0, totalPaisa: 7000 });
  });

  it.each([
    ['start before arriving', ['start']],
    ['complete an open pool', ['complete']],
    ['arrive twice', ['arrive', 'arrive']],
    ['cancel a started trip', ['arrive', 'start', 'cancel']],
    ['restart a completed trip', ['arrive', 'start', 'complete', 'start']],
  ] as const)('rejects: %s (409 INVALID_TRANSITION)', async (_label, actions) => {
    const { poolId } = await storyPool();
    let res;
    for (const action of actions) res = await poolAction('jashim', poolId, action);
    expect(res!.status).toBe(409);
    expect(res!.body.error.code).toBe('INVALID_TRANSITION');
  });

  it("does not let a passenger drive (403) or Monir run Jashim's pool (404)", async () => {
    const { poolId } = await storyPool();
    expect((await poolAction('nusrat', poolId, 'start')).status).toBe(403);
    expect((await poolAction('monir', poolId, 'arrive')).status).toBe(404);
    expect((await poolAction('jashim', 'not-a-uuid', 'arrive')).status).toBe(404);
  });

  it('lets a passenger cancel after the driver arrives, but not after the start', async () => {
    const { poolId, nusratId, rafiqId } = await storyPool();
    await poolAction('jashim', poolId, 'arrive');
    expect((await cancelRide('rafiq', rafiqId)).body.status).toBe('CANCELLED');
    await poolAction('jashim', poolId, 'start');
    const late = await cancelRide('nusrat', nusratId);
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('refuses new riders once the trip has started', async () => {
    const { poolId } = await storyPool();
    await poolAction('jashim', poolId, 'arrive');
    await poolAction('jashim', poolId, 'start');
    expect((await requestRide('shirin', 'Banani', 'Mohakhali')).body.status).toBe('REQUESTED');
  });

  it('never leaves Shirin MATCHED in a started pool when she books as Jashim taps Start', async () => {
    const { poolId } = await storyPool();
    await poolAction('jashim', poolId, 'arrive');
    const [, shirin] = await Promise.all([poolAction('jashim', poolId, 'start'), requestRide('shirin', 'Banani', 'Mohakhali')]);
    const final = (await getRide('shirin', shirin.body.id)).body;
    expect(['REQUESTED', 'STARTED']).toContain(final.status);
    if (final.status === 'STARTED') expect(final.fare).not.toBeNull();
  });
});

describe('driver cancels the pool', () => {
  beforeAll(resetDatabase);
  beforeEach(resetRideData);

  it('puts Nusrat and Rafiq back in the queue instead of cancelling their rides', async () => {
    const { poolId, nusratId, rafiqId } = await storyPool();
    const res = await poolAction('jashim', poolId, 'cancel');
    expect(res.body).toMatchObject({ status: 'CANCELLED', seatsTaken: 0 });

    for (const [who, id] of [['nusrat', nusratId], ['rafiq', rafiqId]] as const) {
      const ride = (await getRide(who, id)).body;
      expect(ride).toMatchObject({ status: 'REQUESTED', cancelledBy: null, pool: null });
      expect(ride.events.at(-1)).toMatchObject({ type: 'RIDE_REQUEUED', actor: 'DRIVER' });
    }
    await goOnline('monir', 'Banani');
    const relevant = await api().get('/api/driver/requests').set(bearer(await loginAs('monir')));
    expect(relevant.body.map((r: { firstName: string }) => r.firstName)).toEqual(['Nusrat', 'Rafiq']);
  });

  it("re-seats riders straight into another open pool (Monir's Toofan)", async () => {
    await goOnline('jashim', 'Banani');
    await goOnline('monir', 'Banani');
    // Both request before any pool exists, so both wait. Order matters: if Bullet already held
    // Nusrat, Shirin's compatible request would auto-join Bullet instead of waiting for Monir.
    const nusrat = await requestRide('nusrat', 'Banani', 'Mohakhali');
    const shirin = await requestRide('shirin', 'Banani', 'Mohakhali');
    const bullet = await acceptRide('jashim', nusrat.body.id); // Bullet: Nusrat
    await acceptRide('monir', shirin.body.id); // Toofan: Shirin, 1 seat free

    await poolAction('jashim', bullet.body.id, 'cancel');

    const ride = (await getRide('nusrat', nusrat.body.id)).body;
    expect(ride).toMatchObject({ status: 'MATCHED', pool: { vehicleName: 'Toofan', coRiderCount: 1 } });
  });
});
```

Run: `npx vitest run test/integration/driver-flow.test.ts`
Expected: FAIL with 404s, because `/api/pools/...` doesn't exist yet.

- [ ] **Step 2: Implement the pool service and routes**

`api/src/services/poolService.ts`:
```ts
import type { PoolMember, RideRequest } from '@prisma/client';
import { calculateFare } from '../domain/fare';
import { memberRideStatusAfter, nextPoolStatus, type PoolAction, type PoolStatus } from '../domain/transitions';
import { conflict, notFound } from '../lib/AppError';
import { prisma, type Db } from '../lib/prisma';
import { getDriverPoolById } from './driverService';
import { recordEvent } from './events';
import { tryAutoJoin } from './matchingService';
import type { DriverPoolView } from './views';

type Member = PoolMember & { rideRequest: RideRequest };

/** arrive / start / complete / cancel. The pool and all of its current riders move together, in one transaction. */
export async function transitionPool(driverId: string, poolId: string, action: PoolAction): Promise<DriverPoolView> {
  const requeued: string[] = [];

  await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string; status: PoolStatus; driver_id: string }[]>`
      SELECT p.id, p.status, v.driver_id
        FROM pools p JOIN vehicles v ON v.id = p.vehicle_id
       WHERE p.id = ${poolId}::uuid
         FOR UPDATE OF p`;
    const locked = rows[0];
    if (!locked || locked.driver_id !== driverId) throw notFound('Pool');

    const next = nextPoolStatus(locked.status, action);
    if (!next) throw conflict('INVALID_TRANSITION', `You can't ${action} a trip that is ${locked.status.toLowerCase().replace('_', ' ')}`);

    const members = await tx.poolMember.findMany({ where: { poolId, leftAt: null }, include: { rideRequest: true } });
    const now = new Date();

    if (action === 'cancel') {
      await cancelAndRequeue(tx, poolId, members, driverId, now);
      requeued.push(...members.map((member) => member.rideRequestId));
    } else {
      await tx.pool.update({
        where: { id: poolId },
        data: {
          status: next,
          ...(action === 'start' && { startedAt: now }),
          ...(action === 'complete' && { completedAt: now }),
        },
      });
      await moveRiders(tx, poolId, members, action, driverId);
    }

    await recordEvent(tx, {
      type: 'POOL_STATUS_CHANGED',
      poolId,
      actorUserId: driverId,
      fromStatus: locked.status,
      toStatus: next,
      metadata: { riders: members.length },
    });
  });

  // After the cancel commits, give each re-queued rider an immediate chance at another open pool.
  for (const rideId of requeued) await tryAutoJoin(rideId);

  return getDriverPoolById(poolId, { includeLeft: action === 'cancel' });
}

async function moveRiders(tx: Db, poolId: string, members: Member[], action: Exclude<PoolAction, 'cancel'>, driverId: string) {
  const rideStatus = memberRideStatusAfter(action);
  const pooled = members.length >= 2; // the discount depends on who is actually aboard at the start

  for (const member of members) {
    const ride = member.rideRequest;
    const fare = action === 'start' ? calculateFare({ distanceKm: ride.distanceKm, seats: ride.seats, pooled }) : null;
    await tx.rideRequest.update({
      where: { id: ride.id },
      data: {
        status: rideStatus,
        ...(fare && {
          fareBasePaisa: fare.basePaisa,
          fareDistancePaisa: fare.distancePaisa,
          fareDiscountPaisa: fare.discountPaisa,
          fareTotalPaisa: fare.totalPaisa,
        }),
      },
    });
    await recordEvent(tx, {
      type: 'RIDE_STATUS_CHANGED',
      rideRequestId: ride.id,
      poolId,
      actorUserId: driverId,
      fromStatus: ride.status,
      toStatus: rideStatus,
      ...(fare && { metadata: { ...fare, pooled } }),
    });
  }
}

async function cancelAndRequeue(tx: Db, poolId: string, members: Member[], driverId: string, now: Date) {
  await tx.pool.update({ where: { id: poolId }, data: { status: 'CANCELLED', seatsTaken: 0 } });
  for (const member of members) {
    await tx.poolMember.update({ where: { id: member.id }, data: { leftAt: now, leftReason: 'DRIVER_CANCELLED' } });
    await tx.rideRequest.update({ where: { id: member.rideRequestId }, data: { status: 'REQUESTED' } });
    await recordEvent(tx, {
      type: 'RIDE_REQUEUED',
      rideRequestId: member.rideRequestId,
      poolId,
      actorUserId: driverId,
      fromStatus: member.rideRequest.status,
      toStatus: 'REQUESTED',
    });
  }
}
```

`api/src/routes/pools.ts`:
```ts
import { Router } from 'express';
import { POOL_ACTIONS } from '../domain/transitions';
import { authenticate, currentUser, requireRole } from '../middleware/authenticate';
import { parseId } from '../middleware/validate';
import { transitionPool } from '../services/poolService';

export const poolsRouter = Router();

poolsRouter.use(authenticate, requireRole('DRIVER'));

// Transitions are commands with rules, so each is its own action endpoint, not a PATCH of `status`.
for (const action of POOL_ACTIONS) {
  poolsRouter.post(`/:id/${action}`, async (req, res) => {
    res.json(await transitionPool(currentUser(req).id, parseId(req.params.id, 'Pool'), action));
  });
}
```

In `api/src/routes/index.ts`, add `import { poolsRouter } from './pools';` and `apiRouter.use('/pools', poolsRouter);`.

- [ ] **Step 3: Run all tests**

Run: `npx vitest run && npx tsc --noEmit`
Expected: everything passes.

- [ ] **Step 4: Commit**

```bash
git add api/src api/test
git commit -m "feat(driver): add arrive, start, complete and cancel for pools

Pool and riders move together in one transaction. Start locks each
rider's fare with the pool discount only if 2+ riders are aboard. A
driver cancel re-queues riders and immediately retries auto-join.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 15: Driver history and seeded demo history

**Branch:** still `feature/driver-flow`

**Files:**
- Modify: `api/src/services/driverService.ts` (append `getDriverHistory`), `api/src/routes/driver.ts` (append), `api/src/db/seedData.ts` (append `seedDemoHistory`), `api/src/db/seed.ts`
- Test: `api/test/integration/history.test.ts`

**Interfaces:**
- Consumes: `driverPoolInclude`, `toDriverPoolView`, `calculateFare`, `estimateFares`, `distanceKm`, `castEmail`.
- Produces:
  - `getDriverHistory(driverId): Promise<DriverPoolView[]>`
  - `GET /api/driver/history`
  - `seedDemoHistory(db: PrismaClient, now?: Date): Promise<boolean>`, which returns false if Bullet already has any pool

- [ ] **Step 1: Write the failing tests**

`api/test/integration/history.test.ts`:
```ts
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedDemoHistory } from '../../src/db/seedData';
import { prisma } from '../../src/lib/prisma';
import { resetDatabase, resetRideData } from '../helpers/db';
import { api, bearer, loginAs } from '../helpers/http';
import { acceptRide, goOnline, poolAction, requestRide } from '../helpers/scenario';

describe('history', () => {
  beforeAll(resetDatabase);
  beforeEach(resetRideData);

  it("lists Jashim's finished trips with the riders who left", async () => {
    await goOnline('jashim', 'Banani');
    const nusrat = await requestRide('nusrat', 'Banani', 'Mohakhali');
    const pool = await acceptRide('jashim', nusrat.body.id);
    await requestRide('rafiq', 'Banani', 'Gulshan 1');
    await poolAction('jashim', pool.body.id, 'arrive');
    await poolAction('jashim', pool.body.id, 'start');
    await poolAction('jashim', pool.body.id, 'complete');

    const res = await api().get('/api/driver/history').set(bearer(await loginAs('jashim')));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ status: 'COMPLETED', seatsTaken: 2 });
    expect(res.body[0].riders.map((r: { fareTotalPaisa: number }) => r.fareTotalPaisa)).toEqual([5250, 6750]);
  });

  it("gives Nusrat a full, explainable timeline of yesterday's seeded ride", async () => {
    expect(await seedDemoHistory(prisma)).toBe(true);
    expect(await seedDemoHistory(prisma)).toBe(false); // idempotent

    const rides = await api().get('/api/rides').set(bearer(await loginAs('nusrat')));
    expect(rides.body).toHaveLength(1);
    expect(rides.body[0]).toMatchObject({ status: 'COMPLETED', fare: { totalPaisa: 5250 } });

    const detail = await api().get(`/api/rides/${rides.body[0].id}`).set(bearer(await loginAs('nusrat')));
    expect(detail.body.events.map((e: { toStatus: string }) => e.toStatus)).toEqual([
      'REQUESTED', 'MATCHED', 'DRIVER_ARRIVED', 'STARTED', 'COMPLETED',
    ]);

    const history = await api().get('/api/driver/history').set(bearer(await loginAs('jashim')));
    expect(history.body[0].riders.map((r: { firstName: string }) => r.firstName)).toEqual(['Nusrat', 'Rafiq']);
  });
});
```

Run: `npx vitest run test/integration/history.test.ts`
Expected: FAIL, because `seedDemoHistory` isn't exported and `/api/driver/history` returns 404.

- [ ] **Step 2: Implement it**

Append to `api/src/services/driverService.ts`:
```ts
export async function getDriverHistory(driverId: string): Promise<DriverPoolView[]> {
  const pools = await prisma.pool.findMany({
    where: { vehicle: { driverId }, status: { in: ['COMPLETED', 'CANCELLED'] } },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: driverPoolInclude,
  });
  return pools.map((pool) => toDriverPoolView(pool, true));
}
```

Append to `api/src/routes/driver.ts`:
```ts
driverRouter.get('/history', async (req, res) => {
  res.json(await driverService.getDriverHistory(currentUser(req).id));
});
```

Append to `api/src/db/seedData.ts` (and merge the new imports into the top of the file):
```ts
import { calculateFare, estimateFares } from '../domain/fare';
import { distanceKm } from '../domain/geo';

/**
 * Yesterday 08:41, Banani: Nusrat and Rafiq shared Bullet. Gives the history screens something real.
 * Idempotent: does nothing if Bullet already has any pool.
 */
export async function seedDemoHistory(db: PrismaClient, now = new Date()): Promise<boolean> {
  const bullet = await db.vehicle.findUniqueOrThrow({ where: { plate: 'DHK-TESLA-11' } });
  if ((await db.pool.count({ where: { vehicleId: bullet.id } })) > 0) return false;

  const zone = async (name: string) => db.zone.findUniqueOrThrow({ where: { name } });
  const [banani, mohakhali, gulshan1] = await Promise.all([zone('Banani'), zone('Mohakhali'), zone('Gulshan 1')]);
  const nusrat = await db.user.findUniqueOrThrow({ where: { email: castEmail('nusrat') } });
  const rafiq = await db.user.findUniqueOrThrow({ where: { email: castEmail('rafiq') } });
  const at = (hour: number, minute: number) => {
    const time = new Date(now);
    time.setDate(time.getDate() - 1);
    time.setHours(hour, minute, 0, 0);
    return time;
  };

  await db.$transaction(async (tx) => {
    const pool = await tx.pool.create({
      data: {
        vehicleId: bullet.id, pickupZoneId: banani.id, capacity: bullet.capacity, seatsTaken: 2,
        status: 'COMPLETED', createdAt: at(8, 42), startedAt: at(8, 46), completedAt: at(8, 58),
      },
    });
    await tx.rideEvent.createMany({
      data: [
        { poolId: pool.id, actorUserId: bullet.driverId, type: 'POOL_OPENED', toStatus: 'OPEN', createdAt: at(8, 42) },
        { poolId: pool.id, actorUserId: bullet.driverId, type: 'POOL_STATUS_CHANGED', fromStatus: 'OPEN', toStatus: 'DRIVER_ARRIVED', createdAt: at(8, 44) },
        { poolId: pool.id, actorUserId: bullet.driverId, type: 'POOL_STATUS_CHANGED', fromStatus: 'DRIVER_ARRIVED', toStatus: 'STARTED', createdAt: at(8, 46) },
        { poolId: pool.id, actorUserId: bullet.driverId, type: 'POOL_STATUS_CHANGED', fromStatus: 'STARTED', toStatus: 'COMPLETED', createdAt: at(8, 58) },
      ],
    });

    const riders = [
      { passenger: nusrat, dropoff: mohakhali, requestedAt: at(8, 41), matchedAt: at(8, 42), via: 'DRIVER_ACCEPT', matchedBy: bullet.driverId },
      { passenger: rafiq, dropoff: gulshan1, requestedAt: at(8, 43), matchedAt: at(8, 43), via: 'AUTO_JOIN', matchedBy: null },
    ] as const;

    for (const rider of riders) {
      const km = distanceKm(banani, rider.dropoff);
      const estimate = estimateFares(km, 1);
      const fare = calculateFare({ distanceKm: km, seats: 1, pooled: true });
      const ride = await tx.rideRequest.create({
        data: {
          passengerId: rider.passenger.id, pickupZoneId: banani.id, dropoffZoneId: rider.dropoff.id, seats: 1,
          distanceKm: km, status: 'COMPLETED', estimateSoloPaisa: estimate.soloPaisa, estimatePooledPaisa: estimate.pooledPaisa,
          fareBasePaisa: fare.basePaisa, fareDistancePaisa: fare.distancePaisa, fareDiscountPaisa: fare.discountPaisa,
          fareTotalPaisa: fare.totalPaisa, createdAt: rider.requestedAt,
        },
      });
      await tx.poolMember.create({ data: { poolId: pool.id, rideRequestId: ride.id, seats: 1, joinedAt: rider.matchedAt } });
      await tx.rideEvent.createMany({
        data: [
          { rideRequestId: ride.id, actorUserId: rider.passenger.id, type: 'RIDE_REQUESTED', toStatus: 'REQUESTED', createdAt: rider.requestedAt },
          { rideRequestId: ride.id, poolId: pool.id, actorUserId: rider.matchedBy, type: 'RIDE_MATCHED', fromStatus: 'REQUESTED', toStatus: 'MATCHED', metadata: { via: rider.via }, createdAt: rider.matchedAt },
          { rideRequestId: ride.id, poolId: pool.id, actorUserId: bullet.driverId, type: 'RIDE_STATUS_CHANGED', fromStatus: 'MATCHED', toStatus: 'DRIVER_ARRIVED', createdAt: at(8, 44) },
          { rideRequestId: ride.id, poolId: pool.id, actorUserId: bullet.driverId, type: 'RIDE_STATUS_CHANGED', fromStatus: 'DRIVER_ARRIVED', toStatus: 'STARTED', metadata: { ...fare, pooled: true }, createdAt: at(8, 46) },
          { rideRequestId: ride.id, poolId: pool.id, actorUserId: bullet.driverId, type: 'RIDE_STATUS_CHANGED', fromStatus: 'STARTED', toStatus: 'COMPLETED', createdAt: at(8, 58) },
        ],
      });
    }
  });
  return true;
}
```

`createMany` inserts rows in array order, so `bigserial` ids increase in the same order and the timeline sorts correctly.

In `api/src/db/seed.ts`, import `seedDemoHistory` alongside `seedReferenceData`. After `await seedReferenceData(prisma);`, add:
```ts
    const seededHistory = await seedDemoHistory(prisma);
    if (seededHistory) console.log("Seeded yesterday's 08:41 Banani pool (Nusrat + Rafiq in Bullet).");
```

- [ ] **Step 3: Run all tests, then re-seed the dev database**

Run: `npx vitest run && npx tsc --noEmit`
Expected: everything passes.

Run: `npm run db:seed`
Expected: both seed lines print on the first run against a fresh dev DB. After that, only the cast line prints.

- [ ] **Step 4: Commit**

```bash
git add api/src api/test
git commit -m "feat(driver): add trip history and seed yesterday's Banani pool

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Final verification for Plan 1**

Run from `api/`: `npx vitest run && npx tsc --noEmit && npm run build && ls dist/server.js`
Expected: all tests pass, there are no type errors, and `dist/server.js` exists.

Smoke-test the dev server with curl:
```bash
npm run dev &   # in another terminal is fine too
sleep 3
TOKEN=$(curl -s localhost:4000/api/auth/login -H 'Content-Type: application/json' -d '{"email":"nusrat@teslapool.test","password":"bullet123"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
curl -s localhost:4000/api/rides -H "Authorization: Bearer $TOKEN"
kill %1
```
Expected: a JSON array containing yesterday's COMPLETED ride with `"totalPaisa":5250`.

- [ ] **Step 6: Close the branch**

Follow the Branch close procedure with `<branch>` = `feature/driver-flow`, `<title>` = `Driver flow: pool lifecycle, fare locking, history`, and `<summary>` = `Arrive/start/complete/cancel with fare locking at start, driver-cancel re-queue with auto-join retry, driver history, seeded demo history.`
