#!/usr/bin/env bash
#
# Move the database off Neon.
#
# The dump is the easy half. The half that matters is proving the new
# database holds the same rows as the old one, table by table, before any
# traffic is pointed at it — a restore that fails quietly on three tables
# looks exactly like a restore that worked.
#
# Usage:
#   export NEON_URL='postgres://...neon.tech/neondb?sslmode=require'
#   export LOCAL_URL='postgres://user:pass@localhost:5432/easyteam'
#   ./migrate-database.sh dump      # while the old system still serves
#   ./migrate-database.sh restore   # after writes are stopped
#   ./migrate-database.sh verify    # compares row counts, exits 1 on drift

set -euo pipefail

# The dump and the row-count files describe the whole database; neither is
# for other accounts on this machine to read.
umask 077

DUMP_DIR="${DUMP_DIR:-./dumps}"
DUMP_FILE="$DUMP_DIR/easyteam-$(date +%Y%m%d).dump"
COUNTS_BEFORE="$DUMP_DIR/counts-neon.txt"
COUNTS_AFTER="$DUMP_DIR/counts-local.txt"

: "${NEON_URL:?set NEON_URL}"
: "${LOCAL_URL:?set LOCAL_URL}"

install -d -m 700 "$DUMP_DIR"

# Every table with its live row count. Not an estimate: reltuples lies after
# a bulk load, and this number is the whole point of the exercise.
count_rows() {
  local url="$1"
  psql "$url" -At -F'|' <<'SQL'
SELECT table_name,
       (xpath('/row/c/text()',
              query_to_xml(format('SELECT count(*) AS c FROM %I.%I', table_schema, table_name),
                           false, true, '')))[1]::text::bigint AS rows
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;
SQL
}

case "${1:-}" in
  dump)
    echo "→ counting rows on Neon…"
    count_rows "$NEON_URL" | tee "$COUNTS_BEFORE"
    echo "→ dumping to $DUMP_FILE"
    # Custom format: parallel restore, and it survives a version gap better
    # than plain SQL. --no-owner/--no-acl because the local roles differ.
    pg_dump "$NEON_URL" --format=custom --no-owner --no-acl --verbose \
      --file="$DUMP_FILE"
    echo "✓ dump complete: $(du -h "$DUMP_FILE" | cut -f1)"
    ;;

  restore)
    [ -f "$DUMP_FILE" ] || { echo "no dump at $DUMP_FILE"; exit 1; }
    echo "→ restoring into local Postgres"
    # --clean --if-exists so a second run is not a half-merge of two attempts.
    pg_restore --dbname="$LOCAL_URL" --no-owner --no-acl --clean --if-exists \
      --jobs=4 --verbose "$DUMP_FILE"
    echo "✓ restore finished"
    ;;

  verify)
    echo "→ counting rows locally…"
    count_rows "$LOCAL_URL" > "$COUNTS_AFTER"
    [ -f "$COUNTS_BEFORE" ] || { echo "no $COUNTS_BEFORE — run dump first"; exit 1; }

    if diff -u "$COUNTS_BEFORE" "$COUNTS_AFTER"; then
      echo "✓ every table matches. Safe to point traffic here."
    else
      echo
      echo "✗ ROW COUNTS DIFFER — do not cut over."
      echo "  Left is Neon, right is local. Investigate every line above."
      exit 1
    fi
    ;;

  *)
    echo "usage: $0 {dump|restore|verify}"
    exit 1
    ;;
esac
