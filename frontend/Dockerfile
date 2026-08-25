# ── Stage 1: Build ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY frontend/package*.json ./frontend/
COPY frontend ./frontend

RUN npm ci || npm install

RUN npm run build --workspace=verisumm-frontend

# ── Stage 2: Production Nginx Server ──────────────────────────────────────────
FROM nginx:1.25-alpine AS runner

# Remove default nginx static assets
RUN rm -rf /usr/share/nginx/html/*

# Copy compiled static assets from builder stage
COPY --from=builder /app/frontend/dist /usr/share/nginx/html

# Expose HTTP port for static serving
EXPOSE 80

HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
