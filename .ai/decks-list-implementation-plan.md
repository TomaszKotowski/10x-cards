# API Endpoint Implementation Plan: GET /api/decks

## 1. Przegląd punktu końcowego

Endpoint `GET /api/decks` służy do pobierania paginowanej listy talii należących do zalogowanego użytkownika. Umożliwia filtrowanie po statusie, sortowanie według różnych kryteriów oraz paginację wyników. Każda talia w odpowiedzi zawiera podstawowe informacje oraz liczbę kart (`card_count`).

**Główne funkcjonalności:**

- Listowanie talii użytkownika z wykluczeniem soft-deleted (deleted_at IS NULL)
- Filtrowanie po statusie (draft, published, rejected)
- Sortowanie według created_at lub updated_at (rosnąco/malejąco)
- Paginacja z konfigurowalnymi limit i offset
- Obliczanie liczby kart dla każdej talii
- Autoryzacja JWT - tylko talie właściciela

---

## 2. Szczegóły żądania

**Metoda HTTP:** GET

**Struktura URL:** `/api/decks`

**Parametry zapytania (query parameters):**

| Parametr | Typ    | Wymagany | Wartości                                                                 | Default           | Walidacja                       |
| -------- | ------ | -------- | ------------------------------------------------------------------------ | ----------------- | ------------------------------- |
| `status` | string | Nie      | `draft`, `published`, `rejected`                                         | brak (wszystkie)  | Enum validation                 |
| `limit`  | number | Nie      | 1-100                                                                    | 50                | Musi być liczbą całkowitą 1-100 |
| `offset` | number | Nie      | >= 0                                                                     | 0                 | Musi być liczbą całkowitą >= 0  |
| `sort`   | string | Nie      | `updated_at_desc`, `updated_at_asc`, `created_at_desc`, `created_at_asc` | `updated_at_desc` | Enum validation                 |

**Request Headers:**

```
Authorization: Bearer <jwt_token>
```

**Request Body:** Brak (GET request)

---

## 3. Wykorzystywane typy

### DTOs (z src/types.ts):

**DeckListItemDTO:**

```typescript
// DTO dla pojedynczej talii w liście
type DeckListItemDTO = Omit<DeckEntity, "user_id" | "deleted_at"> & {
  card_count: number;
};

// Pola:
// - id: string (UUID)
// - name: string
// - slug: string
// - status: 'draft' | 'published' | 'rejected'
// - published_at: string | null (ISO8601)
// - rejected_at: string | null (ISO8601)
// - rejected_reason: string | null
// - card_count: number
// - created_at: string (ISO8601)
// - updated_at: string (ISO8601)
```

**PaginatedDecksResponseDTO:**

```typescript
// Odpowiedź z paginacją
type PaginatedDecksResponseDTO = {
  data: DeckListItemDTO[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
};
```

**ApiErrorResponseDTO:**

```typescript
// Standardowa odpowiedź błędu
interface ApiErrorResponseDTO {
  error: string;
  message: string;
}
```

### Zod Schemas (do utworzenia):

**GetDecksQuerySchema:**

```typescript
import { z } from "zod";

const GetDecksQuerySchema = z.object({
  status: z.enum(["draft", "published", "rejected"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  sort: z.enum(["updated_at_desc", "updated_at_asc", "created_at_desc", "created_at_asc"]).default("updated_at_desc"),
});

type GetDecksQuery = z.infer<typeof GetDecksQuerySchema>;
```

**Uwaga:** Użyj `z.coerce.number()` dla parametrów liczbowych, ponieważ query parameters przychodzą jako stringi.

---

## 4. Szczegóły odpowiedzi

### Sukces - 200 OK

**Content-Type:** `application/json`

**Body:**

```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "JavaScript Basics",
      "slug": "javascript-basics",
      "status": "published",
      "published_at": "2024-01-15T10:30:00.000Z",
      "rejected_at": null,
      "rejected_reason": null,
      "card_count": 15,
      "created_at": "2024-01-10T14:20:00.000Z",
      "updated_at": "2024-01-15T10:30:00.000Z"
    },
    {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "name": "TypeScript Advanced",
      "slug": "typescript-advanced",
      "status": "draft",
      "published_at": null,
      "rejected_at": null,
      "rejected_reason": null,
      "card_count": 8,
      "created_at": "2024-01-12T09:15:00.000Z",
      "updated_at": "2024-01-14T16:45:00.000Z"
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 123
  }
}
```

