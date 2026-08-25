# VeriSum Platform — Testing Strategy & CI/CD Documentation

This document outlines the testing architecture, synthetic data guidelines, coverage requirements, and continuous integration pipeline for the VeriSum platform.

---

## 1. Testing Pyramid & Overview

VeriSum enforces a three-tier test pyramid to guarantee factual verification accuracy, security compliance, and UI regression protection.

```
                  ┌────────────────────────┐
                  │    End-to-End (E2E)    │  Playwright (Frontend + API Flow)
                  │       (Browser)        │
                  ├────────────────────────┤
                  │   Integration Tests    │  Supertest + Mongoose + MongoMemoryServer
                  │    (REST API & Jobs)   │  + Deployment Mode & Audit Logs
                  ├────────────────────────┤
                  │       Unit Tests       │  Jest / Vitest (Chunking, Verification
                  │  (Core Logic & Math)   │  Metrics, Auth, Token Parsing)
                  └────────────────────────┘
```

---

## 2. Test Suite Breakdown

### 2.1 Unit Tests
Unit tests validate pure algorithms without network or database dependencies:
- **Text Chunking & Hierarchy** (`backend/src/chunking/`): Validates sentence boundary integrity, chunk overlapping, and source document attribution.
- **De-identification Engine** (`backend/src/deid/`): Verifies HIPAA Safe Harbor regex and NER entity extraction.
- **Fact Verification & NLI Metrics** (`backend/src/verification/`): Tests string overlap, ROUGE scores, entity F1 calculations, and claim contradiction classification.

Run unit tests locally:
```bash
cd backend && npm run test:unit
```

### 2.2 Integration Tests
Integration tests execute full REST API routes against an in-memory MongoDB server (`mongodb-memory-server`) and mock job queue:
- **Auth & JWT** (`auth.test.ts`): Admin creation, clinician registration, login, token refresh, and role enforcement.
- **Ingestion & De-ID** (`ingestion.test.ts`): Document upload, file parsing (.pdf, .docx, .txt), and PHI redaction.
- **Summarization & Jobs** (`jobs.test.ts`): Job creation across multiple model backends (`mock`, `local_clinical_model`).
- **Audit Logging** (`audit.test.ts`): Request ID tracking and audit trail search filtering.
- **Benchmark & Correlations** (`benchmark.test.ts`): NLP automated metrics vs clinician feedback correlation calculations.
- **Multi-Doc Collections** (`collections.test.ts`): Collection management and multi-document synthesis.
- **Deployment Mode** (`deploymentMode.test.ts`): Enforces `DEPLOYMENT_MODE=offline` restriction blocking `hosted_llm` calls with HTTP 403 Forbidden.

Run integration tests locally:
```bash
cd backend && npm run test:integration
```

Run integration tests with code coverage enforcement:
```bash
cd backend && npm run test:coverage
```

### 2.3 End-to-End (E2E) Browser Tests
Playwright automates browser interaction across the React frontend and Express backend:
- `tests/e2e/verisum_workflow.spec.ts`: Simulates clinical document intake → backend selection → job submission → summary review with flagged claims → clinician evaluation submission.

Run Playwright E2E tests locally:
```bash
npx playwright test
```

---

## 3. Synthetic Clinical Text Fixtures

Test fixtures are located in `tests/fixtures/clinical_fixtures.json` (and `tests/fixtures/fixtures.ts`).

The suite includes 10 realistic synthetic clinical document fixtures across all supported `docType`s:
1. `ehr_note` (Outpatient Progress Note)
2. `discharge_summary` (Hospital Course - NSTEMI)
3. `radiology_report` (Chest Radiograph 2-Views)
4. `pathology_report` (Melanoma Skin Biopsy)
5. `dialogue_transcript` (Telehealth Asthma Consultation)
6. `biomedical_literature` (SGLT2 Inhibitor Trial Meta-Analysis)
7. `ehr_note` (Emergency Appendicitis Note)
8. `discharge_summary` (Psychiatric Unit Discharge)
9. `radiology_report` (Brain MRI Scan)
10. `biomedical_literature` (GLP-1 Renal Trial Meta-Analysis)

### ⚠️ STRICT SAFETY RULE: Synthetic Data Mandate
> **CRITICAL MANDATE**: NEVER commit, upload, or paste real patient data, real hospital clinical notes, or un-anonymized Protected Health Information (PHI) into test files or fixtures.
>
> All test fixtures MUST be 100% synthetically generated using synthetic names (e.g. "Johnathan Doe"), fake dates, synthetic MRNs (e.g. "98451230"), and fictional medical accounts.

### Guidelines for Adding New Test Fixtures:
When adding new fixtures to `tests/fixtures/clinical_fixtures.json`:
1. Assign a unique `id` (e.g., `synth-doc-11`).
2. Specify the correct `docType`.
3. Fill `expectedPhi` array with exact character substrings and categories (`NAME`, `DATE`, `MRN`, `LOCATION`, `ACCESSION`).
4. If testing verification/hallucination detection, set `hasInjectedFabrications: true` and include `fabricatedClaims` with the expected contradiction reason.

---

## 4. Code Coverage Thresholds

Jest enforces coverage thresholds configured in `backend/package.json`:

```json
"coverageThreshold": {
  "global": {
    "lines": 70,
    "statements": 70
  },
  "./dist-test/src/chunking/": {
    "lines": 80,
    "statements": 80
  },
  "./dist-test/src/verification/": {
    "lines": 80,
    "statements": 80
  },
  "./dist-test/src/auth/": {
    "lines": 80,
    "statements": 80
  },
  "./dist-test/src/audit/": {
    "lines": 80,
    "statements": 80
  }
}
```

The CI build will fail automatically if backend coverage falls below these thresholds.

---

## 5. CI/CD Pipeline Architecture

The `.github/workflows/ci.yml` pipeline executes 4 parallel and sequential stages:

1. **Lint & Test Stage**: Runs ESLint, type-checking, and Jest unit/integration tests with MongoDB/Redis services.
2. **Docker Build Verification**: Builds all 4 container images (`backend`, `worker`, `frontend`, `model-service`).
3. **Playwright E2E Stage**: Spins up local servers and executes headless Playwright browser tests.
4. **Security Audit Stage**: Performs dependency vulnerability scanning using `npm audit`.
