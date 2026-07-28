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

---

### [2026-07-27] Chunk 0.3 — Authentication & Access Control

#### Auth Module Created (`backend/src/auth/`)
| File | Purpose |
|---|---|
| `tokens.ts` | `signAccessToken()` (15m), `signRefreshToken()` (7d), `verifyToken()` using `jsonwebtoken` + `JWT_SECRET` |
| `middleware.ts` | `requireAuth` (validates `Authorization: Bearer` JWT, attaches `req.user`); `requireRole(...roles)` factory (returns 403 on role mismatch) |
| `audit.ts` | `logEvent()` stub — writes `AuditLog` entries, non-fatal on failure; hook in place for 0.9 pipeline |
| `router.ts` | Full auth Express router (see endpoints below) |
| `index.ts` | Barrel re-export |

#### Endpoints Implemented
| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/auth/register` | Public | Creates researcher account; role locked to `researcher` |
| `POST` | `/auth/admin/create-user` | Admin-only | Creates any role (clinician/researcher/admin) |
| `POST` | `/auth/login` | Public | Returns `accessToken` JSON + `refreshToken` httpOnly cookie |
| `POST` | `/auth/refresh` | Cookie | Issues new access token from valid refresh cookie |
| `POST` | `/auth/logout` | Public | Clears refresh cookie |
| `GET` | `/auth/me` | requireAuth | Returns authenticated user profile (no passwordHash) |
| `GET` | `/auth/admin/users` | Admin-only | Lists all users |

#### Security Design Decisions
- bcrypt cost factor = **12** for production; tests use cost = **1** for speed
- Refresh token stored as **httpOnly, sameSite=strict** cookie scoped to `/auth/refresh`
- Wrong password response uses constant-time bcrypt compare to **prevent user enumeration**
- Express app split into `app.ts` (pure Express, no DB call) and `index.ts` (connects DB + calls listen) to allow Supertest imports without double-connect errors

#### Tests — `backend/tests/auth.test.ts` (16 tests, all passing)
- Register: success, duplicate email (409), weak password (400)
- Login: correct credentials, wrong password (401), non-existent user (401)
- /me: valid token, no token (401), expired token (401 + `TokenExpired`), tampered token (401)
- RBAC: admin allowed, researcher → 403, clinician → 403
- Refresh: no cookie (401), valid cookie, expired refresh (401 + `TokenExpired`)

**Total test suite: 27/27 passing ✅** (11 model tests + 16 auth tests)

---

### [2026-07-27] Chunk 0.4 — Document Ingestion & De-identification

#### De-identification Module (`backend/src/deid/index.ts`)
Two-pass pipeline:

| Pass | Where | What it catches |
|---|---|---|
| **Regex pass** (always runs) | Node.js | MRN, SSN, phone, dates (6 patterns), ages, emails, ZIP codes, IP addresses, URLs, patient IDs, room/bed numbers — 14 rule categories total |
| **NER pass** (optional) | `model-service` HTTP `/deid/ner` | PERSON, LOCATION, ORGANIZATION via Python `re` stub (spaCy/Presidio in later chunk) |

- NER call has a 5-second timeout; any network failure silently falls back to regex-only (non-fatal by design)
- Returns `{ deidentifiedText, phiMatchCount, matchedTags }` for both audit logging and response metadata

#### Text Extraction (`backend/src/ingestion/extractor.ts`)
| Format | Library | Notes |
|---|---|---|
| `.txt` | Buffer → UTF-8 | Direct read |
| `.pdf` | `pdf-parse` | Errors on image-only PDFs |
| `.docx` | `mammoth` | Extracts raw text, ignores formatting |
- Max file size: 10 MB enforced at multer layer

#### Ingestion Router (`backend/src/ingestion/router.ts`)
| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/documents` | `clinician`/`researcher`/`admin` | Multipart file **or** pasted JSON `rawText`; always stores de-identified text only |
| `GET` | `/documents` | Any auth | Lists caller's documents (admin sees all); `rawText` excluded from list response |
| `GET` | `/documents/:id` | Owner or admin | Returns de-identified text; admin `?raw-view=true` emits audited log entry |

