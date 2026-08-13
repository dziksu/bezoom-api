#!/usr/bin/env bash

set -Eeuo pipefail

: "${DATABASE_URL:?DATABASE_URL must point to the empty restore target}"
: "${BACKUP_FILE:?BACKUP_FILE must point to a custom-format PostgreSQL dump}"

RESTORE_CONFIRMATION="RESTORE_TO_EMPTY_DATABASE"
PSQL_BIN="${PSQL_BIN:-psql}"
PG_RESTORE_BIN="${PG_RESTORE_BIN:-pg_restore}"

if [[ "${RESTORE_CONFIRM:-}" != "$RESTORE_CONFIRMATION" ]]; then
  printf 'Refusing restore. Set RESTORE_CONFIRM=%s after verifying the target URL.\n' "$RESTORE_CONFIRMATION" >&2
  exit 2
fi

if [[ ! -f "$BACKUP_FILE" ]]; then
  printf 'Backup does not exist: %s\n' "$BACKUP_FILE" >&2
  exit 3
fi

for required_command in "$PSQL_BIN" "$PG_RESTORE_BIN"; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    printf 'Required command is unavailable: %s\n' "$required_command" >&2
    exit 4
  fi
done

checksum() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
    return
  fi
  shasum -a 256 "$1" | awk '{print $1}'
}

checksum_file="${BACKUP_FILE}.sha256"
if [[ ! -f "$checksum_file" ]]; then
  printf 'Checksum file does not exist: %s\n' "$checksum_file" >&2
  exit 5
fi

read -r expected_checksum _ <"$checksum_file"
actual_checksum="$(checksum "$BACKUP_FILE")"
if [[ -z "$expected_checksum" || "$actual_checksum" != "$expected_checksum" ]]; then
  printf 'Backup checksum mismatch\n' >&2
  exit 6
fi

"$PG_RESTORE_BIN" --list "$BACKUP_FILE" >/dev/null

# Restore only into a fresh database. This prevents an accidental merge or overwrite
# of a running environment. PostGIS' spatial_ref_sys is ignored because the extension
# may be provisioned before the restore.
user_relation_count="$(
  "$PSQL_BIN" "$DATABASE_URL" --no-psqlrc --tuples-only --no-align --set=ON_ERROR_STOP=1 --command="
    SELECT count(*)
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE relation.relkind IN ('r', 'p')
      AND namespace.nspname NOT IN ('pg_catalog', 'information_schema')
      AND NOT (namespace.nspname = 'public' AND relation.relname = 'spatial_ref_sys');
  "
)"

if [[ "$user_relation_count" != "0" ]]; then
  printf 'Refusing restore: target database contains %s user relations\n' "$user_relation_count" >&2
  exit 7
fi

"$PG_RESTORE_BIN" \
  --dbname="$DATABASE_URL" \
  --exit-on-error \
  --single-transaction \
  --no-owner \
  --no-privileges \
  "$BACKUP_FILE"

printf 'Restore completed successfully from: %s\n' "$BACKUP_FILE"
