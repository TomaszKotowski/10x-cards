# Schemat bazy danych PostgreSQL - 10x-cards MVP

## 1. Tabele

### 1.1 users
Tabela zarządzana przez Supabase Auth (GoTrue). Nie wymaga tworzenia migracji - istnieje w schemacie `auth.users`.

**Referencje w aplikacji:**
- `id` (uuid) - używane jako `user_id` w innych tabelach
- `email` (text)
- `created_at` (timestamptz)

---

### 1.2 decks

Tabela przechowująca talie kart użytkownika.

| Kolumna | Typ | Ograniczenia | Opis |
|---------|-----|--------------|------|
| `id` | uuid | PRIMARY KEY, DEFAULT gen_random_uuid() | Stały identyfikator talii (deck_id) |
| `user_id` | uuid | NOT NULL, REFERENCES auth.users(id) ON DELETE CASCADE | Właściciel talii |
| `name` | text | NOT NULL, CHECK (char_length(name) >= 1 AND char_length(name) <= 200) | Nazwa talii, unikalna per użytkownik (z wyłączeniem soft-deleted) |
| `slug` | text | NOT NULL | URL-friendly slug generowany z name, aktualizowany przy zmianie nazwy |
| `status` | text | NOT NULL, DEFAULT 'draft', CHECK (status IN ('draft', 'published')) | Status talii |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | Data utworzenia |
| `updated_at` | timestamptz | NOT NULL, DEFAULT now() | Data ostatniej aktualizacji |
| `published_at` | timestamptz | NULL | Data publikacji (NULL dla draft) |
| `deleted_at` | timestamptz | NULL | Soft delete timestamp (NULL = aktywna) |

**Notatki:**
- `slug` jest generowany automatycznie z `name` (lowercase, zamieniając spacje i polskie znaki na ascii-friendly)
- Unikalność nazwy wymuszana indeksem częściowym (patrz sekcja Indeksy)
- Po publikacji talia i jej karty są read-only (logika aplikacji)

---

### 1.3 cards

Tabela przechowująca karty w taliach.

| Kolumna | Typ | Ograniczenia | Opis |
|---------|-----|--------------|------|
| `id` | uuid | PRIMARY KEY, DEFAULT gen_random_uuid() | Identyfikator karty |
| `deck_id` | uuid | NOT NULL, REFERENCES decks(id) ON DELETE CASCADE | Talia, do której należy karta |
| `front` | text | NOT NULL, CHECK (char_length(front) >= 1 AND char_length(front) <= 200) | Pytanie (front karty), max 200 znaków |
| `back` | text | NOT NULL, CHECK (char_length(back) >= 1 AND char_length(back) <= 200) | Odpowiedź (back karty), max 200 znaków |
| `position` | integer | NOT NULL, DEFAULT 0 | Kolejność karty w talii (do sortowania) |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | Data utworzenia karty |
| `updated_at` | timestamptz | NOT NULL, DEFAULT now() | Data ostatniej aktualizacji |

**Notatki:**
- Brak soft delete dla kart - usunięcie fizyczne w Draft, brak usuwania po publikacji
- Limity 200 znaków wymuszane przez CHECK constraints
- `position` używane do utrzymania kolejności kart w talii (edycja) i losowania w sesji nauki

---

### 1.4 generation_sessions

Tabela przechowująca sesje generacji AI.

| Kolumna | Typ | Ograniczenia | Opis |
|---------|-----|--------------|------|
| `id` | uuid | PRIMARY KEY, DEFAULT gen_random_uuid() | Identyfikator sesji generacji |
| `user_id` | uuid | NOT NULL, REFERENCES auth.users(id) ON DELETE CASCADE | Użytkownik inicjujący generację |
| `deck_id` | uuid | NULL, REFERENCES decks(id) ON DELETE SET NULL | Talia docelowa (może być NULL jeśli talia usunięta) |
| `source_text` | text | NOT NULL, CHECK (char_length(source_text) >= 1 AND char_length(source_text) <= 10000) | Oryginalny tekst wejściowy |
| `sanitized_source_text` | text | NOT NULL, CHECK (char_length(sanitized_source_text) >= 1 AND char_length(sanitized_source_text) <= 10000) | Tekst po sanityzacji (usunięcie zbędnych spacji/HTML) |
| `status` | text | NOT NULL, DEFAULT 'in_progress', CHECK (status IN ('in_progress', 'completed', 'failed', 'timeout')) | Status generacji |
| `parameters` | jsonb | NULL | Parametry wywołania LLM (model, temperatura, etc.) |
| `cards_generated` | integer | NULL | Liczba kart zwróconych przez model |
| `cards_saved` | integer | NULL | Liczba kart faktycznie zapisanych (max 20) |
| `was_truncated` | boolean | NOT NULL, DEFAULT false | Czy wynik został przycięty (model zwrócił >20 kart) |
| `error_message` | text | NULL | Komunikat błędu (jeśli status = failed/timeout) |
| `started_at` | timestamptz | NOT NULL, DEFAULT now() | Timestamp rozpoczęcia |
| `completed_at` | timestamptz | NULL | Timestamp zakończenia (powodzenie/błąd/timeout) |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | Data utworzenia rekordu |