### Błędy

**400 Bad Request** - Nieprawidłowe parametry zapytania

```json
{
  "error": "validation_error",
  "message": "Invalid query parameters"
}
```

Przykładowe przypadki:

- status nie jest jednym z dozwolonych wartości
- limit < 1 lub limit > 100
- offset < 0
- sort nie jest jednym z dozwolonych wartości

**401 Unauthorized** - Brak lub nieprawidłowy token JWT

```json
{
  "error": "unauthorized",
  "message": "Authentication required"
}
```

**500 Internal Server Error** - Błąd serwera lub bazy danych

```json
{
  "error": "internal_server_error",
  "message": "An unexpected error occurred"
}
```

---

## 5. Przepływ danych

### Diagram przepływu:

```
1. Client Request
   ↓
2. Astro Endpoint (/api/decks/index.ts)
   ↓
3. Middleware - Auth Validation (locals.supabase)
   ↓
4. Query Parameters Validation (Zod)
   ↓
5. Service Layer (DeckService.listDecks)
   ↓
6. Database Query (Supabase)
   - SELECT decks with LEFT JOIN cards for count
   - Filter by user_id (from JWT)
   - Filter by status (if provided)
   - Filter by deleted_at IS NULL
   - Apply sorting
   - Apply pagination (limit, offset)
   - Count total for pagination
   ↓
7. Transform to DTOs
   ↓
8. Return Response (200 OK or error)
```

### Szczegóły zapytania bazodanowego:

**Główne zapytanie (pseudocode SQL):**

```sql
SELECT
  d.id,
  d.name,
  d.slug,
  d.status,
  d.published_at,
  d.rejected_at,
  d.rejected_reason,
  d.created_at,
  d.updated_at,
  COUNT(c.id) as card_count
FROM decks d
LEFT JOIN cards c ON c.deck_id = d.id AND c.deleted_at IS NULL
WHERE d.user_id = :user_id
  AND d.deleted_at IS NULL
  AND (:status IS NULL OR d.status = :status)
GROUP BY d.id
ORDER BY d.updated_at DESC  -- lub inne pole zgodnie z parametrem sort
LIMIT :limit
OFFSET :offset;
```

**Zapytanie liczące (dla pagination.total):**

```sql
SELECT COUNT(*) as total
FROM decks
WHERE user_id = :user_id
  AND deleted_at IS NULL
  AND (:status IS NULL OR status = :status);
```

**Indeksy używane (z db-plan.md):**

- `idx_decks_user_id_status_updated` - szybkie filtrowanie i sortowanie
- `idx_cards_deck_id_position` - szybkie liczenie kart

---

## 6. Względy bezpieczeństwa

### Autoryzacja i uwierzytelnianie:

1. **Walidacja JWT Token:**
   - Wymagany header: `Authorization: Bearer <token>`
   - Token walidowany przez Supabase middleware
   - Wyciągnięcie `user_id` z `auth.uid()`
   - Zwrot 401 jeśli token jest nieważny lub brakuje

2. **Izolacja danych użytkownika:**
   - Wszystkie zapytania MUSZĄ zawierać `WHERE user_id = :user_id`
   - Użytkownik widzi TYLKO swoje talie
   - Brak możliwości listowania talii innych użytkowników

3. **Row Level Security (RLS):**
   - Zgodnie z tech-stack.md, RLS będzie włączony "później"
   - W MVP wymuszamy filtrowanie po user_id w kodzie aplikacji
   - Polityki RLS (plan na później):
     ```sql
     CREATE POLICY "Users can view own decks"
     ON decks FOR SELECT
     USING (auth.uid() = user_id);
     ```

4. **Walidacja parametrów wejściowych:**
   - Wszystkie parametry query walidowane przez Zod
   - Zapobieganie SQL injection przez użycie parametryzowanych zapytań (Supabase)
   - Sanityzacja i type coercion dla parametrów liczbowych

