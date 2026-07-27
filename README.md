# VeriSumm 🏥⚡

VeriSumm is a safety-first clinical and biomedical text summarization platform engineered to synthesize dense medical literature, patient records, and clinical trial documents into accurate, risk-aware summaries. Designed with strict verification workflows and model transparency, VeriSumm helps healthcare professionals, researchers, and clinicians process complex medical text efficiently without compromising accuracy or patient safety.

Built as an enterprise MERN monorepo with microservice isolation, VeriSumm pairs a high-performance Express & Node.js API layer with asynchronous BullMQ background job processing, a local Python FastAPI inference microservice for local Hugging Face transformer models, and a sleek React & TypeScript frontend interface.

## Repository Layout

```
verisumm/
├── backend/          # Express + TypeScript REST API (Auth, API Gateway, DB logic)
├── frontend/         # React + TypeScript (Vite + Tailwind CSS) client app
├── worker/           # Node.js + TypeScript BullMQ background job processor
├── model-service/    # Python + FastAPI microservice (Local HF Model Inference)
├── libs/common/      # Shared TypeScript interfaces, types, and constants
├── infra/            # Docker Compose configurations and infrastructure setup
├── docs/             # Architecture documentation, diagrams, and prompt series
├── tests/            # Cross-service end-to-end and integration tests
├── .env.example      # Master environment variable template
└── README.md         # Project documentation and setup guide
```

## Quick Start (Docker Compose)

To start all 6 services (`backend`, `frontend`, `worker`, `model-service`, `mongo`, `redis`):

1. **Clone the repository and prepare environment variables**:
   ```bash
   cp .env.example .env
   ```

2. **Spin up the stack**:
   ```bash
   docker compose -f infra/docker-compose.yml up --build
   ```

3. **Verify Service Statuses**:
   - **Frontend UI**: [http://localhost:5173](http://localhost:5173)
   - **Backend Health Check**: [http://localhost:5000/health](http://localhost:5000/health) → `{"status": "ok"}`
   - **Model Service Health Check**: [http://localhost:8000/health](http://localhost:8000/health) → `{"status": "ok"}`

## Local Development (Without Docker)

Install dependencies across all npm workspaces:
```bash
npm install
npm run dev:backend
npm run dev:frontend
```
For the Python model service:
```bash
cd model-service
pip install -r requirements.txt
python main.py
```
