# API Endpoint Implementation Plan: POST /api/decks/:deckId/reject

## 1. Przegląd punktu końcowego

Endpoint służy do odrzucenia talii w statusie `draft` z opcjonalnym powodem odrzucenia. Operacja jest nieodwracalna i zmienia status talii na `rejected`, ustawiając timestamp `rejected_at` oraz opcjonalnie zapisując powód w polu `rejected_reason`.

**Kluczowe cechy:**
- Wymaga autoryzacji JWT (Bearer token)
- Wywołuje funkcję RPC `reject_deck(deck_id, reason)` w bazie danych
- Operacja atomowa z blokadą transakcyjną (advisory lock)
- Waliduje własność talii i status `draft`
- Powód odrzucenia jest opcjonalny, max 500 znaków

## 2. Szczegóły żądania

### Metoda HTTP
`POST`

### Struktura URL
```
/api/decks/:deckId/reject
```

### Path Parameters
- **deckId** (wymagany): UUID talii do odrzucenia
  - Format: UUID v4
  - Walidacja: Zod UUID validator

### Request Headers
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

### Request Body
```typescript
{
  "reason"?: string  // Opcjonalny, max 500 znaków
}
```

**Walidacja:**
- `reason`: opcjonalne pole typu string
- Maksymalna długość: 500 znaków
- Jeśli przekroczono limit, zwróć błąd 400 z kodem `reason_too_long`

## 3. Wykorzystywane typy

### Command Model
```typescript
// src/types.ts (już istnieje)
export interface RejectDeckCommand {
  reason?: string;
}
```

### Response DTOs
```typescript
// src/types.ts (już istnieje)
export interface RejectDeckSuccessResponseDTO {
  success: true;
  deck_id: string;
}

export interface RejectDeckErrorResponseDTO {
  success: false;
  error: "deck_not_draft" | "reason_too_long";
  message: string;
}

export type RejectDeckResponseDTO = 
  | RejectDeckSuccessResponseDTO 
  | RejectDeckErrorResponseDTO;
```

### Validation Schemas (nowe)
```typescript
// src/lib/schemas/deck.schema.ts
export const rejectDeckParamsSchema = z.object({
  deckId: z.string().uuid({ message: "Invalid deck ID format" }),
});

export const rejectDeckBodySchema = z.object({
  reason: z
    .string()
    .max(500, "Rejection reason exceeds maximum length of 500 characters")
    .optional(),
});

export type RejectDeckParams = z.infer<typeof rejectDeckParamsSchema>;
export type RejectDeckBody = z.infer<typeof rejectDeckBodySchema>;
```

### RPC Result Type (nowy)
```typescript
// src/lib/services/deck.service.ts
interface RejectDeckRpcResult {
  success: boolean;
  error?: string;
  deck_id?: string;
}
```

## 4. Szczegóły odpowiedzi

### Success Response (200 OK)
```json
{
  "success": true,
  "deck_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

### Error Responses

#### 400 Bad Request - Invalid UUID
```json
{
  "error": "validation_error",
  "message": "Invalid deck ID format"
}
```

#### 400 Bad Request - Reason Too Long
```json
{
  "success": false,
  "error": "reason_too_long",
  "message": "Rejection reason exceeds maximum length of 500 characters"
}
```

#### 400 Bad Request - Deck Not Draft
```json
{
  "success": false,
  "error": "deck_not_draft",
  "message": "Only draft decks can be rejected"
}
```

#### 401 Unauthorized
```json
{
  "error": "unauthorized",
  "message": "Missing or invalid authentication token"
}
```

#### 404 Not Found
```json
{
  "error": "not_found",
  "message": "Deck not found"
}
```

#### 500 Internal Server Error
```json
{
  "error": "internal_error",
  "message": "An unexpected error occurred"
}
```

## 5. Przepływ danych

### 5.1 Request Flow
```
1. Client → POST /api/decks/:deckId/reject
   ├─ Headers: Authorization Bearer token
   └─ Body: { reason?: string }

2. Astro Middleware (src/middleware/index.ts)
   ├─ Weryfikacja JWT token
   ├─ Utworzenie Supabase client z user context
   └─ Przekazanie context.locals.supabase do endpoint handler