**Notatki:**
- `source_text` przechowuje oryginalny input użytkownika
- `sanitized_source_text` przechowuje tekst po sanityzacji przed wysyłką do LLM
- Indeks częściowy wymusza jedną równoległą generację per użytkownik (status = 'in_progress')
- Timeout 5 minut obsługiwany przez backend (worker/cron aktualizuje status po timeout)
- `was_truncated` = true gdy model zwrócił więcej niż 20 kart

---

## 2. Relacje między tabelami

### 2.1 Relacje jeden-do-wielu (1:N)

**users → decks**
- Kardynalność: Jeden użytkownik może mieć wiele talii
- Klucz obcy: `decks.user_id` → `auth.users.id`
- Kaskadowe usuwanie: ON DELETE CASCADE (usunięcie użytkownika usuwa talie)

**users → generation_sessions**
- Kardynalność: Jeden użytkownik może mieć wiele sesji generacji
- Klucz obcy: `generation_sessions.user_id` → `auth.users.id`
- Kaskadowe usuwanie: ON DELETE CASCADE

**decks → cards**
- Kardynalność: Jedna talia może mieć wiele kart (max 20 w MVP)
- Klucz obcy: `cards.deck_id` → `decks.id`
- Kaskadowe usuwanie: ON DELETE CASCADE (usunięcie talii usuwa karty)

**decks → generation_sessions**
- Kardynalność: Jedna talia może być powiązana z wieloma sesjami generacji (regeneracja, historia)
- Klucz obcy: `generation_sessions.deck_id` → `decks.id`
- Akcja przy usunięciu: ON DELETE SET NULL (zachowanie historii generacji)

---

## 3. Indeksy

### 3.1 Indeksy podstawowe (klucze główne)

Automatycznie tworzone dla PRIMARY KEY:
- `decks.id`
- `cards.id`
- `generation_sessions.id`

### 3.2 Indeksy na kluczach obcych

```sql
-- Wydajne zapytania dla talii użytkownika
CREATE INDEX idx_decks_user_id ON decks(user_id);

-- Wydajne zapytania dla kart w talii
CREATE INDEX idx_cards_deck_id ON cards(deck_id);

-- Wydajne zapytania dla sesji generacji użytkownika
CREATE INDEX idx_generation_sessions_user_id ON generation_sessions(user_id);

-- Wydajne zapytania dla sesji generacji powiązanych z talią
CREATE INDEX idx_generation_sessions_deck_id ON generation_sessions(deck_id) WHERE deck_id IS NOT NULL;
```

### 3.3 Indeksy funkcjonalne i częściowe

```sql
-- Unikalność nazwy talii per użytkownik z wyłączeniem soft-deleted
CREATE UNIQUE INDEX idx_decks_user_name_unique ON decks(user_id, lower(name)) 
WHERE deleted_at IS NULL;

-- Slug dla szybkiego dostępu URL (z wyłączeniem soft-deleted)
CREATE INDEX idx_decks_slug ON decks(slug) WHERE deleted_at IS NULL;

-- Jedna równoległa generacja per użytkownik
CREATE UNIQUE INDEX idx_generation_sessions_one_in_progress_per_user 
ON generation_sessions(user_id) 
WHERE status = 'in_progress';

-- Wydajne filtrowanie aktywnych talii
CREATE INDEX idx_decks_active ON decks(user_id, status) WHERE deleted_at IS NULL;

-- Wydajne filtrowanie opublikowanych talii dla nauki
CREATE INDEX idx_decks_published ON decks(user_id) 
WHERE status = 'published' AND deleted_at IS NULL;

-- Sortowanie kart w talii po pozycji
CREATE INDEX idx_cards_deck_position ON cards(deck_id, position);
```

