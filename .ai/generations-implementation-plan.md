# API Endpoint Implementation Plan: POST /api/generations

## 1. Przegląd punktu końcowego

Endpoint `POST /api/generations` inicjuje asynchroniczny proces generowania fiszek przez AI na podstawie dostarczonego tekstu źródłowego. Endpoint zwraca natychmiastową odpowiedź 202 Accepted z identyfikatorem sesji generacji, podczas gdy faktyczne przetwarzanie AI odbywa się w tle.

**Kluczowe cechy:**
- Asynchroniczne przetwarzanie (non-blocking)
- Wymuszenie maksymalnie 1 aktywnej generacji per użytkownik
- Automatyczna sanityzacja tekstu źródłowego
- Automatyczne generowanie nazwy talii (opcjonalne)
- Timeout 5 minut dla procesu AI
- Limit 20 wygenerowanych kart (przycięcie nadmiarowych)

## 2. Szczegóły żądania

### Metoda HTTP
`POST`

### Struktura URL
```
/api/generations
```

### Nagłówki żądania
```
Content-Type: application/json
```

**Uwaga:** Na tym etapie nie implementujemy autoryzacji JWT. Używamy `DEFAULT_USER_ID` z konfiguracji (podobnie jak w `GET /api/decks`). Pełna autoryzacja zostanie dodana później.

### Request Body

**Struktura:**
```typescript
{
  source_text: string,    // wymagane, 1-10,000 znaków
  deck_name?: string      // opcjonalne, 1-100 znaków
}
```

**Przykład:**
```json
{
  "source_text": "Fotosynteza to proces, w którym rośliny przekształcają światło słoneczne w energię chemiczną...",
  "deck_name": "Biologia - Fotosynteza"
}
```

### Parametry

**Wymagane:**
- `source_text` (string): Tekst źródłowy do wygenerowania fiszek
  - Minimum: 1 znak
  - Maximum: 10,000 znaków
  - Będzie sanityzowany przed zapisem do bazy

**Opcjonalne:**
- `deck_name` (string): Nazwa dla nowo utworzonej talii
  - Minimum: 1 znak
  - Maximum: 100 znaków
  - Domyślnie: auto-generowana nazwa w formacie "Deck YYYY-MM-DD HH:mm"

## 3. Wykorzystywane typy

### Command Model (Input)
```typescript
// z src/types.ts
CreateGenerationCommand {
  source_text: string;
  deck_name: string;
}
```

### Response DTOs (Output)

**Success Response (202):**
```typescript
// z src/types.ts
GenerationInitResponseDTO {
  generation_session_id: string;  // UUID
  deck_id: string;                // UUID
  status: string;                 // "in_progress"
  started_at: string;             // ISO8601 timestamp
}
```

**Error Response - Validation (400):**
```typescript
// z src/types.ts
GenerationValidationErrorResponseDTO {
  error: "validation_error";
  message: string;
  details: {
    field: string;
    current_length: number;
    max_length: number;
  };
}
```

**Error Response - Concurrent Generation (400):**
```typescript
// z src/types.ts
ConcurrentGenerationErrorResponseDTO {
  error: "generation_in_progress";
  message: string;
  active_session_id: string;  // UUID
}
```

**Error Response - Generic (401, 500):**
```typescript
// z src/types.ts
ApiErrorResponseDTO {
  error: string;
  message: string;
}
```

### Zod Validation Schema

Utworzyć w `src/lib/schemas/generation.schema.ts`:

```typescript
import { z } from "zod";

export const createGenerationSchema = z.object({
  source_text: z
    .string()
    .min(1, "Source text is required")
    .max(10000, "Source text must not exceed 10,000 characters")
    .trim(),
  deck_name: z
    .string()
    .min(1, "Deck name must be at least 1 character")
    .max(100, "Deck name must not exceed 100 characters")
    .trim()
    .optional(),
});

export type CreateGenerationInput = z.infer<typeof createGenerationSchema>;
```

## 4. Szczegóły odpowiedzi

### Success Response (202 Accepted)

**Status Code:** `202 Accepted`

**Body:**
```json
{
  "generation_session_id": "550e8400-e29b-41d4-a716-446655440000",
  "deck_id": "660e8400-e29b-41d4-a716-446655440001",
  "status": "in_progress",
  "started_at": "2024-11-09T13:45:30.123Z"
}
```

