#!/usr/bin/env bash
#
# Nightly backup. On Neon this happened without anyone thinking about it;
# on your own server it happens only if this runs.
#
#   0 3 * * *  /opt/easyteam/deploy/backup.sh >> /var/log/easyteam-backup.log 2>&1

set -euo pipefail

# A dump is a complete copy of the database — contacts, tokens, everything.
# Anything this script creates stays readable by its owner alone.
umask 077

BACKUP_DIR="${BACKUP_DIR:-/var/backups/easyteam}"
KEEP_DAYS="${KEEP_DAYS:-14}"
COMPOSE_DIR="$(cd "$(dirname "$0")" && pwd)"

install -d -m 700 "$BACKUP_DIR"
STAMP=$(date +%Y%m%d-%H%M)
FILE="$BACKUP_DIR/easyteam-$STAMP.dump"

# Created with the right mode before a single byte goes in, rather than
# fixed afterwards — the gap is where a reader gets in.
install -m 600 /dev/null "$FILE"
docker compose -f "$COMPOSE_DIR/docker-compose.yml" exec -T postgres \
  pg_dump -U "${POSTGRES_USER:-easyteam}" -d "${POSTGRES_DB:-easyteam}" \
  --format=custom --no-owner --no-acl > "$FILE"

# A backup nobody has restored is a hope, not a backup: this at least proves
# the file is a readable archive rather than an empty or truncated one.
if ! pg_restore --list "$FILE" > /dev/null 2>&1; then
  echo "✗ $FILE is not a readable dump — backup FAILED"
  rm -f "$FILE"
  exit 1
fi

echo "✓ $(date): $FILE ($(du -h "$FILE" | cut -f1))"
find "$BACKUP_DIR" -name 'easyteam-*.dump' -mtime +"$KEEP_DAYS" -delete
