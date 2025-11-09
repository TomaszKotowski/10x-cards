# API Endpoint Implementation Plan: PATCH /api/decks/:deckId

## 1. Przegląd punktu końcowego

Endpoint umożliwia aktualizację nazwy talii fiszek. Edycja jest możliwa tylko dla talii w statusie `draft`. Po zmianie nazwy, slug URL jest automatycznie regenerowany przez trigger bazodanowy. Endpoint wymusza unikalność nazw talii per użytkownik (case-insensitive) i weryfikuje własność zasobu przed modyfikacją.

**Kluczowe cechy:**
- Częściowa aktualizacja (PATCH) - tylko pole `name`
- Autoryzacja oparta na JWT token
- Weryfikacja własności zasobu (user_id)
- Ograniczenie do talii draft
- Automatyczna generacja slug przez DB trigger

## 2. Szczegóły żądania

### Metoda HTTP
`PATCH`

### Struktura URL
```
/api/decks/:deckId
```

### Parametry

**Path Parameters:**
- `deckId` (wymagany): UUID talii do aktualizacji

**Headers:**
- `Authorization` (wymagany): Bearer token w formacie `Bearer <jwt_token>`
- `Content-Type` (wymagany): `application/json`

**Request Body:**
```typescript
{
  name?: string  // 1-100 znaków, opcjonalne
}
```

### Przykład żądania

```bash
PATCH /api/decks/550e8400-e29b-41d4-a716-446655440000
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "name": "Advanced JavaScript Concepts"
}
```

## 3. Wykorzystywane typy

### Command Model
```typescript
// src/types.ts (już zdefiniowany)
export type UpdateDeckCommand = Pick<TablesUpdate<"decks">, "name">;
```

### Response DTO
```typescript
// src/types.ts (już zdefiniowany)
export type DeckDetailDTO = DeckListItemDTO;

export type DeckListItemDTO = Omit<DeckEntity, "user_id" | "deleted_at"> & {
  card_count: number;
};
```

### Error DTOs
```typescript
// src/types.ts (już zdefiniowane)
export interface ValidationErrorResponseDTO extends ApiErrorResponseDTO {
  details: ValidationErrorDetailDTO | ValidationErrorDetailDTO[];
}

export interface DeckNotEditableErrorResponseDTO extends ApiErrorResponseDTO {
  error: "deck_not_editable";
}
```

### Zod Schema (do utworzenia)
```typescript
// src/lib/schemas/deck.schema.ts
import { z } from "zod";

export const updateDeckSchema = z.object({
  name: z.string().min(1).max(100).optional()
}).refine(
  (data) => data.name !== undefined,
  { message: "At least one field must be provided for update" }
);

export const uuidSchema = z.string().uuid("Invalid UUID format");
```

## 4. Szczegóły odpowiedzi

### Sukces (200 OK)

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Advanced JavaScript Concepts",
  "slug": "advanced-javascript-concepts",
  "status": "draft",
  "published_at": null,
  "rejected_at": null,
  "rejected_reason": null,
  "card_count": 15,
  "created_at": "2024-11-09T10:30:00.000Z",
  "updated_at": "2024-11-09T14:45:00.000Z"
}
```

### Błędy (400, 401, 404, 500)

**Nazwa za długa (400):**
```json
{
  "error": "validation_error",
  "message": "Deck name exceeds maximum length",
  "details": { "field": "name", "constraint": "max_length", "max": 100 }
}
```

**Nazwa nie jest unikalna (400):**
```json
{
  "error": "validation_error",
  "message": "Deck name must be unique",
  "details": { "field": "name", "constraint": "unique" }
}
```

**Talia nie jest draft (400):**
```json
{
  "error": "deck_not_editable",
  "message": "Only draft decks can be updated"
}
```

**Brak autoryzacji (401):**
```json
{
  "error": "unauthorized",
  "message": "Missing or invalid authentication token"
}
```

**Nie znaleziono (404):**
```json
{
  "error": "not_found",
  "message": "Deck not found or access denied"
}
```

## 5. Przepływ danych

### Diagram przepływu

```
Client Request
     ↓
[Astro API Route Handler]
     ↓
[Middleware: JWT Validation] ← Astro.locals.supabase
     ↓
[Zod Schema Validation] ← updateDeckSchema
     ↓
[DeckService.updateDeck()]
     ↓
[Supabase Query]
  ├─ SELECT: Weryfikacja własności i statusu
  ├─ Check: status = 'draft'
  ├─ Check: user_id = auth.uid()
  └─ UPDATE: Aktualizacja nazwy
     ↓
[DB Trigger: generate_deck_slug()] ← Automatyczna generacja slug
     ↓
[DB Trigger: update_updated_at_column()] ← Automatyczna aktualizacja timestamp
     ↓
