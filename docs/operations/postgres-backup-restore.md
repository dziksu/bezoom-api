# PostgreSQL backup and restore runbook

## Cel MVP

- dzienny backup bazy aplikacji i bazy Keycloak,
- RPO do 24 godzin,
- RTO 2–4 godziny dla odtworzenia single-VPS,
- kopia przechowywana poza hostem produkcyjnym, docelowo w prywatnym bucketcie R2/S3,
- regularny, udokumentowany test odtworzenia.

Skrypty tworzą PostgreSQL custom dump, sprawdzają czy katalog dumpa jest czytelny i zapisują sumę SHA-256. Restore weryfikuje sumę oraz odmawia pracy na bazie zawierającej tabele użytkownika. Nie wykonuje `DROP`, `--clean` ani automatycznego usuwania starych kopii.

## Backup

Host wykonujący backup potrzebuje klienta PostgreSQL w tej samej lub nowszej głównej wersji niż serwer. Sekretu nie zapisujemy w repozytorium; preferowany jest `PGPASSFILE` z uprawnieniami `0600` albo secret manager środowiska uruchomieniowego.

```bash
DATABASE_URL='postgresql://bezoom@postgres:5432/bezoom' \
BACKUP_LABEL=bezoom \
BACKUP_DIR=/var/backups/bezoom/postgres \
./scripts/postgres/backup.sh
```

Keycloak w lokalnym Compose używa osobnej bazy, dlatego musi mieć osobną kopię:

```bash
DATABASE_URL='postgresql://bezoom@postgres:5432/keycloak' \
BACKUP_LABEL=keycloak \
BACKUP_DIR=/var/backups/bezoom/postgres \
./scripts/postgres/backup.sh
```

Po powodzeniu należy przesłać parę `.dump` i `.dump.sha256` do prywatnego zewnętrznego storage. Retencję ustawiamy po stronie bucketa: minimum 7 dziennych kopii dla MVP. Lokalny katalog nie jest backupem, jeśli znajduje się na tym samym VPS.

Przykładowy harmonogram systemd/cron powinien wykonywać oba backupy raz dziennie i wysyłać alert, jeśli skrypt zakończy się kodem różnym od zera. URL-e i credentiale muszą pochodzić z pliku środowiskowego dostępnego wyłącznie dla użytkownika backupowego. Użytkownik ten powinien mieć tylko uprawnienia potrzebne do dumpa.

## Restore

Restore jest dozwolony wyłącznie do świeżo utworzonej, pustej bazy. Najpierw pobierz dump i plik `.sha256` do tego samego katalogu, zweryfikuj docelowy URL i uruchom:

```bash
DATABASE_URL='postgresql://bezoom@new-postgres:5432/bezoom_restore' \
BACKUP_FILE=/secure/restore/bezoom-20260813T020000Z.dump \
RESTORE_CONFIRM=RESTORE_TO_EMPTY_DATABASE \
./scripts/postgres/restore.sh
```

Po restore:

1. Uruchom `pnpm db:migrate`, aby zastosować ewentualne migracje nowsze od kopii.
2. Sprawdź `/api/health/ready`.
3. Porównaj liczbę profili, eventów i rekordów `drizzle.__drizzle_migrations` ze źródłem lub manifestem operacyjnym.
4. Zweryfikuj wyszukiwanie przestrzenne oraz logowanie przez Keycloak.
5. Dopiero wtedy przełącz ruch lub DNS.

## Test odtworzenia

Co najmniej raz w miesiącu odtwórz najnowsze kopie aplikacji i Keycloak do izolowanych, pustych baz. Zapisz czas rozpoczęcia, zakończenia, rozmiary dumpów, wyniki smoke testów i osobę wykonującą test. Niesprawdzona kopia nie może być uznawana za gwarancję RPO/RTO.

CI wykonuje mały test backup/restore bazy migracyjnej. Nie zastępuje to produkcyjnego ćwiczenia disaster recovery ani testu pobrania kopii ze zdalnego storage.