5. **Ochrona przed wyciekiem danych:**
   - Pominięcie `user_id` w DTO (użytkownik nie potrzebuje widzieć własnego ID)
   - Pominięcie `deleted_at` w DTO (szczegół implementacyjny)
   - Zwracanie tylko niezbędnych pól w odpowiedzi

6. **Rate limiting (plan na później):**
   - Zgodnie z tech-stack.md, rate limiting będzie dodany po MVP
   - Rozważyć limit per IP/user (np. 100 requests/minute)

### CORS:

- Zgodnie z tech-stack.md: CORS zawężone do domeny produkcyjnej i dev
- Konfiguracja w middleware Astro

---

## 7. Obsługa błędów

### Hierarchia obsługi błędów:

```
1. Middleware Auth Error (401)
   ↓
2. Query Parameter Validation Error (400)
   ↓
3. Service Layer Errors
   ↓
4. Database Errors (500)
   ↓
5. Unexpected Errors (500)
```

### Szczegółowe scenariusze błędów:

| Kod | Scenariusz                      | Error Type              | Message                           | Działanie                                 |
| --- | ------------------------------- | ----------------------- | --------------------------------- | ----------------------------------------- |
| 401 | Brak tokenu JWT                 | `unauthorized`          | "Authentication required"         | Zwróć 401, nie loguj (oczekiwany błąd)    |
| 401 | Token JWT nieprawidłowy/expired | `unauthorized`          | "Invalid or expired token"        | Zwróć 401, loguj w celach bezpieczeństwa  |
| 400 | `status` nie jest enum          | `validation_error`      | "Invalid status value"            | Zwróć 400 z Zod error details             |
| 400 | `limit` < 1 lub > 100           | `validation_error`      | "Limit must be between 1 and 100" | Zwróć 400 z Zod error details             |
| 400 | `offset` < 0                    | `validation_error`      | "Offset must be non-negative"     | Zwróć 400 z Zod error details             |
| 400 | `sort` nie jest enum            | `validation_error`      | "Invalid sort value"              | Zwróć 400 z Zod error details             |
| 500 | Błąd połączenia z DB            | `internal_server_error` | "An unexpected error occurred"    | Loguj szczegóły, zwróć ogólny komunikat   |
| 500 | Timeout zapytania               | `internal_server_error` | "An unexpected error occurred"    | Loguj szczegóły, zwróć ogólny komunikat   |
| 500 | Nieoczekiwany wyjątek           | `internal_server_error` | "An unexpected error occurred"    | Loguj stack trace, zwróć ogólny komunikat |

### Strategia logowania:

**Co logować:**

- Błędy 500 (pełny stack trace, context)
- Błędy 401 z invalid token (potencjalne ataki)
- Wolne zapytania (> 2s) - performance monitoring
- User_id i parametry zapytania dla debugowania

**Czego NIE logować:**

- Błędy walidacji 400 (oczekiwane)
- Pomyślne requesty 200 (tylko w debug mode)

**Format logów (structured logging):**

```typescript
{
  level: 'error',
  endpoint: 'GET /api/decks',
  user_id: 'uuid',
  query_params: { status: 'draft', limit: 50, offset: 0 },
  error: 'Database connection failed',
  stack: '...',
  timestamp: '2024-01-15T10:30:00.000Z'
}
```

### Error Handler (helper function):

```typescript
// src/lib/errors/api-error-handler.ts
export function handleApiError(error: unknown, context: string): Response {
  if (error instanceof z.ZodError) {
    return new Response(
      JSON.stringify({
        error: "validation_error",
        message: "Invalid query parameters",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Log unexpected errors
  console.error(`[${context}]`, error);

  return new Response(
    JSON.stringify({
      error: "internal_server_error",
      message: "An unexpected error occurred",
    }),
    { status: 500, headers: { "Content-Type": "application/json" } }
  );
}
```

---

## 8. Rozważania dotyczące wydajności

### Optymalizacje zapytań:

1. **Indeksy bazodanowe:**
   - Wykorzystanie `idx_decks_user_id_status_updated` dla szybkiego filtrowania i sortowania
   - Supabase automatycznie wybierze optymalny plan zapytania

2. **Efektywne liczenie kart:**
   - Użycie LEFT JOIN z COUNT zamiast oddzielnych zapytań
   - Grupowanie po deck.id dla agregacji
   - Filtrowanie cards po `deleted_at IS NULL`

3. **Paginacja:**
   - Limit i offset zapobiegają ładowaniu wszystkich rekordów
   - Default limit 50, max 100 chroni przed nadmiernymi requestami
   - Total count w oddzielnym, prostszym zapytaniu (bez JOIN)

4. **N+1 Query Problem:**
   - **Unikamy** przez użycie JOIN dla card_count w jednym zapytaniu
   - Nie wykonujemy osobnych zapytań dla każdej talii

### Potencjalne wąskie gardła:

1. **Liczenie total dla pagination:**
   - Dla użytkowników z tysiącami talii może być wolne
   - **Mitigacja:** Osobne, uproszczone zapytanie COUNT bez JOIN
   - **Późniejsza optymalizacja:** Cache total w Redis z TTL 60s

2. **LEFT JOIN z cards:**
   - Dla użytkowników z setkami talii i tysiącami kart może spowolnić
   - **Mitigacja:** Indeks `idx_cards_deck_id_position` przyspiesza JOIN
   - **Późniejsza optymalizacja:** Materialized view z pre-computed card_count

3. **Sortowanie:**
   - Sortowanie dużych zestawów danych może być kosztowne
   - **Mitigacja:** Indeks obejmuje kolumny sortowania (updated_at, created_at)
   - **Późniejsza optymalizacja:** Partial index dla często używanych sortowań

### Monitoring wydajności:

**Metryki do śledzenia (plan na później):**

- P50, P95, P99 response time
- Liczba zapytań per user
- Średni czas wykonania zapytania DB
- Cache hit rate (gdy cache zostanie dodany)

**Progi alarmowe:**

- Response time > 2s (P95)
- Database query time > 1s (P95)
- Error rate > 1%

### Strategie cache'owania (plan na później):

1. **HTTP Cache Headers:**
   - `Cache-Control: private, max-age=60` dla list dekc
   - User może odświeżyć danymi, ale browser cache przez 1 minutę

2. **Server-side cache (Redis):**
   - Cache pagination.total na 60s
   - Invalidacja przy CREATE/UPDATE/DELETE deck
   - Key pattern: `decks:list:${user_id}:${status}:total`

3. **Incremental Static Regeneration (ISR):**
   - Nie dotyczy - endpoint wymaga autoryzacji per-user

---

## 9. Etapy wdrożenia

### Krok 1: Przygotowanie walidacji parametrów

**Plik:** `src/lib/validation/decks.validation.ts`

**Zadania:**

1. Utwórz Zod schema `GetDecksQuerySchema` z walidacją:
   - status: optional enum
   - limit: coerce number 1-100, default 50
   - offset: coerce number >= 0, default 0
   - sort: enum z 4 opcjami, default 'updated_at_desc'
2. Wyeksportuj type `GetDecksQuery`
3. Dodaj unit testy dla edge cases (invalid values, boundary values)

**Przykład:**

```typescript
import { z } from "zod";

export const GetDecksQuerySchema = z.object({
  status: z.enum(["draft", "published", "rejected"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  sort: z.enum(["updated_at_desc", "updated_at_asc", "created_at_desc", "created_at_asc"]).default("updated_at_desc"),
});

export type GetDecksQuery = z.infer<typeof GetDecksQuerySchema>;
```

---

### Krok 2: Implementacja service layer

**Plik:** `src/lib/services/deck.service.ts`

**Zadania:**

1. Utwórz lub rozszerz `DeckService` class/module
2. Implementuj metodę `listDecks`:
   - Parametry: `userId: string`, `query: GetDecksQuery`
   - Zwraca: `Promise<PaginatedDecksResponseDTO>`
3. Zaimplementuj logikę:
   - Mapowanie sort parameter na ORDER BY clause
   - Query dla list z LEFT JOIN na cards
   - Query dla total count
   - Transformacja wyników DB do DTOs