[SELECT: Pobranie card_count]
     ↓
[Response: DeckDetailDTO]
     ↓
Client Response (200 OK)
```

### Szczegółowy przepływ w DeckService

1. **Walidacja UUID**: Sprawdzenie formatu `deckId`
2. **Pobranie talii**: SELECT z weryfikacją własności i statusu
3. **Sprawdzenie statusu**: Jeśli `status !== 'draft'`, zwróć błąd 400
4. **Aktualizacja**: UPDATE z obsługą unique constraint violation
5. **Pobranie card_count**: COUNT kart w talii
6. **Zwrócenie DeckDetailDTO**

## 6. Względy bezpieczeństwa

### Uwierzytelnianie
- JWT token w nagłówku `Authorization: Bearer <token>`
- Walidacja przez Supabase Auth (GoTrue)
- Użycie `supabase.auth.getUser()` do pobrania `user_id`

### Autoryzacja
- Weryfikacja własności: `WHERE user_id = $userId AND id = $deckId`
- Ochrona przed IDOR: zawsze filtrowanie po `user_id`
- Zwracanie 404 zamiast 403 (nie ujawniamy istnienia zasobu)

### Walidacja danych
- **Poziom 1**: Zod schema (1-100 znaków)
- **Poziom 2**: Database CHECK constraint
- **Poziom 3**: Unique index (case-insensitive)

### Ochrona przed atakami
- **SQL Injection**: Supabase używa prepared statements
- **Race Conditions**: Unikalność wymuszana przez DB index
- **Mass Assignment**: Tylko pole `name` jest akceptowane

## 7. Obsługa błędów

### Katalog błędów

| Kod | Scenariusz | Error Code | Message |
|-----|-----------|------------|---------|
| 400 | Nazwa za krótka/długa | `validation_error` | Deck name length invalid |
| 400 | Nazwa nie jest unikalna | `validation_error` | Deck name must be unique |
| 400 | Talia nie jest draft | `deck_not_editable` | Only draft decks can be updated |
| 400 | Nieprawidłowy UUID | `validation_error` | Invalid deck ID format |
| 401 | Brak/nieprawidłowy token | `unauthorized` | Missing or invalid authentication token |
| 404 | Talia nie istnieje | `not_found` | Deck not found or access denied |
| 500 | Błąd bazy danych | `internal_server_error` | An unexpected error occurred |

### Mapowanie błędów PostgreSQL

```typescript
if (error.code === '23505') {
  // Unique constraint violation
  throw new Error('Deck name must be unique');
}
if (error.code === '23514') {
  // Check constraint violation
  throw new Error('Deck name length invalid');
}
```

## 8. Rozważania dotyczące wydajności

### Optymalizacje zapytań
- Primary key lookup: O(log n)
- Unique index check: O(log n) - automatyczny
- Card count: Wykorzystuje `idx_cards_deck_id_position`

### Potencjalne wąskie gardła
1. **Unique constraint check**: Już zoptymalizowane przez partial index
2. **Card count query**: Max 20 kart per talia (ograniczone)
3. **Slug generation trigger**: Max 100 znaków, regex operations są szybkie

### Monitoring (później)
- Response time (p50, p95, p99)
- Error rate (4xx, 5xx)
- Database query time
- Unique constraint violations

## 9. Etapy wdrożenia

### Krok 1: Przygotowanie struktury plików

```
src/
├── pages/api/decks/[deckId].ts       # Nowy endpoint
├── lib/services/deck.service.ts      # Rozszerzyć
└── lib/schemas/deck.schema.ts        # Nowy plik
```

### Krok 2: Definicja Zod Schema

**Plik:** `src/lib/schemas/deck.schema.ts`

```typescript
import { z } from "zod";

export const updateDeckSchema = z.object({
  name: z.string().min(1).max(100).optional()
}).refine(
  (data) => data.name !== undefined,
  { message: "At least one field must be provided for update" }
);

