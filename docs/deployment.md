# VeriSum Platform — On-Premises & Self-Hosted Deployment Guide

This guide details the step-by-step procedure for enterprise hospital IT and research engineering teams to deploy the VeriSum clinical summarization and verification platform on-premises in a fully self-hosted, air-gapped, privacy-preserving configuration.

---

## 1. Architectural Overview & Privacy Guarantees

VeriSum is architected to guarantee zero PHI data egress when deployed in **Offline Mode**. 

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                ON-PREMISES INFRASTRUCTURE                              │
│                                                                                        │
│   [ Client Browser ]                                                                   │
│           │                                                                            │
│    HTTPS (TLS 443)                                                                     │
│           ▼                                                                            │
│  ┌─────────────────┐                                                                   │
│  │ Reverse Proxy   │ (TLS Termination via Nginx)                                       │
│  └────────┬────────┘                                                                   │
│           │                                                                            │
│     ┌─────┴─────────────────────┐                                                      │
│     ▼                           ▼                                                      │
│ ┌───────────────┐        ┌───────────────┐                                             │
│ │ Static Web    │        │ Express API   │ (Rate limited, CORS locked, Helmet headers)   │
│ │ Frontend      │        │ Backend       │                                             │
│ └───────────────┘        └───────┬───────┘                                             │
│                                  │                                                     │
│             ┌────────────────────┼────────────────────┐                                │
│             ▼                    ▼                    ▼                                │
│      ┌──────────────┐     ┌──────────────┐     ┌──────────────┐                        │
│      │ MongoDB      │     │ Redis Queue  │     │ Model        │ (Local HF/PyTorch)     │
│      │ Database     │     │ & BullMQ     │     │ Service      │ (ClinicalT5/BioBART)   │
│      └──────────────┘     └──────┬───────┘     └──────────────┘                        │
│                                  │                                                     │
│                                  ▼                                                     │
│                           ┌──────────────┐                                             │
│                           │ Async Job    │                                             │
│                           │ Worker       │                                             │
│                           └──────────────┘                                             │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

When `DEPLOYMENT_MODE=offline` is active:
- All external API calls (e.g. OpenAI, Anthropic, or external cloud endpoints) are blocked at the application level (returns `403 Forbidden`).
- Document ingestion, NER entity recognition, de-identification, summarization, and claim verification run strictly on local compute infrastructure.

---

## 2. Deployment Modes

| Deployment Mode | Environment Setting | Allowed Model Backends | Privacy Profile |
| :--- | :--- | :--- | :--- |
| **Offline (On-Prem)** | `DEPLOYMENT_MODE=offline` | `local_clinical_model`, `mock` | **Strict HIPAA Air-Gapped**. Zero outbound HTTP traffic. |
| **Hybrid** | `DEPLOYMENT_MODE=hybrid` | `local_clinical_model`, `mock`, `hosted_llm` | Enables external LLM APIs (OpenAI/Anthropic) for non-PHI benchmarking. |

---

## 3. Step-by-Step On-Premises Deployment

### Prerequisites
- Linux Server (Fedora, RHEL 9, Ubuntu 22.04 LTS, or Debian 12)
- Docker v24.0+ & Docker Compose v2.20+
- OpenSSL (for certificate generation)
- Recommended compute: 8 vCPUs, 16 GB RAM, 50 GB SSD storage (minimum 1 GPU if serving heavy LLMs locally)

### Step 3.1: Environment Configuration
Copy the production template file to `infra/.env.prod`:
```bash
cp infra/.env.prod.example infra/.env.prod
```

Edit `infra/.env.prod` to configure production parameters:
```env
DEPLOYMENT_MODE=offline
NODE_ENV=production
FRONTEND_URL=https://your-hospital-domain.org
JWT_SECRET=generate_a_secure_64_character_hex_key_here
```

### Step 3.2: Secrets Management
Secrets can be supplied via standard environment variables or mounted file paths (`_FILE` suffix).

