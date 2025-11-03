# Schemat Bazy Danych PostgreSQL – 10x-cards

Dokument opisuje finalny schemat bazy danych dla projektu 10x-cards MVP, uwzględniający wymagania z PRD, decyzje z sesji planowania oraz stack technologiczny (Supabase self-hosted).

## 1. Tabele

### 1.1 `auth.users`

Tabela zarządzana przez Supabase GoTrue. Zawiera dane uwierzytelniające użytkowników.

**Uwaga:** Nie tworzymy tej tabeli ręcznie – jest częścią Supabase Auth.

Kluczowe kolumny używane w relacjach:
- `id` – UUID, Primary Key
- `email` – TEXT, unikalny
- `created_at` – TIMESTAMPTZ
- `updated_at` – TIMESTAMPTZ

---

### 1.2 `decks`

Tabela przechowująca talie fiszek. Każda talia należy do jednego użytkownika.

| Kolumna | Typ | Ograniczenia | Opis |
|---------|-----|--------------|------|
| `id` | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unikalny identyfikator talii |
| `user_id` | UUID | NOT NULL, REFERENCES auth.users(id) ON DELETE CASCADE | Właściciel talii |
| `name` | CITEXT | NOT NULL, CHECK (char_length(name) BETWEEN 1 AND 100) | Nazwa talii (case-insensitive) |
| `slug` | TEXT | NOT NULL | Slug URL generowany z nazwy |
| `status` | TEXT | NOT NULL DEFAULT 'draft', CHECK (status IN ('draft', 'published', 'rejected')) | Status talii |
| `published_at` | TIMESTAMPTZ | NULL | Timestamp publikacji (NULL dla draft) |
| `rejected_at` | TIMESTAMPTZ | NULL | Timestamp odrzucenia |
| `rejected_reason` | TEXT | NULL, CHECK (rejected_reason IS NULL OR char_length(rejected_reason) <= 500) | Powód odrzucenia |
| `deleted_at` | TIMESTAMPTZ | NULL | Soft delete timestamp |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | Timestamp utworzenia |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | Timestamp ostatniej modyfikacji |

**Ograniczenia biznesowe:**
- Po publikacji (`status = 'published'`) talia jest read-only (wymuszane przez RLS i logikę aplikacji)
- Nazwa talii (`name`) musi być unikalna per użytkownik (z uwzględnieniem soft-delete)
- `published_at` jest wymagane, gdy `status = 'published'`
- `rejected_at` i `rejected_reason` są używane, gdy `status = 'rejected'`

---

### 1.3 `cards`

Tabela przechowująca pojedyncze fiszki należące do talii.

| Kolumna | Typ | Ograniczenia | Opis |
|---------|-----|--------------|------|
| `id` | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unikalny identyfikator karty |
| `deck_id` | UUID | NOT NULL, REFERENCES decks(id) ON DELETE CASCADE | Talia, do której należy karta |
| `front` | TEXT | NOT NULL, CHECK (char_length(front) BETWEEN 1 AND 200) | Przednia strona (pytanie) |
| `back` | TEXT | NOT NULL, CHECK (char_length(back) BETWEEN 1 AND 200) | Tylna strona (odpowiedź) |
| `position` | INTEGER | NOT NULL, CHECK (position > 0) | Pozycja karty w talii (1-based) |
| `hint` | TEXT | NULL, CHECK (hint IS NULL OR char_length(hint) <= 200) | Opcjonalna podpowiedź (zarezerwowane na przyszłość) |
| `is_active` | BOOLEAN | NOT NULL DEFAULT TRUE | Czy karta jest aktywna (zarezerwowane na przyszłość) |
| `locale` | TEXT | NULL, CHECK (locale IS NULL OR char_length(locale) <= 10) | Język karty (np. 'pl', 'en') – zarezerwowane |
| `metadata` | JSONB | NULL | Dodatkowe metadane (elastyczne pole) |
| `deleted_at` | TIMESTAMPTZ | NULL | Soft delete timestamp |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | Timestamp utworzenia |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | Timestamp ostatniej modyfikacji |