**Uzasadnienie indeksów częściowych:**
- `idx_decks_user_name_unique`: Wymusza unikalność nazwy tylko dla aktywnych talii (deleted_at IS NULL), case-insensitive przez `lower(name)`
- `idx_generation_sessions_one_in_progress_per_user`: Zapobiega równoległym generacjom per użytkownik - constraint na poziomie DB
- Pozostałe indeksy częściowe optymalizują zapytania eliminując soft-deleted rekordy

---

## 4. Triggery i funkcje

### 4.1 Automatyczna aktualizacja updated_at

```sql
-- Funkcja do aktualizacji updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger dla decks
CREATE TRIGGER update_decks_updated_at 
BEFORE UPDATE ON decks
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Trigger dla cards
CREATE TRIGGER update_cards_updated_at 
BEFORE UPDATE ON cards
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
```

### 4.2 Automatyczne generowanie slug

```sql
-- Funkcja do generowania slug z nazwy talii
CREATE OR REPLACE FUNCTION generate_slug(name text)
RETURNS text AS $$
DECLARE
    slug text;
BEGIN
    -- Konwersja do lowercase, zamiana polskich znaków, usunięcie niepożądanych
    slug := lower(name);
    slug := translate(slug, 
        'ąćęłńóśźżĄĆĘŁŃÓŚŹŻ', 
        'acelnoszz­acelnoszz');
    -- Zamiana spacji i znaków specjalnych na myślnik
    slug := regexp_replace(slug, '[^a-z0-9]+', '-', 'g');
    -- Usunięcie myślników z początku i końca
    slug := trim(both '-' from slug);
    
    RETURN slug;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Trigger do automatycznego ustawiania slug przy INSERT i UPDATE
CREATE OR REPLACE FUNCTION set_deck_slug()
RETURNS TRIGGER AS $$
BEGIN
    NEW.slug := generate_slug(NEW.name);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_deck_slug_trigger
BEFORE INSERT OR UPDATE OF name ON decks
FOR EACH ROW
EXECUTE FUNCTION set_deck_slug();
```

### 4.3 Aktualizacja published_at przy publikacji

```sql
-- Funkcja do ustawiania published_at przy zmianie statusu na published
CREATE OR REPLACE FUNCTION set_published_at()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'published' AND (OLD.status IS NULL OR OLD.status != 'published') THEN
        NEW.published_at := now();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_published_at_trigger
BEFORE UPDATE OF status ON decks
FOR EACH ROW
EXECUTE FUNCTION set_published_at();
```

---

## 5. Polityki Row Level Security (RLS) - Plan na później

**Status MVP:** RLS wyłączone w MVP. Autoryzacja i izolacja danych obsługiwana na poziomie aplikacji (middleware Astro + Supabase client).

**Plan implementacji (po MVP):**

### 5.1 Włączenie RLS

```sql
ALTER TABLE decks ENABLE ROW LEVEL SECURITY;
ALTER TABLE cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE generation_sessions ENABLE ROW LEVEL SECURITY;
```

### 5.2 Polityki dla decks

```sql
-- Użytkownik widzi tylko swoje talie (z wyłączeniem soft-deleted)
CREATE POLICY decks_select_own ON decks
FOR SELECT
USING (auth.uid() = user_id AND deleted_at IS NULL);

-- Użytkownik może tworzyć swoje talie
CREATE POLICY decks_insert_own ON decks
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Użytkownik może aktualizować swoje talie draft
CREATE POLICY decks_update_own_draft ON decks
FOR UPDATE
USING (auth.uid() = user_id AND status = 'draft');

-- Użytkownik może publikować swoje talie draft
CREATE POLICY decks_publish_own ON decks
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (
    (OLD.status = 'draft' AND NEW.status = 'published') OR
    (OLD.status = NEW.status)
);

-- Użytkownik może soft-delete swoje talie
CREATE POLICY decks_delete_own ON decks
FOR UPDATE
USING (auth.uid() = user_id AND deleted_at IS NULL)
WITH CHECK (deleted_at IS NOT NULL);
```

