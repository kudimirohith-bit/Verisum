from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import os
import time

app = FastAPI(
    title="VeriSumm Model Service",
    description="Python FastAPI microservice for local transformer-model inference and NER-based de-identification",
    version="0.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Load local HF Model once at startup ─────────────────────────────────────────
HF_MODEL_NAME = os.getenv("HF_MODEL_NAME", "google/t5-small")
model_loaded = False
summarizer_pipeline = None

try:
    # Attempt to load Hugging Face pipeline if transformers is available
    import torch
    from transformers import pipeline
    print(f"Loading local HF model '{HF_MODEL_NAME}'...")
    # Using pipeline for summarization. On low-memory environments, we configure local model name.
    # We use CPU by default unless CUDA is available.
    device = 0 if torch.cuda.is_available() else -1
    summarizer_pipeline = pipeline("summarization", model=HF_MODEL_NAME, device=device)
    model_loaded = True
    print("HF model loaded successfully.")
except Exception as e:
    print(f"Failed to load HF model '{HF_MODEL_NAME}' ({type(e).__name__}: {e}). Using mock/fallback summarizer.")
    model_loaded = False


# ── Health Check ───────────────────────────────────────────────────────────────
@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "model_loaded": model_loaded,
        "model_name": HF_MODEL_NAME if model_loaded else "mock_model"
    }


# ── Summarization Endpoint ─────────────────────────────────────────────────────
class SummarizeRequest(BaseModel):
    text: str
    doc_type: Optional[str] = "ehr_note"


class SummarizeResponse(BaseModel):
    summary_text: str
    model_name: str
    model_version: str


@app.post("/summarize", response_model=SummarizeResponse)
def summarize(req: SummarizeRequest):
    """
    Summarize a chunk of medical text using the loaded HF model.
    Falls back to a sentence-extraction heuristic if the model is not loaded.
    """
    if model_loaded and summarizer_pipeline is not None:
        try:
            # Adjust min/max length dynamically based on input length
            input_length = len(req.text.split())
            max_len = min(150, max(30, int(input_length * 0.5)))
            min_len = min(30, int(max_len * 0.5))

            res = summarizer_pipeline(req.text, max_length=max_len, min_length=min_len, do_sample=False)
            summary = res[0]["summary_text"]
            return SummarizeResponse(
                summary_text=summary,
                model_name=HF_MODEL_NAME,
                model_version="1.0.0"
            )
        except Exception as e:
            # Fall through to mock on inference error
            pass

    # Mock/fallback heuristic (sentence extractor)
    sentences = [s.strip() for s in req.text.split(".") if s.strip()]
    # Return first 2 sentences or simple summary prefix
    if len(sentences) > 2:
        summary = f"Summary ({req.doc_type}): " + ". ".join(sentences[:2]) + "."
    elif sentences:
        summary = f"Summary ({req.doc_type}): " + sentences[0] + "."
    else:
        summary = "No text provided to summarize."

    return SummarizeResponse(
        summary_text=summary,
        model_name="mock_local_clinical_model",
        model_version="0.1.0-mock"
    )


# ── De-identification NER endpoint ─────────────────────────────────────────────
class NerRequest(BaseModel):
    text: str


class NerEntity(BaseModel):
    text: str
    label: str
    start: int
    end: int


class NerResponse(BaseModel):
    entities: List[NerEntity]
    deidentified_text: str


