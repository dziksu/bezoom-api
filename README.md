# Bezoom API

Backend platformy do odkrywania lokalnych wydarzeń. MVP obsługuje wyłącznie darmowe konta osobiste. Konta firmowe, płatne promocje i kupowanie większego zasięgu pozostają poza aktywnym kontraktem API.

W MVP wszystkie eventy są publiczne. API nie przyjmuje ani nie zwraca ustawienia widoczności eventu. Model bazy zachowuje wariant `PRIVATE` wyłącznie jako miejsce na zaplanowany etap po MVP; obecnie nie istnieje ścieżka utworzenia ani przełączenia eventu prywatnego.

## Architektura MVP

- NestJS 11 + TypeScript, modułowy monolit gotowy do horyzontalnego skalowania.
- PostgreSQL 16 + PostGIS jako źródło prawdy; osobne połączenia read/write.
- CQRS dla eventów oraz `event_stats` jako lekki read model liczników.
- Transakcyjny outbox i asynchroniczna projekcja statystyk (eventual consistency).
- Redis jako fundament cache i BullMQ; ciężkie prace nie blokują requestów.
- Bezpośredni upload mediów do prywatnego MinIO; publiczne są tylko pliki `READY`. Docelowy storage może zostać przełączony na Cloudflare R2 przez adapter S3.
- Stabilny kontrakt błędów oparty wyłącznie o klucze; tłumaczenia należą do web/mobile.
- JSON logs z `requestId`, metryki Prometheus oraz health checks zależności.

## Lokalny start

Wymagane są Docker Compose i pnpm 10.

```bash
cp .env.example .env.local
docker compose up -d
```

Compose uruchamia API wraz z PostgreSQL/PostGIS, Redis, MinIO, Keycloak i Mailpit. API wykonuje migracje przy starcie i nasłuchuje na `http://localhost:4000/api`.

Observability jest profilem opcjonalnym:

```bash
docker compose --profile observability up -d
```

- Swagger: `http://localhost:4000/api`
- Liveness: `http://localhost:4000/api/health/live`
- Readiness: `http://localhost:4000/api/health/ready`
- Prometheus metrics: `http://localhost:4000/api/metrics`
- Grafana: `http://localhost:3001`
- Prometheus: `http://localhost:9090`
- Mailpit: `http://localhost:8025`
- MinIO Console: `http://localhost:9001`

## Kontrakt błędów

API nigdy nie wysyła użytkownikowi gotowego tłumaczenia błędu:

```json
{
  "error": {
    "code": "EVENT_NOT_FOUND",
    "requestId": "c6c37aa5-56c4-4ed8-a7dc-d09be571fc18"
  }
}
```

Błędy walidacji używają `VALIDATION_FAILED` i opcjonalnej mapy `fields`. Odpowiedź może zawierać bezpieczne `details`, ale nigdy stack trace, token, OTP ani tekst przeznaczony do wyświetlenia.

## Weryfikacja

```bash
pnpm typecheck
pnpm lint:check
pnpm test:ci
pnpm test:e2e:ci
pnpm build
pnpm prettier:check
pnpm db:check
```

Migracje można uruchomić osobno przez `pnpm db:migrate`.

CI uruchamia powyższe kontrole na każdym pull requeście. Osobny job integracyjny stosuje wszystkie migracje na pustym PostgreSQL/PostGIS, sprawdza Redis i MinIO, uruchamia E2E oraz wykonuje próbny backup i restore bazy. Coverage jest publikowane jako artefakt CI; na obecnym etapie nie blokujemy zmian globalnym progiem, ale nowy kod powinien być testowany w ramach rozwijanego slice'a.

Procedura dziennego backupu, odtwarzania oraz testu RPO/RTO znajduje się w [runbooku PostgreSQL](docs/operations/postgres-backup-restore.md).

## Onboarding profilu osobistego

Pierwsze `GET /api/user/profile` atomowo zakłada bezpłatny profil osobisty. Odpowiedź zawiera `onboardingCompleted: false`, dopóki użytkownik nie wybierze globalnie unikalnego nicku przez `PATCH /api/user/profile`. Nick ma 3–20 znaków, jest normalizowany do małych liter i może zawierać litery `a-z`, cyfry, `_` oraz `-`.