### Error Responses

#### 400 Bad Request - Validation Error

**Przypadek 1: Przekroczenie limitu znaków**
```json
{
  "error": "validation_error",
  "message": "Source text must not exceed 10,000 characters",
  "details": {
    "field": "source_text",
    "current_length": 12000,
    "max_length": 10000
  }
}
```

**Przypadek 2: Aktywna generacja**
```json
{
  "error": "generation_in_progress",
  "message": "You already have a generation in progress. Please wait for it to complete.",
  "active_session_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### 500 Internal Server Error - Brak DEFAULT_USER_ID

```json
{
  "error": "internal_server_error",
  "message": "DEFAULT_USER_ID not configured"
}
```

#### 500 Internal Server Error

```json
{
  "error": "internal_server_error",
  "message": "An unexpected error occurred. Please try again later."
}
```

## 5. Przepływ danych

### Diagram przepływu

```
Client Request
      ↓
[API Route Handler] /api/generations.ts
  - Sprawdzenie Supabase client availability
  - Sprawdzenie DEFAULT_USER_ID availability
  - Parsowanie request body
      ↓
[Zod Validation]
  - Walidacja source_text (1-10,000 chars)
  - Walidacja deck_name (1-100 chars, optional)
      ↓
[Generation Service] checkActiveGeneration()
  - Query: generation_sessions WHERE user_id = ? AND status = 'in_progress'
  - Jeśli istnieje → 400 Error
      ↓
[Generation Service] sanitizeSourceText()
  - Usunięcie HTML tags
  - Normalizacja whitespace
  - Trim
      ↓
[Generation Service] generateDeckName() (jeśli brak deck_name)
  - Format: "Deck YYYY-MM-DD HH:mm"
      ↓
[Deck Service] createDeck()
  - INSERT INTO decks (user_id, name, status='draft')
  - Zwraca deck_id
      ↓
[Generation Service] createGenerationSession()
  - INSERT INTO generation_sessions
    (user_id, deck_id, status='in_progress', 
     sanitized_source_text, started_at)
  - Zwraca session_id
      ↓
[Generation Service] initiateAIGeneration() (async, non-blocking)
  - Wywołanie w tle (Promise.resolve().then(...))
  - Nie czeka na zakończenie
      ↓
[Response 202 Accepted]
  - Zwrócenie GenerationInitResponseDTO
      ↓
Client otrzymuje odpowiedź

--- Proces w tle (asynchroniczny) ---

[AI Service] callOpenRouter()
  - POST do OpenRouter API
  - Timeout: 5 minut
  - Model: zgodnie z params
      ↓
[AI Service] parseAIResponse()
  - Parsowanie JSON z kartami
  - Walidacja struktury (front/back)
      ↓
[Generation Service] truncateCards()
  - Jeśli >20 kart → przycięcie do 20
  - Zapisanie truncated_count
      ↓
[Card Service] createCards()
  - Batch INSERT INTO cards
  - Position: 1, 2, 3, ...
      ↓
[Generation Service] updateSessionStatus()
  - UPDATE generation_sessions
    SET status='completed', finished_at=NOW()
      ↓
Proces zakończony
```

### Interakcje z bazą danych

**1. Sprawdzenie aktywnej generacji:**
```sql
SELECT id FROM generation_sessions
WHERE user_id = $1 
  AND status = 'in_progress'
LIMIT 1;
```

**2. Utworzenie deck:**
```sql
INSERT INTO decks (user_id, name, status)
VALUES ($1, $2, 'draft')
RETURNING id;
```

**3. Utworzenie generation_session:**
```sql
INSERT INTO generation_sessions 
  (user_id, deck_id, status, sanitized_source_text, started_at, params)
VALUES ($1, $2, 'in_progress', $3, NOW(), $4)
RETURNING id;
```

**4. Aktualizacja statusu (w tle):**
```sql
UPDATE generation_sessions
SET status = $1, 
    finished_at = NOW(),
    error_code = $2,
    error_message = $3,
    truncated_count = $4