@app.post("/deid/ner", response_model=NerResponse)
def deid_ner(req: NerRequest):
    import re

    text = req.text
    entities: List[NerEntity] = []

    rules = [
        (r'\b(Dr\.?|Mr\.?|Mrs\.?|Ms\.?|Prof\.?|Nurse|Patient)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b', 'PERSON'),
        (r'\b(Name|Patient Name|Attending)[:\s]+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b', 'PERSON'),
        (r'\b\d{1,5}\s+[A-Z][a-z]+\s+(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct|Way)\b', 'LOCATION'),
        (r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?,\s+[A-Z]{2}\s+\d{5}(?:-\d{4})?\b', 'LOCATION'),
        (r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(Hospital|Clinic|Medical Center|Health System|Healthcare)\b', 'ORGANIZATION'),
    ]

    all_matches = []
    for pattern, label in rules:
        for match in re.finditer(pattern, text):
            all_matches.append((match.start(), match.end(), f"[{label}]", match.group(), label))

    all_matches.sort(key=lambda x: x[0], reverse=True)
    result = list(text)
    for start, end, tag, matched_text, label in all_matches:
        result[start:end] = list(tag)
        entities.append(NerEntity(
            text=matched_text,
            label=label,
            start=start,
            end=end
        ))
    deidentified = "".join(result)

    return NerResponse(entities=entities, deidentified_text=deidentified)


# ── NLI Entailment Endpoint ───────────────────────────────────────────────────
class NliCheckRequest(BaseModel):
    premise: str
    hypothesis: str


class NliCheckResponse(BaseModel):
    entailment_score: float
    contradiction_score: float
    neutral_score: float
    verdict: str


@app.post("/nli-check", response_model=NliCheckResponse)
def nli_check(req: NliCheckRequest):
    """
    Evaluates entailment vs contradiction vs neutral for a premise (source chunk)
    and a hypothesis (summary claim sentence).
    """
    import re
    premise = req.premise.lower().strip()
    hypothesis = req.hypothesis.lower().strip()

    if not premise or not hypothesis:
        return NliCheckResponse(
            entailment_score=0.0,
            contradiction_score=0.0,
            neutral_score=1.0,
            verdict="neutral"
        )

    # 1. Number comparison (numeric hallucination detection)
    p_nums = set(re.findall(r'\b\d+(?:\.\d+)?\b', premise))
    h_nums = set(re.findall(r'\b\d+(?:\.\d+)?\b', hypothesis))

    missing_nums = h_nums - p_nums
    if missing_nums:
        return NliCheckResponse(
            entailment_score=0.05,
            contradiction_score=0.90,
            neutral_score=0.05,
            verdict="contradiction"
        )

    # 2. Negation flip check
    negation_words = {"no", "not", "denies", "denied", "without", "absent", "negative", "never", "none"}
    p_negs = set(w for w in premise.split() if w in negation_words)
    h_negs = set(w for w in hypothesis.split() if w in negation_words)

    if (len(p_negs) > 0) != (len(h_negs) > 0):
        p_words = set(re.findall(r'\b[a-z]{3,}\b', premise)) - negation_words
        h_words = set(re.findall(r'\b[a-z]{3,}\b', hypothesis)) - negation_words
        common = p_words & h_words
        if len(common) >= 1:
            return NliCheckResponse(
                entailment_score=0.10,
                contradiction_score=0.85,
                neutral_score=0.05,
                verdict="contradiction"
            )

    # 3. Word/concept overlap scoring
    p_words = set(re.findall(r'\b[a-z]{3,}\b', premise))
    h_words = set(re.findall(r'\b[a-z]{3,}\b', hypothesis))

    stopwords = {"the", "and", "was", "for", "with", "that", "this", "from", "were", "been", "have", "has", "had", "patient", "showed", "note"}
    h_content = h_words - stopwords
    p_content = p_words - stopwords

    if not h_content:
        return NliCheckResponse(
            entailment_score=0.80,
            contradiction_score=0.10,
            neutral_score=0.10,
            verdict="entailment"
        )

    overlap = h_content & p_content
    overlap_ratio = len(overlap) / len(h_content)

    if overlap_ratio >= 0.5:
        ent_score = round(min(0.99, 0.60 + (overlap_ratio * 0.40)), 2)
        return NliCheckResponse(
            entailment_score=ent_score,
            contradiction_score=0.05,
            neutral_score=round(1.0 - ent_score - 0.05, 2),
            verdict="entailment"
        )
    elif overlap_ratio >= 0.25:
        return NliCheckResponse(
            entailment_score=0.40,
            contradiction_score=0.20,
            neutral_score=0.40,
            verdict="neutral"
        )
    else:
        return NliCheckResponse(
            entailment_score=0.10,
            contradiction_score=0.75,
            neutral_score=0.15,
            verdict="contradiction"
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

