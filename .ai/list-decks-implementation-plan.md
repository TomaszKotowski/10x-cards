# API Endpoint Implementation Plan: GET /api/decks

## 1. Przegląd punktu końcowego

Endpoint `GET /api/decks` zwraca paginowaną listę talii fiszek należących do zalogowanego użytkownika. Umożliwia filtrowanie po statusie, sortowanie według różnych kryteriów oraz kontrolę paginacji. Jest to podstawowy endpoint do wyświetlania listy talii w interfejsie użytkownika.

**Główne funkcjonalności:**

- Pobieranie wszystkich talii użytkownika (z wykluczeniem soft-deleted)
- Filtrowanie po statusie (draft, published, rejected)
- Sortowanie po dacie utworzenia lub modyfikacji (rosnąco/malejąco)
- Paginacja z konfigurowalnymi limitami
- Zwracanie liczby kart w każdej talii (computed field)

## 2. Szczegóły żądania

### Metoda HTTP

`GET`

### Struktura URL

```
/api/decks
```

### Parametry Query String

#### Wymagane

Brak - wszystkie parametry są opcjonalne.

#### Opcjonalne

| Parametr | Typ    | Wartości                                                                               | Default             | Opis                       |
| -------- | ------ | -------------------------------------------------------------------------------------- | ------------------- | -------------------------- |
| `status` | string | `'draft'` \| `'published'` \| `'rejected'`                                             | brak                | Filtruje talie po statusie |
| `limit`  | number | 1-100                                                                                  | 50                  | Liczba elementów na stronę |
| `offset` | number | ≥0                                                                                     | 0                   | Przesunięcie dla paginacji |
| `sort`   | string | `'updated_at_desc'` \| `'updated_at_asc'` \| `'created_at_desc'` \| `'created_at_asc'` | `'updated_at_desc'` | Kolejność sortowania       |

### Request Headers

```
Authorization: Bearer <jwt_token>
```

Token JWT jest wymagany i musi być prawidłowy. Middleware Astro powinien weryfikować token i udostępniać `context.locals.supabase` oraz `context.locals.user`.

### Request Body

Brak - endpoint GET nie przyjmuje body.

## 3. Wykorzystywane typy

### DTOs (Data Transfer Objects)

**Import z `src/types.ts`:**

```typescript
import type { DeckListItemDTO, PaginatedDecksResponseDTO, PaginationDTO, ApiErrorResponseDTO } from "@/types";
```

**Struktura `DeckListItemDTO`:**

```typescript
{
  id: string; // UUID talii
  name: string; // Nazwa talii (1-100 znaków)
  slug: string; // URL-friendly slug
  status: "draft" | "published" | "rejected";
  published_at: string | null; // ISO8601 timestamp
  rejected_at: string | null; // ISO8601 timestamp
  rejected_reason: string | null; // Max 500 znaków
  card_count: number; // Liczba aktywnych kart (computed)
  created_at: string; // ISO8601 timestamp
  updated_at: string; // ISO8601 timestamp
}
```

**Struktura `PaginatedDecksResponseDTO`:**

```typescript
{
  data: DeckListItemDTO[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  }
}
```

### Validation Schemas (Zod)

**Query parameters schema:**

```typescript
import { z } from "zod";

const listDecksQuerySchema = z.object({
  status: z.enum(["draft", "published", "rejected"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  sort: z.enum(["updated_at_desc", "updated_at_asc", "created_at_desc", "created_at_asc"]).default("updated_at_desc"),
});

type ListDecksQuery = z.infer<typeof listDecksQuerySchema>;
```

## 4. Szczegóły odpowiedzi

### Odpowiedź sukcesu (200 OK)

**Content-Type:** `application/json`

**Body:**