**PHI never touches disk** — multer uses `memoryStorage()` only; raw buffer is discarded after extraction + de-identification.

#### Model-service NER Endpoint (`model-service/main.py`)
- `POST /deid/ner` — accepts `{ text }`, returns `{ entities, deidentified_text }`
- Current implementation: Python `re`-based stub for PERSON / LOCATION / ORGANIZATION
- spaCy + Microsoft Presidio integration planned for a later chunk

#### Tests — `backend/tests/ingestion.test.ts` (16 tests)
**5 synthetic PHI recall tests (unit):**
- Note 1: MRN `8834521`, SSN `123-45-6789`, DOB `03/15/1978`, phone `(555) 234-7890` → all redacted ✅
- Note 2: Admission date, discharge date, email `john.smith@email.com`, ZIP `94103` → all redacted ✅
- Note 3: Patient ID `4492871`, age `67-year-old`, URL `https://pacs.hospital.internal/...` → all redacted ✅
- Note 4: Three dates + phone in dialogue format → all redacted ✅
- Note 5: IP `192.168.1.45`, email, two dates in biomedical excerpt → all redacted ✅
- Clean text baseline: `phiMatchCount = 0` ✅

**API integration tests (10):**
- Clinician/researcher text upload, unauthenticated 401, missing `docType` 400, missing body 400
- `.txt` file upload via multipart
- GET: owner access, non-owner 403, admin access, 404 for unknown ID

**Total test suite: 43/43 passing ✅** (11 model + 16 auth + 16 ingestion)

---

### [2026-07-28] Chunk 0.5 — Long-Document Chunking & Hierarchical Summarization

#### Files Created (`backend/src/chunking/`)
| File | Purpose |
|---|---|
| `splitter.ts` | Regex-based sentence boundary detector with abbreviation protection (placeholder substitution), section-header detection, paragraph/sentence two-phase split |
| `TextChunker.ts` | `TextChunker` class — sentence-aware, overlap-carrying, section-boundary preferring chunker with injected `countTokens` function |
| `HierarchicalSummarizer.ts` | Map-reduce orchestrator with recursive re-chunking, multi-document support, per-chunk source tagging, intermediate summary retention |
| `index.ts` | Barrel export |
| `README.md` | Design doc: map-reduce strategy, tradeoffs vs RAG, config examples, convergence analysis |

#### TextChunker Design
- **Injected tokenizer**: `countTokens: (text: string) => number` — backbone-agnostic
- **Section-boundary preference**: splits at clinical headers (`Assessment:`, `Plan:`, `Chief Complaint:`, etc.) before falling back to sentence, then paragraph
- **Overlap**: configurable `overlapTokens` carried from previous chunk tail (prevents boundary blindness)
- **Validation**: throws on invalid config (max ≤ 0, overlap ≥ max, negative overlap)
- **Multi-doc**: `chunkDocuments(docs)` tags each chunk with its source `docId`

#### HierarchicalSummarizer Design
- **Map step**: summarizes each chunk independently (parallel `Promise.all`)
- **Reduce step**: concatenates chunk-summaries → if within token limit, produce final; else re-chunk recursively
- **Output**: `{ finalSummary, chunkSummaries[], levelsUsed, sourceDocIds[] }`
- `chunkSummaries` preserves all intermediate levels for claim-tracing back to source spans (used in 0.7)

#### Test Infrastructure Fix
- ts-jest uses 500MB+ heap on this machine (2.7GB available) — OOM with all suites in one process
- **Solution**: split into two separate Node processes:
  - `test:unit` — `chunking.runner.ts` compiled to plain JS, runs with Node `assert` module, 256MB heap
  - `test:integration` — Jest + mongodb-memory-server, models/auth/ingestion tests, 2048MB heap
  - `build:test` — `tsc -p tsconfig.jest.json` compiles to `dist-test/` for both runners