4. Obsługa błędów:
   - Catch database errors
   - Throw custom errors z kontekstem
5. Dodaj JSDoc documentation

**Struktura metody:**

```typescript
import type { SupabaseClient } from "@/db/supabase.client";
import type { PaginatedDecksResponseDTO } from "@/types";
import type { GetDecksQuery } from "@/lib/validation/decks.validation";

export class DeckService {
  constructor(private supabase: SupabaseClient) {}

  async listDecks(userId: string, query: GetDecksQuery): Promise<PaginatedDecksResponseDTO> {
    // 1. Map sort parameter to ORDER BY
    const orderByColumn = query.sort.startsWith("created_at") ? "created_at" : "updated_at";
    const orderDirection = query.sort.endsWith("_asc") ? "asc" : "desc";

    // 2. Build base query
    let decksQuery = this.supabase
      .from("decks")
      .select(
        `
        id,
        name,
        slug,
        status,
        published_at,
        rejected_at,
        rejected_reason,
        created_at,
        updated_at,
        cards:cards(count)
      `,
        { count: "exact" }
      )
      .eq("user_id", userId)
      .is("deleted_at", null);

    // 3. Apply status filter if provided
    if (query.status) {
      decksQuery = decksQuery.eq("status", query.status);
    }

    // 4. Apply sorting and pagination
    const { data, error, count } = await decksQuery
      .order(orderByColumn, { ascending: orderDirection === "asc" })
      .range(query.offset, query.offset + query.limit - 1);

    // 5. Handle errors
    if (error) {
      throw new Error(`Failed to fetch decks: ${error.message}`);
    }

    // 6. Transform to DTOs
    const decksWithCount = data.map((deck) => ({
      ...deck,
      card_count: deck.cards[0]?.count ?? 0,
    }));

    // 7. Return paginated response
    return {
      data: decksWithCount,
      pagination: {
        limit: query.limit,
        offset: query.offset,
        total: count ?? 0,
      },
    };
  }
}
```

**Alternatywne podejście (funkcyjne):**

```typescript
export async function listDecks(
  supabase: SupabaseClient,
  userId: string,
  query: GetDecksQuery
): Promise<PaginatedDecksResponseDTO> {
  // Implementation...
}
```

---

### Krok 3: Utworzenie Astro endpoint

**Plik:** `src/pages/api/decks/index.ts`

**Zadania:**

1. Utwórz plik z eksportem `GET` function (uppercase)
2. Dodaj `export const prerender = false`
3. Implementuj flow:
   - Pobranie user z `locals.supabase`
   - Walidacja query parameters z Zod
   - Wywołanie DeckService
   - Zwrot response z odpowiednim status code
4. Obsługa błędów z try-catch
5. Dodaj TypeScript types dla wszystkich zmiennych

**Implementacja:**

```typescript
import type { APIRoute } from "astro";
import { GetDecksQuerySchema } from "@/lib/validation/decks.validation";
import { DeckService } from "@/lib/services/deck.service";
import type { ApiErrorResponseDTO } from "@/types";

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    // 1. Check authentication
    const user = await locals.supabase.auth.getUser();

    if (!user.data.user) {
      const errorResponse: ApiErrorResponseDTO = {
        error: "unauthorized",
        message: "Authentication required",
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 2. Parse and validate query parameters
    const url = new URL(request.url);
    const rawQuery = {
      status: url.searchParams.get("status"),
      limit: url.searchParams.get("limit"),
      offset: url.searchParams.get("offset"),
      sort: url.searchParams.get("sort"),
    };

    const validationResult = GetDecksQuerySchema.safeParse(rawQuery);

    if (!validationResult.success) {
      const errorResponse: ApiErrorResponseDTO = {
        error: "validation_error",
        message: "Invalid query parameters",
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 3. Call service layer
    const deckService = new DeckService(locals.supabase);
    const result = await deckService.listDecks(user.data.user.id, validationResult.data);

    // 4. Return success response
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    // 5. Handle unexpected errors
    console.error("[GET /api/decks] Error:", error);

    const errorResponse: ApiErrorResponseDTO = {
      error: "internal_server_error",
      message: "An unexpected error occurred",
    };

    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
```

