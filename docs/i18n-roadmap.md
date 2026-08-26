# VeriSum Platform — Multilingual Extensibility & Roadmap (Gap 4.5)

This document provides a future-proofing architectural blueprint and concrete engineering checklist for extending the VeriSum safety-first summarization platform to support additional languages (e.g., Spanish `es`, French `fr`, German `de`, Mandarin Chinese `zh`).

---

## 1. Context & Architectural Principles

Currently, clinical NLP literature and safety evaluation platforms are predominantly English/US-centric (**Gap 4.5**). VeriSum is designed so that language assumptions are parameter-driven rather than hardcoded.

### Core Architectural Safeguards:
1. **Language Detection at Ingestion**: BCP-47 language codes are auto-detected during intake (`Document.language`).
2. **Backend Language Routing**: Model backends declare `supportedLanguages`. The platform rejects jobs if the chosen backend does not support the document language (`UNSUPPORTED_BACKEND_LANGUAGE`).
3. **Fail-Closed Security Policy**: In non-offline mode, documents in languages without a validated De-ID pipeline are blocked at ingestion (`DEID_UNSUPPORTED_LANGUAGE`).
4. **Transparent Verification Warnings**: When automated NLI verification is unavailable for a language, the system flags the summary with a visible UI warning rather than silently skipping validation.

---

## 2. End-to-End Checklist for Adding a New Language

Below is the concrete technical checklist required to enable a second language (e.g., Spanish `es`) end-to-end.

```
┌───────────────────────────┐    ┌───────────────────────────┐    ┌───────────────────────────┐
│ 1. Clinical Data & Token  │ →  │ 2. Domain Model & Service │ →  │ 3. De-ID Pipeline (NER)   │
└───────────────────────────┘    └───────────────────────────┘    └───────────────────────────┘
                                                                                │
┌───────────────────────────┐    ┌───────────────────────────┐                  ▼
│ 5. UI i18n Localization   │ ←  │ 4. Verification NLI Model │ ◄────────────────┘
└───────────────────────────┘    └───────────────────────────┘
```

---

### Phase 1: Clinical Corpus & Synthetic Data Setup
- [ ] **Collect Synthetic Test Fixtures**: Add at least 5 synthetic documents in the target language to `tests/fixtures/clinical_fixtures.json` covering all `docType`s.
- [ ] **Define PHI Entity Annotations**: Mark ground-truth character offsets for names, dates, MRNs, and locations in target language text.
- [ ] **Inject Fact Fabrications**: Include at least 2 synthetic documents with deliberate claim contradictions to benchmark verification accuracy.

---

### Phase 2: Local Model Service Adaptation (`model-service/`)
- [ ] **Select Base Model**: Identify a domain-adapted multilingual model (e.g. `mBART-50`, `mT5-base`, or `Llama-3-8B-Instruct`).
- [ ] **Update Prompt Templates**: Create language-specific summarization prompt templates in `model-service/app/prompts/`.
- [ ] **Register Backend Support**: Update `supportedLanguages` in `backend/src/summarizer/backends.ts`:
  ```typescript
  export class LocalModelServiceBackend implements SummarizerBackend {
    readonly supportedLanguages = ['en', 'es']; // Added 'es'
  }
  ```

---

### Phase 3: Language-Specific De-identification (De-ID)
- [ ] **Regex Rule Adaptation**: Update regular expressions in `backend/src/deid/rules.ts` for target language date formats (e.g., `DD/MM/YYYY`), address patterns, and national identifiers (e.g., DNI/NIE in Spanish).
- [ ] **NER Model Integration**: Train or fine-tune an `XLM-RoBERTa` or `mBERT` token-classification model on clinical NER benchmarks (e.g., MEDDOCAN for Spanish, CANTEMIST).
- [ ] **Update Fail-Closed Registry**: Register the validated language code in `backend/src/deid/languageDetector.ts`:
  ```typescript
  const VALIDATED_DEID_LANGUAGES = new Set(['en', 'es']);
  ```

---

### Phase 4: Fact Verification & NLI Model Calibration
- [ ] **Multilingual NLI Checker**: Integrate a cross-lingual NLI model (e.g., `MoritzLaurer/mDeBERTa-v3-base-mnli-xnli`) into `backend/src/verification/nliChecker.ts`.
- [ ] **Entity Extraction & Medical Ontology**: Update `backend/src/verification/entityChecker.ts` with target language medical entity stop-words and negation markers (e.g. "sin", "negativo", "sin evidencia de").
- [ ] **Register Verification Support**: Update `backend/src/verification/pipeline.ts` to clear `verificationWarning` when the target language is active.

---

### Phase 5: Frontend UI Localization
- [ ] **Install i18n Package**: Integrate `i18next` and `react-i18next` in `frontend/package.json`.
- [ ] **Add Locale Dictionaries**: Create `frontend/src/locales/es.json` containing UI text translations.
- [ ] **Add Language Selector Header**: Include a BCP-47 language picker dropdown in top navigation bar.