Avatar jest opcjonalny i można go dodać podczas onboardingu lub później przez `POST /api/user/profile/avatar`. Obraz trafia do MinIO lokalnie i do S3-compatible storage docelowo; API weryfikuje limit 5 MiB, deklarowany MIME oraz sygnaturę JPEG/PNG/WebP. Numer telefonu nie jest częścią podstawowego onboardingu. Użytkownik potrzebuje zweryfikowanego telefonu dopiero przed pobraniem URL-i uploadu zdjęć i rozpoczęciem tworzenia eventu.

## Zarządzanie kontem i usunięcie danych

`GET /api/user/account` zwraca stan konta oraz URL Keycloak Account Console. Keycloak jest jedynym miejscem zmiany emaila, hasła, MFA/WebAuthn, aktywnych sesji i powiązanych dostawców tożsamości. `PATCH /api/user/profile` modyfikuje wyłącznie dane domenowe BeZoom: nick, bio, zainteresowania i prywatność. Imię, nazwisko i zweryfikowany email są synchronizowane wyłącznie z nowszego tokenu Keycloak, więc stary token nie cofnie zmiany emaila.

- `POST /api/user/account/deactivate` — odwracalna deaktywacja i wylogowanie sesji Keycloak;
- `POST /api/user/account/reactivate` — reaktywacja po ponownym uwierzytelnieniu;
- `DELETE /api/user/account` — idempotentne zaplanowanie usunięcia za 30 dni;
- `POST /api/user/account/deletion/cancel` — anulowanie przed rozpoczęciem anonimizacji.

Operacje wymagają `auth_time` nie starszego niż 5 minut. Globalny guard natychmiast blokuje zwykłe API dla `DEACTIVATED`, `PENDING_DELETION` i `ANONYMIZED`, również przy nadal ważnym access tokenie. Worker po okresie karencji usuwa PII profilu, telefon i OTP, avatar oraz prywatne raw uploads, usuwa engagement/relacje/notyfikacje, soft-delete'uje komentarze autora, archiwizuje jego eventy i koryguje liczniki przez transactional outbox. Następnie usuwa identity w Keycloak i zastępuje pozostałe techniczne odwołania nieodwracalnym tombstone. Hash starego subjectu pozostaje wyłącznie jako erasure ledger zapobiegający odtworzeniu profilu przez stary JWT.

Bezpośredni `delete_account` w Keycloak pozostaje wyłączony, ponieważ nie obejmuje danych domenowych BeZoom. Lokalny Compose uruchamia idempotentny `keycloak-config`, który włącza SMTP Mailpit, weryfikację emaila, `UPDATE_EMAIL`, politykę hasła i dedykowany service account o minimalnych rolach `manage-users`/`view-users`.

## Zasady publikacji eventu

Nowy event nie staje się publiczny automatycznie. Przechodzi przez upload, moderację/weryfikację i przygotowanie mediów. Feed, wyszukiwanie, szczegóły oraz engagement dopuszczają tylko eventy publiczne, opublikowane, zweryfikowane i z mediami `READY`. Promień MVP wynosi stałe 5 km i nie może zostać kupiony ani ustawiony przez klienta.

Lokalnie `event.created` jest przekazywany transakcyjnym outboxem do BullMQ, a developerski worker kopiuje media z prywatnego bucketu `raw-uploads` do `media` i ustawia `READY`. Użytkownik publikuje gotowy event przez `POST /api/events/:id/publish`; wymagany jest zweryfikowany telefon. `development_passthrough` jest twardo blokowany przy `NODE_ENV=production` — produkcja wymaga prawdziwej moderacji oraz bezpiecznego dekodowania i ponownego kodowania obrazu.

## Zarządzanie własnym eventem

- `PATCH /api/events/:id` zapisuje zmianę jako `DRAFT`. Edycja eventu opublikowanego natychmiast wycofuje go z publicznych odczytów i zeruje poprzednią weryfikację.
- `POST /api/events/:id/resubmit` wysyła poprawiony szkic do ponownej moderacji. Event odrzucony musi najpierw przejść przez `PATCH`, więc nie można bez zmian zapętlać odrzuconej treści.
- `POST /api/events/:id/cancel` ustawia `CANCELLED`, usuwa event z publicznych odczytów i zachowuje go w historii właściciela.
- `DELETE /api/events/:id` wykonuje soft delete: ustawia `archived_at`, zachowuje spójność danych i ukrywa event także na liście właściciela.

