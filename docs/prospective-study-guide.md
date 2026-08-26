# VeriSum Platform — Prospective Evaluation & Study Design Guide (Gap 4.6)

This guide provides research teams with methodology, governance standards, and operational procedures for designing prospective clinical studies using the VeriSum platform.

---

## 1. Executive Summary & Research Gap

The clinical NLP literature review (**Gap 4.6**) established that almost all existing evidence for LLM clinical note summarization is retrospective and offline (e.g., automated ROUGE/BERTScore on static datasets). Very few studies evaluate real-world prospective workflows or prospective clinician time-saved.

VeriSum provides **Study Mode** (`/studies`) to structure prospective clinical evaluation into trackable, research-grade studies.

> [!IMPORTANT]
> **IRB / Ethics Committee Mandate**: VeriSum provides the *technical instrumentation* and audit logging for prospective study execution. Institutional Review Board (IRB) or Ethics Committee approval is strictly the responsibility of the research team before enrolling real patient data or clinicians into a study.

---

## 2. Prospective Study Architecture & Workflow

```
┌───────────────────────────┐    ┌───────────────────────────┐    ┌───────────────────────────┐
│ 1. Study Registration     │ →  │ 2. Document Ingestion &   │ →  │ 3. Blinded Clinician      │
│    POST /studies          │    │    Randomized Backend     │    │    Evaluation & Review    │
└───────────────────────────┘    └───────────────────────────┘    └───────────────────────────┘
                                                                                │
┌───────────────────────────┐    ┌───────────────────────────┐                  ▼
│ 5. Export Study Results   │ ←  │ 4. Time-on-Task & Safety  │ ◄────────────────┘
│    GET /studies/:id/results│   │    Audit Data Capture     │
└───────────────────────────┘    └───────────────────────────┘
```

---

## 3. Study Design & Methodological Best Practices

### A. Randomized Backend Allocation & Blinding
To eliminate reviewer confirmation bias:
- **Backend Enrollment**: Enroll 2 or 3 model backends in the study (e.g., `local_clinical_model` vs. `hosted_llm`).
- **Blinding**: Enable clinician-blinding in the frontend so reviewers do not know which model generated a given summary during rating.
- **Randomization**: Assign incoming summarization jobs across enrolled backends using 1:1 block randomization.

### B. Sample Size & Power Calculations
- **Primary Outcomes**:
  - **Clinician Time-Saved**: Difference in review time (seconds) between baseline manual review and AI-assisted summary review.
  - **Correctness Rating**: Mean 5-point Likert score for factual accuracy.
- **Sample Size Guidance**:
  - To detect a 15% reduction in clinician review time (α = 0.05, power = 0.80), a minimum sample size of **N = 100 summaries per arm** (200 total) is recommended across diverse document types (`ehr_note`, `discharge_summary`, `radiology_report`).

### C. Time-on-Task Instrumentation & Limitations
- **Instrumentation**: The platform automatically records `timeOnTaskMs` from the moment a clinician opens the summary review screen until feedback submission.
- **Exploratory Caveat**:
  > [!NOTE]
  > Time-on-task is an automated browser approximation. It measures UI interaction latency and should be interpreted as exploratory efficiency evidence, not a clinical trial-grade time-and-motion measurement.

---

## 4. Operational API Workflow for Researchers

### Step 1: Create a Research Study
```bash
POST /studies
Authorization: Bearer <RESEARCHER_JWT>
Content-Type: application/json

{
  "name": "Prospective Discharge Note Efficiency Study (2026)",
  "description": "Evaluating local ClinicalT5 vs Hosted LLM on clinician review speed and correctness.",
  "enrolledBackends": ["local_clinical_model", "hosted_llm"],
  "enrolledDocTypes": ["discharge_summary"],
  "primaryOutcomeMetric": "clinician_time_saved"
}
```

### Step 2: Enroll Documents / Jobs into Study
```bash
POST /studies/:studyId/enroll-document
Authorization: Bearer <RESEARCHER_JWT>

{
  "jobId": "65b2f8a1e4b01234567890ab"
}
```

### Step 3: Clinicians Complete Review Sessions
Clinicians review summaries via the React interface (`SummaryReviewScreen.tsx`). The platform automatically attaches `timeOnTaskMs` and `studyId` to submitted feedback.

### Step 4: Export Aggregated Study Results
```bash
GET /studies/:studyId/results
Authorization: Bearer <RESEARCHER_JWT>
```
Returns structured JSON metrics and an exportable Markdown report comparing:
- Mean consistency scores
- Mean clinician ratings (Correctness, Completeness, Conciseness)
- Flagged claim rates
- Average time-on-task per backend