WHERE id = $5;
```

### Interakcje z zewnętrznymi usługami

**OpenRouter API:**
- Endpoint: `https://openrouter.ai/api/v1/chat/completions`
- Metoda: POST
- Headers:
  - `Authorization: Bearer ${OPENROUTER_API_KEY}`
  - `Content-Type: application/json`
- Timeout: 5 minut (300,000 ms)
- Retry: Brak (MVP)

## 6. Względy bezpieczeństwa

### Uwierzytelnianie i Autoryzacja (MVP)

**WAŻNE: Na tym etapie NIE implementujemy pełnej autoryzacji JWT.**

Zgodnie z obecnym wzorcem w projekcie (patrz: `GET /api/decks`):
- **User ID**: Używamy `DEFAULT_USER_ID` z konfiguracji (`src/db/supabase.client.ts`)
- **Brak JWT**: Endpoint nie wymaga nagłówka Authorization
- **Walidacja**: Sprawdzamy tylko czy `DEFAULT_USER_ID` jest skonfigurowany
- **Implementacja później**: Pełna autoryzacja JWT + middleware zostanie dodana w przyszłości

**Guards w endpoincie:**
```typescript
// Guard 1: Check Supabase client availability
const useMockData = import.meta.env.USE_MOCK_DATA === "true";
if (!useMockData && !context.locals.supabase) {
  return new Response(JSON.stringify({
    error: "internal_server_error",
    message: "Database connection not available"
  }), { status: 500 });
}

// Guard 2: Check DEFAULT_USER_ID is configured
if (!useMockData && !DEFAULT_USER_ID) {
  return new Response(JSON.stringify({
    error: "internal_server_error",
    message: "DEFAULT_USER_ID not configured"
  }), { status: 500 });
}
```

### Bezpieczeństwo (Później)
- **JWT Auth**: Będzie dodane w przyszłości
- **RLS**: Row Level Security zostanie włączone później
- **Middleware**: Weryfikacja tokenu zostanie dodana później

### Walidacja danych wejściowych

**1. Walidacja Zod (server-side):**
- Typ danych (string)
- Długość source_text (1-10,000)
- Długość deck_name (1-100)
- Trim whitespace

**2. Sanityzacja source_text:**
```typescript
function sanitizeSourceText(text: string): string {
  // Usunięcie HTML tags
  let sanitized = text.replace(/<[^>]*>/g, '');
  
  // Normalizacja whitespace
  sanitized = sanitized.replace(/\s+/g, ' ');
  
  // Trim
  sanitized = sanitized.trim();
  
  return sanitized;
}
```

**3. Walidacja biznesowa:**
- Sprawdzenie aktywnej generacji (max 1 per user)
- Wymuszenie przez unikalny indeks DB

### Ochrona sekretów
- **OPENROUTER_API_KEY**: Tylko w zmiennych środowiskowych serwera
- **Dostęp**: Tylko kod serwera (nie frontend)
- **Weryfikacja**: `import.meta.env.OPENROUTER_API_KEY` w Astro API route

### Rate Limiting
- **MVP**: 1 aktywna generacja per użytkownik (wymuszenie przez DB)
- **Później**: Rate limiting per IP/user (np. 10 generacji/dzień)

### SQL Injection
- **Ochrona**: Supabase client używa parametryzowanych zapytań
- **Brak**: Bezpośredniego SQL w kodzie aplikacji

## 7. Obsługa błędów

### Kategorie błędów

#### 1. Błędy walidacji (400 Bad Request)

**Scenariusz A: Nieprawidłowa długość source_text**
- Zbyt krótki: `current_length: 0`
- Zbyt długi: `current_length > 10000`
- Zwracany typ: `GenerationValidationErrorResponseDTO`

**Scenariusz B: Nieprawidłowa długość deck_name**
- Zbyt długi: `current_length > 100`
- Zwracany typ: `GenerationValidationErrorResponseDTO`

**Scenariusz C: Aktywna generacja w toku**
- Użytkownik ma już generację ze statusem 'in_progress'
- Zwracany typ: `ConcurrentGenerationErrorResponseDTO`
- Zawiera: `active_session_id`

#### 2. Błędy konfiguracji (500 Internal Server Error)

**Scenariusz A: Brak Supabase client**
- `context.locals.supabase` jest undefined
- Zwracany typ: `ApiErrorResponseDTO`
- Message: "Database connection not available"

