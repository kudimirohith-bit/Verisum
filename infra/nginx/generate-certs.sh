#!/bin/sh
# Generate self-signed TLS certificates for local testing if not present

CERTS_DIR="$(dirname "$0")/certs"
mkdir -p "$CERTS_DIR"

if [ ! -f "$CERTS_DIR/server.crt" ] || [ ! -f "$CERTS_DIR/server.key" ]; then
  echo "[TLS Certs] Generating self-signed SSL certificate for local production stack testing..."
  openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout "$CERTS_DIR/server.key" \
    -out "$CERTS_DIR/server.crt" \
    -subj "/C=US/ST=State/L=City/O=VeriSum/OU=IT/CN=localhost"
  echo "[TLS Certs] Generated $CERTS_DIR/server.crt and $CERTS_DIR/server.key"
else
  echo "[TLS Certs] Existing SSL certificate found in $CERTS_DIR"
fi
