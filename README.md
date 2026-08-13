# Bezoom API

Backend platformy do odkrywania lokalnych wydarzeń. MVP obsługuje wyłącznie darmowe konta osobiste. Konta firmowe, płatne promocje i kupowanie większego zasięgu pozostają poza aktywnym kontraktem API.

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
pnpm exec tsc --noEmit
pnpm test -- --runInBand
pnpm test:e2e -- --runInBand
pnpm build
pnpm prettier:check
```

Migracje można uruchomić osobno przez `pnpm db:migrate`.

## Zasady publikacji eventu

Nowy event nie staje się publiczny automatycznie. Przechodzi przez upload, moderację/weryfikację i przygotowanie mediów. Feed, wyszukiwanie, szczegóły oraz engagement dopuszczają tylko eventy publiczne, opublikowane, zweryfikowane i z mediami `READY`. Promień MVP wynosi stałe 5 km i nie może zostać kupiony ani ustawiony przez klienta.