**Ograniczenia biznesowe:**
- Pozycja (`position`) musi być unikalna w obrębie talii (z uwzględnieniem soft-delete)
- Maksymalnie 20 kart może być opublikowanych w talii (wymuszane podczas publikacji)
- Karty w opublikowanych taliach są read-only

---

### 1.4 `generation_sessions`

Tabela przechowująca sesje generacji AI. Każda sesja jest powiązana z jedną talią (relacja 1:1).

| Kolumna | Typ | Ograniczenia | Opis |
|---------|-----|--------------|------|
| `id` | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unikalny identyfikator sesji |
| `user_id` | UUID | NOT NULL, REFERENCES auth.users(id) ON DELETE CASCADE | Użytkownik inicjujący generację |
| `deck_id` | UUID | NOT NULL, UNIQUE, REFERENCES decks(id) ON DELETE CASCADE | Talia powiązana z generacją (1:1) |
| `status` | TEXT | NOT NULL DEFAULT 'in_progress', CHECK (status IN ('in_progress', 'completed', 'failed', 'timeout')) | Status generacji |
| `params` | JSONB | NULL | Parametry użyte do generacji (model, temperatura, itp.) |
| `sanitized_source_text` | TEXT | NOT NULL, CHECK (char_length(sanitized_source_text) <= 10000) | Oczyszczony tekst źródłowy użyty do generacji |
| `truncated_count` | SMALLINT | NULL, CHECK (truncated_count >= 0) | Liczba kart usuniętych z wyniku LLM (jeśli >20) |
| `error_code` | TEXT | NULL | Kod błędu (jeśli status = 'failed') |
| `error_message` | TEXT | NULL, CHECK (error_message IS NULL OR char_length(error_message) <= 1000) | Szczegóły błędu |
| `started_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | Timestamp rozpoczęcia generacji |
| `finished_at` | TIMESTAMPTZ | NULL | Timestamp zakończenia generacji |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | Timestamp utworzenia rekordu |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | Timestamp ostatniej modyfikacji |

**Ograniczenia biznesowe:**
- Użytkownik może mieć maksymalnie jedną aktywną sesję generacji (`status = 'in_progress'`) – wymuszane przez częściowy indeks unikalny
- Każda talia może mieć maksymalnie jedną sesję generacji (UNIQUE na `deck_id`)
- Timeout generacji: 5 minut (wymuszane przez logikę aplikacji)

---

## 2. Relacje między tabelami

### 2.1 Diagram relacji

```
auth.users (1) ──────< (N) decks
    │                      │
    │                      │ (1:1)
    │                      └──────< generation_sessions
    │
    └─────────────────< (N) generation_sessions

decks (1) ──────< (N) cards
```

### 2.2 Opis relacji

| Relacja | Kardynalność | Typ | Szczegóły |
|---------|--------------|-----|-----------|
| `auth.users` → `decks` | 1:N | Jeden-do-wielu | Użytkownik może mieć wiele talii |
| `auth.users` → `generation_sessions` | 1:N | Jeden-do-wielu | Użytkownik może mieć wiele sesji generacji (w czasie) |
| `decks` → `cards` | 1:N | Jeden-do-wielu | Talia zawiera wiele kart |
| `decks` → `generation_sessions` | 1:1 | Jeden-do-jednego | Każda talia ma dokładnie jedną sesję generacji |

**Uwagi:**
- Wszystkie relacje używają `ON DELETE CASCADE` dla automatycznego czyszczenia powiązanych rekordów
- Relacja 1:1 między `decks` i `generation_sessions` wymuszana przez UNIQUE constraint na `generation_sessions.deck_id`

---

## 3. Indeksy

### 3.1 Indeksy podstawowe (automatyczne)

Następujące indeksy są tworzone automatycznie przez PostgreSQL:

- Primary Keys: `decks(id)`, `cards(id)`, `generation_sessions(id)`
- Unique constraints: `generation_sessions(deck_id)`

### 3.2 Indeksy wydajnościowe

| Tabela | Indeks | Typ | Cel |
|--------|--------|-----|-----|
| `decks` | `idx_decks_user_id_status_updated` | B-tree | Szybkie listowanie talii użytkownika z filtrowaniem po statusie i sortowaniem |
| `decks` | `idx_decks_user_name_unique` | Częściowy unikalny | Wymuszenie unikalności nazwy talii per użytkownik (tylko nieusunięte) |
| `decks` | `idx_decks_slug` | B-tree | Szybkie wyszukiwanie talii po slug (routing URL) |
| `cards` | `idx_cards_deck_id_position` | B-tree | Szybkie pobieranie kart w kolejności dla danej talii |
| `cards` | `idx_cards_deck_position_unique` | Częściowy unikalny | Wymuszenie unikalności pozycji w talii (tylko nieusunięte) |
| `generation_sessions` | `idx_gen_sessions_user_created` | B-tree | Listowanie historii generacji użytkownika |
| `generation_sessions` | `idx_gen_sessions_user_in_progress` | Częściowy unikalny | Wymuszenie maksymalnie 1 aktywnej generacji per użytkownik |

### 3.3 Definicje SQL indeksów

```sql
-- Decks: listowanie i sortowanie
CREATE INDEX idx_decks_user_id_status_updated
ON decks(user_id, status, updated_at DESC)
WHERE deleted_at IS NULL;

