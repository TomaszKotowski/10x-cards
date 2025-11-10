# Architektura UI dla 10x-cards

## 1. Przegląd struktury UI

- **Cel produktu**: Szybkie tworzenie i nauka fiszek dzięki generacji AI, prostym edycjom w Draft oraz nauce w losowej kolejności. Mobile‑first.
- **Główne obszary**:
  - **Autoryzacja**: /auth (Supabase email/hasło). Zabezpieczenie tras przez middleware i intercept 401 → /auth.
  - **Zarządzanie taliami**: /decks (lista), /decks/:slug-:id (szczegóły Draft/Published).
  - **Generacja AI**: /generate (start), polling statusu generacji i redirect do Draft.
  - **Nauka**: /learn/:deckId (sesja jednokrotnego przejścia, losowa kolejność, bez oceniania w MVP).
- **Zasady widoczności**: Status „rejected” niewidoczny w UI (brak filtrów/banerów); soft delete ukrywa talie globalnie.
- **Routing i URL**: Preferowany wzorzec szczegółu talii: `/decks/:slug-:id` (id jako źródło prawdy; slug informacyjnie). Obsłużyć stare/nieaktualne slug bez błędu (brak twardego redirectu w MVP).
- **Stan i komunikacja z API**:
  - Lekki `apiClient` (fetchJson<T>, Zod parse, AbortController, intercept 401 → /auth).
  - Cache GET z TTL 30–60 s (np. /api/decks); jawna invalidacja po mutacjach (add/edit/delete/publish/generate).
  - Polling generacji co ~2 s do 5 min (timeout → komunikat i CTA „Spróbuj ponownie”).
- **Dostępność (A11y)**: Na start podstawy: etykiety, focus ring, cele dotykowe ≥44 px, kontrast AA. Zaawansowane (ARIA, aria-live, focus trap) zaplanowane później.
- **Bezpieczeństwo**: JWT Supabase; RLS w DB; generyczne komunikaty błędów; brak sekretów w kliencie; CORS w middleware.
- **Mock Mode**: Flaga `USE_MOCK_DATA=true` przełącza na serwis mock do rozwoju UI (generacja, listy, karty).

## 2. Lista widoków

### Widok: Autoryzacja
- **Ścieżka**: `/auth`
- **Główny cel**: Logowanie/rejestracja użytkownika i przekierowanie do listy talii po sukcesie.
- **Kluczowe informacje do wyświetlenia**:
  - **Formularz**: e-mail, hasło; przełącznik logowanie/rejestracja.
  - **Komunikaty**: generyczne błędy przy niepowodzeniu; link „Zapomniałem hasła” (opcjonalnie, poza MVP).
- **Kluczowe komponenty widoku**:
  - **AuthForm** (shadcn/ui form + walidacja), **SubmitButton** (stan ładowania), **AuthLayout**.
- **UX, dostępność i względy bezpieczeństwa**:
  - **UX**: automatyczne przeniesienie fokusa po błędzie, blokada wielokrotnego submitu.
  - **A11y**: etykiety, `aria-invalid`, opisy błędów powiązane z polami.
  - **Security**: obsługa 401/wygaśniętej sesji; przechowywanie tokenów przez Supabase klienta.
- **Zgodność z API**: Autoryzacja via Supabase SDK; brak dedykowanych endpointów REST.
- **Powiązane US**: US-001, US-002, US-003, US-004

---

### Widok: Lista talii
- **Ścieżka**: `/decks` (chroniona)
- **Główny cel**: Przegląd własnych talii, wejście do szczegółów, rozpoczęcie nauki (dla published), utworzenie nowej poprzez /generate, soft delete talii.
- **Kluczowe informacje do wyświetlenia**:
  - **Karty listy**: nazwa, status (draft/published), liczba kart, daty (updated_at), CTA.
  - **Filtr segmentowy**: Draft | Published (domyślnie All lub Draft; „rejected” niewidoczne).
  - **Pusty stan**: CTA „Utwórz nową talię” → /generate.
- **Kluczowe komponenty widoku**:
  - **DeckFilters** (segmented control), **DeckList**, **DeckListItem**, **DeleteDeckDialog**, **EmptyState**.
