# ── Stage 1: Build ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./
COPY libs/common ./libs/common
COPY worker ./worker

RUN npm ci || npm install

RUN npm run build --workspace=@verisumm/common
RUN npm run build --workspace=verisumm-worker

# ── Stage 2: Production Runtime ───────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
COPY libs/common/package*.json ./libs/common/
COPY worker/package*.json ./worker/

RUN npm ci --omit=dev || npm install --omit=dev

COPY --from=builder /app/libs/common/dist ./libs/common/dist
COPY --from=builder /app/worker/dist ./worker/dist

# Security Hardening: Non-root user
USER node

CMD ["node", "worker/dist/index.js"]
