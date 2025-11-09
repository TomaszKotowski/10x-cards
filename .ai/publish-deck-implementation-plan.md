# API Endpoint Implementation Plan: POST /api/decks/:deckId/publish

## 1. Przegląd punktu końcowego

Endpoint publikuje talię fiszek w operacji atomowej typu all-or-nothing. Publikacja jest nieodwracalna - po opublikowaniu talia i jej karty stają się read-only. Endpoint wykonuje kompleksowe walidacje biznesowe, usuwa nadmiarowe karty (>20) i aktualizuje status talii na `published` z timestampem publikacji.

**Kluczowe cechy:**
- Operacja atomowa z blokadą transakcyjną (advisory lock)
- Walidacja liczby kart (1-20) i ich zawartości (≤200 znaków per strona)
- Hard-delete kart poza top 20 według pozycji
- Nieodwracalna zmiana statusu na `published`
- Wymuszenie read-only przez RLS policies po publikacji

## 2. Szczegóły żądania

### Metoda HTTP
`POST`

### Struktura URL
```
/api/decks/:deckId/publish
```

### Parametry

**Path Parameters:**
- `deckId` (wymagany): UUID talii do publikacji
  - Format: UUID v4
  - Walidacja: Zod schema `z.string().uuid()`

**Request Headers:**
- `Authorization` (wymagany): Bearer token JWT
  - Format: `Bearer <jwt_token>`
  - Walidacja: Middleware Astro weryfikuje token przez Supabase Auth

**Request Body:**
- Brak (endpoint nie przyjmuje body)

### Przykład żądania

```http
POST /api/decks/550e8400-e29b-41d4-a716-446655440000/publish HTTP/1.1
Host: api.10x-cards.com
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json
```

## 3. Wykorzystywane typy

### DTOs (z src/types.ts)

**Success Response:**
```typescript
PublishDeckSuccessResponseDTO {
  success: true;
  deck_id: string;
}
```

**Error Responses:**
```typescript
PublishDeckErrorResponseDTO {
  success: false;
  error: "invalid_card_count" | "deck_not_draft" | "validation_failed";
  message: string;
  card_count?: number;
  validation_errors?: CardValidationErrorDetailDTO[];
}

CardValidationErrorDetailDTO {
  card_id: string;
  field: string;
  error: string;
  current_length: number;
  max_length: number;
}

ApiErrorResponseDTO {
  error: string;
  message: string;
}
```

### Command Models
- Brak (endpoint nie przyjmuje body)

### Typy wewnętrzne (do utworzenia w service)

```typescript
// Wynik funkcji RPC z bazy danych
interface PublishDeckRpcResult {
  success: boolean;
  error?: string;
  card_count?: number;
  deck_id?: string;
}
```

## 4. Szczegóły odpowiedzi

### 200 OK - Sukces publikacji

```json
{
  "success": true,
  "deck_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

### 400 Bad Request - Błędy walidacji

**Nieprawidłowa liczba kart:**
```json
{
  "success": false,
  "error": "invalid_card_count",
  "message": "Deck must have between 1 and 20 cards",
  "card_count": 0
}
```

**Talia nie jest w statusie draft:**
```json
{
  "success": false,
  "error": "deck_not_draft",
  "message": "Only draft decks can be published"
}
```

**Nieprawidłowy format UUID:**
```json
{
  "error": "validation_error",
  "message": "Invalid deck ID format"
}
```

### 401 Unauthorized - Brak lub nieprawidłowy token

```json
{
  "error": "unauthorized",
  "message": "Authentication required"
}
```

### 404 Not Found - Talia nie istnieje lub nie należy do użytkownika

```json
{
  "error": "deck_not_found",
  "message": "Deck not found or you don't have permission to access it"
}
```

### 500 Internal Server Error - Błąd serwera

```json
{
  "error": "internal_server_error",
  "message": "An unexpected error occurred"
}
```

## 5. Przepływ danych

### Diagram przepływu

```
Client Request
    ↓
[Astro Middleware]
    ├─→ Weryfikacja JWT token
    ├─→ Pobranie user_id z auth.uid()
    └─→ Przekazanie do endpoint handler
         ↓
[Endpoint Handler: POST /api/decks/:deckId/publish]
    ├─→ Walidacja UUID w path parameter (Zod)
    ├─→ Wywołanie DeckService.publishDeck()
    └─→ Zwrócenie odpowiedzi
         ↓
[DeckService.publishDeck()]
    ├─→ Wywołanie RPC: supabase.rpc('publish_deck', { deck_id_param })
    └─→ Obsługa wyniku RPC
         ↓
[Database RPC Function: publish_deck()]
    ├─→ pg_advisory_xact_lock (blokada transakcyjna)
    ├─→ SELECT deck FOR UPDATE (pobranie z blokadą)
    ├─→ Walidacje biznesowe
    ├─→ DELETE FROM cards WHERE position > 20
    ├─→ UPDATE decks SET status='published', published_at=NOW()
    └─→ RETURN JSONB result
         ↓
[Response Mapping]
    ├─→ Mapowanie wyniku RPC na DTO
    ├─→ Ustawienie odpowiedniego status code
    └─→ Zwrócenie JSON response do klienta
