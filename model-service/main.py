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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
