#!/bin/sh
# VeriSum MongoDB Restore Script — infra/restore.sh

set -e

DUMP_PATH="$1"
MONGO_URI="${MONGO_URI:-mongodb://mongo:27017/verisumm}"

if [ -z "$DUMP_PATH" ]; then
  echo "Error: Path to dump folder must be specified."
  echo "Usage: ./restore.sh <path_to_dump_directory>"
  echo "Example: ./restore.sh /backups/dump_20260825_120000"
  exit 1
fi

if [ ! -d "$DUMP_PATH" ]; then
  echo "Error: Directory ${DUMP_PATH} does not exist."
  exit 1
fi

echo "=========================================="
echo "Starting VeriSum MongoDB Database Restore"
echo "Timestamp: $(date)"
echo "Source Dump: ${DUMP_PATH}"
echo "Target DB URI: ${MONGO_URI}"
echo "=========================================="

mongorestore --uri="${MONGO_URI}" --drop "${DUMP_PATH}"

echo "Database restored successfully from ${DUMP_PATH}"
echo "=========================================="
