# API Endpoint Implementation Plan: DELETE /api/decks/:deckId

## 1. Przegląd punktu końcowego

Endpoint służy do miękkiego usunięcia (soft-delete) talii fiszek. Operacja ustawia timestamp `deleted_at` na talii, a trigger bazy danych automatycznie kaskadowo usuwa wszystkie karty należące do talii. Usunięte talie są wykluczane ze wszystkich zapytań listujących i szczegółowych.

**Kluczowe cechy:**
- Soft-delete (zachowanie danych z możliwością odzyskania)
- Automatyczne kaskadowe usunięcie kart przez trigger DB
- Wymaga uwierzytelnienia JWT
- Weryfikacja własności przez RLS
- Brak treści odpowiedzi (204 No Content)

## 2. Szczegóły żądania

### Metoda HTTP
`DELETE`

### Struktura URL
```
/api/decks/:deckId
```

### Parametry

**Path Parameters:**
- `deckId` (wymagany): UUID talii do usunięcia
  - Format: UUID v4
  - Walidacja: regex UUID lub biblioteka walidacyjna

**Request Headers:**
```
Authorization: Bearer <jwt_token>
```

**Request Body:**
Brak - endpoint nie przyjmuje treści żądania

## 3. Wykorzystywane typy

### Typy z src/types.ts
Endpoint nie wymaga dedykowanych DTO ani Command Models, ponieważ:
- Nie przyjmuje request body
- Zwraca 204 No Content (brak response body)
- Operuje tylko na parametrze ścieżki (deckId)

### Typy wewnętrzne
```typescript
// Walidacja parametru ścieżki (Zod schema)
const DeleteDeckParamsSchema = z.object({
  deckId: z.string().uuid({ message: "Invalid deck ID format" })
});
```

## 4. Szczegóły odpowiedzi

### Sukces (204 No Content)
```
Status: 204 No Content
Headers: (brak specjalnych nagłówków)
Body: (brak treści)
```

### Błędy

**401 Unauthorized**
```json
{
  "error": "unauthorized",
  "message": "Authentication required"
}
```

**404 Not Found**
```json
{
  "error": "deck_not_found",
  "message": "Deck not found or already deleted"
}
```

**500 Internal Server Error**
```json
{
  "error": "internal_server_error",
  "message": "An unexpected error occurred"
}
```

## 5. Przepływ danych

### Diagram przepływu
```
1. Client → DELETE /api/decks/:deckId + JWT
2. Astro Endpoint → Walidacja parametru deckId (Zod)
3. Astro Endpoint → Pobranie supabase z context.locals
4. Astro Endpoint → Wywołanie DeckService.softDeleteDeck(deckId, userId)
5. DeckService → Supabase UPDATE decks SET deleted_at = NOW() WHERE id = deckId
6. Supabase RLS → Weryfikacja user_id = auth.uid() AND deleted_at IS NULL
7. Supabase Trigger → Kaskadowe ustawienie deleted_at na cards
8. DeckService → Zwrot sukcesu lub błędu
9. Astro Endpoint → Zwrot 204 No Content lub odpowiedni kod błędu
10. Client ← Odpowiedź
```

### Interakcje z bazą danych

**Query wykonywane przez Supabase Client:**
```typescript
const { error } = await supabase
  .from('decks')
  .update({ deleted_at: new Date().toISOString() })
  .eq('id', deckId)
  .is('deleted_at', null)
  .single();
```

**RLS Policy (automatyczna weryfikacja):**
```sql
CREATE POLICY "Users can soft-delete their own decks"
ON decks FOR UPDATE
USING (user_id = auth.uid() AND deleted_at IS NULL)
WITH CHECK (user_id = auth.uid() AND deleted_at IS NOT NULL);
```

**Trigger (automatyczne kaskadowanie):**
```sql
CREATE TRIGGER cascade_soft_delete_cards
AFTER UPDATE OF deleted_at ON decks
FOR EACH ROW
WHEN (NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL)
EXECUTE FUNCTION soft_delete_deck_cards();
```

## 6. Względy bezpieczeństwa

