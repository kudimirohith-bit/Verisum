from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List

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


# ── Health Check ───────────────────────────────────────────────────────────────
@app.get("/health")
def health_check():
    return {"status": "ok"}


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
    """
    NER-based de-identification using regex fallback.

    In Chunk 0.4 this is a rule-based stub using Python re patterns for
    PERSON / LOCATION / ORGANIZATION / DATE entities.
    A spaCy/Presidio model will be wired in a later chunk for production accuracy.
    """
    import re

    text = req.text
    entities: List[NerEntity] = []

    rules = [
        # Salutation + Name patterns: Dr. John Smith, Mr. Jane Doe, Nurse Alice
        (r'\b(Dr\.?|Mr\.?|Mrs\.?|Ms\.?|Prof\.?|Nurse|Patient)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b', 'PERSON'),
        # "Name: John Smith" patterns
        (r'\b(Name|Patient Name|Attending)[:\s]+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b', 'PERSON'),
        # Street addresses
        (r'\b\d{1,5}\s+[A-Z][a-z]+\s+(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct|Way)\b', 'LOCATION'),
        # City, State ZIP
        (r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?,\s+[A-Z]{2}\s+\d{5}(?:-\d{4})?\b', 'LOCATION'),
        # Hospital / Clinic names
        (r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(Hospital|Clinic|Medical Center|Health System|Healthcare)\b', 'ORGANIZATION'),
    ]

    offset_shift = 0
    deidentified = text

    for pattern, label in rules:
        for match in re.finditer(pattern, text):
            tag = f"[{label}]"
            entities.append(NerEntity(
                text=match.group(),
                label=label,
                start=match.start(),
                end=match.end()
            ))

    # Apply substitutions by sorting matches in reverse order to preserve offsets
    all_matches = []
    for pattern, label in rules:
        for match in re.finditer(pattern, text):
            all_matches.append((match.start(), match.end(), f"[{label}]"))

    # Sort by start position descending to avoid offset drift
    all_matches.sort(key=lambda x: x[0], reverse=True)
    result = list(text)
    for start, end, tag in all_matches:
        result[start:end] = list(tag)
    deidentified = "".join(result)

    return NerResponse(entities=entities, deidentified_text=deidentified)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