-- Decks: unikalność nazwy per użytkownik (tylko aktywne)
CREATE UNIQUE INDEX idx_decks_user_name_unique
ON decks(user_id, LOWER(name))
WHERE deleted_at IS NULL;

-- Decks: routing po slug
CREATE INDEX idx_decks_slug
ON decks(slug)
WHERE deleted_at IS NULL;

-- Cards: pobieranie kart w kolejności
CREATE INDEX idx_cards_deck_id_position
ON cards(deck_id, position)
WHERE deleted_at IS NULL;

-- Cards: unikalność pozycji w talii (tylko aktywne)
CREATE UNIQUE INDEX idx_cards_deck_position_unique
ON cards(deck_id, position)
WHERE deleted_at IS NULL;

-- Generation Sessions: historia użytkownika
CREATE INDEX idx_gen_sessions_user_created
ON generation_sessions(user_id, created_at DESC);

-- Generation Sessions: tylko jedna aktywna generacja per użytkownik
CREATE UNIQUE INDEX idx_gen_sessions_user_in_progress
ON generation_sessions(user_id)
WHERE status = 'in_progress';
```

---

## 4. Polityki Row Level Security (RLS)

RLS jest włączone na wszystkich tabelach użytkownika. Strategia: **deny-by-default** – brak dostępu, chyba że polityka jawnie przyznaje uprawnienia.

### 4.1 Włączenie RLS

```sql
ALTER TABLE decks ENABLE ROW LEVEL SECURITY;
ALTER TABLE cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE generation_sessions ENABLE ROW LEVEL SECURITY;
```

### 4.2 Polityki dla tabeli `decks`

#### SELECT (odczyt)
Użytkownik może odczytać swoje talie (wszystkie statusy), które nie są usunięte.

```sql
CREATE POLICY "Users can view their own decks"
ON decks FOR SELECT
USING (
  user_id = auth.uid()
  AND deleted_at IS NULL
);
```

#### INSERT (tworzenie)
Użytkownik może tworzyć nowe talie ze sobą jako właścicielem.

```sql
CREATE POLICY "Users can create their own decks"
ON decks FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND status = 'draft'
  AND deleted_at IS NULL
);
```

#### UPDATE (edycja)
Użytkownik może edytować tylko swoje talie w statusie `draft`.

```sql
CREATE POLICY "Users can update their own draft decks"
ON decks FOR UPDATE
USING (
  user_id = auth.uid()
  AND status = 'draft'
  AND deleted_at IS NULL
)
WITH CHECK (
  user_id = auth.uid()
  AND deleted_at IS NULL
);
```

#### DELETE (soft-delete)
Użytkownik może usuwać (soft-delete) swoje talie w dowolnym statusie.

```sql
CREATE POLICY "Users can soft-delete their own decks"
ON decks FOR UPDATE
USING (
  user_id = auth.uid()
  AND deleted_at IS NULL
)
WITH CHECK (
  user_id = auth.uid()
  AND deleted_at IS NOT NULL
);
```

---

### 4.3 Polityki dla tabeli `cards`

#### SELECT (odczyt)
Użytkownik może odczytać karty ze swoich talii.

```sql
CREATE POLICY "Users can view cards from their own decks"
ON cards FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM decks
    WHERE decks.id = cards.deck_id
    AND decks.user_id = auth.uid()
    AND decks.deleted_at IS NULL
  )
  AND cards.deleted_at IS NULL
);
```

#### INSERT (tworzenie)
Użytkownik może dodawać karty tylko do swoich talii w statusie `draft`.

```sql
CREATE POLICY "Users can insert cards into their draft decks"
ON cards FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM decks
    WHERE decks.id = cards.deck_id
    AND decks.user_id = auth.uid()
    AND decks.status = 'draft'
    AND decks.deleted_at IS NULL
  )
  AND cards.deleted_at IS NULL
);
```

#### UPDATE (edycja)
Użytkownik może edytować karty tylko w swoich taliach w statusie `draft`.

```sql
CREATE POLICY "Users can update cards in their draft decks"
ON cards FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM decks
    WHERE decks.id = cards.deck_id
    AND decks.user_id = auth.uid()
    AND decks.status = 'draft'
    AND decks.deleted_at IS NULL
  )
  AND cards.deleted_at IS NULL
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM decks
    WHERE decks.id = cards.deck_id
    AND decks.user_id = auth.uid()
    AND decks.status = 'draft'
    AND decks.deleted_at IS NULL
  )
  AND cards.deleted_at IS NULL
);
```

#### DELETE (soft-delete)
Użytkownik może usuwać (soft-delete) karty tylko w swoich taliach w statusie `draft`.

```sql
CREATE POLICY "Users can soft-delete cards in their draft decks"
ON cards FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM decks
    WHERE decks.id = cards.deck_id
    AND decks.user_id = auth.uid()
    AND decks.status = 'draft'
    AND decks.deleted_at IS NULL
  )
  AND cards.deleted_at IS NULL
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM decks
    WHERE decks.id = cards.deck_id
    AND decks.user_id = auth.uid()
    AND decks.status = 'draft'
  )
  AND cards.deleted_at IS NOT NULL
);
```

---

### 4.4 Polityki dla tabeli `generation_sessions`

#### SELECT (odczyt)
Użytkownik może odczytać swoje sesje generacji.

```sql
CREATE POLICY "Users can view their own generation sessions"
ON generation_sessions FOR SELECT
USING (user_id = auth.uid());
```

#### INSERT (tworzenie)
Tylko service role lub aplikacja może tworzyć sesje generacji (brak publicznej polityki INSERT dla użytkowników).

```sql
-- Brak polityki INSERT dla auth.uid()
-- Sesje tworzone przez backend z service role
```

#### UPDATE (edycja)
Tylko service role może aktualizować sesje generacji (zmiana statusu, error, itp.).

```sql
-- Brak polityki UPDATE dla auth.uid()
-- Aktualizacje przez backend z service role
```

---

## 5. Funkcje i Triggery

### 5.1 Trigger: Automatyczna aktualizacja `updated_at`

Automatycznie aktualizuje kolumnę `updated_at` przy każdej modyfikacji rekordu.

```sql
-- Funkcja triggerowa
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggery dla poszczególnych tabel
CREATE TRIGGER set_updated_at_decks
BEFORE UPDATE ON decks
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_cards
BEFORE UPDATE ON cards
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_generation_sessions
BEFORE UPDATE ON generation_sessions
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
```

---

### 5.2 Trigger: Automatyczna generacja slug z nazwy talii

Generuje slug URL-friendly z nazwy talii przy tworzeniu i aktualizacji.

```sql
-- Funkcja pomocnicza do generowania slug
CREATE OR REPLACE FUNCTION slugify(text_input TEXT)
RETURNS TEXT AS $$
DECLARE
  result TEXT;
