# Seed wydajnościowy i ustalenia z testów geo-search

Data pomiaru: 14 sierpnia 2026. Środowisko: lokalna Colima, Docker Compose, PostgreSQL 16 z PostGIS 3.5, Redis i MinIO.

## Cel

Seed ma zapewniać realistyczny, powtarzalny zestaw danych do pracy nad mapą wydarzeń i pomiarów wydajności. Daty eventów są przesuwane względem chwili uruchomienia, natomiast UUID pozostają stabilne. Każde ponowne uruchomienie zastępuje wyłącznie dane oznaczone prefiksem `seed:v1:`.

Eventy profilu `performance` są rozdzielane cyklicznie i równomiernie między 50 ośrodków obejmujących cały kraj (49 dawnych miast wojewódzkich oraz Gdynię). Każdy ośrodek dostaje więc 800 z 40 000 eventów, zamiast rozkładu ważonego z dominującym klastrem warszawskim używanego przez mniejsze profile.

Dla bardziej realistycznych testów szczegółów eventu 40% rekordów ma długi, wieloakapitowy opis, a galerie zdjęć w 45% rekordów zawierają 2–3 pozycje. Pozostałe eventy zachowują krótki opis i jedno zdjęcie.

Profil `performance` tworzy:

| Zasób                | Liczba rekordów |
| -------------------- | --------------: |
| Profile              |          25 000 |
| Twórcy               |           1 500 |
| Eventy i lokalizacje |          40 000 |
| Statystyki eventów   |          40 000 |
| Zdjęcia              |         ~65 000 |
| Lajki                |         600 000 |
| Zapisy               |         260 000 |
| RSVP                 |         380 000 |
| Komentarze           |         120 000 |
| Znajomości           |         200 000 |
| Notyfikacje          |         350 000 |
| Blokady              |           2 000 |
| Zgłoszenia           |           1 000 |

Uruchomienie:

```bash
pnpm db:seed -- --scale=performance
```

W badanym środowisku pełny seed trwał 402,5 sekundy. Największym kosztem były indeksowane inserty aktywności. Lokalny kontener PostGIS działał jako obraz `amd64` pod emulacją, dlatego tego czasu nie należy traktować jako wyniku infrastruktury produkcyjnej.

## Zakres testów API

Testy wykonywały anonimowe zapytania do `GET /api/events/search` dla Warszawy, Krakowa, Wrocławia, Gdańska i Białegostoku. Sprawdzono:

- wyłącznie przyszłe, publiczne, opublikowane i zweryfikowane eventy;
- maksymalny dystans 5 km i rosnące sortowanie po dystansie;
- pierwszą i drugą stronę paginacji bez powtórzonych identyfikatorów;
- filtry `week=0` oraz `week=1` w strefie `Europe/Warsaw`;
- pusty wynik poza obszarem danych;
- walidację szerokości geograficznej, limitu oraz kursora związanego z innymi parametrami;
- szczegóły eventu i liczniki `event_stats`;
- listy komentarzy, polubień i potwierdzonych uczestników;
- dostępność grafik SVG z MinIO;
- zimny i ciepły odczyt cache Redis.

Wszystkie testy poprawności przeszły. Event o dużej aktywności zwrócił spójnie 160 komentarzy, 818 lajków i 378 potwierdzonych uczestników, a listy społecznościowe poprawnie używały paginacji.

## Znalezione problemy

### Wielokrotne obliczanie dystansu

PostgreSQL rozwijał zwykły CTE `candidates`. Na kolejnej stronie kursora `ST_Distance` był przez to liczony osobno dla selekcji, filtra kursora i sortowania. Druga strona Warszawy trwała około 1,24 sekundy.

Rozwiązaniem jest CTE `nearby AS MATERIALIZED`, który raz wybiera lokalizacje w promieniu i raz oblicza ich dystans. Kolejne filtry pracują na gotowej wartości `distance_m`.

Geo-search używa sferycznego wariantu funkcji PostGIS (`use_spheroid = false`). Jest on odpowiedni dla lokalnego promienia 5 km i tańszy od modelu elipsoidalnego.

### Lookup aktywnego organizatora

Plan wykonywał lookup profilu dla każdego kandydata eventu i musiał odczytywać rekord tabeli, aby sprawdzić `account_status`. Częściowy indeks:

```sql
CREATE INDEX profiles_active_keycloak_sub_idx
  ON profiles (keycloak_sub)
  WHERE account_status = 'ACTIVE';
```

pozwolił użyć index-only scan dla publicznej ścieżki discovery.

### Niespójny format dat

Surowa ścieżka `db.execute` zwracała `timestamptz` jako tekst PostgreSQL, na przykład `2026-08-15 01:28:54.356+00`. Szczegóły eventu zwracały ISO 8601. Geo-search normalizuje teraz `startDate`, `endDate` i `createdAt` do obiektów `Date`, dzięki czemu JSON ma jednolity format `2026-08-15T01:28:54.356Z`.