Każda mutacja sprawdza właściciela i maskuje cudzy event kluczem `EVENT_NOT_FOUND`. Zapis używa wersjonowania optymistycznego; równoległa zmiana zwraca `EVENT_CONCURRENT_MODIFICATION`.

## Developerska symulacja SMS

W środowisku developerskim żądanie kodu weryfikacyjnego telefonu wysyła wiadomość e-mail na adres profilu użytkownika przez SMTP Mailpita. Wiadomość jest oznaczona jako symulacja SMS i zawiera numer telefonu, sześciocyfrowy kod oraz czas ważności. Podgląd: `http://localhost:8025`.

Surowy kod istnieje tylko w pamięci na czas wysyłki. Baza przechowuje wyłącznie HMAC kodu, a logi nie zawierają OTP. Tryb developerski jest blokowany dla `NODE_ENV=production`; dopóki nie zostanie podłączony produkcyjny adapter SMS, API zwraca klucz `PHONE_VERIFICATION_SMS_NOT_CONFIGURED`.

## Infinite scroll i zasoby społecznościowe

API nie używa paginacji opartej o `page`, `OFFSET` ani dokładne `total`. Każda lista zwraca kontrakt:

```json
{
  "items": [],
  "hasMore": true,
  "nextCursor": "opaque-value"
}
```

Klient przekazuje otrzymane `nextCursor` jako `?cursor=...`. Kursory są związane z konkretnym zasobem i parametrami wyszukiwania; zmodyfikowany lub użyty w innym kontekście kursor zwraca `CURSOR_INVALID`. Sortowanie ma zawsze deterministyczny drugi klucz UUID, a kolumny czasowe mają precyzję zgodną z JavaScript, dzięki czemu równoległe zapisy nie powodują pomijania rekordów.

Cursor-based infinite scroll obejmuje geo-discovery oraz listy utworzonych, polubionych, zapisanych eventów i tych, w których użytkownik uczestniczy. Zasoby eventu:

- `GET /api/events/:eventId/comments` — komentarze od najnowszych;
- `POST /api/events/:eventId/comments` — komentarz albo odpowiedź jednego poziomu, maksymalnie 500 znaków;
- `PATCH /api/events/:eventId/comments/:commentId` — edycja własnego komentarza;
- `DELETE /api/events/:eventId/comments/:commentId` — soft-delete własnego komentarza;
- `GET /api/events/:eventId/likes` — publiczne profile osób, które polubiły event;
- `GET /api/events/:eventId/participants` — publiczne profile potwierdzonych uczestników.

Prywatne i zdezaktywowane profile nie pojawiają się na listach polubień ani uczestników. Liczba komentarzy w `event_stats` aktualizuje się przez transakcyjny outbox i pozostaje eventual-consistent. Tworzenie komentarzy ma limit jednego komentarza na sekundę na użytkownika.

## Zgłoszenia i blokady

- `POST /api/events/:eventId/reports` zapisuje zgłoszenie publicznego eventu jako `PENDING`. Powody: `SPAM`, `INAPPROPRIATE_CONTENT`, `FRAUD`, `OTHER`; opis jest opcjonalny i ma maksymalnie 1000 znaków.
- Ponowienie oczekującego zgłoszenia przez tę samą osobę jest idempotentne. Indeks kolejki `(created_at, id)` przygotowuje odczyt dla przyszłego automatu, który ustawi `IGNORED` albo `ESCALATED`.
- `PUT /api/user/blocks/:profileId` i `DELETE /api/user/blocks/:profileId` blokują/odblokowują użytkownika idempotentnie.
- `GET /api/user/blocks` zwraca listę blokad przez cursor-based infinite scroll.
- Blokada działa dwukierunkowo dla zalogowanych odczytów i nowych interakcji. Usunięcie wcześniejszego lajka, zapisu lub RSVP pozostaje możliwe. Anonimowy odbiorca nadal widzi publiczne eventy — blokada nie zmienia publicznego eventu w treść prywatną.

API klienta nie zawiera kolejki moderatorskiej ani decyzji administratora; panel administracyjny pozostanie osobną aplikacją.