BEGIN
  result := LOWER(TRIM(text_input));
  result := REGEXP_REPLACE(result, '[^a-z0-9\s-]', '', 'g');
  result := REGEXP_REPLACE(result, '[\s-]+', '-', 'g');
  result := TRIM(BOTH '-' FROM result);
  RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Funkcja triggerowa
CREATE OR REPLACE FUNCTION generate_deck_slug()
RETURNS TRIGGER AS $$
BEGIN
  NEW.slug := slugify(NEW.name);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger
CREATE TRIGGER set_deck_slug
BEFORE INSERT OR UPDATE OF name ON decks
FOR EACH ROW
EXECUTE FUNCTION generate_deck_slug();
```

---

### 5.3 Trigger: Kaskadowy soft-delete kart przy usunięciu talii

Automatycznie ustawia `deleted_at` na kartach, gdy talia jest usuwana (soft-delete).

```sql
CREATE OR REPLACE FUNCTION soft_delete_deck_cards()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    UPDATE cards
    SET deleted_at = NEW.deleted_at
    WHERE deck_id = NEW.id
    AND deleted_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cascade_soft_delete_cards
AFTER UPDATE OF deleted_at ON decks
FOR EACH ROW
WHEN (NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL)
EXECUTE FUNCTION soft_delete_deck_cards();
```

---

### 5.4 Funkcja RPC: Publikacja talii (SECURITY DEFINER)

Funkcja atomowo publikuje talię z walidacjami i blokadą transakcyjną.

```sql
CREATE OR REPLACE FUNCTION publish_deck(deck_id_param UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deck_record RECORD;
  card_count INTEGER;
  result JSONB;
BEGIN
  -- Blokada transakcyjna na talii
  PERFORM pg_advisory_xact_lock(hashtext(deck_id_param::TEXT));

  -- Pobranie talii z blokadą
  SELECT * INTO deck_record
  FROM decks
  WHERE id = deck_id_param
  FOR UPDATE;

  -- Walidacja: talia istnieje
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'deck_not_found'
    );
  END IF;

  -- Walidacja: użytkownik jest właścicielem
  IF deck_record.user_id != auth.uid() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'unauthorized'
    );
  END IF;

  -- Walidacja: talia jest w statusie draft
  IF deck_record.status != 'draft' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'deck_not_draft'
    );
  END IF;

  -- Walidacja: talia nie jest usunięta
  IF deck_record.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'deck_deleted'
    );
  END IF;

  -- Zliczenie aktywnych kart
  SELECT COUNT(*) INTO card_count
  FROM cards
  WHERE deck_id = deck_id_param
  AND deleted_at IS NULL;

  -- Walidacja: talia ma od 1 do 20 kart
  IF card_count < 1 OR card_count > 20 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'invalid_card_count',
      'card_count', card_count
    );
  END IF;

  -- Usuń karty poza top 20 (wg position)
  DELETE FROM cards
  WHERE deck_id = deck_id_param
  AND deleted_at IS NULL
  AND position > (
    SELECT position
    FROM cards
    WHERE deck_id = deck_id_param
    AND deleted_at IS NULL
    ORDER BY position ASC
    LIMIT 1 OFFSET 19
  );

  -- Publikacja talii
  UPDATE decks
  SET
    status = 'published',
    published_at = NOW(),
    updated_at = NOW()
  WHERE id = deck_id_param;

  RETURN jsonb_build_object(
    'success', true,
    'deck_id', deck_id_param
  );