### 5.3 Polityki dla cards

```sql
-- Użytkownik widzi karty ze swoich talii
CREATE POLICY cards_select_own ON cards
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM decks 
        WHERE decks.id = cards.deck_id 
        AND decks.user_id = auth.uid()
        AND decks.deleted_at IS NULL
    )
);

-- Użytkownik może dodawać karty do swoich draft talii
CREATE POLICY cards_insert_own_draft ON cards
FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM decks 
        WHERE decks.id = cards.deck_id 
        AND decks.user_id = auth.uid()
        AND decks.status = 'draft'
        AND decks.deleted_at IS NULL
    )
);

-- Użytkownik może edytować karty w swoich draft taliach
CREATE POLICY cards_update_own_draft ON cards
FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM decks 
        WHERE decks.id = cards.deck_id 
        AND decks.user_id = auth.uid()
        AND decks.status = 'draft'
        AND decks.deleted_at IS NULL
    )
);

-- Użytkownik może usuwać karty ze swoich draft talii
CREATE POLICY cards_delete_own_draft ON cards
FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM decks 
        WHERE decks.id = cards.deck_id 
        AND decks.user_id = auth.uid()
        AND decks.status = 'draft'
        AND decks.deleted_at IS NULL
    )
);
```

### 5.4 Polityki dla generation_sessions

```sql
-- Użytkownik widzi tylko swoje sesje generacji
CREATE POLICY generation_sessions_select_own ON generation_sessions
FOR SELECT
USING (auth.uid() = user_id);

-- Użytkownik może tworzyć swoje sesje generacji
CREATE POLICY generation_sessions_insert_own ON generation_sessions
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Tylko backend/service_role może aktualizować status generacji
CREATE POLICY generation_sessions_update_backend ON generation_sessions
FOR UPDATE
USING (false); -- Aplikacja używa service_role client
```

**Notatki na później:**
- Polityki wymuszają izolację danych per użytkownik na poziomie DB
- Read-only dostęp do published talii wymuszony przez brak polityk UPDATE/DELETE
- Backend używa `service_role` client do aktualizacji `generation_sessions` (bypass RLS)
- Implementacja RLS wraz z pełnym audytem po MVP

---

## 6. Ograniczenia aplikacyjne i walidacje

### 6.1 Limity implementowane na poziomie DB (CHECK constraints)

- **Karty:** max 200 znaków na `front` i `back`
- **Tekst wejściowy:** max 10 000 znaków na `source_text` i `sanitized_source_text`
- **Nazwa talii:** 1-200 znaków
- **Status talii:** tylko 'draft' lub 'published'
- **Status generacji:** tylko 'in_progress', 'completed', 'failed', 'timeout'

### 6.2 Limity implementowane na poziomie aplikacji

- **Max 20 kart per talia:** Walidacja przed dodaniem karty (API endpoint)
- **Jedna równoległa generacja per użytkownik:** Wymuszane przez unikalny indeks częściowy
- **Timeout generacji 5 minut:** Backend worker/cron aktualizuje status po timeout
- **Read-only po publikacji:** Logika aplikacji blokuje UPDATE/DELETE dla published decks/cards

### 6.3 Walidacje wielopoziomowe (defense in depth)

Wszystkie limity walidowane w trzech miejscach:
1. **Frontend (client):** UX - liczniki znaków, blokady formularzy, komunikaty
2. **Backend (server/API):** Zod validation przed zapisem do DB
3. **Database:** CHECK constraints jako ostatnia linia obrony

---

## 7. Dodatkowe uwagi projektowe

### 7.1 Soft delete

- Tylko talia `decks` ma soft delete (`deleted_at`)
- Karty nie mają soft delete - fizyczne usuwanie w draft, brak możliwości usunięcia po publikacji
- Soft-deleted talie są niewidoczne w aplikacji (filtrowanie `WHERE deleted_at IS NULL`)
- Plan na przyszłość: cron do twardego usuwania starych soft-deleted rekordów

### 7.2 Wydajność zapytań

**Najczęstsze zapytania:**
1. Lista talii użytkownika (aktywne, draft/published) → `idx_decks_active`, `idx_decks_published`
2. Karty talii z sortowaniem → `idx_cards_deck_position`
3. Aktywna sesja generacji użytkownika → `idx_generation_sessions_one_in_progress_per_user`
4. Dostęp do talii przez slug → `idx_decks_slug`