export const uuidSchema = z.string().uuid();
```

### Krok 3: Implementacja DeckService

**Plik:** `src/lib/services/deck.service.ts`

```typescript
async updateDeck(
  supabase: SupabaseClient,
  userId: string,
  deckId: string,
  command: UpdateDeckCommand
): Promise<DeckDetailDTO> {
  // 1. Verify ownership and status
  const { data: deck } = await supabase
    .from('decks')
    .select('status')
    .eq('id', deckId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .single();

  if (!deck) throw new Error('Deck not found');
  if (deck.status !== 'draft') throw new Error('Deck not editable');

  // 2. Update deck
  const { data: updated, error } = await supabase
    .from('decks')
    .update({ name: command.name })
    .eq('id', deckId)
    .select()
    .single();

  if (error?.code === '23505') throw new Error('Name not unique');
  if (error) throw error;

  // 3. Get card count
  const { count } = await supabase
    .from('cards')
    .select('*', { count: 'exact', head: true })
    .eq('deck_id', deckId)
    .is('deleted_at', null);

  return { ...updated, card_count: count || 0 };
}
```

### Krok 4: Implementacja API Route Handler

**Plik:** `src/pages/api/decks/[deckId].ts`

```typescript
import type { APIRoute } from "astro";
import { updateDeckSchema, uuidSchema } from "../../../lib/schemas/deck.schema";
import { DeckService } from "../../../lib/services/deck.service";

export const prerender = false;

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  try {
    // 1. Auth
    const { data: { user }, error } = await locals.supabase.auth.getUser();
    if (error || !user) {
      return new Response(JSON.stringify({
        error: "unauthorized",
        message: "Missing or invalid authentication token"
      }), { status: 401 });
    }

    // 2. Validate deckId
    const deckIdResult = uuidSchema.safeParse(params.deckId);
    if (!deckIdResult.success) {
      return new Response(JSON.stringify({
        error: "validation_error",
        message: "Invalid deck ID format"
      }), { status: 400 });
    }

    // 3. Validate body
    const body = await request.json();
    const validation = updateDeckSchema.safeParse(body);
    if (!validation.success) {
      return new Response(JSON.stringify({
        error: "validation_error",
        message: validation.error.errors[0].message
      }), { status: 400 });
    }

    // 4. Update deck
    const service = new DeckService();
    const result = await service.updateDeck(
      locals.supabase,
      user.id,
      deckIdResult.data,
      validation.data
    );

    return new Response(JSON.stringify(result), { status: 200 });

  } catch (error) {
    if (error.message === 'Deck not found') {
      return new Response(JSON.stringify({
        error: "not_found",
        message: "Deck not found or access denied"
      }), { status: 404 });
    }
    if (error.message === 'Deck not editable') {
      return new Response(JSON.stringify({
        error: "deck_not_editable",
        message: "Only draft decks can be updated"
      }), { status: 400 });
    }
    if (error.message === 'Name not unique') {
      return new Response(JSON.stringify({
        error: "validation_error",
        message: "Deck name must be unique"
      }), { status: 400 });
    }

    console.error('[PATCH /api/decks/:deckId]', error);
    return new Response(JSON.stringify({
      error: "internal_server_error",
      message: "An unexpected error occurred"
    }), { status: 500 });
  }
};
```

### Krok 5: Testy manualne

**Przygotowanie:**
1. `supabase start`
2. `supabase db reset`
3. Utworzyć użytkownika i uzyskać JWT token
4. Utworzyć testową talię draft

**Scenariusze:**

```bash
# Test 1: Sukces
curl -X PATCH http://localhost:4321/api/decks/{deckId} \
  -H "Authorization: Bearer {token}" \
  -d '{"name": "Updated Name"}'
# Oczekiwane: 200 OK

# Test 2: Nazwa za długa
curl -X PATCH http://localhost:4321/api/decks/{deckId} \
  -H "Authorization: Bearer {token}" \
  -d '{"name": "'$(printf 'A%.0s' {1..101})'"}'
# Oczekiwane: 400 Bad Request

# Test 3: Duplikat nazwy
# Utworzyć dwie talie, spróbować zmienić nazwę jednej na drugą
# Oczekiwane: 400 Bad Request

# Test 4: Published deck
# Opublikować talię, spróbować edytować
# Oczekiwane: 400 Bad Request

# Test 5: Brak autoryzacji
curl -X PATCH http://localhost:4321/api/decks/{deckId} \
  -d '{"name": "Test"}'
# Oczekiwane: 401 Unauthorized

# Test 6: Nieistniejąca talia
curl -X PATCH http://localhost:4321/api/decks/00000000-0000-0000-0000-000000000000 \
  -H "Authorization: Bearer {token}" \
  -d '{"name": "Test"}'
# Oczekiwane: 404 Not Found
```

### Krok 6: Weryfikacja

- [ ] Endpoint zwraca 200 OK dla poprawnych żądań
- [ ] Slug jest automatycznie generowany z nazwy
- [ ] Unikalność nazwy jest wymuszana
- [ ] Tylko draft decks mogą być edytowane
- [ ] Weryfikacja własności działa poprawnie
- [ ] Wszystkie błędy zwracają odpowiednie kody statusu
- [ ] Response zawiera card_count
- [ ] updated_at jest automatycznie aktualizowany

### Krok 7: Dokumentacja

- [ ] Zaktualizować API documentation
- [ ] Dodać przykłady użycia
- [ ] Udokumentować error codes
- [ ] Dodać do Postman/Insomnia collection
