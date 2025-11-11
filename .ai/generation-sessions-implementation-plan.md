# API Endpoint Implementation Plan: Generation Sessions

## 1. Przegląd punktów końcowych

Implementacja dwóch endpointów do zarządzania sesjami generacji AI:

1. **GET /api/generation-sessions/:sessionId** - Pobieranie szczegółów pojedynczej sesji generacji
2. **GET /api/generation-sessions** - Listowanie wszystkich sesji użytkownika z paginacją

**Cel biznesowy:**
- Umożliwienie użytkownikowi monitorowania statusu generacji AI (polling)
- Przeglądanie historii generacji z podstawowymi informacjami o taliach
- Obsługa różnych stanów sesji: `in_progress`, `completed`, `failed`, `timeout`

**Kluczowe założenia:**
- Użytkownik może przeglądać tylko swoje sesje (wymuszane przez RLS)
- Pole `sanitized_source_text` NIE jest zwracane w odpowiedziach API (tylko audyt)
- Endpoint szczegółów jest używany do pollingu (optymalizacja wydajności)
- Lista sesji zawiera podstawowe informacje z JOIN do tabeli `decks`

---

## 2. Szczegóły żądania

### 2.1 GET /api/generation-sessions/:sessionId

**Metoda HTTP:** GET

**Struktura URL:** `/api/generation-sessions/:sessionId`

**Parametry:**
- **Wymagane:**
  - `sessionId` (path parameter) - UUID sesji generacji
  
- **Opcjonalne:** Brak

**Request Headers:**
```
Authorization: Bearer <jwt_token>
```

**Request Body:** Brak (metoda GET)

**Walidacja parametrów:**
- `sessionId`: musi być poprawnym UUID v4
- JWT token: musi być obecny i ważny

---

### 2.2 GET /api/generation-sessions

**Metoda HTTP:** GET

**Struktura URL:** `/api/generation-sessions`

**Parametry:**
- **Wymagane:** Brak

- **Opcjonalne:**
  - `limit` (query parameter) - liczba elementów na stronę (domyślnie: 20, max: 100)
  - `offset` (query parameter) - offset paginacji (domyślnie: 0, min: 0)
  - `status` (query parameter) - filtrowanie po statusie (`in_progress`, `completed`, `failed`, `timeout`)

**Request Headers:**
```
Authorization: Bearer <jwt_token>
```

**Request Body:** Brak (metoda GET)

**Walidacja parametrów:**
- `limit`: liczba całkowita, 1-100, domyślnie 20
- `offset`: liczba całkowita, >= 0, domyślnie 0
- `status`: enum (`in_progress`, `completed`, `failed`, `timeout`) lub brak
- JWT token: musi być obecny i ważny

---

## 3. Wykorzystywane typy

### 3.1 Istniejące typy (src/types.ts)

**DTOs:**
- `GenerationSessionDTO` - pełne szczegóły sesji (endpoint pojedynczy)
- `GenerationSessionListItemDTO` - uproszczony widok dla listy
- `PaginatedResponseDTO<T>` - wrapper dla odpowiedzi z paginacją
- `PaginationDTO` - metadane paginacji

**Entity Types:**
- `GenerationSessionEntity` - typ bazowy z database.types.ts

### 3.2 Nowe typy do dodania

**Query DTO dla listy sesji:**
```typescript
export interface GetGenerationSessionsQueryDTO {
  limit?: number;
  offset?: number;
  status?: 'in_progress' | 'completed' | 'failed' | 'timeout';
}
```

---

## 4. Szczegóły odpowiedzi

### 4.1 GET /api/generation-sessions/:sessionId

**Response 200 OK (in_progress):**
```json
{
  "id": "uuid",
  "user_id": "uuid",
  "deck_id": "uuid",
  "status": "in_progress",
  "started_at": "ISO8601 timestamp",
  "finished_at": null,
  "params": {
    "model": "string",
    "temperature": 0.7
  },
  "truncated_count": null,
  "error_code": null,
  "error_message": null
}
```

**Error Responses:**
- `401 Unauthorized`: Brak lub nieprawidłowy JWT token
- `404 Not Found`: Sesja nie istnieje lub nie należy do użytkownika
- `500 Internal Server Error`: Błąd serwera

---

### 4.2 GET /api/generation-sessions

**Response 200 OK:**
```json
{
  "data": [
    {
      "id": "uuid",
      "deck_id": "uuid",
      "deck_name": "string",
      "status": "completed",
      "started_at": "ISO8601 timestamp",
      "finished_at": "ISO8601 timestamp",
      "truncated_count": 0,
      "error_code": null
    }
  ],
  "pagination": {
    "limit": 20,
    "offset": 0,
    "total": 45
  }
}
```

**Error Responses:**
- `401 Unauthorized`: Brak lub nieprawidłowy JWT token
- `400 Bad Request`: Nieprawidłowe parametry zapytania
- `500 Internal Server Error`: Błąd serwera

---

## 5. Przepływ danych

### 5.1 GET /api/generation-sessions/:sessionId

```
1. Request → Astro Middleware
2. Walidacja JWT (auth.uid())
3. Walidacja sessionId (UUID format)
4. GenerationSessionService.getSessionById(sessionId, userId)
5. Supabase Query z RLS
6. Transformacja Entity → GenerationSessionDTO
7. Response 200 z DTO lub 404
```

**Optymalizacje:**
- Indeks PRIMARY KEY na `generation_sessions(id)`
- RLS policy zapewnia filtrowanie po user_id
- Brak JOIN - pojedyncze zapytanie

---

### 5.2 GET /api/generation-sessions