---

### Krok 4: Weryfikacja middleware auth

**Plik:** `src/middleware/index.ts`

**Zadania:**

1. Sprawdź, czy middleware poprawnie inicjalizuje `locals.supabase`
2. Upewnij się, że Supabase client jest dostępny w context
3. Jeśli nie istnieje, utwórz middleware według dokumentacji Astro + Supabase

**Przykład middleware (jeśli trzeba utworzyć):**

```typescript
import { defineMiddleware } from "astro:middleware";
import { createServerClient } from "@supabase/ssr";

export const onRequest = defineMiddleware(async ({ locals, request }, next) => {
  locals.supabase = createServerClient(import.meta.env.SUPABASE_URL, import.meta.env.SUPABASE_ANON_KEY, {
    cookies: {
      get(key) {
        return request.headers.get("cookie")?.match(new RegExp(`${key}=([^;]+)`))?.[1];
      },
      set(key, value, options) {
        // Set cookie logic
      },
      remove(key, options) {
        // Remove cookie logic
      },
    },
  });

  return next();
});
```

---

### Krok 5: Testy jednostkowe dla walidacji

**Plik:** `src/lib/validation/__tests__/decks.validation.test.ts`

**Zadania:**

1. Test suite dla `GetDecksQuerySchema`
2. Test cases:
   - Valid queries z różnymi kombinacjami parametrów
   - Default values (limit, offset, sort)
   - Invalid status values
   - Limit out of range (0, 101, negative)
   - Offset negative
   - Invalid sort values
   - Type coercion dla string -> number
   - Empty/undefined values

**Przykładowe testy:**

```typescript
import { describe, it, expect } from "vitest";
import { GetDecksQuerySchema } from "../decks.validation";

describe("GetDecksQuerySchema", () => {
  it("should accept valid query with all parameters", () => {
    const result = GetDecksQuerySchema.parse({
      status: "draft",
      limit: "25",
      offset: "10",
      sort: "created_at_asc",
    });

    expect(result).toEqual({
      status: "draft",
      limit: 25,
      offset: 10,
      sort: "created_at_asc",
    });
  });

  it("should apply default values", () => {
    const result = GetDecksQuerySchema.parse({});

    expect(result).toEqual({
      limit: 50,
      offset: 0,
      sort: "updated_at_desc",
    });
  });

  it("should reject invalid status", () => {
    expect(() => {
      GetDecksQuerySchema.parse({ status: "invalid" });
    }).toThrow();
  });

  it("should reject limit > 100", () => {
    expect(() => {
      GetDecksQuerySchema.parse({ limit: "101" });
    }).toThrow();
  });

  it("should reject negative offset", () => {
    expect(() => {
      GetDecksQuerySchema.parse({ offset: "-1" });
    }).toThrow();
  });

  it("should coerce string numbers to integers", () => {
    const result = GetDecksQuerySchema.parse({
      limit: "30",
      offset: "5",
    });

    expect(result.limit).toBe(30);
    expect(result.offset).toBe(5);
    expect(typeof result.limit).toBe("number");
  });
});
```

---

### Krok 6: Testy integracyjne dla service

**Plik:** `src/lib/services/__tests__/deck.service.test.ts`

**Zadania:**

1. Setup mock Supabase client
2. Test cases dla `listDecks`:
   - Successful list with pagination
   - Filtering by status
   - Different sort orders
   - Empty result set
   - Database errors
   - Card count calculation

**Przykładowe testy (z vitest):**

```typescript
import { describe, it, expect, vi } from "vitest";
import { DeckService } from "../deck.service";

describe("DeckService.listDecks", () => {
  const mockSupabase = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          is: vi.fn(() => ({
            order: vi.fn(() => ({
              range: vi.fn(),
            })),
          })),
        })),
      })),
    })),
  };

  it("should return paginated decks with card count", async () => {
    // Mock implementation...
  });

  it("should filter by status when provided", async () => {
    // Mock implementation...
  });

  it("should handle database errors gracefully", async () => {
    // Mock implementation...
  });
});
```