```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Historia Polski",
      "slug": "historia-polski",
      "status": "published",
      "published_at": "2024-01-15T10:30:00.000Z",
      "rejected_at": null,
      "rejected_reason": null,
      "card_count": 15,
      "created_at": "2024-01-10T08:00:00.000Z",
      "updated_at": "2024-01-15T10:30:00.000Z"
    },
    {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "name": "Matematyka - Pochodne",
      "slug": "matematyka-pochodne",
      "status": "draft",
      "published_at": null,
      "rejected_at": null,
      "rejected_reason": null,
      "card_count": 8,
      "created_at": "2024-01-12T14:20:00.000Z",
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

### Odpowiedzi błędów

#### 400 Bad Request

Nieprawidłowe parametry query string.

```json
{
  "error": "validation_error",
  "message": "Invalid query parameters: limit must be between 1 and 100"
}
```

#### 401 Unauthorized

Brak tokenu JWT lub token nieprawidłowy/wygasły.

```json
{
  "error": "unauthorized",
  "message": "Authentication required"
}
```

#### 500 Internal Server Error

Błąd serwera lub bazy danych.

```json
{
  "error": "internal_server_error",
  "message": "An unexpected error occurred"
}
```

## 5. Przepływ danych

### Architektura warstw

```
Client Request
    ↓
Astro Middleware (auth verification)
    ↓
API Route Handler (/src/pages/api/decks/index.ts)
    ↓
Query Params Validation (Zod)
    ↓
Deck Service (/src/lib/services/deck.service.ts)
    ↓
Supabase Query Builder
    ↓
PostgreSQL Database (decks + cards tables)
    ↓
Response Mapping (Entity → DTO)
    ↓
JSON Response to Client
```

### Szczegółowy przepływ

1. **Request Processing (API Route)**
   - Odczyt query parameters z `Astro.url.searchParams`
   - Walidacja parametrów przez Zod schema
   - Pobranie `user_id` z `context.locals.user` (po weryfikacji middleware)

2. **Service Layer (deck.service.ts)**
   - Funkcja: `listUserDecks(supabase, userId, filters, pagination, sort)`
   - Budowanie zapytania Supabase:
     ```typescript
     let query = supabase
       .from("decks")
       .select("*, cards(count)", { count: "exact" })
       .eq("user_id", userId)
       .is("deleted_at", null);
     ```
   - Aplikacja filtrów (status)
   - Aplikacja sortowania (mapowanie sort string → ORDER BY)
   - Aplikacja paginacji (range)

3. **Database Query**
   - Wykorzystanie indeksu: `idx_decks_user_id_status_updated`
   - Filtrowanie przez partial index: `WHERE deleted_at IS NULL`
   - Join z `cards` dla obliczenia `card_count`
   - Zwrot: lista talii + total count

4. **Response Mapping**
   - Transformacja `DeckEntity` → `DeckListItemDTO`
   - Ukrycie pól: `user_id`, `deleted_at`
   - Dodanie computed field: `card_count`
   - Konstrukcja `PaginatedDecksResponseDTO`

5. **Response Serialization**
   - Zwrot JSON z kodem 200
   - Ustawienie nagłówków: `Content-Type: application/json`

### Interakcje z bazą danych

**Główne zapytanie (przykład z filtrem status='draft'):**

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
  COUNT(c.id) FILTER (WHERE c.deleted_at IS NULL) as card_count
FROM decks d
LEFT JOIN cards c ON c.deck_id = d.id
WHERE d.user_id = $1
  AND d.deleted_at IS NULL
  AND d.status = 'draft'
GROUP BY d.id
ORDER BY d.updated_at DESC
LIMIT 50 OFFSET 0;
```

**Zapytanie count (dla total):**

```sql
SELECT COUNT(*)
FROM decks
WHERE user_id = $1
  AND deleted_at IS NULL
  AND status = 'draft';
```

## 6. Względy bezpieczeństwa

### Autoryzacja i uwierzytelnianie

1. **JWT Token Verification**
   - Token weryfikowany przez Astro middleware
   - Middleware ustawia `context.locals.user` z `user_id`
   - Brak tokenu → 401 Unauthorized (obsługa w middleware)

2. **User Isolation**
   - Wszystkie zapytania filtrowane przez `user_id = context.locals.user.id`
   - Użytkownik widzi **tylko swoje talie**
   - Brak możliwości dostępu do talii innych użytkowników

3. **Row Level Security (RLS)**
   - **Status w MVP**: RLS wyłączone (zgodnie z tech-stack.md)
   - **Plan na później**: Polityka `Users can view their own decks`
   - Obecnie izolacja wymuszana przez logikę aplikacji (filtr `user_id`)

### Walidacja danych wejściowych

1. **Query Parameters**
   - Walidacja przez Zod schema przed wykonaniem zapytania
   - Wymuszenie limitów: `limit` ∈ [1, 100], `offset` ≥ 0
   - Enum validation dla `status` i `sort`
   - Coercion number dla parametrów liczbowych