```
1. Request → Astro Middleware
2. Walidacja JWT (auth.uid())
3. Walidacja query params (limit, offset, status)
4. GenerationSessionService.listUserSessions(userId, filters)
5. Supabase Query z JOIN do decks
6. Osobne zapytanie COUNT dla total
7. Transformacja wyników → DTOs
8. Response 200 z paginowaną listą
```

**Optymalizacje:**
- Indeks `idx_gen_sessions_user_created` (user_id, created_at DESC)
- JOIN do `decks` dla deck_name
- Osobne zapytanie COUNT

---

## 6. Względy bezpieczeństwa

### 6.1 Uwierzytelnianie i autoryzacja

**JWT Token:**
- Wymagany w nagłówku `Authorization: Bearer <token>`
- Walidacja przez Supabase middleware
- Ekstrakcja `user_id` z `auth.uid()`

**Row Level Security (RLS):**
- Włączone na tabeli `generation_sessions`
- Policy: użytkownik widzi tylko swoje sesje
- Automatyczne filtrowanie wyników po `user_id`

### 6.2 Walidacja danych wejściowych

- `sessionId`: walidacja formatu UUID v4
- `limit`: walidacja zakresu 1-100, domyślnie 20
- `offset`: walidacja >= 0, domyślnie 0
- `status`: walidacja enum
- Zod schema dla wszystkich parametrów

### 6.3 Ochrona danych wrażliwych

**Pola NIE zwracane w API:**
- `sanitized_source_text` - tylko dla audytu
- `created_at`, `updated_at` - pola wewnętrzne

**Sanityzacja błędów:**
- Tylko generyczne komunikaty user-friendly
- Brak stack traces w odpowiedziach

---

## 7. Obsługa błędów

### 7.1 Błędy walidacji (400 Bad Request)

**Scenariusze:**
- Nieprawidłowe query parameters
- Nieprawidłowy format UUID

**Odpowiedź:**
```json
{
  "error": "validation_error",
  "message": "Invalid query parameters"
}
```

---

### 7.2 Błędy autoryzacji (401 Unauthorized)

**Scenariusze:**
- Brak tokenu JWT
- Token nieprawidłowy lub wygasły

**Odpowiedź:**
```json
{
  "error": "unauthorized",
  "message": "Authentication required"
}
```

---

### 7.3 Błędy zasobów (404 Not Found)

**Scenariusze:**
- Sesja nie istnieje
- Sesja należy do innego użytkownika

**Odpowiedź:**
```json
{
  "error": "not_found",
  "message": "Generation session not found"
}
```

---

### 7.4 Błędy serwera (500 Internal Server Error)

**Scenariusze:**
- Błąd połączenia z bazą danych
- Nieoczekiwany błąd w service layer

**Odpowiedź:**
```json
{
  "error": "internal_server_error",
  "message": "An unexpected error occurred"
}
```

---

## 8. Rozważania dotyczące wydajności

### 8.1 Indeksy bazodanowe

- `generation_sessions(id)` - PRIMARY KEY
- `idx_gen_sessions_user_created` - (user_id, created_at DESC)
- `decks(id)` - PRIMARY KEY dla JOIN

### 8.2 Optymalizacje zapytań

- Proste SELECT by ID dla pojedynczej sesji
- JOIN tylko dla `deck_name` w liście
- Osobne zapytanie COUNT (może być cache'owane)
- LIMIT/OFFSET dla paginacji

### 8.3 Polling optimization

- Exponential backoff: 2s → 5s → 10s
- Cache dla statusów końcowych
- Rozważyć WebSocket/SSE w przyszłości

---

## 9. Etapy wdrożenia

### Krok 1: Przygotowanie typów i walidacji

**Zadania:**
1. Dodać `GetGenerationSessionsQueryDTO` do `src/types.ts`
2. Utworzyć `src/lib/validation/generation-session.schemas.ts`
3. Zaimplementować Zod schemas:
   - `sessionIdParamSchema`
   - `getGenerationSessionsQuerySchema`

---

### Krok 2: Implementacja service layer

**Plik:** `src/lib/services/generation-session.service.ts`

**Metody:**
1. `getSessionById(sessionId, userId)` - pobieranie pojedynczej sesji
2. `listUserSessions(userId, filters)` - lista z paginacją i filtrowaniem

**Odpowiedzialność:**
- Zapytania do Supabase
- Transformacja Entity → DTO
- Obsługa błędów zapytań

---

### Krok 3: Implementacja route handlers

**Pliki:**
- `src/pages/api/generation-sessions/[sessionId].ts`
- `src/pages/api/generation-sessions/index.ts`

**Odpowiedzialność:**
- Walidacja JWT
- Walidacja parametrów (Zod)
- Wywołanie service layer
- Obsługa błędów HTTP
- Zwrot Response z JSON

---

### Krok 4: Testy (opcjonalne w MVP)

**Scenariusze:**
- Service: getSessionById, listUserSessions
- Routes: 200, 401, 404, 400, 500
- Walidacja: UUID, query params
- RLS: użytkownik widzi tylko swoje sesje

---

### Krok 5: Dokumentacja

- Aktualizacja `.ai/api-plan.md`
- Przykłady użycia w README (opcjonalne)
- Dokumentacja dla frontendu (polling strategy)

---

## 10. Checklist implementacji

- [ ] Dodać `GetGenerationSessionsQueryDTO` do types.ts
- [ ] Utworzyć Zod schemas
- [ ] Zaimplementować GenerationSessionService
- [ ] Utworzyć route handler [sessionId].ts
- [ ] Utworzyć route handler index.ts
- [ ] Przetestować walidację parametrów
- [ ] Przetestować RLS (użytkownik widzi tylko swoje sesje)
- [ ] Przetestować paginację
- [ ] Przetestować filtrowanie po statusie
- [ ] Zaktualizować dokumentację API