---

### Krok 7: Testy E2E dla endpoint

**Plik:** `tests/api/decks.test.ts` (lub odpowiednia lokalizacja)

**Zadania:**

1. Setup test database lub mock Supabase
2. Test cases:
   - GET /api/decks bez auth -> 401
   - GET /api/decks z valid auth -> 200
   - GET /api/decks?status=draft -> filtered results
   - GET /api/decks?limit=10 -> correct pagination
   - GET /api/decks?sort=created_at_asc -> correct order
   - Invalid query params -> 400
   - Verify response structure matches DTO

**Przykładowe testy (z Playwright lub innym narzędziem):**

```typescript
import { test, expect } from "@playwright/test";

test.describe("GET /api/decks", () => {
  test("should return 401 without authentication", async ({ request }) => {
    const response = await request.get("/api/decks");
    expect(response.status()).toBe(401);

    const body = await response.json();
    expect(body).toHaveProperty("error", "unauthorized");
  });

  test("should return paginated decks with valid auth", async ({ request }) => {
    // Login and get token
    const token = await getAuthToken();

    const response = await request.get("/api/decks", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty("data");
    expect(body).toHaveProperty("pagination");
    expect(body.pagination).toHaveProperty("limit", 50);
    expect(body.pagination).toHaveProperty("offset", 0);
    expect(body.pagination).toHaveProperty("total");
  });

  test("should filter by status", async ({ request }) => {
    const token = await getAuthToken();

    const response = await request.get("/api/decks?status=draft", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();

    // All returned decks should have status 'draft'
    body.data.forEach((deck) => {
      expect(deck.status).toBe("draft");
    });
  });

  test("should respect limit parameter", async ({ request }) => {
    const token = await getAuthToken();

    const response = await request.get("/api/decks?limit=10", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();

    expect(body.data.length).toBeLessThanOrEqual(10);
    expect(body.pagination.limit).toBe(10);
  });

  test("should return 400 for invalid parameters", async ({ request }) => {
    const token = await getAuthToken();

    const response = await request.get("/api/decks?limit=101", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body).toHaveProperty("error", "validation_error");
  });
});
```

---

### Krok 8: Dokumentacja API

**Plik:** `docs/api/decks.md` (lub aktualizacja istniejącej dokumentacji)

**Zadania:**

1. Dokumentuj endpoint w formacie czytelnym dla developerów
2. Dodaj przykłady requestów i responses
3. Opisz wszystkie parametry i ich walidacje
4. Dodaj przykłady error responses
5. Dołącz curl examples dla łatwego testowania

**Przykład dokumentacji:**

````markdown
# GET /api/decks

## Description

Returns a paginated list of decks for the authenticated user.

## Authentication

Required. Include JWT token in Authorization header.

## Query Parameters

| Parameter | Type   | Required | Default         | Description                                       |
| --------- | ------ | -------- | --------------- | ------------------------------------------------- |
| status    | string | No       | -               | Filter by deck status: draft, published, rejected |
| limit     | number | No       | 50              | Items per page (1-100)                            |
| offset    | number | No       | 0               | Pagination offset                                 |
| sort      | string | No       | updated_at_desc | Sort order                                        |

## Examples

### Basic request

```bash
curl -X GET \
  'https://api.10xcards.com/api/decks' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN'
```
````

### Filter by status

```bash
curl -X GET \
  'https://api.10xcards.com/api/decks?status=draft&limit=10' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN'
```

## Response Codes

- 200 OK - Success
- 400 Bad Request - Invalid parameters
- 401 Unauthorized - Missing or invalid token
- 500 Internal Server Error - Server error

