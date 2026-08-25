# VeriSumm Benchmarking Report: CLI Research Study Run
**Run ID:** `6a8d59d2995b2811f3039647`  
**Date:** 2026-08-25T09:01:06.619Z  
**Documents Evaluated:** 1  
**Model Backends Compared:** `mock`, `local_clinical_model`, `hosted_llm`  

---

## 1. Model Backend Comparison Summary

| Backend | Count | ROUGE-1 (F1) | ROUGE-2 (F1) | ROUGE-L (F1) | BERTScore | Entity F1 | Consistency | Human Overall | Latency | Flagged Rate |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **mock** | 1 | 0.430 | 0.418 | 0.430 | 0.500 | 0.441 | 1.000 | N/A | 4 ms | 0.0% |
| **local_clinical_model** | 1 | 0.673 | 0.667 | 0.673 | 0.750 | 0.704 | 1.000 | N/A | 11 ms | 0.0% |
| **hosted_llm** | 1 | 0.215 | 0.154 | 0.172 | 0.222 | 0.189 | 1.000 | N/A | 2 ms | 0.0% |

## 2. Metric Leaderboard & Best Performers

- **Highest ROUGE-1 Overlap:** `local_clinical_model` (0.673)
- **Highest BERTScore Semantic Match:** `local_clinical_model` (0.750)
- **Highest Clinical Entity Grounding:** `local_clinical_model` (0.704)
- **Highest Factual Consistency (NLI):** `mock` (1.000)
- **Fastest Inference Speed:** `hosted_llm` (2 ms)

## 3. Automatic Metrics vs. Clinician Judgment Correlation

Empirical study evaluating how standard automatic NLP metrics correlate with clinician rating dimensions.

| Automatic Metric | Human Dimension | Sample Size | Pearson (r) | Spearman (ρ) | Interpretation |
|:---|:---|:---:|:---:|:---:|:---|
| `rouge1_f1` | completeness | 1 | **0.000** | **0.000** | Negligible / No Correlation |
| `rouge1_f1` | correctness | 1 | **0.000** | **0.000** | Negligible / No Correlation |
| `rouge1_f1` | conciseness | 1 | **0.000** | **0.000** | Negligible / No Correlation |
| `rouge1_f1` | overall | 1 | **0.000** | **0.000** | Negligible / No Correlation |
| `rouge2_f1` | completeness | 1 | **0.000** | **0.000** | Negligible / No Correlation |
| `rouge2_f1` | correctness | 1 | **0.000** | **0.000** | Negligible / No Correlation |
| `rouge2_f1` | conciseness | 1 | **0.000** | **0.000** | Negligible / No Correlation |
| `rouge2_f1` | overall | 1 | **0.000** | **0.000** | Negligible / No Correlation |
| `rougeL_f1` | completeness | 1 | **0.000** | **0.000** | Negligible / No Correlation |
| `rougeL_f1` | correctness | 1 | **0.000** | **0.000** | Negligible / No Correlation |
| `rougeL_f1` | conciseness | 1 | **0.000** | **0.000** | Negligible / No Correlation |
| `rougeL_f1` | overall | 1 | **0.000** | **0.000** | Negligible / No Correlation |
| `bertScore_f1` | completeness | 1 | **0.000** | **0.000** | Negligible / No Correlation |
| `bertScore_f1` | correctness | 1 | **0.000** | **0.000** | Negligible / No Correlation |
| `bertScore_f1` | conciseness | 1 | **0.000** | **0.000** | Negligible / No Correlation |
| `bertScore_f1` | overall | 1 | **0.000** | **0.000** | Negligible / No Correlation |
| `entityF1` | completeness | 1 | **0.000** | **0.000** | Negligible / No Correlation |
| `entityF1` | correctness | 1 | **0.000** | **0.000** | Negligible / No Correlation |
| `entityF1` | conciseness | 1 | **0.000** | **0.000** | Negligible / No Correlation |
| `entityF1` | overall | 1 | **0.000** | **0.000** | Negligible / No Correlation |
| `consistencyScore` | completeness | 1 | **0.000** | **0.000** | Negligible / No Correlation |
| `consistencyScore` | correctness | 1 | **0.000** | **0.000** | Negligible / No Correlation |
| `consistencyScore` | conciseness | 1 | **0.000** | **0.000** | Negligible / No Correlation |
| `consistencyScore` | overall | 1 | **0.000** | **0.000** | Negligible / No Correlation |

## 4. Key Disagreements: Automatic NLP Metrics vs. Human Safety

Highlighting instances where lexical/ngram metrics (ROUGE) rated summaries highly despite low clinician correctness ratings due to subtle hallucinations.

No severe metric-human disagreements detected in this benchmark evaluation run.

## 5. Summary & Governance Recommendations

1. **Safety First:** Lexical metrics like ROUGE fail to detect critical numerical or negation flips in clinical text. NLI-based consistency scoring and entity grounding must remain mandatory safety gates before summary presentation.
2. **Model Selection:** Use domain-adapted backends (`local_clinical_model` or fine-tuned LLMs) for acute discharge notes, reserving generative APIs for non-sensitive dialogue transcripts.