- **UX, dostępność i względy bezpieczeństwa**:
  - **UX**: skeletony podczas ładowania, potwierdzenie soft delete, zapamiętanie wyboru filtra (opcjonalnie w URL lub localStorage).
  - **A11y**: lista semantyczna, przyciski z etykietami, focus management po usunięciu.
  - **Security**: ukrycie soft‑deleted/rejected; generyczne błędy.
- **Zgodność z API**:
  - GET `/api/decks` (status, sort, limit/offset; TTL cache).
  - DELETE `/api/decks/:deckId` (soft delete; invalidacja listy i szczegółu).
- **Powiązane US**: US-021, US-022, US-027

---

### Widok: Generacja AI
- **Ścieżka**: `/generate` (chroniona)
- **Główny cel**: Wklejenie tekstu (≤10 000 znaków), opcjonalna nazwa talii, start generacji i śledzenie postępu.
- **Kluczowe informacje do wyświetlenia**:
  - **Textarea** z licznikiem 0/10 000 (+ wczesna walidacja długości i blokada przycisku).
  - **Nazwa talii** (1–100 znaków, informacja że unikalność weryfikowana podczas zapisu na serwerze).
  - **Stan**: „W trakcie” z paskiem/loaderem, informacja o możliwym czasie trwania, CTA anulacji (opcjonalnie), komunikaty o błędach.
- **Kluczowe komponenty widoku**:
  - **TextareaWithCounter**, **DeckNameInput**, **GenerateButton** (z blokadą i spinnerem), **GenerationStatusPanel** (polling), **InfoBanner**.
- **UX, dostępność i względy bezpieczeństwa**:
  - **UX**: blokada wielokrotnego wysłania, wyraźny stan „w trakcie”, CTA „Spróbuj ponownie” po błędzie/timeout.
  - **A11y**: `aria-live=polite` dla statusu, etykiety pól.
  - **Security**: generyczne komunikaty o błędach; brak ekspozycji sanitized_source_text.
- **Zgodność z API**:
  - POST `/api/generations` (walidacje, 1 sesja równolegle na użytkownika).
  - GET `/api/generation-sessions/:sessionId` (polling co ~2 s, timeout 5 min).
  - Po statusie `completed` → redirect do Draft: `/decks/:slug-:id?banner=truncated_count`.
- **Powiązane US**: US-010, US-011, US-012, US-013, US-014, US-028

---

### Widok: Szczegóły talii – Draft
- **Ścieżka**: `/decks/:slug-:id` (status = draft; chroniona)
- **Główny cel**: Przegląd i edycja kart, przygotowanie do publikacji, zmiana nazwy talii, dodawanie/usuwanie kart.
- **Kluczowe informacje do wyświetlenia**:
  - **Lista kart**: front/back z licznikami 0/200, oznaczenia przekroczeń (>200) i nieprawidłowości.
  - **Panel walidacji** („Sprawdź i opublikuj”): lista naruszeń (mapowanie do kart), liczba kart (1–20), podsumowanie.
  - **Baner po generacji**: „Utworzono X kart (przycięto Y)”.
- **Kluczowe komponenty widoku**:
  - **DeckHeader** (nazwa edytowalna inline), **CardItemEditable**, **CardList**, **AddCardStickyBar**, **ValidationPanel**, **PublishButton**, **DeleteDeckDialog**.
- **UX, dostępność i względy bezpieczeństwa**:
  - **UX**: edycja inline na blur / na klik „Zapisz”, brak autozapisu; sticky „Dodaj kartę” na mobile; preflight klienta przed publikacją (długości, liczba kart), następnie POST /publish i ewentualne mapowanie błędów serwera.
  - **A11y**: czytelne komunikaty błędów przy polach, skróty klawiaturowe odłożone; focus nie gubi się po walidacji.
  - **Security**: tylko draft edytowalny; generyczne błędy; unikalność nazwy egzekwowana serwerowo (opcjonalny pre‑check on‑blur).