### Uwierzytelnianie
- **JWT Token**: Wymagany w nagłówku `Authorization: Bearer <token>`
- **Middleware**: Astro middleware weryfikuje token i ustawia `context.locals.user`
- **Brak tokena**: Zwrot 401 Unauthorized przed wykonaniem logiki endpointu

### Autoryzacja
- **RLS Policy**: Automatyczna weryfikacja własności na poziomie bazy danych
- **Warunek USING**: `user_id = auth.uid() AND deleted_at IS NULL`
- **Ochrona przed race conditions**: RLS działa na poziomie transakcji

### Walidacja danych
- **UUID Format**: Walidacja formatu UUID za pomocą Zod przed zapytaniem DB
- **SQL Injection**: Supabase Client używa parametryzowanych zapytań
- **Soft-delete check**: Warunek `.is('deleted_at', null)` zapobiega podwójnemu usunięciu

### Ochrona danych
- **Soft-delete**: Dane nie są fizycznie usuwane, możliwość odzyskania
- **Kaskadowanie**: Trigger zapewnia spójność (karty również usuwane)
- **Atomowość**: Operacja wykonywana w transakcji (UPDATE + trigger)

### Minimalizacja ekspozycji informacji
- **Generyczne błędy**: Nie ujawnianie szczegółów technicznych w odpowiedziach
- **404 dla wielu przypadków**: Talia nie istnieje, już usunięta, lub nie należy do użytkownika
- **Brak szczegółów w logach publicznych**: Wrażliwe informacje tylko w logach serwera

## 7. Obsługa błędów

### Scenariusze błędów i odpowiedzi

#### 1. Brak tokena JWT lub token nieprawidłowy
**Status:** 401 Unauthorized
**Odpowiedź:**
```json
{
  "error": "unauthorized",
  "message": "Authentication required"
}
```
**Obsługa:** Middleware Astro zwraca błąd przed wywołaniem endpointu

#### 2. Nieprawidłowy format UUID
**Status:** 400 Bad Request
**Odpowiedź:**
```json
{
  "error": "validation_error",
  "message": "Invalid deck ID format"
}
```
**Obsługa:** Walidacja Zod w endpoincie, zwrot błędu przed zapytaniem DB

#### 3. Talia nie istnieje lub już usunięta
**Status:** 404 Not Found
**Odpowiedź:**
```json
{
  "error": "deck_not_found",
  "message": "Deck not found or already deleted"
}
```
**Obsługa:** Supabase zwraca 0 zmodyfikowanych wierszy, endpoint interpretuje jako 404

**Uwaga bezpieczeństwa:** Nie rozróżniamy przypadków "nie istnieje" vs "nie należy do Ciebie" aby nie ujawniać informacji o istnieniu zasobów innych użytkowników.

#### 4. Błąd bazy danych
**Status:** 500 Internal Server Error
**Odpowiedź:**
```json
{
  "error": "internal_server_error",
  "message": "An unexpected error occurred"
}
```
**Obsługa:** 
- Logowanie pełnych szczegółów błędu na serwerze
- Zwrot generycznego komunikatu do klienta
- Monitoring i alerty dla błędów 500

## 8. Rozważania dotyczące wydajności

### Optymalizacje zapytań

**Indeksy wykorzystywane:**
- Primary Key na `decks.id` (automatyczny)
- Index na `decks.user_id` (z `idx_decks_user_id_status_updated`)
- Partial index wykluczający `deleted_at IS NULL`

**Wydajność operacji:**
- UPDATE pojedynczego wiersza: O(1) dzięki PK lookup
- RLS check: O(1) - porównanie `user_id`
- Trigger kaskadowy: O(n) gdzie n = liczba kart (max 20 w MVP)

### Potencjalne wąskie gardła

**1. Trigger kaskadowy**
- **Problem:** UPDATE wielu kart w jednej transakcji
- **Mitigacja:** Limit 20 kart per talia (wymuszony przy publikacji)
- **Monitoring:** Czas wykonania triggera w logach DB