END;
$$;

-- Przyznaj uprawnienia wykonania
GRANT EXECUTE ON FUNCTION publish_deck(UUID) TO authenticated;
```

---

### 5.5 Funkcja RPC: Odrzucenie talii (SECURITY DEFINER)

Funkcja atomowo odrzuca talię z opcjonalnym powodem.

```sql
CREATE OR REPLACE FUNCTION reject_deck(
  deck_id_param UUID,
  reason_param TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deck_record RECORD;
BEGIN
  -- Blokada transakcyjna na talii
  PERFORM pg_advisory_xact_lock(hashtext(deck_id_param::TEXT));

  -- Pobranie talii z blokadą
  SELECT * INTO deck_record
  FROM decks
  WHERE id = deck_id_param
  FOR UPDATE;

  -- Walidacja: talia istnieje
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'deck_not_found'
    );
  END IF;

  -- Walidacja: użytkownik jest właścicielem
  IF deck_record.user_id != auth.uid() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'unauthorized'
    );
  END IF;

  -- Walidacja: talia jest w statusie draft
  IF deck_record.status != 'draft' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'deck_not_draft'
    );
  END IF;

  -- Odrzucenie talii
  UPDATE decks
  SET
    status = 'rejected',
    rejected_at = NOW(),
    rejected_reason = reason_param,
    updated_at = NOW()
  WHERE id = deck_id_param;

  RETURN jsonb_build_object(
    'success', true,
    'deck_id', deck_id_param
  );
