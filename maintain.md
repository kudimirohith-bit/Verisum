# Maintain Log - Verisum Project

## Repository & Environment Setup
- **Repository URL**: `https://github.com/kudimirohith-bit/Verisum`
- **Branch**: `main`
- **Initialized**: 2026-07-27

---

## Log of Changes & Tasks

### [2026-07-27] Chunk 0.1 — MERN Project Scaffolding Initialized

#### Monorepo Architecture & Package Management
- Configured root `package.json` with npm workspaces (`backend`, `frontend`, `worker`, `libs/common`).
- Implemented `@verisumm/common` shared library containing TypeScript interfaces (`SummarizationJobPayload`, `SummarizationJobResult`), constants (`QUEUE_NAMES`), and status definitions.
- Created root `.gitignore` and `.env.example` pre-declaring all environment variables.

#### Service Implementation Breakdown
1. **Backend Service (`backend/`)**: Express + TypeScript API, pre-declared deps, `GET /health`, `tsconfig.json`, `.eslintrc.json`, `.prettierrc`, Dockerfile.
2. **Frontend Service (`frontend/`)**: React + Vite + TypeScript, Tailwind CSS, `react-router-dom`, Axios client wrapper, VeriSumm landing page, Dockerfile.
3. **Worker Service (`worker/`)**: Node.js + TypeScript, connected to `@verisumm/common`, Dockerfile.
4. **Model Microservice (`model-service/`)**: Python + FastAPI, `/health` endpoint, Dockerfile.
5. **Infrastructure (`infra/docker-compose.yml`)**: 6 services with healthchecks.
6. **Docs**: `README.md`, `docs/architecture.md` with Mermaid diagram.

---

### [2026-07-27] Chunk 0.2 — Core Data Models (Mongoose Schemas)

#### Mongoose Models Created (`backend/src/models/`)
| Model | Key Fields | Indexes |
|---|---|---|
| `User` | email (unique), role enum, passwordHash | Unique on `email` (via `unique: true` field flag) |
| `Document` | ownerId (ref User), docType enum, rawText, phiStatus, collectionId (nullable) | Index on `ownerId` |
| `SummarizationJob` | documentIds (array ref Document), modelBackend, status enum, completedAt | Index on `status` |
| `Summary` | jobId (ref SummarizationJob), summaryText, tokenCount, automaticMetrics (Mixed), consistencyScore (nullable), flaggedClaims (sub-docs) | None |
| `ClinicianFeedback` | summaryId (ref Summary), reviewerId (ref User), 3x rating fields (1-5), comment | None |
| `AuditLog` | eventType enum, actorId (nullable), documentId (nullable), jobId (nullable), payload (Mixed) | Compound on `eventType + createdAt` |

#### Zod Schemas Created (`backend/src/schemas/`)
- `user.schema.ts`, `document.schema.ts`, `summarizationJob.schema.ts`, `summary.schema.ts`, `clinicianFeedback.schema.ts`, `auditLog.schema.ts`, `index.ts` (barrel)

#### Database Connection
- Created `backend/src/lib/db.ts` — reusable `connectDB()` / `disconnectDB()` functions.
- Updated `backend/src/index.ts` to connect MongoDB before starting Express.

#### Seed Script
- Created `backend/scripts/seedDemoData.ts` — `npm run seed` inserts:
  - 1 admin user (`admin@verisumm.io`)
  - 1 clinician user (`clinician@verisumm.io`)
  - 1 de-identified `discharge_summary` document

#### Tests
- Created `backend/tests/models.test.ts` — Jest + `mongodb-memory-server` (11 tests):
  - User: create, unique email, invalid role rejection
  - Document: create + `ownerId` population
  - SummarizationJob: create + `documentIds` population
  - Summary: create + `jobId` population
  - ClinicianFeedback: create + multi-ref population + out-of-range rating rejection
  - AuditLog: create + invalid eventType rejection
- **Result: 11/11 tests passing** ✅
- Note: `MONGOMS_SYSTEM_BINARY` env var set in `npm test` script to use cached Fedora 43-compatible MongoDB 7.0.24 binary.