2. **SQL Injection Prevention**
   - Używanie Supabase query builder (parametryzowane zapytania)
   - Brak bezpośredniego SQL z interpolacją stringów
   - Wszystkie wartości escapowane automatycznie

3. **Data Exposure Prevention**
   - Ukrycie `user_id` w DTO (nie zwracamy w response)
   - Ukrycie `deleted_at` (pole wewnętrzne)
   - Zwracanie tylko publicznych pól zgodnie z `DeckListItemDTO`

### Rate Limiting

- **Status w MVP**: Brak rate limiting
- **Notatka na przyszłość**: Implementacja per-user lub per-IP limitu
- Endpoint read-only, więc niższy priorytet niż write endpoints

### CORS

- Konfiguracja w middleware lub reverse proxy
- Dozwolone origins: domena produkcyjna + localhost (dev)
- Zgodnie z tech-stack.md: "CORS zawężone do domeny produkcyjnej i dev"

## 7. Obsługa błędów

### Katalog błędów

| Kod | Scenariusz                          | Response Body                                                                                 | Akcja                                 |
| --- | ----------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------- |
| 400 | Nieprawidłowy `limit` (>100 lub <1) | `{ error: 'validation_error', message: 'limit must be between 1 and 100' }`                   | Zwróć błąd walidacji                  |
| 400 | Nieprawidłowy `offset` (<0)         | `{ error: 'validation_error', message: 'offset must be non-negative' }`                       | Zwróć błąd walidacji                  |
| 400 | Nieprawidłowy `status`              | `{ error: 'validation_error', message: 'status must be one of: draft, published, rejected' }` | Zwróć błąd walidacji                  |
| 400 | Nieprawidłowy `sort`                | `{ error: 'validation_error', message: 'Invalid sort parameter' }`                            | Zwróć błąd walidacji                  |
| 401 | Brak tokenu JWT                     | `{ error: 'unauthorized', message: 'Authentication required' }`                               | Obsługa w middleware                  |
| 401 | Token wygasły/nieprawidłowy         | `{ error: 'unauthorized', message: 'Invalid or expired token' }`                              | Obsługa w middleware                  |
| 500 | Błąd bazy danych                    | `{ error: 'internal_server_error', message: 'An unexpected error occurred' }`                 | Log error, zwróć generyczny komunikat |
| 500 | Nieoczekiwany wyjątek               | `{ error: 'internal_server_error', message: 'An unexpected error occurred' }`                 | Log error, zwróć generyczny komunikat |

### Strategia obsługi błędów

1. **Walidacja (400)**

   ```typescript
   try {
     const params = listDecksQuerySchema.parse({
       status: url.searchParams.get("status"),
       limit: url.searchParams.get("limit"),
       offset: url.searchParams.get("offset"),
       sort: url.searchParams.get("sort"),
     });
   } catch (error) {
     if (error instanceof z.ZodError) {
       return new Response(
         JSON.stringify({
           error: "validation_error",
           message: error.errors[0].message,
         }),
         { status: 400 }
       );
     }
   }
   ```

2. **Autoryzacja (401)**
   - Obsługa w middleware przed dotarciem do route handler
   - Route handler zakłada, że `context.locals.user` istnieje
   - Guard clause na początku handlera:

   ```typescript
   if (!context.locals.user) {
     return new Response(
       JSON.stringify({
         error: "unauthorized",
         message: "Authentication required",
       }),
       { status: 401 }
     );
   }
   ```

3. **Błędy serwera (500)**
   ```typescript
   try {
     const result = await deckService.listUserDecks(...);
     // ...
   } catch (error) {
     console.error('Error listing decks:', error);
     return new Response(JSON.stringify({
       error: 'internal_server_error',
       message: 'An unexpected error occurred'
     }), { status: 500 });
   }
   ```

### Logowanie błędów

- **Development**: `console.error()` z pełnym stack trace
- **Production**: Strukturalne logi (JSON) bez wrażliwych danych
- **Brak PII w logach**: Nie logować `user_id`, email, itp.
- **Context w logach**: endpoint, timestamp, error type, request_id (opcjonalnie)

## 8. Rozważania dotyczące wydajności

### Optymalizacje zapytań