END;
$$;

-- Przyznaj uprawnienia wykonania
GRANT EXECUTE ON FUNCTION reject_deck(UUID, TEXT) TO authenticated;
```

---

## 6. Dodatkowe uwagi i decyzje projektowe

### 6.1 Unikalność nazw talii

- Nazwa talii musi być unikalna per użytkownik (case-insensitive przez CITEXT)
- Unikalność jest wymuszana tylko dla nieusunietych talii (partial unique index)
- Po soft-delete nazwa może być ponownie użyta przez tego samego użytkownika

### 6.2 Soft-delete vs. Hard-delete

**Soft-delete (MVP):**
- Wszystkie usunięcia użytkownika używają `deleted_at`
- Karty są kaskadowo oznaczane jako usunięte, gdy talia jest usuwana
- Nieusunięte rekordy filtrowane przez `WHERE deleted_at IS NULL`

**Hard-delete (po MVP):**
- Karty poza top 20 przy publikacji: obecnie hard-delete (DELETE FROM)
- Rozważyć zmianę na soft-delete dla celów audytu
- Cron job do czyszczenia starych soft-deleted rekordów (retencja do ustalenia)

### 6.3 Pozycje kart (`position`)

- Pozycje numerowane od 1 (CHECK position > 0)
- Unikalność wymuszana w obrębie talii (partial unique index)
- Normalizacja pozycji (usuwanie luk) wykonywana przez logikę aplikacji, nie trigger
- Przy publikacji brane są pierwsze 20 kart wg `position ASC`

### 6.4 Publikacja talii

**Proces:**
1. Walidacja własności, statusu (draft), liczby kart (1-20)
2. Blokada transakcyjna (`pg_advisory_xact_lock`) zapobiega race conditions
3. Hard-delete kart poza top 20 wg `position`
4. Zmiana statusu na `published`, ustawienie `published_at`
5. Po publikacji talia i karty są read-only (wymuszane przez RLS)

### 6.5 Generacja AI

**Workflow:**
1. Backend tworzy rekord `generation_sessions` z `status = 'in_progress'`
2. Częściowy unikalny indeks zapewnia, że użytkownik ma max 1 aktywną sesję
3. Tekst wejściowy sanityzowany i zapisany w `sanitized_source_text` (max 10k znaków)
4. Wywołanie OpenRouter z timeoutem 5 minut
5. Jeśli LLM zwróci >20 kart, przycięcie do 20 i zapis `truncated_count`
6. Zmiana statusu na `completed`, `failed` lub `timeout`
7. Relacja 1:1 z `decks` przez UNIQUE constraint na `deck_id`

### 6.6 Skalowanie i wydajność

**Indeksy:**
- Wszystkie częste zapytania mają dedykowane indeksy
- Częściowe indeksy (`WHERE deleted_at IS NULL`) redukują rozmiar i poprawiają wydajność
- Indeksy na JSONB (`params`, `metadata`) mogą być dodane w przyszłości przy potrzebie

**Partycjonowanie:**
- Nie jest wymagane w MVP (przewidywane wolumeny umiarkowane)
- Rozważyć partycjonowanie `generation_sessions` po dacie przy >100k rekordów/miesiąc

### 6.7 Bezpieczeństwo

**RLS:**
- Włączone na wszystkich tabelach użytkownika
- Strategia deny-by-default: brak dostępu bez jawnej polityki
- Polityki oparte na `auth.uid()` (JWT z Supabase)
