# API Endpoint Implementation Plan: Cards Management

## 1. Przegląd punktów końcowych

### GET /api/decks/:deckId/cards
Zwraca paginowaną listę kart z talii. Karty sortowane według `position ASC`, filtrowane przez soft-delete. RLS zapewnia dostęp tylko do własnych talii.

### POST /api/decks/:deckId/cards
Dodaje nową kartę do draft deck. Waliduje długość pól (1-200 chars), sprawdza limit (max 20 kart), weryfikuje status talii (draft only), zapewnia unikalność pozycji.

---

## 2. Szczegóły żądań

### GET /api/decks/:deckId/cards

- **Metoda:** GET
- **URL:** `/api/decks/:deckId/cards`
- **Path params:** `deckId` (UUID, required)
- **Query params:** `limit` (1-100, default 100), `offset` (≥0, default 0)
- **Headers:** `Authorization: Bearer <jwt_token>`

### POST /api/decks/:deckId/cards

- **Metoda:** POST
- **URL:** `/api/decks/:deckId/cards`
- **Path params:** `deckId` (UUID, required)
- **Headers:** `Authorization: Bearer <jwt_token>`, `Content-Type: application/json`
- **Body:**
  - `front` (string, 1-200 chars, required)
  - `back` (string, 1-200 chars, required)
  - `position` (integer, >0, required)
  - `hint` (string, max 200 chars, optional)

---

## 3. Wykorzystywane typy

### DTOs (z src/types.ts)
- `CardDTO` - reprezentacja karty (bez deleted_at)
- `PaginatedCardsResponseDTO` - odpowiedź GET z paginacją
- `CreateCardCommand` - dane wejściowe POST
- `ValidationErrorResponseDTO` - błędy walidacji
- `CardLimitErrorResponseDTO` - przekroczenie limitu
- `DeckNotEditableErrorResponseDTO` - talia nie draft
- `ApiErrorResponseDTO` - bazowy typ błędu

---

## 4. Szczegóły odpowiedzi

### GET - Success (200)
```json
{
  "data": [
    {
      "id": "uuid",
      "deck_id": "uuid",
      "front": "string",
      "back": "string",
      "position": 1,
      "hint": "string | null",
      "is_active": true,
      "locale": "pl | null",
      "metadata": {},
      "created_at": "ISO8601",
      "updated_at": "ISO8601"
    }
  ],
  "pagination": {
    "limit": 100,
    "offset": 0,
    "total": 20
  }
}
```

### POST - Success (201)
```json
{
  "id": "uuid",
  "deck_id": "uuid",
  "front": "string",
  "back": "string",
  "position": 1,
  "hint": "string | null",
  "is_active": true,
  "locale": null,
  "metadata": {},
  "created_at": "ISO8601",
  "updated_at": "ISO8601"
}
```

### Error Responses

| Status | Error Code | Scenariusz |
|--------|------------|------------|
| 400 | validation_error | Nieprawidłowe dane wejściowe |
| 400 | card_limit_reached | Deck ma już 20 kart |
| 400 | deck_not_editable | Deck nie jest draft |
| 401 | unauthorized | Brak/nieprawidłowy JWT |
| 404 | deck_not_found | Deck nie istnieje lub brak dostępu |
| 409 | position_conflict | Position już zajęta |
| 500 | internal_error | Błąd serwera |

---

## 5. Przepływ danych

### GET Flow
```
Request → Middleware (JWT) → Validate params (Zod) 
→ CardService.getCardsByDeckId() 
→ DB: COUNT + SELECT (RLS filters) 
→ Map to CardDTO[] 
→ Build PaginatedCardsResponseDTO 
→ Response 200
```

### POST Flow
```
Request → Middleware (JWT) → Validate body (Zod) 
→ CardService.createCard()
  → getDeckById() (check ownership + status)
  → getCardCount() (check limit < 20)
  → getNextPosition() (if position not provided)
  → INSERT card (RLS + DB constraints)
→ Map to CardDTO 
→ Response 201
```

**DB Queries:**
- GET: 2 queries (COUNT + SELECT)
- POST: 3-4 queries (SELECT deck, COUNT cards, optional MAX position, INSERT card)

**Indexes used:**
- `idx_cards_deck_id_position` (ORDER BY optimization)
- `idx_cards_deck_position_unique` (uniqueness enforcement)

---

## 6. Względy bezpieczeństwa

### Authentication
- JWT token w `Authorization: Bearer <token>` header
- Middleware weryfikuje przez Supabase client
- Brak tokenu → 401 Unauthorized

