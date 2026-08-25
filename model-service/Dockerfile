FROM python:3.11-slim AS runner

WORKDIR /app

ENV PYTHONUNBUFFERED=1
ENV PORT=8000

# Install dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source code
COPY . .

# Security Hardening: Create non-root user and switch user context
RUN useradd -u 10001 -m appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