1. **Wykorzystanie indeksów**
   - Główny indeks: `idx_decks_user_id_status_updated`
   - Struktura: `(user_id, status, updated_at DESC) WHERE deleted_at IS NULL`
   - Pokrywa filtrowanie + sortowanie w jednym indeksie
   - Index-only scan możliwy dla większości zapytań

2. **Agregacja card_count**
   - LEFT JOIN z `cards` + COUNT aggregate
   - Alternatywa: Denormalizacja (kolumna `card_count` w `decks`)
   - MVP: JOIN (prostsze, spójne dane)
   - Później: Rozważyć denormalizację przy >10k talii/user

3. **Paginacja**
   - LIMIT/OFFSET dla prostoty w MVP
   - Wada: Wolniejsze dla dużych offsetów
   - Alternatywa (później): Cursor-based pagination (keyset pagination)
   - Dla MVP: LIMIT 100 max wystarczający

### Potencjalne wąskie gardła

1. **COUNT(\*) dla total**
   - Kosztowne dla dużych tabel
   - Optymalizacja: Cache total count (Redis, 1-5 min TTL)
   - Alternatywa: Approximate count dla UI (pokazać "~123 talii")

2. **N+1 Problem**
   - Unikamy przez LEFT JOIN dla card_count
   - Supabase query builder automatycznie optymalizuje

3. **Large Result Sets**
   - Max 100 items per request (wymuszony limit)
   - Typowy użytkownik: <50 talii (zgodnie z PRD)
   - Nie przewidujemy problemów w MVP

### Strategie cache'owania

**MVP (brak cache):**

- Każde żądanie odpytuje bazę
- Wystarczające dla <1000 użytkowników

**Później (opcjonalnie):**

- Redis cache dla list talii (TTL 1-5 min)
- Invalidacja przy CREATE/UPDATE/DELETE talii
- Cache key: `decks:user:{userId}:status:{status}:sort:{sort}`

### Monitoring wydajności

- **Metryki do śledzenia**:
  - Response time (p50, p95, p99)
  - Database query time
  - Error rate (4xx, 5xx)
  - Requests per second

- **Alerty**:
  - Response time >1s (p95)
  - Error rate >5%
  - Database connection pool exhaustion

## 9. Etapy wdrożenia

### Krok 1: Przygotowanie struktury plików

**Utworzyć pliki:**

- `src/pages/api/decks/index.ts` - API route handler
- `src/lib/services/deck.service.ts` - Logika biznesowa
- `src/lib/schemas/deck.schema.ts` - Zod validation schemas

### Krok 2: Implementacja Zod schema

**Plik: `src/lib/schemas/deck.schema.ts`**

```typescript
import { z } from "zod";

export const listDecksQuerySchema = z.object({
  status: z.enum(["draft", "published", "rejected"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  sort: z.enum(["updated_at_desc", "updated_at_asc", "created_at_desc", "created_at_asc"]).default("updated_at_desc"),
});

export type ListDecksQuery = z.infer<typeof listDecksQuerySchema>;
```

### Krok 3: Implementacja Deck Service

**Plik: `src/lib/services/deck.service.ts`**

**Funkcja główna:**

```typescript
export async function listUserDecks(
  supabase: SupabaseClient,
  userId: string,
  filters: { status?: string },
  pagination: { limit: number; offset: number },
  sort: string
): Promise<{ data: DeckListItemDTO[]; total: number }> {
  // 1. Budowanie base query
  // 2. Aplikacja filtrów (status)
  // 3. Aplikacja sortowania
  // 4. Wykonanie zapytania z paginacją
  // 5. Mapowanie Entity → DTO
  // 6. Zwrot { data, total }
}
```

**Szczegóły implementacji:**

- Użycie `supabase.from('decks').select('*, cards(count)', { count: 'exact' })`
- Filtrowanie: `.eq('user_id', userId).is('deleted_at', null)`
- Opcjonalnie: `.eq('status', filters.status)` jeśli podany
- Sortowanie: mapowanie sort string → `.order()` calls
- Paginacja: `.range(offset, offset + limit - 1)`
- Mapowanie: usunięcie `user_id`, `deleted_at`, dodanie `card_count`

### Krok 4: Implementacja API Route Handler

**Plik: `src/pages/api/decks/index.ts`**

**Struktura:**

```typescript
export const prerender = false;

export async function GET(context: APIContext): Promise<Response> {
  // 1. Guard: sprawdź autoryzację
  // 2. Parse i waliduj query params (Zod)
  // 3. Wywołaj deck service
  // 4. Skonstruuj response DTO
  // 5. Zwróć JSON response
  // 6. Obsłuż błędy (try-catch)
}
```

