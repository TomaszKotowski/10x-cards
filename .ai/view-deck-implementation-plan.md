# API Endpoint Implementation Plan: GET /api/decks/:deckId

## 1. Przegląd punktu końcowego

Endpoint służy do pobierania szczegółowych informacji o pojedynczej talii fiszek. Zwraca wszystkie metadane talii wraz z obliczoną liczbą kart. Endpoint wymaga autentykacji i zapewnia, że użytkownik może przeglądać tylko swoje własne talie.

**Kluczowe funkcjonalności:**
- Pobieranie szczegółów talii po UUID
- Automatyczne liczenie aktywnych kart w talii
- Weryfikacja własności talii przez użytkownika
- Obsługa soft-delete (ukrywanie usuniętych talii)

## 2. Szczegóły żądania

### Metoda HTTP
`GET`

### Struktura URL
```
/api/decks/:deckId
```

### Parametry

**Parametry ścieżki (wymagane):**
- `deckId` (string, UUID) - Unikalny identyfikator talii

**Nagłówki (wymagane):**
```
Authorization: Bearer <jwt_token>
```

**Query parameters:** Brak

**Request Body:** Brak (metoda GET)

### Przykład żądania
```http
GET /api/decks/550e8400-e29b-41d4-a716-446655440000 HTTP/1.1
Host: api.10x-cards.com
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## 3. Wykorzystywane typy

### DTOs (z src/types.ts)

**Response DTO:**
```typescript
// Linia 44 w src/types.ts
export type DeckDetailDTO = DeckListItemDTO;

// DeckListItemDTO (linia 33-35)
export type DeckListItemDTO = Omit<DeckEntity, "user_id" | "deleted_at"> & {
  card_count: number;
};
```

**Struktura DeckDetailDTO:**
```typescript
{
  id: string;                    // UUID
  name: string;                  // 1-100 znaków
  slug: string;                  // Auto-generowany z name
  status: "draft" | "published" | "rejected";
  published_at: string | null;   // ISO8601 timestamp
  rejected_at: string | null;    // ISO8601 timestamp
  rejected_reason: string | null; // Max 500 znaków
  card_count: number;            // Obliczone (0-20)
  created_at: string;            // ISO8601 timestamp
  updated_at: string;            // ISO8601 timestamp
}
```

### Validation Schemas (do utworzenia)

**Path Parameters Schema:**
```typescript
// src/lib/schemas/deck.schema.ts
import { z } from "zod";

export const DeckIdParamSchema = z.object({
  deckId: z.string().uuid({ message: "Invalid deck ID format" })
});

export type DeckIdParam = z.infer<typeof DeckIdParamSchema>;
```

## 4. Szczegóły odpowiedzi

### Odpowiedź sukcesu (200 OK)

**Content-Type:** `application/json`

**Body:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "JavaScript Basics",
  "slug": "javascript-basics",
  "status": "draft",
  "published_at": null,
  "rejected_at": null,
  "rejected_reason": null,
  "card_count": 15,
  "created_at": "2024-11-09T10:30:00.000Z",
  "updated_at": "2024-11-09T14:45:00.000Z"
}
```

### Odpowiedzi błędów

#### 400 Bad Request
```json
{
  "error": "validation_error",
  "message": "Invalid deck ID format"
}
```

#### 401 Unauthorized
```json
{
  "error": "unauthorized",
  "message": "Authentication required"
}
```

#### 404 Not Found
```json
{
  "error": "deck_not_found",
  "message": "Deck not found"
}
```

#### 500 Internal Server Error
```json
{
  "error": "internal_server_error",
  "message": "An unexpected error occurred"
}
```

## 5. Przepływ danych

### Diagram przepływu

```
1. Client Request
   ↓
2. Astro API Route (/src/pages/api/decks/[deckId].ts)
   ↓
3. Middleware (weryfikacja JWT, context.locals.supabase)
   ↓
4. Path Parameter Validation (Zod - DeckIdParamSchema)
   ↓
5. DeckService.getDeckById(deckId, userId)
   ↓
6. Supabase Query:
   - SELECT deck WHERE id = :deckId AND user_id = :userId AND deleted_at IS NULL
   - COUNT cards WHERE deck_id = :deckId AND deleted_at IS NULL
   ↓
7. RLS Policy Check (automatic via Supabase)
   ↓
8. Transform to DeckDetailDTO
   ↓
9. Return Response (200 OK lub error)
```

### Interakcje z bazą danych

**Tabele:**
- `decks` (główne zapytanie)
- `cards` (JOIN do liczenia)

**Indeksy wykorzystywane:**
- `decks(id)` - Primary Key
- `idx_decks_user_id_status_updated` - dla filtrowania po user_id
- `idx_cards_deck_id_position` - dla JOIN z cards

**RLS Policies:**
- `"Users can view their own decks"` (db-plan.md linia 215-221)

## 6. Względy bezpieczeństwa

### Autentykacja
- **JWT Token**: Wymagany w nagłówku `Authorization: Bearer <token>`
- **Weryfikacja**: Przez Supabase GoTrue w middleware
- **Brak tokenu**: Zwrot 401 Unauthorized
- **Token wygasły**: Zwrot 401 Unauthorized

### Autoryzacja
- **Własność zasobu**: Sprawdzenie `deck.user_id = auth.uid()`
- **RLS Policy**: Automatyczne filtrowanie przez Supabase
- **Deny-by-default**: Brak dostępu bez jawnej polityki

### Walidacja danych wejściowych
- **UUID validation**: Zod schema zapobiega SQL injection
- **Type safety**: TypeScript + Zod zapewniają bezpieczeństwo typów