3. API Route Handler (src/pages/api/decks/[deckId]/reject.ts)
   ├─ Walidacja path parameter (deckId) przez Zod
   ├─ Walidacja request body (reason) przez Zod
   └─ Wywołanie DeckService.rejectDeck()

4. Deck Service (src/lib/services/deck.service.ts)
   ├─ Wywołanie RPC: supabase.rpc('reject_deck', { deck_id_param, reason_param })
   ├─ Parsowanie wyniku JSONB
   └─ Mapowanie na DTO lub rzucenie błędu

5. Database RPC Function (reject_deck)
   ├─ Advisory lock: pg_advisory_xact_lock(hashtext(deck_id))
   ├─ SELECT deck FOR UPDATE (blokada wiersza)
   ├─ Walidacje:
   │  ├─ Deck exists
   │  ├─ User is owner (auth.uid())
   │  ├─ Status = 'draft'
   │  └─ Not soft-deleted
   ├─ UPDATE decks SET:
   │  ├─ status = 'rejected'
   │  ├─ rejected_at = NOW()
   │  ├─ rejected_reason = reason_param
   │  └─ updated_at = NOW()
   └─ RETURN JSONB result

6. Response
   └─ Return 200 OK with success DTO or error DTO
```

### 5.2 Error Handling Flow
```
Validation Error (Zod)
├─ Invalid UUID → 400 Bad Request
└─ Reason too long → 400 Bad Request

RPC Business Logic Errors
├─ deck_not_found → throw Error → 404 Not Found
├─ unauthorized → throw Error → 404 Not Found (nie ujawniamy istnienia)
└─ deck_not_draft → 200 OK with error DTO

RPC Execution Error
└─ Database error → throw Error → 500 Internal Server Error