- **Zgodność z API**:
  - GET `/api/decks/:deckId`, GET `/api/decks/:deckId/cards` (TTL cache krótkie; invalidacje po mutacjach).
  - POST `/api/decks/:deckId/cards` (dodanie), PATCH `/api/cards/:cardId` (edycja), DELETE `/api/cards/:cardId` (soft delete).
  - PATCH `/api/decks/:deckId` (zmiana nazwy), POST `/api/decks/:deckId/publish` (batch all‑or‑nothing; zwrot walidacji przy 400).
- **Powiązane US**: US-015, US-016, US-017, US-018, US-019, US-020, US-029, US-030, US-031

---

### Widok: Szczegóły talii – Published
- **Ścieżka**: `/decks/:slug-:id` (status = published; chroniona)
- **Główny cel**: Read‑only podgląd kart i rozpoczęcie nauki.
- **Kluczowe informacje do wyświetlenia**:
  - **Lista kart**: front/back bez możliwości edycji, liczba kart, data publikacji.
  - **CTA**: „Ucz się”.
- **Kluczowe komponenty widoku**:
  - **DeckHeader** (nazwa nieedytowalna), **CardListReadonly**, **StartLearnButton**.
- **UX, dostępność i względy bezpieczeństwa**:
  - **UX**: jasna informacja o trybie tylko do odczytu; brak przycisków edycji/usuwania.
  - **A11y**: struktura semantyczna, focus ring na CTA.
  - **Security**: brak akcji mutujących; generyczne błędy.
- **Zgodność z API**:
  - GET `/api/decks/:deckId`, GET `/api/decks/:deckId/cards`.
- **Powiązane US**: US-022

---

### Widok: Nauka (Learn)
- **Ścieżka**: `/learn/:deckId` (chroniona)
- **Główny cel**: Sesja nauki w losowej kolejności, każdy element max raz na sesję.
- **Kluczowe informacje do wyświetlenia**:
  - **Ekran karty**: najpierw front, po „Pokaż odpowiedź” back, następnie CTA „Następna” i „Pomiń”.
  - **Postęp**: pasek N/N, licznik kart, ekran zakończenia z CTA „Wróć do talii”/„Powtórz sesję”.
- **Kluczowe komponenty widoku**:
  - **LearnShell** (mobile‑first, sticky dolny pasek CTA), **LearnCard**, **RevealButton**, **NextButton**, **SkipButton**, **ProgressBar**, **SessionComplete**.
- **UX, dostępność i względy bezpieczeństwa**:
  - **UX**: brak skrótów klawiaturowych w MVP; duże cele dotykowe; płynne przejścia kart.
  - **A11y**: kontrola fokusa między przyciskami; role `progressbar` dla paska postępu.
  - **Security**: brak zapisu stanu (sesja w pamięci klienta), brak ujawniania danych poza użytkownika.
- **Zgodność z API**:
  - GET `/api/decks/:deckId/cards` (pobranie kart; permutacja po stronie klienta).
- **Powiązane US**: US-023, US-024, US-025, US-026

---

### Widok: 404 / Brak dostępu
- **Ścieżka**: globalny fallback / przekierowania
- **Główny cel**: Przyjazne komunikaty dla nieistniejących zasobów lub prób dostępu do cudzych talii (bez ujawniania szczegółów).
- **Kluczowe komponenty widoku**: **NotFound**, **GenericError**, automatyczny redirect 401 → /auth.
- **Powiązane US**: US-004

## 3. Mapa podróży użytkownika

- **Flow główny (happy path)**:
  1. **/auth**: logowanie → sukces → redirect do **/decks**.
  2. **/decks**: klik „Nowa talia” → **/generate**.
  3. **/generate**: wklejenie tekstu (≤10k), opcjonalna nazwa → „Generuj”. UI pokazuje status i blokuje kolejne żądania.
  4. **Polling**: do 5 min (co ~2 s). Po `completed` → redirect do **/decks/:slug-:id** (Draft) z banerem o przycięciu (`truncated_count`).
  5. **Draft**: edycja kart inline, liczniki; dodawanie/usuwanie; preflight klienta (długości/limit kart); „Opublikuj”.
  6. **Publikacja**: POST `/publish` (all‑or‑nothing). Sukces → status `published`, pozostajemy w szczegółach lub wracamy do **/decks** (konsekwentny wzorzec: pozostać w szczegółach Published).
  7. **Published**: CTA „Ucz się” → **/learn/:deckId**.
  8. **Learn**: przejście przez wszystkie karty, ekran zakończenia → „Wróć do talii”.