### Ochrona danych wrażliwych
- **Ukryte pola**: `user_id` i `deleted_at` nie są zwracane w response
- **Soft-delete**: Usunięte talie są całkowicie ukryte (404)
- **Minimalne błędy**: Komunikaty nie ujawniają szczegółów implementacji

## 7. Obsługa błędów

### Macierz błędów

| Kod | Scenariusz | Error Code | Message |
|-----|-----------|------------|---------|
| 400 | Nieprawidłowy UUID | `validation_error` | "Invalid deck ID format" |
| 401 | Brak tokenu | `unauthorized` | "Authentication required" |
| 401 | Token nieprawidłowy | `unauthorized` | "Authentication required" |
| 404 | Talia nie istnieje | `deck_not_found` | "Deck not found" |
| 404 | Talia usunięta | `deck_not_found` | "Deck not found" |
| 404 | Brak uprawnień | `deck_not_found` | "Deck not found" |
| 500 | Błąd DB | `internal_server_error` | "An unexpected error occurred" |

### Logowanie błędów

**Poziomy logowania:**
- **400**: INFO - normalne zachowanie użytkownika
- **401**: WARN - potencjalna próba nieautoryzowanego dostępu
- **404**: INFO - normalne zachowanie
- **500**: ERROR - wymaga interwencji, pełny stack trace

## 8. Rozważania dotyczące wydajności

### Optymalizacje zapytań

**Indeksy wykorzystywane:**
- Primary key na `decks(id)` - O(log n) lookup
- Index na `decks(user_id, status, updated_at)` - wspiera filtrowanie
- Index na `cards(deck_id, position)` - efektywny JOIN i COUNT

**Single query approach:**
- Jedno zapytanie z LEFT JOIN i COUNT zamiast dwóch osobnych
- Agregacja na poziomie DB (COUNT) zamiast w aplikacji

### Szacowana wydajność

**Oczekiwane czasy odpowiedzi:**
- **p50**: <100ms
- **p95**: <200ms
- **p99**: <500ms

## 9. Etapy wdrożenia

### Krok 1: Utworzenie Zod schema dla walidacji
**Plik**: `src/lib/schemas/deck.schema.ts`

```typescript
import { z } from "zod";

export const DeckIdParamSchema = z.object({
  deckId: z.string().uuid({ message: "Invalid deck ID format" })
});

export type DeckIdParam = z.infer<typeof DeckIdParamSchema>;
```

### Krok 2: Utworzenie DeckService
**Plik**: `src/lib/services/deck.service.ts`

```typescript
import type { SupabaseClient } from "@/db/supabase.client";
import type { DeckDetailDTO } from "@/types";

export class DeckService {
  constructor(private supabase: SupabaseClient) {}

  async getDeckById(deckId: string, userId: string): Promise<DeckDetailDTO | null> {
    const { data, error } = await this.supabase
      .from("decks")
      .select("*")
      .eq("id", deckId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .single();

    if (error || !data) return null;

    const { count } = await this.supabase
      .from("cards")
      .select("*", { count: "exact", head: true })
      .eq("deck_id", deckId)
      .is("deleted_at", null);

    return {
      id: data.id,
      name: data.name,
      slug: data.slug,
      status: data.status,
      published_at: data.published_at,
      rejected_at: data.rejected_at,
      rejected_reason: data.rejected_reason,
      card_count: count ?? 0,
      created_at: data.created_at,
      updated_at: data.updated_at
    };
  }
}
```

### Krok 3: Utworzenie Astro API endpoint
**Plik**: `src/pages/api/decks/[deckId].ts`

```typescript
import type { APIRoute } from "astro";
import { DeckIdParamSchema } from "@/lib/schemas/deck.schema";
import { DeckService } from "@/lib/services/deck.service";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  try {
    const user = context.locals.user;
    if (!user) {
      return new Response(
        JSON.stringify({ error: "unauthorized", message: "Authentication required" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const validationResult = DeckIdParamSchema.safeParse(context.params);
    if (!validationResult.success) {
      return new Response(
        JSON.stringify({ error: "validation_error", message: "Invalid deck ID format" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const { deckId } = validationResult.data;
    const deckService = new DeckService(context.locals.supabase);
    const deck = await deckService.getDeckById(deckId, user.id);

    if (!deck) {
      return new Response(
        JSON.stringify({ error: "deck_not_found", message: "Deck not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(deck), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error("Error fetching deck:", error);
    return new Response(
      JSON.stringify({ error: "internal_server_error", message: "An unexpected error occurred" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
```

### Krok 4: Testy manualne

**Test 1: Sukces (200 OK)**
```bash
curl -X GET http://localhost:4321/api/decks/550e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer <valid_jwt_token>"
```

**Test 2: Nieprawidłowy UUID (400)**
```bash
curl -X GET http://localhost:4321/api/decks/invalid-uuid \
  -H "Authorization: Bearer <valid_jwt_token>"
```

**Test 3: Brak autoryzacji (401)**
```bash
curl -X GET http://localhost:4321/api/decks/550e8400-e29b-41d4-a716-446655440000
```

**Test 4: Talia nie istnieje (404)**
```bash
curl -X GET http://localhost:4321/api/decks/00000000-0000-0000-0000-000000000000 \
  -H "Authorization: Bearer <valid_jwt_token>"
```

### Krok 5: Code review checklist

- [ ] TypeScript kompiluje się bez błędów
- [ ] ESLint nie zgłasza problemów
- [ ] Wszystkie testy manualne przechodzą
- [ ] Kod zgodny z guidelines z `.windsurf/rules/`
- [ ] Logowanie błędów zaimplementowane
- [ ] Walidacja UUID działa poprawnie
- [ ] RLS policy testowana
- [ ] Soft-delete respektowany
- [ ] Dokumentacja API zaktualizowana