### Authorization
- RLS włączone na `decks` i `cards` tables
- Policies:
  - GET: "Users can view cards from their own decks"
  - POST: "Users can insert cards into their draft decks"
- Weryfikacja ownership przez RLS (nie w app logic)
- 404 zamiast 403 (nie ujawniać istnienia zasobów)

### Input Validation

**Zod Schemas (`src/lib/schemas/card.schema.ts`):**
```typescript
// Query params
getCardsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(100),
  offset: z.coerce.number().int().min(0).default(0)
});

// Path params
deckIdParamSchema = z.object({
  deckId: z.string().uuid()
});

// Request body
createCardSchema = z.object({
  front: z.string().min(1).max(200),
  back: z.string().min(1).max(200),
  position: z.number().int().min(1),
  hint: z.string().max(200).optional()
});
```

**Multi-layer validation:**
1. Zod schemas (type, format, length)
2. DB constraints (CHECK char_length)
3. Business logic (card limit, deck status)

### Attack Prevention
- **SQL Injection:** Parametryzowane zapytania (Supabase client)
- **XSS:** Frontend escape (React auto-escaping)
- **CSRF:** JWT w header (nie cookies)
- **Race Conditions:** DB unique constraint + retry logic
- **Info Disclosure:** Generyczne komunikaty błędów

---

## 7. Obsługa błędów

### Error Hierarchy
1. Zod validation → 400 validation_error
2. Business logic → 400 specific error
3. RLS/Authorization → 404 deck_not_found
4. DB constraints → 409 position_conflict
5. Unexpected → 500 internal_error

### Error Response Factory
**Plik:** `src/lib/utils/error-response.ts`
```typescript
export function createErrorResponse(
  status: number,
  error: string,
  message: string,
  details?: unknown
) {
  return new Response(
    JSON.stringify({ error, message, ...(details && { details }) }),
    { status, headers: { "Content-Type": "application/json" } }
  );
}
```

### Logging Strategy
- **Console (MVP):** Log 500 errors i 409 conflicts
- **Nie logować:** 400/401/404 (expected errors)
- **Później:** Sentry integration, request ID tracking

---

## 8. Rozważania dotyczące wydajności

### Query Optimization
- Wykorzystanie indeksów: `idx_cards_deck_id_position`, `idx_cards_deck_position_unique`
- Partial indexes (`WHERE deleted_at IS NULL`) dla mniejszego rozmiaru
- Osobne COUNT i SELECT (nie subquery)
- LIMIT/OFFSET pagination

### Bottlenecks
- **GET:** 2 queries (niski impact, max 20 kart)
- **POST:** 3-4 queries (można zoptymalizować JOIN dla getDeckById + getCardCount)
- **Position conflicts:** Rzadkie (frontend auto-increment)

### Caching
- **Nie w MVP:** Karty często edytowane (draft mode)
- **Później:** Cache dla published decks (read-only)

---

## 9. Etapy wdrożenia

### Krok 1: Zod Schemas
**Plik:** `src/lib/schemas/card.schema.ts`

Utworzyć:
- `getCardsQuerySchema` (limit, offset validation)
- `deckIdParamSchema` (UUID validation)
- `createCardSchema` (front, back, position, hint validation)

**Walidacja:** `npm run typecheck`

---

### Krok 2: Card Service
**Plik:** `src/lib/services/card.service.ts`

Implementować funkcje:

**a) `getCardsByDeckId(supabase, deckId, limit, offset)`**
- COUNT cards WHERE deck_id AND deleted_at IS NULL
- SELECT cards ORDER BY position LIMIT/OFFSET
- Map CardEntity → CardDTO
- Return { cards, total }

**b) `getCardCount(supabase, deckId)`**
- COUNT cards WHERE deck_id AND deleted_at IS NULL
- Return count

**c) `getNextPosition(supabase, deckId)`**
- SELECT MAX(position) WHERE deck_id AND deleted_at IS NULL
- Return max + 1 (lub 1)

**d) `createCard(supabase, deckId, userId, cardData)`**
- getDeckById() → check status === 'draft'
- getCardCount() → check count < 20
- If no position → getNextPosition()
- INSERT card
- Handle unique constraint (position conflict)
- Map CardEntity → CardDTO

**Error handling:**
- Throw specific errors: 'deck_not_found', 'deck_not_editable', 'card_limit_reached', 'position_conflict'

**Walidacja:** Unit tests z mock Supabase