**Optymalizacje:**
- Indeksy częściowe eliminują niepotrzebne rekordy
- Indeksy na klucze obce przyspieszają JOINy
- Funkcja `generate_slug()` oznaczona IMMUTABLE dla cache'owania

### 7.3 Decyzje projektowe

**Dlaczego ON DELETE CASCADE dla decks → cards?**
- Karty nie mają znaczenia bez talii
- Upraszcza soft delete talii (nie trzeba obsługiwać osieroconych kart)

**Dlaczego ON DELETE SET NULL dla decks → generation_sessions?**
- Historia generacji może być wartościowa dla analityki/debugowania
- Sesje generacji mogą istnieć niezależnie od talii

**Dlaczego brak soft delete dla cards?**
- Karty są zawsze powiązane z talią (kaskadowe usunięcie)
- W published taliach karty są read-only (nie można usunąć)
- W draft taliach fizyczne usunięcie jest wystarczające

**Dlaczego position zamiast timestamps dla kolejności?**
- Pozwala na ręczne sortowanie/reorder w przyszłych wersjach
- Bardziej deterministyczne niż timestamps (brak kolizji przy bulk insert)

### 7.4 Typy danych

- **uuid:** Wszystkie ID (bezpieczne, rozproszone, nie-sekwencyjne)
- **text:** Dynamiczne stringi (name, front, back, source_text) - PostgreSQL optymalizuje automatycznie
- **timestamptz:** Wszystkie timestampy (z timezone, UTC w bazie)
- **jsonb:** Parametry LLM (indexed, queryable, flexible schema)
- **integer:** Liczniki (position, cards_generated) i flagowe booleans
- **boolean:** Flagi (was_truncated)

### 7.5 Bezpieczeństwo danych

**MVP (teraz):**
- Brak szyfrowania kolumn na poziomie DB
- `sanitized_source_text` przechowywany jako plaintext
- Autoryzacja na poziomie aplikacji (middleware)

**Później (plan):**
- RLS ON + polityki (szczegóły w sekcji 5)
- Ewentualne szyfrowanie `source_text` i `sanitized_source_text` (zależnie od wrażliwości danych)
- Polityka retencji: automatyczne usuwanie starych `generation_sessions` po X dniach
- Audit logging: kto, kiedy, co zmodyfikował (trigger-based lub aplikacyjnie)

### 7.6 Migracje

**Kolejność tworzenia:**
1. Tabela `decks` (zależy tylko od `auth.users`)
2. Tabela `cards` (zależy od `decks`)
3. Tabela `generation_sessions` (zależy od `auth.users` i `decks`)
4. Indeksy (po utworzeniu wszystkich tabel)
5. Triggery i funkcje (po indeksach)
6. RLS polityki (później, osobna migracja)

**Naming convention migracji:**
```
YYYYMMDDHHMMSS_descriptive_name.sql
```

Przykład:
```
20240115120000_create_decks_table.sql
20240115120100_create_cards_table.sql
20240115120200_create_generation_sessions_table.sql
20240115120300_create_indexes.sql
20240115120400_create_triggers_and_functions.sql
```

---

## 8. Podsumowanie schematu

**Liczba tabel:** 3 (+ auth.users z Supabase)
- `decks` - talie kart
- `cards` - karty w taliach  
- `generation_sessions` - sesje generacji AI

**Liczba indeksów:** 11
- 3 PRIMARY KEY (automatyczne)
- 4 indeksy na klucze obce
- 4 indeksy częściowe/funkcjonalne (unique constraints, optymalizacje)

**Liczba triggerów:** 4
- 2 dla auto-update `updated_at`
- 1 dla auto-generate `slug`
- 1 dla auto-set `published_at`

**Główne constraints:**
- 7 CHECK constraints (limity znaków, statusy)
- 2 unikalne indeksy częściowe (nazwa talii, jedna generacja)
- 4 klucze obce (relacje między tabelami)

**Status RLS:** Wyłączone w MVP, plan implementacji udokumentowany w sekcji 5.

**Kompatybilność:** PostgreSQL 12+ (Supabase), używa standardowych funkcji PG (uuid, jsonb, timestamptz, partial indexes, triggers).