Middleware Errors
└─ No JWT or invalid → 401 Unauthorized
```

## 6. Względy bezpieczeństwa

### 6.1 Uwierzytelnianie
- **JWT Token**: Wymagany w header `Authorization: Bearer <token>`
- **Middleware**: Weryfikacja tokenu przez Astro middleware
- **User Context**: Token zawiera `user_id` używany w RPC do weryfikacji własności

### 6.2 Autoryzacja
- **Własność zasobu**: RPC funkcja weryfikuje `deck.user_id = auth.uid()`
- **404 zamiast 403**: Jeśli użytkownik nie jest właścicielem, zwracamy 404 (nie ujawniamy istnienia zasobu)
- **Status check**: Tylko talie w statusie `draft` mogą być odrzucone

### 6.3 Walidacja danych wejściowych
- **UUID validation**: Zod sprawdza format UUID przed wywołaniem RPC
- **Reason length**: Max 500 znaków (walidacja Zod + DB constraint)
- **SQL Injection**: Zabezpieczone przez parametryzowane wywołanie RPC
- **XSS**: Reason jest przechowywany jako plain text, nie renderowany jako HTML

### 6.4 Race Conditions
- **Advisory Lock**: `pg_advisory_xact_lock()` zapobiega równoczesnym modyfikacjom tej samej talii
- **Row Lock**: `SELECT ... FOR UPDATE` blokuje wiersz na czas transakcji
- **Atomowość**: Cała operacja w jednej transakcji RPC

### 6.5 Rate Limiting
- **Brak w MVP**: Rate limiting nie jest implementowany w MVP
- **Przyszłość**: Rozważyć dodanie limitu requestów per użytkownik/IP

## 7. Obsługa błędów

### 7.1 Błędy walidacji (400 Bad Request)

#### Invalid UUID Format
```typescript
// Zod validation error
{
  error: "validation_error",
  message: "Invalid deck ID format"
}
```

**Przyczyna**: Path parameter `deckId` nie jest poprawnym UUID

**Obsługa**: 
- Zod validator rzuca ZodError
- Endpoint handler łapie i zwraca 400

#### Reason Too Long
```typescript
{
  success: false,
  error: "reason_too_long",
  message: "Rejection reason exceeds maximum length of 500 characters"
}
```

**Przyczyna**: Pole `reason` przekracza 500 znaków

**Obsługa**:
- Zod validator rzuca ZodError
- Endpoint handler łapie i zwraca 400

### 7.2 Błędy logiki biznesowej (200 OK z error DTO)

#### Deck Not Draft
```typescript
{
  success: false,
  error: "deck_not_draft",
  message: "Only draft decks can be rejected"
}
```

**Przyczyna**: Talia ma status `published` lub `rejected`

**Obsługa**:
- RPC zwraca JSONB z `success: false`
- Service mapuje na error DTO
- Endpoint zwraca 200 OK z error DTO (nie jest to błąd HTTP, ale biznesowy)

### 7.3 Błędy autoryzacji

#### Missing or Invalid JWT (401 Unauthorized)
```typescript
{
  error: "unauthorized",
  message: "Missing or invalid authentication token"
}
```

**Przyczyna**: Brak tokenu lub token nieprawidłowy/wygasły

**Obsługa**:
- Middleware wykrywa brak/nieprawidłowy token
- Zwraca 401 przed wywołaniem endpoint handler

#### Deck Not Found or Unauthorized (404 Not Found)
```typescript
{
  error: "not_found",
  message: "Deck not found"
}
```

**Przyczyny**:
- Talia nie istnieje
- Talia należy do innego użytkownika
- Talia jest soft-deleted

**Obsługa**:
- RPC zwraca `deck_not_found` lub `unauthorized`
- Service rzuca Error("Deck not found")
- Endpoint handler łapie i zwraca 404

**Bezpieczeństwo**: Nie rozróżniamy "nie istnieje" vs "nie masz dostępu" aby nie ujawniać istnienia zasobów

### 7.4 Błędy serwera (500 Internal Server Error)

#### Database RPC Error
```typescript
{
  error: "internal_error",
  message: "An unexpected error occurred"
}
```

**Przyczyny**:
- Błąd połączenia z bazą danych
- Timeout RPC
- Nieoczekiwany błąd w funkcji RPC
- Błąd parsowania wyniku JSONB

**Obsługa**:
- Service loguje szczegóły błędu (console.error)
- Rzuca Error z ogólnym komunikatem
- Endpoint handler łapie i zwraca 500 z generycznym komunikatem

**Logging**: Szczegóły błędu logowane po stronie serwera, nie ujawniane klientowi

## 8. Rozważania dotyczące wydajności

### 8.1 Optymalizacje zapytań
- **Single RPC Call**: Cała operacja w jednym wywołaniu RPC (minimalizacja round-trips)
- **Advisory Lock**: Efektywna blokada na poziomie aplikacji (lepsza niż table lock)
- **Row Lock**: `FOR UPDATE` blokuje tylko konkretny wiersz, nie całą tabelę
- **Index Usage**: Query używa primary key index (`decks.id`)

### 8.2 Potencjalne wąskie gardła
- **Advisory Lock Contention**: Jeśli wielu użytkowników próbuje odrzucić tę samą talię równocześnie
  - **Mitigation**: W praktyce rzadkie (każdy użytkownik ma swoje talie)
- **RPC Timeout**: Domyślny timeout Supabase to 60s
  - **Mitigation**: Operacja jest szybka (<100ms), timeout nie powinien wystąpić

### 8.3 Skalowanie
- **Stateless**: Endpoint jest stateless, łatwo skalowalny poziomo
- **Connection Pooling**: Supabase zarządza connection poolingiem
- **No N+1 Queries**: Wszystko w jednym RPC call

### 8.4 Monitoring
- **Metrics do śledzenia**:
  - Liczba odrzuceń per użytkownik/dzień
  - Czas wykonania RPC
  - Częstotliwość błędów `deck_not_draft`
- **Alerts**:
  - Wysoki wskaźnik błędów 500
  - Długi czas wykonania RPC (>1s)

## 9. Etapy wdrożenia

### Krok 1: Dodanie schematów walidacji Zod
**Plik**: `src/lib/schemas/deck.schema.ts`

**Zadania**:
1. Dodać `rejectDeckParamsSchema` dla walidacji UUID
2. Dodać `rejectDeckBodySchema` dla walidacji `reason` (max 500 znaków)
3. Wyeksportować typy TypeScript z inferencji Zod

**Przykład**:
```typescript
export const rejectDeckParamsSchema = z.object({
  deckId: z.string().uuid({ message: "Invalid deck ID format" }),
});