**2. Blokady transakcyjne**
- **Problem:** Równoczesne operacje na tej samej talii
- **Mitigacja:** RLS i transakcje Postgres zapewniają izolację
- **Uwaga:** Soft-delete jest operacją rzadką (użytkownik usuwa talię)

### Monitoring i metryki

**Kluczowe metryki do śledzenia:**
- Czas odpowiedzi endpointu (p50, p95, p99)
- Liczba błędów 404 vs 500
- Czas wykonania triggera `cascade_soft_delete_cards`
- Liczba usuniętych talii per użytkownik/dzień

**Alerty:**
- Wzrost błędów 500 powyżej progu (np. >1% requestów)
- Czas odpowiedzi >1s (p95)
- Błędy połączenia do bazy danych

## 9. Etapy wdrożenia

### Krok 1: Przygotowanie walidacji
**Plik:** `src/lib/schemas/deck.schema.ts`

Utworzyć schema Zod dla walidacji parametru ścieżki:
```typescript
import { z } from 'zod';

export const DeleteDeckParamsSchema = z.object({
  deckId: z.string().uuid({ message: "Invalid deck ID format" })
});
```

### Krok 2: Implementacja metody serwisu
**Plik:** `src/lib/services/deck.service.ts`

Dodać metodę `softDeleteDeck` do istniejącego serwisu lub utworzyć nowy:
- Przyjmuje `deckId` i `userId` jako parametry
- Wykonuje UPDATE z ustawieniem `deleted_at`
- Weryfikuje czy operacja zakończyła się sukcesem (count > 0)
- Loguje operację i błędy
- Rzuca wyjątek z kodem `DECK_NOT_FOUND` jeśli talia nie istnieje

### Krok 3: Utworzenie endpointu Astro
**Plik:** `src/pages/api/decks/[deckId].ts`

Implementacja endpointu DELETE:
1. Sprawdzenie uwierzytelnienia (`context.locals.user`)
2. Walidacja parametru `deckId` za pomocą Zod
3. Pobranie klienta Supabase z `context.locals.supabase`
4. Wywołanie `deckService.softDeleteDeck()`
5. Obsługa odpowiedzi:
   - Sukces → 204 No Content
   - DECK_NOT_FOUND → 404 Not Found
   - Inne błędy → 500 Internal Server Error

### Krok 4: Testowanie manualne

**Test 1: Sukces (204)**
```bash
curl -X DELETE "http://localhost:4321/api/decks/{deck-id}" \
  -H "Authorization: Bearer {token}"
```

**Test 2: Brak autoryzacji (401)**
```bash
curl -X DELETE "http://localhost:4321/api/decks/{deck-id}"
```

**Test 3: Nieprawidłowy UUID (400)**
```bash
curl -X DELETE "http://localhost:4321/api/decks/invalid-uuid" \
  -H "Authorization: Bearer {token}"
```

**Test 4: Talia nie istnieje (404)**
```bash
curl -X DELETE "http://localhost:4321/api/decks/00000000-0000-0000-0000-000000000000" \
  -H "Authorization: Bearer {token}"
```

**Test 5: Weryfikacja kaskadowego usunięcia**
Sprawdzić w bazie danych czy karty również mają ustawione `deleted_at`:
```sql
SELECT id, deleted_at FROM cards WHERE deck_id = '{deck-id}';
```

### Krok 5: Weryfikacja RLS i triggerów

**Test RLS:**
- Utworzyć talię jako użytkownik A
- Spróbować usunąć jako użytkownik B
- Oczekiwany wynik: 404 (RLS blokuje dostęp)

**Test triggera:**
- Sprawdzić liczbę kart przed usunięciem
- Usunąć talię
- Sprawdzić czy wszystkie karty mają `deleted_at`

### Krok 6: Finalizacja

**Checklist:**
- [ ] Kod przechodzi `npm run typecheck`
- [ ] Kod przechodzi `npm run lint`
- [ ] Wszystkie testy manualne zakończone sukcesem
- [ ] RLS policy działa poprawnie
- [ ] Trigger kaskadowy działa poprawnie
- [ ] Logowanie błędów działa poprawnie
- [ ] Code review przeprowadzony