**Scenariusz B: Brak DEFAULT_USER_ID**
- `DEFAULT_USER_ID` nie jest skonfigurowany w env
- Zwracany typ: `ApiErrorResponseDTO`
- Message: "DEFAULT_USER_ID not configured"

#### 3. Inne błędy serwera (500 Internal Server Error)

**Scenariusz A: Błąd tworzenia deck**
- Błąd połączenia z DB
- Błąd walidacji DB constraints
- Zwracany typ: `ApiErrorResponseDTO`

**Scenariusz B: Błąd tworzenia generation_session**
- Błąd połączenia z DB
- Rollback: usuń utworzony deck
- Zwracany typ: `ApiErrorResponseDTO`

### Błędy w procesie asynchronicznym (AI)

**Obsługa w tle (nie wpływa na odpowiedź 202):**

1. **Timeout (5 minut):**
   - Status: 'timeout'
   - error_code: 'timeout_exceeded'
   - error_message: 'Generation exceeded 5 minute timeout'

2. **Błąd OpenRouter API:**
   - Status: 'failed'
   - error_code: 'openrouter_error'
   - error_message: Komunikat z API (max 1000 znaków)

3. **Nieznany błąd:**
   - Status: 'failed'
   - error_code: 'unknown_error'
   - error_message: 'An unexpected error occurred during generation'

### Strategia logowania błędów

**1. Server-side logging:**
```typescript
console.error("[POST /api/generations] Error:", {
  userId: user.id,
  error: error.message,
  timestamp: new Date().toISOString()
});
```

**2. Database logging (generation_sessions):**
- `error_code`: Kod błędu
- `error_message`: Szczegóły błędu (max 1000 znaków)
- `status`: 'failed' lub 'timeout'

**3. User-facing messages:**
- Generyczne komunikaty (bez szczegółów technicznych)

## 8. Rozważania dotyczące wydajności

### Potencjalne wąskie gardła

**1. Wywołanie OpenRouter API:**
- **Problem**: Długi czas odpowiedzi (do 5 minut)
- **Rozwiązanie**: Asynchroniczne przetwarzanie (non-blocking)

**2. Zapisywanie wielu kart:**
- **Problem**: Batch insert 20 kart
- **Rozwiązanie**: Użycie Supabase batch insert

**3. Sprawdzanie aktywnej generacji:**
- **Problem**: Query na każde żądanie
- **Rozwiązanie**: Indeks DB na (user_id, status)

### Strategie optymalizacji

**1. Asynchroniczne przetwarzanie:**
```typescript
// Nie czekaj na zakończenie AI
Promise.resolve().then(() => processAIGeneration(sessionId, sanitizedText));

// Natychmiastowa odpowiedź 202
return new Response(JSON.stringify(responseDTO), { status: 202 });
```

**2. Timeout enforcement:**
```typescript
async function callOpenRouterWithTimeout(text: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(OPENROUTER_URL, {
      signal: controller.signal,
      // ... inne opcje
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}
```

### Monitoring wydajności

**Metryki do śledzenia (później):**
- Średni czas odpowiedzi endpointu (cel: <500ms)
- Liczba timeoutów AI (cel: <5%)
- Liczba błędów 500 (cel: <1%)
- Liczba aktywnych generacji

## 9. Kroki implementacji

### Krok 1: Utworzenie Zod schema
**Plik:** `src/lib/schemas/generation.schema.ts`

**Zadania:**
- Zdefiniować `createGenerationSchema` z walidacją source_text i deck_name
- Wyeksportować typ `CreateGenerationInput`

**Zależności:** zod

### Krok 2: Utworzenie Generation Service
**Plik:** `src/lib/services/generation.service.ts`

**Funkcje do implementacji:**
1. `checkActiveGeneration(supabase, userId)`: Sprawdza aktywną generację
2. `sanitizeSourceText(text)`: Oczyszcza tekst źródłowy
3. `generateDeckName()`: Generuje automatyczną nazwę talii
4. `createGenerationSession(supabase, userId, deckId, sanitizedText, params)`: Tworzy sesję
5. `updateSessionStatus(supabase, sessionId, status, errorCode?, errorMessage?, truncatedCount?)`: Aktualizuje status
6. `processAIGeneration(supabase, sessionId, sanitizedText)`: Główna funkcja asynchroniczna