export const rejectDeckBodySchema = z.object({
  reason: z
    .string()
    .max(500, "Rejection reason exceeds maximum length of 500 characters")
    .optional(),
});

export type RejectDeckParams = z.infer<typeof rejectDeckParamsSchema>;
export type RejectDeckBody = z.infer<typeof rejectDeckBodySchema>;
```

### Krok 2: Dodanie metody `rejectDeck()` do DeckService
**Plik**: `src/lib/services/deck.service.ts`

**Zadania**:
1. Dodać interfejs `RejectDeckRpcResult` dla wyniku RPC
2. Zaimplementować funkcję `rejectDeck(supabase, deckId, reason?)`
3. Wywołać RPC `reject_deck` z parametrami
4. Parsować wynik JSONB i mapować na DTO
5. Obsłużyć błędy biznesowe (`deck_not_draft`, `deck_not_found`, `unauthorized`)
6. Logować błędy wykonania RPC

**Sygnatura**:
```typescript
export async function rejectDeck(
  supabase: TypedSupabaseClient,
  deckId: string,
  reason?: string
): Promise<RejectDeckSuccessResponseDTO | RejectDeckErrorResponseDTO>
```

**Logika**:
- Wywołaj `supabase.rpc('reject_deck', { deck_id_param: deckId, reason_param: reason })`
- Jeśli RPC error → throw Error (500)
- Jeśli `result.success === true` → return success DTO
- Jeśli `result.error === 'deck_not_found' | 'unauthorized'` → throw Error("Deck not found") (404)
- Jeśli `result.error === 'deck_not_draft'` → return error DTO (200)
- Inne błędy → throw Error (500)

**Wzoruj się na**: Istniejącej funkcji `publishDeck()` w tym samym pliku

### Krok 3: Utworzenie API route handler
**Plik**: `src/pages/api/decks/[deckId]/reject.ts`

**Zadania**:
1. Utworzyć nowy plik w katalogu `src/pages/api/decks/[deckId]/`
2. Dodać `export const prerender = false` (SSR)
3. Zaimplementować handler `POST` z następującą logiką:
   - Sprawdzić autoryzację (context.locals.supabase)
   - Walidować path parameter przez `rejectDeckParamsSchema`
   - Parsować i walidować request body przez `rejectDeckBodySchema`
   - Wywołać `DeckService.rejectDeck()`
   - Zwrócić odpowiedź 200 OK z DTO
4. Obsłużyć błędy:
   - ZodError → 400 Bad Request
   - "Deck not found" → 404 Not Found
   - Inne błędy → 500 Internal Server Error
5. Dodać odpowiednie nagłówki CORS (jeśli wymagane)

**Struktura**:
```typescript
import type { APIRoute } from "astro";
import { rejectDeck } from "@/lib/services/deck.service";
import { rejectDeckParamsSchema, rejectDeckBodySchema } from "@/lib/schemas/deck.schema";
import { ZodError } from "zod";

export const prerender = false;