```

---

### Krok 9: Code review checklist

**Przed merge do main:**

**Funkcjonalność:**
- [ ] Endpoint zwraca poprawne dane dla różnych query parameters
- [ ] Paginacja działa zgodnie ze specyfikacją
- [ ] Filtrowanie po status działa poprawnie
- [ ] Sortowanie działa dla wszystkich opcji
- [ ] Card count jest obliczany poprawnie
- [ ] Soft-deleted decks są wykluczane

**Bezpieczeństwo:**
- [ ] Autoryzacja JWT jest wymagana
- [ ] Użytkownik widzi tylko swoje talie (filter po user_id)
- [ ] Query parameters są walidowane przez Zod
- [ ] Brak SQL injection (używamy Supabase parameterized queries)
- [ ] Error messages nie ujawniają szczegółów technicznych
- [ ] user_id i deleted_at nie są w response

**Wydajność:**
- [ ] Zapytanie używa odpowiednich indeksów
- [ ] LEFT JOIN jest efektywny (sprawdź EXPLAIN)
- [ ] Limit jest respektowany (max 100)
- [ ] Brak N+1 query problem

**Testy:**
- [ ] Wszystkie unit testy przechodzą
- [ ] Integration testy pokrywają happy path i edge cases
- [ ] E2E testy weryfikują pełny flow
- [ ] Test coverage > 80% dla nowego kodu

**Dokumentacja:**
- [ ] JSDoc dla service methods
- [ ] API documentation jest aktualna
- [ ] Przykłady requestów są funkcjonalne
- [ ] Error responses są udokumentowane

**Code quality:**
- [ ] TypeScript strict mode bez błędów
- [ ] ESLint bez warnings
- [ ] Kod jest zgodny z project rules (.zed/rules/)
- [ ] Early returns dla error conditions
- [ ] Brak deep nesting
- [ ] Zmienne mają sensowne nazwy

---

### Krok 10: Monitoring i deployment

**Po deployment:**

**Monitoring (plan na później):**
1. Dodaj metryki w application monitoring:
   - Response time (P50, P95, P99)
   - Error rate
   - Request rate per user
   - Database query performance

2. Alerty:
   - Response time > 2s (P95)
   - Error rate > 1%
   - Database timeout errors

3. Logi strukturalne:
   - User ID
   - Query parameters
   - Response time
   - Error details

**Performance baseline:**
- Zmierz baseline metrics po deployment
- Ustal progi dla alertów na podstawie rzeczywistego użycia
- Monitoruj trendy przez pierwszy tydzień

**Rollback plan:**
- W przypadku critical bugs, przywróć poprzednią wersję
- Zabezpiecz endpoint feature flag (np. environment variable)
- Przygotuj hotfix branch dla szybkich poprawek

---

## 10. Podsumowanie i checklist wdrożenia

### Kluczowe punkty implementacji:

1. **Walidacja wejścia:** Zod schema z coercion dla query parameters
2. **Service layer:** Oddzielna logika biznesowa od routing logic
3. **Efektywne zapytanie:** LEFT JOIN dla card_count w jednym zapytaniu
4. **Bezpieczeństwo:** Filter po user_id, walidacja JWT, brak wrażliwych danych w response
5. **Obsługa błędów:** Graceful handling z odpowiednimi status codes
6. **Testy:** Unit, integration i E2E coverage
7. **Dokumentacja:** API docs i inline comments

### Szacowany czas implementacji:

- Krok 1 (Walidacja): 1-2h
- Krok 2 (Service): 3-4h
- Krok 3 (Endpoint): 2-3h
- Krok 4 (Middleware check): 1h
- Krok 5 (Unit testy): 2-3h
- Krok 6 (Integration testy): 2-3h
- Krok 7 (E2E testy): 2-3h
- Krok 8 (Dokumentacja): 1-2h
- Krok 9 (Code review): 1-2h
- **Total: 15-23h**

### Zależności:

- Supabase client setup (middleware)
- Database migrations (tabele decks, cards)
- TypeScript types (src/types.ts)
- Indeksy bazodanowe (dla wydajności)

### Kolejne kroki po implementacji:

1. Zaimplementuj pozostałe endpoints dla decks:
   - GET /api/decks/:deckId
   - PATCH /api/decks/:deckId
   - DELETE /api/decks/:deckId
   - POST /api/decks/:deckId/publish
   - POST /api/decks/:deckId/reject

2. Dodaj cache layer (Redis) dla pagination.total

3. Zaimplementuj rate limiting per user

4. Dodaj telemetrię i monitoring (Sentry, Prometheus)

---

**Plan gotowy do implementacji!**
```
