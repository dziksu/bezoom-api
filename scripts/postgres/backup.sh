#!/usr/bin/env bash

set -Eeuo pipefail

umask 077

: "${DATABASE_URL:?DATABASE_URL must point to the database being backed up}"

BACKUP_DIR="${BACKUP_DIR:-./backups/postgres}"
BACKUP_LABEL="${BACKUP_LABEL:-bezoom}"
PG_DUMP_BIN="${PG_DUMP_BIN:-pg_dump}"
PG_RESTORE_BIN="${PG_RESTORE_BIN:-pg_restore}"

if [[ ! "$BACKUP_LABEL" =~ ^[A-Za-z0-9._-]+$ ]]; then
  printf 'BACKUP_LABEL must contain only letters, digits, dot, underscore or dash\n' >&2
  exit 2
fi

for required_command in "$PG_DUMP_BIN" "$PG_RESTORE_BIN"; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    printf 'Required command is unavailable: %s\n' "$required_command" >&2
    exit 3
  fi
done

checksum() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
    return
  fi
  shasum -a 256 "$1" | awk '{print $1}'
}

mkdir -p -- "$BACKUP_DIR"

timestamp="$(date -u +'%Y%m%dT%H%M%SZ')"
final_path="${BACKUP_DIR%/}/${BACKUP_LABEL}-${timestamp}.dump"
temporary_path="${BACKUP_DIR%/}/.${BACKUP_LABEL}-${timestamp}.$$.tmp"

cleanup() {
  rm -f -- "$temporary_path"
}
trap cleanup EXIT HUP INT TERM

"$PG_DUMP_BIN" \
  --dbname="$DATABASE_URL" \
  --format=custom \
  --compress=6 \
  --no-owner \
  --no-privileges \
  --file="$temporary_path"

# A dump that cannot be listed is not a usable backup. Validate before publishing it.
"$PG_RESTORE_BIN" --list "$temporary_path" >/dev/null

mv -- "$temporary_path" "$final_path"
digest="$(checksum "$final_path")"
printf '%s  %s\n' "$digest" "$(basename "$final_path")" >"${final_path}.sha256"

trap - EXIT HUP INT TERM
printf 'Backup created and verified: %s\n' "$final_path"