**Kluczowe elementy:**

- Użycie `context.locals.supabase` i `context.locals.user`
- Early return dla błędów walidacji (400)
- Early return dla braku autoryzacji (401)
- Try-catch dla błędów serwera (500)
- Zwrot `PaginatedDecksResponseDTO`

### Krok 5: Testy manualne

**Scenariusze testowe:**

1. **Happy path - lista wszystkich talii**

   ```bash
   curl -H "Authorization: Bearer <token>" \
     "http://localhost:4321/api/decks"
   ```

   Oczekiwane: 200 OK, lista talii z domyślną paginacją

2. **Filtrowanie po statusie**

   ```bash
   curl -H "Authorization: Bearer <token>" \
     "http://localhost:4321/api/decks?status=draft"
   ```

   Oczekiwane: 200 OK, tylko talie draft

3. **Sortowanie**

   ```bash
   curl -H "Authorization: Bearer <token>" \
     "http://localhost:4321/api/decks?sort=created_at_asc"
   ```

   Oczekiwane: 200 OK, talie posortowane od najstarszych

4. **Paginacja**

   ```bash
   curl -H "Authorization: Bearer <token>" \
     "http://localhost:4321/api/decks?limit=10&offset=20"
   ```

   Oczekiwane: 200 OK, 10 talii od pozycji 20

5. **Błąd walidacji - limit za duży**

   ```bash
   curl -H "Authorization: Bearer <token>" \
     "http://localhost:4321/api/decks?limit=200"
   ```

   Oczekiwane: 400 Bad Request, komunikat o błędzie

6. **Błąd autoryzacji - brak tokenu**

   ```bash
   curl "http://localhost:4321/api/decks"
   ```

   Oczekiwane: 401 Unauthorized

7. **Pusta lista**
   - Użytkownik bez talii
     Oczekiwane: 200 OK, `data: []`, `total: 0`

### Krok 6: Weryfikacja wydajności

**Testy do wykonania:**

- Sprawdzenie EXPLAIN ANALYZE dla głównego zapytania
- Weryfikacja użycia indeksu `idx_decks_user_id_status_updated`
- Test z >100 taliami (paginacja)
- Test z różnymi kombinacjami filtrów i sortowania

**Kryteria akceptacji:**

- Query time <100ms dla <100 talii
- Index scan (nie sequential scan)
- Response time <200ms (całkowity)

### Krok 7: Code review i dokumentacja

**Checklist:**

- [ ] Kod zgodny z ESLint rules
- [ ] TypeScript strict mode bez błędów
- [ ] Wszystkie typy z `src/types.ts` użyte poprawnie
- [ ] Zod schemas pokrywają wszystkie query params
- [ ] Error handling zgodny z planem (400, 401, 500)
- [ ] Logowanie błędów bez PII
- [ ] Komentarze JSDoc dla funkcji service
- [ ] Testy manualne przeszły pomyślnie

### Krok 8: Deployment i monitoring

**Pre-deployment:**

- Merge do main branch
- Weryfikacja CI/CD pipeline (build, typecheck, lint)

**Post-deployment:**

- Sprawdzenie logów produkcyjnych (pierwsze 24h)
- Monitoring response times
- Weryfikacja error rate

**Rollback plan:**

- Jeśli error rate >10%: natychmiastowy rollback
- Jeśli response time >2s (p95): investigate + rollback jeśli nie da się szybko naprawić

---

## Podsumowanie

Endpoint `GET /api/decks` jest podstawowym read-only endpointem do listowania talii użytkownika. Implementacja opiera się na trzech warstwach:

1. **API Route** - walidacja, autoryzacja, orchestration
2. **Service Layer** - logika biznesowa, query building
3. **Database** - optymalne zapytania z wykorzystaniem indeksów

Kluczowe aspekty:

- ✅ Paginacja z limitami (max 100)
- ✅ Filtrowanie po statusie
- ✅ Elastyczne sortowanie
- ✅ Izolacja użytkowników (user_id filter)
- ✅ Computed field (card_count)
- ✅ Proper error handling (400, 401, 500)
- ✅ Performance optimization (indexes)

Plan jest gotowy do implementacji przez zespół programistów.