## Wyniki przed i po zmianie

Poniższe czasy obejmują pełne żądanie HTTP w lokalnym środowisku:

| Scenariusz                     |    Przed |     Po |              Zmiana |
| ------------------------------ | -------: | -----: | ------------------: |
| Warszawa, pierwsze 20 wyników  |   653 ms | 242 ms |                -63% |
| Warszawa, druga strona kursora | 1 244 ms | 198 ms |                -84% |
| Warszawa, bieżący tydzień      |   590 ms | 172 ms |                -71% |
| Warszawa, kolejny tydzień      |   663 ms | 173 ms |                -74% |
| Identyczne zapytanie z Redis   |   4,4 ms | 4,5 ms | bez istotnej zmiany |

Pozostałe zimne odczyty po zmianie wynosiły około 50–116 ms dla mniejszych ośrodków. Wyniki są wskazówką regresyjną dla lokalnego środowiska, nie produkcyjnym SLA. Należy je porównywać na tej samej maszynie, z tym samym profilem seeda i pustym cache.

## Weryfikacja zmian

Po wdrożeniu uruchomiono:

```bash
pnpm typecheck
pnpm test:ci
pnpm build
pnpm db:check
```

Rezultat: 37 zestawów i 149 testów zaliczonych, poprawny build, formatowanie oraz spójność migracji Drizzle. Migracja `0011_geo_search_active_organizers.sql` została także zastosowana do lokalnej bazy z pełnym seedem `performance`.

## Etap skalowania API — 20 sierpnia 2026

Kolejny przegląd objął mapę, geo-search, pule połączeń, Redis, workery, outbox i obserwowalność. Pomiary wykonano na tym samym lokalnym seedzie `performance`; wyniki są testem regresyjnym jednej instancji, a nie deklaracją produkcyjnej pojemności.

Najważniejsze zmiany:

- mapa zwraca kompaktowy DTO zamiast pełnego eventu, maksymalnie 500 pinezek, a nadmiar reprezentuje przez klastry;
- koszt viewportu jest ograniczony budżetem sektorów przed alokacją pamięci, a zapytania prostokątne używają osobnej kolumny `geometry(Point, 4326)` i indeksu GiST;
- typowy total mapy jest wyprowadzany z już pobranych sektorów; osobne count bounds mają krótki cache;
- geo-search dzieli kandydatów na zasięg lokalny, wybierany indeksem PostGIS, oraz większe zasięgi wybierane indeksem `(radius_km, start_date, id)`, dzięki czemu nie skanuje całej Polski promieniem 1000 km;
- projektor statystyk agreguje cały batch outboxa, używa `SKIP LOCKED`, opróżnia kolejne pełne batche i usuwa przetworzone rekordy po retencji;
- repliki HTTP mogą działać z `PROCESS_ROLE=api`, a osobne repliki workerów z `PROCESS_ROLE=worker`;
- cache, rate limiting i BullMQ obsługują osobne adresy Redis; read/write PostgreSQL mają niezależne pule i timeouty;
- Prometheus mierzy rozmiar odpowiedzi, stan pul DB oraz backlog i wiek outboxa; alerty obejmują oczekiwanie na połączenia oraz opóźniony outbox;
- publiczne discovery ma kompresję, krótki cache HTTP i distributed rate limiting, a udane access logi są próbkowane produkcyjnie.

Pomiary punktowe:

| Scenariusz | Zimny odczyt | Ciepły odczyt | Payload JSON |
| --- | ---: | ---: | ---: |
| Mapa Warszawy, typowy viewport | 257 ms | 13 ms | 27,1 KB |
| Mapa, dawny szeroki viewport | 349 ms | cache sektorowy | 48,9 KB |
| Geo-search Warszawa, 20 wyników | 710 ms | 9 ms | 25,1 KB |

Dawny szeroki request mapy zwracał około 6,9 MB i trwał 4,83 s na zimno. Po zmianie ten sam request zwrócił 100 priorytetowych pinezek i 11 klastrów reprezentujących łącznie 269 eventów. Dodatkowo naprawiono wcześniejsze przeciekanie rekordów spoza dokładnego viewportu, wynikające z granic kafli cache.

Kontrolowany test `pnpm test:load`, z podniesionym limitem tylko w lokalnej instancji benchmarkowej, uzyskał:

- 25 równoległych klientów przez 20 sekund;
- 23 129 żądań, czyli 1 156 RPS;
- 0% błędów;
- p50 20,8 ms, p95 37,0 ms, p99 59,1 ms;
- p95 mapy 41,0 ms i p95 geo-search 33,3 ms.

Test korzystał głównie z ciepłego cache i jednej instancji. Przed produkcją należy powtórzyć go na stagingu dla wielu replik, z realistycznym rozkładem viewportów, wymuszonym udziałem cache missów, osobnymi Redisami, PgBouncerem oraz monitoringiem CPU, pamięci, liczby połączeń i opóźnienia outboxa.