- **Scenariusze alternatywne i błędy**:
  - **Generacja w toku**: POST `/api/generations` zwraca `generation_in_progress` → komunikat + CTA „Spróbuj ponownie”.
  - **Timeout generacji**: status `timeout` → komunikat i CTA „Spróbuj ponownie”.
  - **Walidacje Draft**: lokalne liczniki i zaznaczenia; przy POST `/publish` możliwe `validation_errors` → mapowanie do kart (scroll/focus do pierwszego błędu).
  - **Limity**: blokada dodania >20 kart; licznik 10 000 znaków na /generate.
  - **401/403**: intercept 401 → /auth; cudza talia → 404/redirect bez szczegółów.
  - **Soft delete**: potwierdzenie; po usunięciu invalidacja cache i powrót do listy.

## 4. Układ i struktura nawigacji

- **App Shell**:
  - **Nagłówek**: logo/brand → /decks, link „Generuj” → /generate, menu użytkownika (Wyloguj).
  - **Breadcrumby**: uproszczone – w szczegółach talii przycisk „Wróć” do /decks.
  - **Sticky akcje**: na mobile w Draft („Dodaj kartę”, „Sprawdź i opublikuj”), w Learn (dolny pasek CTA).

- **Nawigacja między widokami**:
  - **Ochrona tras**: middleware + klient (401 → /auth). /auth publiczne; reszta chroniona.
  - **Deep‑linking**: bezpieczne wejście na `/decks/:slug-:id` (id decyduje o danych; slug informacyjnie).
  - **Redirecty**: po logowaniu → /decks; po udanej generacji → Draft; po publikacji → pozostanie w szczegółach (Published) lub powrót do listy (decydowane produktowo – rekomendacja: zostać w szczegółach).

- **Responsywność**:
  - **Mobile‑first**: jednokolumnowo; desktop: dwukolumnowo (lista kart + panel walidacji w Draft; lista + CTA w Published).

## 5. Kluczowe komponenty

- **AppHeader**: nawigacja główna, menu użytkownika (Wyloguj). A11y: landmarks, focus ring.
- **ProtectedRoute/Middleware**: przekierowania niezalogowanych; intercept 401 w `apiClient`.
- **apiClient**: `fetchJson<T>`, Zod parse, TTL 30–60 s (GET), invalidacje po mutacjach; obsługa 401 i błędów generycznych.
- **Toast/ErrorBanner/InfoBanner**: komunikaty globalne (timeout generacji, przycięcie kart, sukces publikacji).
- **DeckFilters**: segment Draft/Published; zapis wyboru.
- **DeckList/DeckListItem**: karta talii, CTA „Wejdź”, „Ucz się” (dla Published), „Usuń”.
- **DeleteDeckDialog/ConfirmDialog**: potwierdzenia akcji destrukcyjnych (soft delete, usunięcie karty).
- **TextareaWithCounter / InputWithCounter**: walidacje długości (10 000; 200).
- **GenerationStatusPanel**: polling `GET /api/generation-sessions/:id`, stany: in_progress/completed/failed/timeout.
- **DeckHeader (rename inline)**: PATCH `/api/decks/:deckId`; obsługa unikalności (błąd serwera → komunikat przy polu).
- **CardItemEditable / CardList**: edycja front/back (≤200), pozycje, usuwanie (DELETE), dodawanie (POST). Wersja readonly dla Published.
- **AddCardStickyBar**: szybkie dodawanie z walidacją i limitem 20 kart.
- **ValidationPanel**: zlicza błędy i limity; preflight klienta; prowadzi do kart z błędami.
- **PublishButton**: POST `/api/decks/:deckId/publish` z mapowaniem `validation_errors` na UI.
- **LearnShell/LearnCard**: flow pytanie → odpowiedź → Next/Skip; ProgressBar; SessionComplete.
- **EmptyState/Skeletons**: stany załadowania i braku danych.