---

### Krok 3: GET Endpoint
**Plik:** `src/pages/api/decks/[deckId]/cards.ts`

```typescript
export const prerender = false;

export const GET: APIRoute = async (context) => {
  // 1. Get supabase, user from context.locals
  // 2. Check user authentication → 401
  // 3. Validate deckId (Zod)
  // 4. Validate query params (Zod)
  // 5. Try-catch:
  //    - getCardsByDeckId()
  //    - Build PaginatedCardsResponseDTO
  //    - Return 200
  // 6. Catch errors → 400/404/500
};
```

**Walidacja:** 
- Test z curl/Postman
- Sprawdzić RLS filtering
- Test paginacji

---

### Krok 4: POST Endpoint
**Plik:** `src/pages/api/decks/[deckId]/cards.ts` (ten sam)

```typescript
export const POST: APIRoute = async (context) => {
  // 1. Get supabase, user from context.locals
  // 2. Check user authentication → 401
  // 3. Validate deckId (Zod)
  // 4. Parse & validate body (Zod)
  // 5. Try-catch:
  //    - createCard()
  //    - Return 201 with CardDTO
  // 6. Catch specific errors:
  //    - deck_not_found → 404
  //    - deck_not_editable → 400
  //    - card_limit_reached → 400
  //    - position_conflict → 409
  //    - Other → 500
};
```

**Walidacja:**
- Test tworzenia karty
- Test limitu 20 kart
- Test draft status enforcement
- Test position conflict
- Test auto-position assignment

---

### Krok 5: Error Response Utility
**Plik:** `src/lib/utils/error-response.ts`

Implementować `createErrorResponse()` helper dla spójnych odpowiedzi błędów.

**Walidacja:** Użyć w endpointach, sprawdzić format JSON

---

### Krok 6: Integration Tests
**Scenariusze testowe:**

**GET:**
- ✓ Pobierz karty z własnej talii
- ✓ Paginacja (limit, offset)
- ✓ 404 dla cudzej talii
- ✓ 401 bez tokenu
- ✓ 400 dla nieprawidłowych params

**POST:**
- ✓ Utwórz kartę w draft deck
- ✓ 400 dla przekroczenia limitu (20 kart)
- ✓ 400 dla published deck
- ✓ 409 dla duplikatu position
- ✓ Auto-assign position
- ✓ 404 dla cudzej talii
- ✓ 401 bez tokenu
- ✓ 400 dla walidacji (front/back length)

---

### Krok 7: Documentation
- Zaktualizować API docs
- Dodać przykłady curl
- Dokumentować error codes
- Dodać TypeScript examples

---

## 10. Checklist wdrożenia

- [ ] Utworzyć `src/lib/schemas/card.schema.ts`
- [ ] Utworzyć `src/lib/services/card.service.ts`
- [ ] Utworzyć `src/lib/utils/error-response.ts`
- [ ] Implementować GET endpoint
- [ ] Implementować POST endpoint
- [ ] Unit tests dla service
- [ ] Integration tests dla endpoints
- [ ] Sprawdzić RLS policies działają
- [ ] Sprawdzić DB constraints działają
- [ ] Test performance (query execution time)
- [ ] Code review
- [ ] Update documentation
- [ ] Deploy do staging
- [ ] Smoke tests na staging
- [ ] Deploy do production

---

## 11. Potencjalne problemy i rozwiązania

| Problem | Rozwiązanie |
|---------|-------------|
| Position conflicts przy concurrent inserts | DB unique constraint + 409 response + retry w kliencie |
| Wiele zapytań w POST (performance) | Zoptymalizować JOIN dla getDeckById + getCardCount |
| RLS overhead | Indeksy już zoptymalizowane, monitoring query time |
| Auto-position race condition | Transakcja DB lub advisory lock (później) |
| Limit 20 kart - co z istniejącymi >20? | Publish endpoint przycina do 20, GET zwraca wszystkie |

---

## 12. Notatki implementacyjne

- Używać `context.locals.supabase` (nie import supabaseClient)
- Używać `SupabaseClient` type z `src/db/supabase.client.ts`
- Wszystkie endpointy: `export const prerender = false`
- HTTP methods uppercase: `GET`, `POST`
- Zod validation przed business logic
- RLS policies enforcement automatyczny (nie sprawdzać w kodzie)
- Mapować CardEntity → CardDTO (omit deleted_at)
- Generyczne error messages (nie ujawniać DB details)
- Console.error tylko dla 500 errors