**Zależności:** 
- Supabase client
- AI service
- Card service

### Krok 3: Utworzenie AI Service
**Plik:** `src/lib/services/ai.service.ts`

**Funkcje do implementacji:**
1. `callOpenRouter(text, timeoutMs)`: Wywołanie OpenRouter API z timeoutem
2. `parseAIResponse(response)`: Parsowanie odpowiedzi AI
3. `truncateCards(cards, maxCount)`: Przycięcie kart do limitu

**Zależności:**
- `OPENROUTER_API_KEY` z env
- fetch API z AbortController

### Krok 4: Rozszerzenie Deck Service
**Plik:** `src/lib/services/deck.service.ts`

**Funkcje do implementacji:**
1. `createDeck(supabase, userId, name)`: Tworzy nowy deck
2. `deleteDeck(supabase, deckId)`: Usuwa deck (rollback)

**Zależności:** Supabase client

### Krok 5: Utworzenie Card Service
**Plik:** `src/lib/services/card.service.ts`

**Funkcje do implementacji:**
1. `createCards(supabase, deckId, cards)`: Batch insert kart
2. `validateCardData(card)`: Walidacja pojedynczej karty

**Zależności:** Supabase client

### Krok 6: Utworzenie API Route Handler
**Plik:** `src/pages/api/generations.ts`

**Struktura:**
```typescript
export const prerender = false;

import type { APIRoute } from "astro";
import { createGenerationSchema } from "@/lib/schemas/generation.schema";
import * as GenerationService from "@/lib/services/generation.service";
import * as DeckService from "@/lib/services/deck.service";

export const POST: APIRoute = async (context) => {
  // 1. Guard: Sprawdzenie Supabase client availability
  // 2. Guard: Sprawdzenie DEFAULT_USER_ID availability
  // 3. Parsowanie i walidacja request body (Zod)
  // 4. Sprawdzenie aktywnej generacji
  // 5. Sanityzacja source_text
  // 6. Generacja deck_name (jeśli brak)
  // 7. Utworzenie deck
  // 8. Utworzenie generation_session
  // 9. Uruchomienie procesu AI (async, non-blocking)
  // 10. Zwrócenie 202 Accepted
};
```

### Krok 7: Obsługa błędów i edge cases

**Zadania:**
- Implementacja try-catch dla wszystkich operacji DB
- Rollback przy błędach (usunięcie deck jeśli session się nie utworzy)
- Logowanie błędów do console
- Zwracanie odpowiednich kodów statusu

### Krok 8: Testy manualne

**Scenariusze testowe:**
1. ✅ Pomyślne utworzenie generacji z deck_name
2. ✅ Pomyślne utworzenie generacji bez deck_name (auto-generated)
3. ✅ Błąd walidacji: source_text zbyt długi (>10,000)
4. ✅ Błąd walidacji: source_text pusty
5. ✅ Błąd: użytkownik ma już aktywną generację
6. ✅ Błąd: brak DEFAULT_USER_ID (500)
7. ✅ Błąd: brak Supabase client (500)
8. ✅ Timeout AI (5 minut)
9. ✅ Przycięcie kart (>20 wygenerowanych)
10. ✅ Mock mode (USE_MOCK_DATA=true)

### Krok 9: Dokumentacja

**Zadania:**
- Dodanie komentarzy JSDoc do funkcji serwisowych
- Aktualizacja API documentation
- Dodanie przykładów użycia w README (jeśli dotyczy)

---

## Podsumowanie

Ten plan implementacji zapewnia kompleksowe wskazówki dla zespołu programistów do skutecznego wdrożenia endpointu POST /api/generations. Kluczowe aspekty to:

- **Asynchroniczne przetwarzanie**: Natychmiastowa odpowiedź 202, proces AI w tle
- **Bezpieczeństwo**: JWT auth, walidacja Zod, sanityzacja input, ochrona sekretów
- **Wydajność**: Non-blocking calls, indeksy DB, timeout enforcement
- **Obsługa błędów**: Szczegółowe scenariusze, rollback, logging
- **Zgodność z architekturą**: Supabase, Astro, TypeScript, zgodnie z tech stack

Plan jest gotowy do implementacji zgodnie z zasadami projektu i najlepszymi praktykami.