export const POST: APIRoute = async ({ params, request, locals }) => {
  // 1. Check authentication
  const supabase = locals.supabase;
  if (!supabase) {
    return new Response(
      JSON.stringify({ error: "unauthorized", message: "Missing or invalid authentication token" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    // 2. Validate path parameters
    const { deckId } = rejectDeckParamsSchema.parse(params);

    // 3. Parse and validate request body
    const body = await request.json();
    const { reason } = rejectDeckBodySchema.parse(body);

    // 4. Call service
    const result = await rejectDeck(supabase, deckId, reason);

    // 5. Return response
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    // Handle errors (see error handling section)
  }
};
```

### Krok 4: Obsługa błędów w API route
**Plik**: `src/pages/api/decks/[deckId]/reject.ts`

**Zadania**:
1. Dodać blok `catch` w handlerze POST
2. Obsłużyć `ZodError` → 400 Bad Request
3. Obsłużyć `Error("Deck not found")` → 404 Not Found
4. Obsłużyć inne błędy → 500 Internal Server Error
5. Logować błędy serwera (console.error)
6. Zwracać generyczne komunikaty błędów (nie ujawniać szczegółów technicznych)

**Przykład**:
```typescript
catch (error) {
  // Validation errors
  if (error instanceof ZodError) {
    return new Response(
      JSON.stringify({
        error: "validation_error",
        message: error.errors[0]?.message || "Invalid request data",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Not found errors
  if (error instanceof Error && error.message === "Deck not found") {
    return new Response(
      JSON.stringify({ error: "not_found", message: "Deck not found" }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  // Server errors
  console.error("[API /api/decks/:deckId/reject] Unexpected error:", error);
  return new Response(
    JSON.stringify({ error: "internal_error", message: "An unexpected error occurred" }),
    { status: 500, headers: { "Content-Type": "application/json" } }
  );
}
```

### Krok 5: Testowanie manualne
**Narzędzia**: cURL, Postman, lub Thunder Client (VS Code)

**Scenariusze testowe**:

1. **Happy Path - Odrzucenie draft deck bez powodu**
   ```bash
   curl -X POST http://localhost:4321/api/decks/{valid-draft-deck-id}/reject \
     -H "Authorization: Bearer {valid-jwt}" \
     -H "Content-Type: application/json" \
     -d '{}'
   ```
   **Oczekiwany wynik**: 200 OK, `{ success: true, deck_id: "..." }`

2. **Happy Path - Odrzucenie draft deck z powodem**
   ```bash
   curl -X POST http://localhost:4321/api/decks/{valid-draft-deck-id}/reject \
     -H "Authorization: Bearer {valid-jwt}" \
     -H "Content-Type: application/json" \
     -d '{ "reason": "Cards are too difficult for beginners" }'
   ```
   **Oczekiwany wynik**: 200 OK, `{ success: true, deck_id: "..." }`

3. **Validation Error - Invalid UUID**
   ```bash
   curl -X POST http://localhost:4321/api/decks/invalid-uuid/reject \
     -H "Authorization: Bearer {valid-jwt}" \
     -H "Content-Type: application/json" \
     -d '{}'
   ```
   **Oczekiwany wynik**: 400 Bad Request, `{ error: "validation_error", message: "Invalid deck ID format" }`

4. **Validation Error - Reason Too Long**
   ```bash
   curl -X POST http://localhost:4321/api/decks/{valid-draft-deck-id}/reject \
     -H "Authorization: Bearer {valid-jwt}" \
     -H "Content-Type: application/json" \
     -d '{ "reason": "{string with 501+ characters}" }'
   ```
   **Oczekiwany wynik**: 400 Bad Request, `{ error: "validation_error", message: "Rejection reason exceeds maximum length of 500 characters" }`

5. **Business Logic Error - Deck Not Draft**
   ```bash
   curl -X POST http://localhost:4321/api/decks/{published-deck-id}/reject \
     -H "Authorization: Bearer {valid-jwt}" \
     -H "Content-Type: application/json" \
     -d '{}'
   ```
   **Oczekiwany wynik**: 200 OK, `{ success: false, error: "deck_not_draft", message: "Only draft decks can be rejected" }`

6. **Authorization Error - Missing JWT**
   ```bash
   curl -X POST http://localhost:4321/api/decks/{valid-draft-deck-id}/reject \
     -H "Content-Type: application/json" \
     -d '{}'
   ```
   **Oczekiwany wynik**: 401 Unauthorized

7. **Not Found - Deck Doesn't Exist**
   ```bash
   curl -X POST http://localhost:4321/api/decks/{non-existent-uuid}/reject \
     -H "Authorization: Bearer {valid-jwt}" \
     -H "Content-Type: application/json" \
     -d '{}'
   ```
   **Oczekiwany wynik**: 404 Not Found, `{ error: "not_found", message: "Deck not found" }`

8. **Not Found - Deck Belongs to Another User**
   ```bash
   curl -X POST http://localhost:4321/api/decks/{other-user-deck-id}/reject \
     -H "Authorization: Bearer {valid-jwt}" \
     -H "Content-Type: application/json" \
     -d '{}'
   ```
   **Oczekiwany wynik**: 404 Not Found, `{ error: "not_found", message: "Deck not found" }`

### Krok 6: Weryfikacja w bazie danych
**Narzędzia**: Supabase Studio, psql, lub pgAdmin

**Zadania**:
1. Po pomyślnym odrzuceniu, sprawdzić rekord w tabeli `decks`:
   ```sql
   SELECT id, name, status, rejected_at, rejected_reason, updated_at
   FROM decks
   WHERE id = '{rejected-deck-id}';
   ```
   **Oczekiwane wartości**:
   - `status` = `'rejected'`
   - `rejected_at` = timestamp (not null)
   - `rejected_reason` = podany powód lub NULL
   - `updated_at` = timestamp (zaktualizowany)

2. Sprawdzić, czy karty w odrzuconej talii pozostają niezmienione:
   ```sql
   SELECT id, deck_id, front, back, deleted_at
   FROM cards
   WHERE deck_id = '{rejected-deck-id}';
   ```
   **Oczekiwane**: Karty nie są usuwane ani modyfikowane

3. Sprawdzić, czy nie można ponownie odrzucić tej samej talii:
   - Wywołać endpoint ponownie
   - Oczekiwany wynik: 200 OK z `{ success: false, error: "deck_not_draft", ... }`

### Krok 7: Dokumentacja i cleanup
**Zadania**:
1. Zaktualizować dokumentację API (jeśli istnieje)
2. Dodać komentarze JSDoc do nowych funkcji
3. Sprawdzić, czy wszystkie importy są poprawne
4. Uruchomić linter: `npm run lint`
5. Uruchomić type checker: `npm run typecheck`
6. Sformatować kod: `npx prettier --write "src/**/*.ts"`
7. Commitować zmiany z opisowym komunikatem:
   ```
   feat(api): implement POST /api/decks/:deckId/reject endpoint
   
   - Add rejectDeck() service method with RPC call
   - Add Zod validation schemas for params and body
   - Implement API route handler with error handling
   - Validate reason field (max 500 chars)
   - Return appropriate HTTP status codes
   ```

### Krok 8: Integracja z frontendem (opcjonalnie, jeśli w zakresie)
**Zadania**:
1. Utworzyć funkcję API client do wywołania endpointu
2. Dodać UI button "Reject Deck" w widoku draft deck
3. Dodać modal z opcjonalnym polem tekstowym dla powodu
4. Obsłużyć success/error responses
5. Pokazać toast notification po odrzuceniu
6. Przekierować użytkownika do listy talii

**Uwaga**: Ten krok może być poza zakresem implementacji samego endpointu API.

## 10. Checklist przed merge

- [ ] Schematy Zod dodane i przetestowane
- [ ] Metoda `rejectDeck()` w DeckService zaimplementowana
- [ ] API route handler utworzony w `src/pages/api/decks/[deckId]/reject.ts`
- [ ] Wszystkie scenariusze błędów obsłużone
- [ ] Testy manualne przeszły pomyślnie
- [ ] Weryfikacja w bazie danych potwierdza poprawność operacji
- [ ] Linter i type checker nie zgłaszają błędów
- [ ] Kod sformatowany przez Prettier
- [ ] Komentarze JSDoc dodane do publicznych funkcji
- [ ] Commit message zgodny z Conventional Commits
- [ ] Dokumentacja zaktualizowana (jeśli dotyczy)

## 11. Potencjalne rozszerzenia (po MVP)

1. **Powiadomienia email**: Wysłać email do użytkownika po odrzuceniu talii
2. **Historia odrzuceń**: Przechowywać historię wszystkich odrzuceń (audit log)
3. **Przywracanie odrzuconych talii**: Endpoint do zmiany statusu z `rejected` na `draft`
4. **Bulk reject**: Odrzucanie wielu talii jednocześnie
5. **Powody z predefiniowanej listy**: Dropdown z typowymi powodami odrzucenia
6. **Rate limiting**: Ograniczenie liczby odrzuceń per użytkownik/dzień
7. **Webhook**: Wywołanie webhooka po odrzuceniu (integracje zewnętrzne)