#### Tests — `backend/tests/chunking.runner.ts` (22 tests, all passing ✅)
- Splitter: 3-sentence split, empty string, abbreviation protection (Dr./Mr.), section header preservation
- Constructor: validation of maxTokensPerChunk/overlapTokens combos
- Short doc: single-chunk fast path
- **Acceptance criteria (a/b/c)**: no chunk over limit, sentence-boundary endings, ≥95% source coverage
- Section-aware: structured clinical doc produces `sectionName` tagged chunks
- Multi-doc: docId tagging, per-doc chunkIndex reset
- HierarchicalSummarizer: short doc, long doc multi-level reduce, sentenceRange validity, multi-doc tagging, three-doc job

**Grand total: 65 tests, 0 failures ✅** (22 unit + 43 integration)

---

### [2026-07-28] Chunk 0.6 — Pluggable Summarization Model Backends

#### Interfaces & Backends Created (`backend/src/models/` & `backend/src/summarizer/`)
- **`SummarizerBackend` Interface**: Defines common API for model backends:
  - `name`: string identifier
  - `maxContextTokens`: number
  - `summarize(text, docType)`: returns `Promise<SummaryResult>`
  - `countTokens(text)`: returns number
- **`SummaryResult` Interface**: Structure for summary outputs:
  - `summaryText`, `modelName`, `modelVersion`, `latencyMs`, `rawProviderResponse`
- **Concrete Backend Implementations**:
  1. `MockBackend`: Deterministic backend for tests (truncation-based).
  2. `LocalModelServiceBackend`: HTTP client calls Python FastAPI `model-service` on `POST /summarize` (defaults to port 8000) with a 15-second timeout and robust local fallback when offline.
  3. `HostedLLMBackend`: Calls Anthropic API (Claude) or OpenAI API (GPT) based on config, with 3x retry + exponential backoff, custom token estimator, and local fallback on exhaustion/no key.
- **`BackendRegistry`**: Factory mapping identifiers `"mock"`, `"local"`, `"local_clinical_model"`, and `"hosted_llm"` to backend instances.

#### Ingestion & Workers Wiring
- **Jobs Router (`backend/src/jobs/router.ts`)**:
  - `POST /jobs`: Creates a `SummarizationJob` in `queued` status, validates document IDs exist in MongoDB, enqueues onto BullMQ (`summarization-queue`), and creates an audit log.
  - `GET /jobs/:id`: Endpoint to check job status.
- **Queue System (`backend/src/jobs/queue.ts`)**: Configures Redis-backed BullMQ Queue using `ioredis`.
- **Worker (`worker/src/index.ts` & `backend/src/jobs/processor.ts`)**:
  - Worker listens to `summarization-queue` in worker process.
  - Processor (`processSummarizationJob` located in backend to avoid cross-rootDir compilation issues) connects to MongoDB, marks job as `running`, runs `HierarchicalSummarizer` with the configuration-selected backend, persists `Summary` document (with intermediate chunk summaries stored inside `automaticMetrics`), sets job status to `verifying` (comes in 0.7), and logs a `summarize` audit log.

#### Python `model-service` Summarization
- Added `POST /summarize` to `model-service/main.py`.
- Attempts to load Hugging Face pipeline (defaults to `google/t5-small`) once at startup; gracefully falls back to sentence-extraction heuristic if `transformers` or `torch` are not installed or fail to load.

#### Tests — `backend/tests/jobs.test.ts` (3 tests, all passing)
- Enqueues jobs and processes them inline (by mocking BullMQ queue to execute the worker processor in the same thread synchronously).
- Verifies database status transitions, non-empty summaries, correct backend metadata recording, and audit logging.
- Tests validation failures (empty document list, non-existent document IDs).

**Grand total: 68 tests, 0 failures ✅** (22 unit + 46 integration)

