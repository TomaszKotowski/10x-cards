# Tech‑Stack – 10x‑cards (MVP + „później”)

Dokument opisuje zatwierdzony stos technologiczny zgodny z PRD oraz Twoimi
założeniami:

- Wersje pakietów są zaakceptowane i zamrożone (bez ich zmiany).
- Supabase działa w trybie self‑hosted na Dockerze, deploy na DigitalOcean.
- Zabezpieczenia DB (RLS/polityki) wejdą „później”, ale są opisane jako plan.

## Frontend

- Astro 5 + React 19 + TypeScript 5 + Tailwind 4 + shadcn/ui.
- Cel: szybkie MVP (mobile‑first), minimalny JS (wyspy Astro), gotowe komponenty UI.
- Zamrożenie wersji: commit lockfile, `packageManager` w `package.json`, `corepack` włączony; instalacje z wersjami dokładnymi.
- Uwaga kompatybilności: smoke test shadcn/ui z React 19 i Tailwind 4.

MVP (must‑have)

- Widoki: logowanie/rejestracja, lista talii (draft/published), szczegóły Draft
  (lista kart, edycja, dodawanie, usuwanie), publikacja batch, widok nauki.
- Walidacje po stronie klienta: 10 000 znaków wejścia generatora; 200 znaków
  na front/back; licznik znaków przy edycji; komunikaty błędów generyczne.

Później

- Telemetria frontu (Sentry/TrackJS), i18n, dostępnościowe dopracowania.

## Backend (self‑hosted na DigitalOcean)

- Supabase (self‑host): Postgres + PostgREST + GoTrue (auth) + Realtime + Studio.
- Usługa do AI obłsuży Astro na serwerze. Wywołuje OpenRouter i egzekwuje limity z PRD. Sekret `OPENROUTER_API_KEY` wyłącznie na serwerze.
- Migracje: Supabase CLI; katalog migracji w repo.

MVP (must‑have)

- Endpoint generacji (backend‑only):
  - Przyjmuje tekst wejściowy (≤10 000 znaków), sanitizuje, zapisuje
    `generation_session` (status, timestamp, parametry).
  - Wymusza 1 równoległą sesję per użytkownik.
  - Twardy timeout 5 min; po czasie anuluje i ustawia status.
  - Przycina wynik do 20 kart; zapisuje „przycięto” w metadanych.
- API do CRUD Draft (read/write) i odczyt Published (read‑only po publikacji).

Później

- Supabase RLS i polityki (szczegóły w sekcji „Bezpieczeństwo – później”).
- Ewentualna migracja usługi AI do Edge Functions, jeśli zdecydujemy się na
  ich self‑hosting w stabilnym wariancie.

## AI – OpenRouter

- Jeden model w MVP (bez fallbacków). Wywołania wyłącznie z backendu.
- Limity i reguły z PRD:
  - Wejście: do 10 000 znaków; walidacja client + server.
  - Wyjście: do 20 kart; dodatkowe przycięte.
  - Format Q/A, sanityzacja spacji/HTML, zapis `sanitized_source_text`.
  - Timeout 5 min; 1 równoległa generacja per użytkownik.
- Koszt i kontrola: klucz jako sekret środowiskowy; prosty rate‑limit (notatka na przyszłość).

## Dane i ograniczenia (DB – teraz)

- Tabele: `users` (Supabase), `decks`, `cards`, `generation_sessions`.
- Indeksy/ograniczenia (MVP):
  - Unikalność nazwy talii per użytkownik z soft‑delete:
    unikalny indeks częściowy na `(user_id, lower(name)) WHERE deleted_at IS NULL`.
  - Długości kart: `CHECK (char_length(front) <= 200)` i `CHECK (char_length(back) <= 200)`.
  - Jedna generacja równoległa: unikalny indeks częściowy na `generation_sessions(user_id)
WHERE status = 'in_progress'`.
  - `sanitized_source_text` + metadane generacji (timestamp, parametry, status, przycięcie).

## CI/CD i Hosting (DigitalOcean)

- Buildy: GitHub Actions buduje obrazy i pushuje do DOCR (DigitalOcean Container Registry).
- Deploy: Droplet (np. 2 vCPU/4 GB RAM na start), `docker compose` (plik poza zakresem tego dokumentu),
  update przez SSH lub GitHub Actions; secrets z DO vars/`doppler`/`sops`.
- Frontend: statyczny build za reverse proxy na tym samym Droplecie lub DO App Platform.
- Dane: wolumen DO dla Postgresa, kopie zapasowe: nocne `pg_dump` + snapshoty DO.

## Bezpieczeństwo – teraz vs. później

Teraz (MVP)

- Sekrety tylko na serwerze (OpenRouter, klucze Supabase service/JWT). Brak kluczy w przeglądarce.
- Minimalne błędy: komunikaty generyczne (bez szczegółów technicznych).
- CORS zawężone do domeny produkcyjnej i dev.
- DB constraints i indeksy jak wyżej (walidacje + limity + blokada równoległości).

Później (plan)

- RLS ON + polityki dla `decks`, `cards`, `generation_sessions` (własność po `user_id`, deny‑by‑default).
- Polityki `insert/update/delete` warunkowane `auth.uid()` + referencyjna spójność.
- Ograniczenie ekspozycji PostgREST (tylko niezbędne widoki/RPC), rotacja kluczy JWT.
- Audyt/logowanie: centralne logi, ślady zapytań; maskowanie PII (brak wrażliwych danych w logach).
- TLS wszędzie, rotacja sekretów, backup‑restore ćwiczony okresowo.

## Notatki na przyszłość (po MVP)

- Rate limiting (per IP/user na endpoint generacji) i kwoty (dziennie/miesięcznie).
- Retencja i twarde purge dla soft‑deleted (cron/worker).
- Observability: Sentry (front), Prometheus/Grafana (backend), strukturalne logi.
- Skalowanie: DO Load Balancer, poziome skalowanie usług, ewentualnie DO Managed DB.

## Mapowanie na PRD (skrót)

- Auth i izolacja: GoTrue teraz; pełne RLS „później”.
- Draft/Publish all‑or‑nothing: walidacje przed publikacją; po publikacji read‑only.
- Generacja AI: limit 10 000 znaków, przycięcie do 20, timeout 5 min, 1 sesja równoległa.
- Walidacje treści: klient + serwer + DB CHECK.
- Soft delete: `deleted_at`, ukrycie w UI i zapytaniach; unikalność nazw z uwzględnieniem soft‑delete.