```

## 6. Względy bezpieczeństwa

### Uwierzytelnianie i autoryzacja

1. **JWT Token Validation**
   - Middleware Astro weryfikuje token przez `supabase.auth.getUser()`
   - Token musi być aktywny i nieprzeterminowany
   - Brak tokenu lub nieprawidłowy token → 401 Unauthorized

2. **Ownership Verification**
   - Funkcja RPC weryfikuje własność przez `deck_record.user_id != auth.uid()`
   - Użytkownik może publikować tylko swoje talie
   - Próba publikacji cudzej talii → 404 Not Found (nie ujawniamy istnienia)

3. **RLS Policies (później)**
   - Po wdrożeniu RLS, polityki będą wymuszać read-only na opublikowanych taliach
   - Polityka UPDATE na `decks`: `status = 'draft' AND user_id = auth.uid()`

### Walidacja danych wejściowych

1. **UUID Validation**
   - Zod schema: `z.string().uuid()` dla `deckId`
   - Zapobiega SQL injection i nieprawidłowym formatom

2. **Business Logic Validation**
   - Wszystkie walidacje wykonywane w funkcji RPC
   - Walidacje atomowe w transakcji z blokadą

### Ochrona przed atakami

1. **SQL Injection** - Parametryzowane zapytania przez RPC
2. **Race Conditions** - `pg_advisory_xact_lock` zapewnia atomowość
3. **CSRF** - Nie dotyczy API z JWT (stateless)
4. **Information Disclosure** - Komunikaty błędów generyczne

## 7. Obsługa błędów

### Hierarchia obsługi błędów

```
try {
  // 1. Walidacja UUID (Zod)
  // 2. Wywołanie DeckService
  // 3. Wywołanie RPC
  // 4. Parsowanie wyniku
} catch (ZodError) {
  // 400 Bad Request
} catch (AuthError) {
  // 401 Unauthorized
} catch (RpcError) {
  // Mapowanie błędów RPC
} catch (Error) {
  // 500 Internal Server Error
}
```

### Szczegółowe scenariusze błędów

**400 Bad Request:**
- Nieprawidłowy format UUID
- Nieprawidłowa liczba kart (RPC)
- Talia nie jest w statusie draft (RPC)
- Walidacja kart nie powiodła się (RPC)

**401 Unauthorized:**
- Brak tokenu
- Nieprawidłowy lub przeterminowany token

**404 Not Found:**
- Talia nie istnieje
- Talia należy do innego użytkownika
- Talia jest usunięta (soft-delete)

**500 Internal Server Error:**
- Błąd połączenia z bazą danych
- Błąd wykonania RPC
- Nieoczekiwany błąd

### Logowanie błędów

```typescript
// Development
console.error('[PublishDeck] Error:', error);
console.error('[PublishDeck] Context:', { deckId, userId });

// Production (później)
// Sentry.captureException(error);
```

## 8. Wydajność

### Optymalizacje bazy danych

1. **Advisory Lock** - Atomowość operacji, minimalizacja czasu blokady
2. **Indeksy** - Primary key na `decks(id)`, index na `cards(deck_id, position)`
3. **FOR UPDATE Lock** - Blokuje tylko jeden wiersz

### Potencjalne wąskie gardła

1. **Usuwanie nadmiarowych kart** - Hard delete może być kosztowne
2. **Walidacja długości kart** - Sprawdzanie dla wszystkich kart
3. **Concurrent publikacje** - Advisory lock może powodować czekanie

### Oczekiwana wydajność

- **Średni czas odpowiedzi:** 50-150ms
- **P95:** <300ms
- **P99:** <500ms
- **Timeout:** 30s (Astro default)

## 9. Etapy wdrożenia

### Krok 1: Przygotowanie środowiska i walidacja schematu DB

1. Zweryfikować, że funkcja RPC `publish_deck(UUID)` istnieje w bazie danych
2. Sprawdzić uprawnienia `GRANT EXECUTE TO authenticated`
3. Przetestować funkcję RPC ręcznie

**Weryfikacja:**
```sql
SELECT proname FROM pg_proc WHERE proname = 'publish_deck';
SELECT publish_deck('test-uuid'::UUID);
```

### Krok 2: Utworzenie Zod schema dla walidacji

**Plik:** `src/lib/schemas/deck.schema.ts`

```typescript
import { z } from "zod";

export const publishDeckParamsSchema = z.object({
  deckId: z.string().uuid({ message: "Invalid deck ID format" }),
});
```

### Krok 3: Utworzenie DeckService z metodą publishDeck

**Plik:** `src/lib/services/deck.service.ts`

**Metoda:** `publishDeck(supabase, deckId)`
- Wywołuje RPC `publish_deck`
- Obsługuje wynik i mapuje na typowane odpowiedzi
- Rzuca wyjątki dla błędów RPC

### Krok 4: Utworzenie endpoint handlera

**Plik:** `src/pages/api/decks/[deckId]/publish.ts`

**Handler POST:**
1. Sprawdza autentykację (`locals.user`)
2. Waliduje `deckId` przez Zod
3. Wywołuje `DeckService.publishDeck()`
4. Zwraca odpowiedź z odpowiednim status code

### Krok 5: Testowanie manualne

1. Test sukcesu publikacji (draft deck z 1-20 kartami)
2. Test błędu: nieprawidłowy UUID
3. Test błędu: brak autoryzacji
4. Test błędu: talia nie istnieje
5. Test błędu: talia nie jest draft
6. Test błędu: nieprawidłowa liczba kart

### Krok 6: Testowanie automatyczne (opcjonalne)

**Plik:** `src/lib/services/deck.service.test.ts`

**Test cases:**
- Sukces publikacji
- Błąd: nieprawidłowa liczba kart
- Błąd: talia nie jest draft
- Błąd: RPC failure

### Krok 7: Dokumentacja i code review

1. Dodać komentarze JSDoc do service i handlera
2. Zaktualizować dokumentację API
3. Code review przez zespół
4. Merge do main branch

### Krok 8: Deploy i monitoring

1. Deploy na środowisko staging
2. Smoke tests na staging
3. Deploy na produkcję
4. Monitoring metryk (czas odpowiedzi, error rate)
5. Alerty przy anomaliach