For container orchestration (Docker Swarm / Kubernetes Secrets):
1. Mount your secret files into `/run/secrets/`.
2. Configure `infra/.env.prod`:
   ```env
   JWT_SECRET_FILE=/run/secrets/jwt_secret
   ```
The backend `getSecret()` utility automatically reads secret values from the mounted path.

### Step 3.3: TLS / SSL Certificate Setup
Generate or install hospital enterprise TLS certificates in `infra/nginx/certs/`:

- **For testing / local staging**: Generate a self-signed certificate:
  ```bash
  ./infra/nginx/generate-certs.sh
  ```
- **For production**: Copy your enterprise SAN SSL certificates to:
  - Certificate: `infra/nginx/certs/server.crt`
  - Private Key: `infra/nginx/certs/server.key`

### Step 3.4: Launch the Platform
Build and launch the complete production stack:
```bash
docker compose -f infra/docker-compose.prod.yml up -d --build
```

Verify service health status:
```bash
docker compose -f infra/docker-compose.prod.yml ps
```

All 7 core services (`mongo`, `mongo-backup`, `redis`, `model-service`, `backend`, `worker`, `frontend`, `reverse-proxy`) should display status `healthy` or `running`.

---

## 4. Swapping Custom Fine-Tuned Local Models

`model-service` (Python / FastAPI) handles local model inference using Hugging Face `transformers` or PyTorch.

To swap in a custom hospital-fine-tuned model (e.g. `ClinicalT5-large`, `BioBART`, or `Llama-3-8B-Instruct-Med`):

1. **Mount local weights directory** into `model-service` in `infra/docker-compose.prod.yml`:
   ```yaml
   model-service:
     volumes:
       - /path/to/fine_tuned_weights:/models/clinical-model
   ```

2. **Update `model-service/main.py`** model loader:
   ```python
   from transformers import AutoTokenizer, AutoModelForSeq2SeqLM

   MODEL_PATH = "/models/clinical-model"
   tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH)
   model = AutoModelForSeq2SeqLM.from_pretrained(MODEL_PATH)
   ```

3. **Rebuild and restart `model-service`**:
   ```bash
   docker compose -f infra/docker-compose.prod.yml restart model-service
   ```

---

## 5. Automated Backup & Disaster Recovery Procedure

### 5.1 Automated Nightly Backups
The `mongo-backup` container automatically executes `mongodump` every 24 hours, storing dumps inside the persistent Docker volume `mongo_backups`.

### 5.2 Manual Backup Execution
To perform an on-demand database backup:
```bash
docker exec -it verisumm-prod-mongo-backup /backup.sh
```

Backups are saved to `/backups/dump_YYYYMMDD_HHMMSS`.

### 5.3 Disaster Recovery / Restore Procedure
To restore the platform database from a backup snapshot:

1. **Identify the backup directory path**:
   ```bash
   docker exec -it verisumm-prod-mongo-backup ls -la /backups
   ```

2. **Execute restore script**:
   ```bash
   docker exec -it verisumm-prod-mongo-backup /restore.sh /backups/dump_20260825_120000
   ```

3. **Verify Data Integrity**:
   Verify database restoration using `mongosh`:
   ```bash
   docker exec -it verisumm-prod-mongo mongosh verisumm --eval "db.users.countDocuments()"
   ```

---

## 6. Security Hardening Audit Summary

- **Network Isolation**: Reverse proxy isolates internal microservices (`model-service`, `redis`, `mongo`) from external exposure.
- **Rate Limiting**: `express-rate-limit` guards `/auth/*` (100 req / 15m) and `/documents` (50 req / 15m).
- **HTTP Security Headers**: `helmet` adds `X-Frame-Options`, `X-Content-Type-Options`, CSP, and HSTS.
- **Cookies**: Refresh tokens set with `httpOnly`, `secure`, `sameSite: strict`.
- **Non-Root Containers**: Node and Python containers run as unprivileged users (`node` and `appuser`).
- **Dependency Audit**: Continuous security scans using `npm audit`.
