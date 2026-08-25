# ── Stage 1: Build ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root workspace configurations
COPY package*.json ./
COPY tsconfig.json ./
COPY libs/common ./libs/common
COPY backend ./backend

# Install all dependencies (including devDependencies for build)
RUN npm ci || npm install

# Build common library and backend TS project
RUN npm run build --workspace=@verisumm/common
RUN npm run build --workspace=verisumm-backend

# ── Stage 2: Production Runtime ───────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

# Copy workspace package manifests
COPY package*.json ./
COPY libs/common/package*.json ./libs/common/
COPY backend/package*.json ./backend/

# Install production-only dependencies
RUN npm ci --omit=dev || npm install --omit=dev

# Copy compiled JavaScript output from builder stage
COPY --from=builder /app/libs/common/dist ./libs/common/dist
COPY --from=builder /app/backend/dist ./backend/dist

# Security Hardening: Use non-root 'node' user provided by Alpine image
USER node

EXPOSE 5000

HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/health || exit 1

CMD ["node", "backend/dist/index.js"]
