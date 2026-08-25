#!/bin/sh
# Automated Nightly MongoDB Backup Script — infra/backup.sh

set -e

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${BACKUP_TARGET_DIR:-/backups}/dump_${TIMESTAMP}"
MONGO_URI="${MONGO_URI:-mongodb://mongo:27017/verisumm}"

echo "=========================================="
echo "Starting VeriSum MongoDB Automated Backup"
echo "Timestamp: $(date)"
echo "Target Dir: ${BACKUP_DIR}"
echo "=========================================="

mkdir -p "${BACKUP_DIR}"

mongodump --uri="${MONGO_URI}" --out="${BACKUP_DIR}"

echo "Backup created successfully at ${BACKUP_DIR}"
ls -lh "${BACKUP_DIR}"
echo "=========================================="
