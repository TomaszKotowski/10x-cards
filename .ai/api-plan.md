# REST API Plan – 10x-cards

This document defines the REST API for the 10x-cards MVP application. The API is built on Astro server endpoints with Supabase for authentication and data storage.

## 1. Resources

The API exposes the following main resources, mapped to database tables:

| Resource        | Database Table        | Description                                      |
| --------------- | --------------------- | ------------------------------------------------ |
| **Decks**       | `decks`               | Flashcard decks owned by users                   |
| **Cards**       | `cards`               | Individual flashcards within decks               |
| **Generations** | `generation_sessions` | AI generation sessions for creating decks        |
| **Auth**        | `auth.users`          | User authentication (managed by Supabase GoTrue) |

---

## 2. Endpoints

### 2.1 Authentication

Authentication is handled by **Supabase GoTrue** via client-side SDK. No custom auth endpoints are needed in the REST API. All API endpoints require a valid JWT token from Supabase Auth in the `Authorization` header.

**Authentication Flow:**

1. Client uses Supabase client SDK for signup/login/logout
2. Supabase returns JWT token
3. Client includes token in `Authorization: Bearer <token>` header for all API calls
4. API validates token and extracts `user_id` via `auth.uid()`

---

### 2.2 Decks Resource

#### GET /api/decks

List all decks for the authenticated user.

**Query Parameters:**

- `status` (optional): Filter by status (`draft`, `published`, `rejected`)
- `limit` (optional): Number of items per page (default: 50, max: 100)
- `offset` (optional): Pagination offset (default: 0)
- `sort` (optional): Sort order (`updated_at_desc`, `updated_at_asc`, `created_at_desc`, `created_at_asc`; default: `updated_at_desc`)

**Request Headers:**

```
Authorization: Bearer <jwt_token>
```

**Response 200 OK:**

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "string",
      "slug": "string",
      "status": "draft" | "published" | "rejected",
      "published_at": "ISO8601 timestamp" | null,
      "rejected_at": "ISO8601 timestamp" | null,
      "rejected_reason": "string" | null,
      "card_count": 15,
      "created_at": "ISO8601 timestamp",
      "updated_at": "ISO8601 timestamp"
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 123
  }
}
```

**Error Responses:**

- `401 Unauthorized`: Missing or invalid JWT token
- `500 Internal Server Error`: Generic server error

---

#### GET /api/decks/:deckId

Get details of a specific deck.

**Path Parameters:**

- `deckId`: UUID of the deck

**Request Headers:**

```
Authorization: Bearer <jwt_token>
```

**Response 200 OK:**

```json
{
  "id": "uuid",
  "name": "string",
  "slug": "string",
  "status": "draft" | "published" | "rejected",
  "published_at": "ISO8601 timestamp" | null,
  "rejected_at": "ISO8601 timestamp" | null,
  "rejected_reason": "string" | null,
  "card_count": 15,
  "created_at": "ISO8601 timestamp",
  "updated_at": "ISO8601 timestamp"
}
```

**Error Responses:**

- `401 Unauthorized`: Missing or invalid JWT token
- `404 Not Found`: Deck not found or not owned by user
- `500 Internal Server Error`: Generic server error

---

#### PATCH /api/decks/:deckId

Update a deck's name or other mutable properties (only for draft decks).

**Path Parameters:**

- `deckId`: UUID of the deck

**Request Headers:**

```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Request Body:**

```json
{
  "name": "string (1-100 characters, optional)"
}
```

**Response 200 OK:**

```json
{
  "id": "uuid",
  "name": "string",
  "slug": "string",
  "status": "draft",
  "published_at": null,
  "rejected_at": null,
  "rejected_reason": null,
  "card_count": 15,
  "created_at": "ISO8601 timestamp",
  "updated_at": "ISO8601 timestamp"
}
```

**Error Responses:**

- `400 Bad Request`: Validation errors (e.g., name too long, name not unique, deck not in draft status)

```json
{
  "error": "validation_error",
  "message": "Deck name must be unique",
  "details": {
    "field": "name",
    "constraint": "unique"
  }
}
```

- `401 Unauthorized`: Missing or invalid JWT token
- `404 Not Found`: Deck not found or not owned by user
- `500 Internal Server Error`: Generic server error

**Business Logic:**

- Only decks with `status = 'draft'` can be updated
- Deck name must be unique per user (case-insensitive, excluding soft-deleted decks)
- Slug is auto-generated from name via database trigger

---

#### DELETE /api/decks/:deckId

Soft-delete a deck (sets `deleted_at` timestamp).

**Path Parameters:**

- `deckId`: UUID of the deck

**Request Headers:**

```
Authorization: Bearer <jwt_token>
```

**Response 204 No Content:**
No body returned on successful deletion.

**Error Responses:**

- `401 Unauthorized`: Missing or invalid JWT token
- `404 Not Found`: Deck not found or not owned by user
- `500 Internal Server Error`: Generic server error

**Business Logic:**

- Sets `deleted_at = NOW()` on the deck
- Database trigger cascades soft-delete to all cards in the deck
- Soft-deleted decks are excluded from all listing and detail queries

---

#### POST /api/decks/:deckId/publish

Publish a deck (batch all-or-nothing operation).

**Path Parameters:**

- `deckId`: UUID of the deck

**Request Headers:**

```
Authorization: Bearer <jwt_token>
```

**Response 200 OK:**

```json
{
  "success": true,
  "deck_id": "uuid"
}
```

**Error Responses:**

- `400 Bad Request`: Validation errors prevent publication

```json
{
  "success": false,
  "error": "invalid_card_count" | "deck_not_draft" | "validation_failed",
  "message": "Deck must have between 1 and 20 cards",
  "card_count": 0,
  "validation_errors": [
    {
      "card_id": "uuid",
      "field": "front",
      "error": "exceeds_max_length",
      "current_length": 250,
      "max_length": 200
    }
  ]
}
```

- `401 Unauthorized`: Missing or invalid JWT token
- `404 Not Found`: Deck not found or not owned by user
- `500 Internal Server Error`: Generic server error

**Business Logic:**

- Calls database RPC function `publish_deck(deck_id)`
- Validates:
  - Deck is owned by authenticated user
  - Deck status is `draft`
  - Deck is not soft-deleted
  - Deck has 1-20 active cards
  - All cards meet validation criteria (front/back ≤200 chars per side)
- On success:
  - Deletes cards beyond position 20 (hard delete)
  - Sets `status = 'published'` and `published_at = NOW()`
  - Cards become read-only (enforced by RLS policies)
- Entire operation is atomic (transaction with advisory lock)

---

#### POST /api/decks/:deckId/reject

Reject a draft deck with optional reason.

**Path Parameters:**

- `deckId`: UUID of the deck

**Request Headers:**

```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Request Body:**

```json
{
  "reason": "string (optional, max 500 characters)"
}
```

**Response 200 OK:**

```json
{
  "success": true,
  "deck_id": "uuid"
}
```

**Error Responses:**

- `400 Bad Request`: Deck is not in draft status or reason too long

```json
{
  "success": false,
  "error": "deck_not_draft" | "reason_too_long",
  "message": "Only draft decks can be rejected"
}
```

- `401 Unauthorized`: Missing or invalid JWT token
- `404 Not Found`: Deck not found or not owned by user
- `500 Internal Server Error`: Generic server error

**Business Logic:**

- Calls database RPC function `reject_deck(deck_id, reason)`
- Validates deck is in `draft` status
- Sets `status = 'rejected'`, `rejected_at = NOW()`, and stores optional `rejected_reason`
- Operation is atomic (transaction with advisory lock)

---

### 2.3 Cards Resource

#### GET /api/decks/:deckId/cards

List all cards in a specific deck.

**Path Parameters:**

- `deckId`: UUID of the deck

**Query Parameters:**

- `limit` (optional): Number of items per page (default: 100, max: 100)
- `offset` (optional): Pagination offset (default: 0)

**Request Headers:**

```
Authorization: Bearer <jwt_token>
```

**Response 200 OK:**

```json
{
  "data": [
    {
      "id": "uuid",
      "deck_id": "uuid",
      "front": "string",
      "back": "string",
      "position": 1,
      "hint": "string" | null,
      "is_active": true,
      "locale": "pl" | null,
      "metadata": {},
      "created_at": "ISO8601 timestamp",
      "updated_at": "ISO8601 timestamp"
    }
  ],
  "pagination": {
    "limit": 100,
    "offset": 0,
    "total": 20
  }
}
```

**Error Responses:**

- `401 Unauthorized`: Missing or invalid JWT token
- `404 Not Found`: Deck not found or not owned by user
- `500 Internal Server Error`: Generic server error

**Business Logic:**

- Returns cards ordered by `position ASC`
- Excludes soft-deleted cards (`deleted_at IS NULL`)
- User must own the deck (enforced by RLS)

---

#### POST /api/decks/:deckId/cards

Add a new card manually to a draft deck.

**Path Parameters:**

- `deckId`: UUID of the deck

**Request Headers:**

```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Request Body:**

```json
{
  "front": "string (1-200 characters, required)",
  "back": "string (1-200 characters, required)",
  "position": 1,
  "hint": "string (max 200 characters, optional)"
}
```

**Response 201 Created:**

```json
{
  "id": "uuid",
  "deck_id": "uuid",
  "front": "string",
  "back": "string",
  "position": 1,
  "hint": "string" | null,
  "is_active": true,
  "locale": null,
  "metadata": {},
  "created_at": "ISO8601 timestamp",
  "updated_at": "ISO8601 timestamp"
}
```

**Error Responses:**

- `400 Bad Request`: Validation errors

```json
{
  "error": "validation_error",
  "message": "Card front must be between 1 and 200 characters",
  "details": {
    "field": "front",
    "constraint": "length",
    "min": 1,
    "max": 200
  }
}
```

- `400 Bad Request`: Deck has reached maximum card limit (20)

```json
{
  "error": "card_limit_reached",
  "message": "Deck cannot have more than 20 cards",
  "current_count": 20,
  "max_count": 20
}
```

- `400 Bad Request`: Deck is not in draft status

```json
{
  "error": "deck_not_editable",
  "message": "Cards can only be added to draft decks"
}
```

- `401 Unauthorized`: Missing or invalid JWT token
- `404 Not Found`: Deck not found or not owned by user
- `409 Conflict`: Position already exists in deck
- `500 Internal Server Error`: Generic server error

**Business Logic:**

- Only draft decks (`status = 'draft'`) can have cards added
- Deck must have < 20 cards
- Position must be unique within the deck (enforced by DB unique index)
- If position not provided, auto-assign to `max(position) + 1`
- Validated by Zod schema before DB insertion

---

#### PATCH /api/cards/:cardId

Update a card's front, back, position, or hint (only for cards in draft decks).

**Path Parameters:**

- `cardId`: UUID of the card

**Request Headers:**

```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Request Body:**

```json
{
  "front": "string (1-200 characters, optional)",
  "back": "string (1-200 characters, optional)",
  "position": 1,
  "hint": "string (max 200 characters, optional, nullable)"
}
```

**Response 200 OK:**

```json
{
  "id": "uuid",
  "deck_id": "uuid",
  "front": "string",
  "back": "string",
  "position": 1,
  "hint": "string" | null,
  "is_active": true,
  "locale": null,
  "metadata": {},
  "created_at": "ISO8601 timestamp",
  "updated_at": "ISO8601 timestamp"
}
```

**Error Responses:**

- `400 Bad Request`: Validation errors (field too long, invalid position, etc.)
- `400 Bad Request`: Card's deck is not in draft status

```json
{
  "error": "card_not_editable",
  "message": "Cards in published decks cannot be edited"
}
```

- `401 Unauthorized`: Missing or invalid JWT token
- `404 Not Found`: Card not found or deck not owned by user
- `409 Conflict`: Position already exists in deck (if position changed)
- `500 Internal Server Error`: Generic server error

**Business Logic:**

- Card's deck must be in `draft` status (verified via JOIN with decks table)
- RLS policy ensures user owns the deck
- Position uniqueness enforced by DB partial unique index
- `updated_at` automatically set by DB trigger

---

#### DELETE /api/cards/:cardId

Soft-delete a card (only for cards in draft decks).

**Path Parameters:**

- `cardId`: UUID of the card

**Request Headers:**

```
Authorization: Bearer <jwt_token>
```

**Response 204 No Content:**
No body returned on successful deletion.

**Error Responses:**

- `400 Bad Request`: Card's deck is not in draft status

```json
{
  "error": "card_not_deletable",
  "message": "Cards in published decks cannot be deleted"
}
```

- `401 Unauthorized`: Missing or invalid JWT token
- `404 Not Found`: Card not found or deck not owned by user
- `500 Internal Server Error`: Generic server error

**Business Logic:**

- Sets `deleted_at = NOW()` on the card
- Card's deck must be in `draft` status
- RLS policy ensures user owns the deck
- Soft-deleted cards are excluded from all queries

---

### 2.4 Generations Resource

#### POST /api/generations

Initiate AI generation of flashcards from source text.

**Request Headers:**

```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Request Body:**

```json
{
  "source_text": "string (1-10,000 characters, required)",
  "deck_name": "string (1-100 characters, optional, default: auto-generated)"
}
```

**Response 202 Accepted:**

```json
{
  "generation_session_id": "uuid",
  "deck_id": "uuid",
  "status": "in_progress",
  "started_at": "ISO8601 timestamp"
}
```

**Error Responses:**

- `400 Bad Request`: Validation errors

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

- `400 Bad Request`: User already has an active generation

```json
{
  "error": "generation_in_progress",
  "message": "You already have a generation in progress. Please wait for it to complete.",
  "active_session_id": "uuid"
}
```

- `401 Unauthorized`: Missing or invalid JWT token
- `500 Internal Server Error`: Generic server error

**Business Logic:**

1. Validate `source_text` length (1-10,000 chars)
2. Check for existing `in_progress` generation for user (enforced by DB unique index)
3. Sanitize input:
   - Remove extra whitespace
   - Strip HTML tags
   - Trim to 10,000 chars if necessary
4. Create new deck with `status = 'draft'` and auto-generated or provided name
5. Create `generation_session` record with `status = 'in_progress'`
6. Store `sanitized_source_text` in generation_session
7. Call OpenRouter API asynchronously with 5-minute timeout
8. If LLM returns >20 cards:
   - Keep first 20 cards
   - Set `truncated_count` to number of discarded cards
9. Update `generation_session` status to `completed`, `failed`, or `timeout`
10. Return 202 Accepted immediately (client polls for status)

**OpenRouter Integration:**

- Backend-only (never expose API key to client)
- Prompt includes:
  - Max 20 cards
  - Max 200 chars per card side
  - Q/A format
- Timeout: 5 minutes (hard cutoff)
- Error handling: single attempt, no retries in MVP

---

#### GET /api/generation-sessions/:sessionId

Get the status and results of a generation session.

**Path Parameters:**

- `sessionId`: UUID of the generation session

**Request Headers:**

```
Authorization: Bearer <jwt_token>
```

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

**Response 200 OK (completed):**

```json
{
  "id": "uuid",
  "user_id": "uuid",
  "deck_id": "uuid",
  "status": "completed",
  "started_at": "ISO8601 timestamp",
  "finished_at": "ISO8601 timestamp",
  "params": {
    "model": "string",
    "temperature": 0.7
  },
  "truncated_count": 5,
  "error_code": null,
  "error_message": null
}
```

**Response 200 OK (failed/timeout):**

```json
{
  "id": "uuid",
  "user_id": "uuid",
  "deck_id": "uuid",
  "status": "failed" | "timeout",
  "started_at": "ISO8601 timestamp",
  "finished_at": "ISO8601 timestamp",
  "params": {
    "model": "string",
    "temperature": 0.7
  },
  "truncated_count": null,
  "error_code": "llm_error" | "timeout" | "network_error",
  "error_message": "Generic user-friendly error message"
}
```

**Error Responses:**

- `401 Unauthorized`: Missing or invalid JWT token
- `404 Not Found`: Generation session not found or not owned by user
- `500 Internal Server Error`: Generic server error

**Business Logic:**

- User can only view their own generation sessions (enforced by RLS)
- Client polls this endpoint to check generation progress
- `sanitized_source_text` is NOT returned (stored for audit, not for display)
- `truncated_count` indicates how many cards were discarded if >20 generated

---

#### GET /api/generation-sessions

List all generation sessions for the authenticated user.

**Query Parameters:**

- `limit` (optional): Number of items per page (default: 20, max: 100)
- `offset` (optional): Pagination offset (default: 0)
- `status` (optional): Filter by status (`in_progress`, `completed`, `failed`, `timeout`)

**Request Headers:**

```
Authorization: Bearer <jwt_token>
```

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

- `401 Unauthorized`: Missing or invalid JWT token
- `500 Internal Server Error`: Generic server error

**Business Logic:**

- Returns sessions ordered by `created_at DESC`
- Includes basic deck info (name) via JOIN
- Useful for viewing generation history

---

## 3. Authentication and Authorization

### 3.1 Authentication Mechanism

**Provider:** Supabase GoTrue (email/password authentication)

**Implementation:**

- Client-side: Supabase JavaScript client handles signup, login, logout, session management
- API-side: All endpoints verify JWT token via Supabase middleware

**Token Flow:**

1. User signs up or logs in via Supabase client SDK
2. Supabase returns JWT token (stored in client localStorage or cookies)
3. Client includes token in `Authorization: Bearer <token>` header for all API requests
4. Astro middleware validates token using Supabase service client
5. Middleware extracts `user_id` from token and sets `locals.user` for endpoint handlers

**Session Management:**

- JWT expiration: Configured in Supabase (default: 1 hour access token, 7 days refresh token)
- Auto-refresh: Handled by Supabase client SDK
- Logout: Client calls Supabase `signOut()` and removes tokens

### 3.2 Authorization Strategy

**Database-Level Security:** Row Level Security (RLS) policies

All tables (`decks`, `cards`, `generation_sessions`) have RLS enabled with **deny-by-default** strategy:

**Decks:**

- SELECT: User can view their own decks (`user_id = auth.uid()` AND `deleted_at IS NULL`)
- INSERT: User can create decks with themselves as owner (`user_id = auth.uid()` AND `status = 'draft'`)
- UPDATE: User can update their own draft decks (`status = 'draft'`)
- DELETE (soft): User can soft-delete their own decks

**Cards:**

- SELECT: User can view cards from their own decks
- INSERT: User can add cards to their own draft decks
- UPDATE: User can update cards in their own draft decks
- DELETE (soft): User can soft-delete cards in their own draft decks

**Generation Sessions:**

- SELECT: User can view their own sessions (`user_id = auth.uid()`)
- INSERT: Backend creates sessions with service role (no public INSERT policy)
- UPDATE: Backend updates sessions with service role (no public UPDATE policy)

**API-Level Validation:**

- All endpoints verify JWT token via middleware before processing
- Endpoints perform additional business logic checks (e.g., deck status for edits)
- RLS policies provide defense-in-depth (even if API logic has bugs, DB enforces ownership)

### 3.3 Error Handling

**Generic Error Messages:**
To prevent information leakage, all user-facing error messages are generic:

- ✅ Good: "Unable to update deck. Please try again."
- ❌ Bad: "Database constraint violation: duplicate key value violates unique constraint 'idx_decks_user_name_unique'"

**Error Response Format:**

```json
{
  "error": "error_code",
  "message": "User-friendly description"
}
```

**Logging:**

- Detailed errors logged server-side for debugging
- Only generic messages returned to client

---

## 4. Validation and Business Logic

### 4.1 Validation Rules per Resource

#### Decks

| Field             | Validation                                            | Enforced By             |
| ----------------- | ----------------------------------------------------- | ----------------------- |
| `name`            | NOT NULL, 1-100 characters                            | Zod + DB CHECK          |
| `name`            | Unique per user (case-insensitive, excluding deleted) | DB partial unique index |
| `slug`            | Auto-generated from name                              | DB trigger              |
| `status`          | IN ('draft', 'published', 'rejected')                 | DB CHECK                |
| `rejected_reason` | NULL or ≤500 characters                               | Zod + DB CHECK          |
| `user_id`         | Must be authenticated user                            | RLS policy              |

#### Cards

| Field      | Validation                                 | Enforced By                |
| ---------- | ------------------------------------------ | -------------------------- |
| `front`    | NOT NULL, 1-200 characters                 | Zod + DB CHECK             |
| `back`     | NOT NULL, 1-200 characters                 | Zod + DB CHECK             |
| `position` | INTEGER > 0                                | DB CHECK                   |
| `position` | Unique within deck (excluding deleted)     | DB partial unique index    |
| `hint`     | NULL or ≤200 characters                    | Zod + DB CHECK             |
| `deck_id`  | Must reference existing deck owned by user | RLS policy + FK constraint |

#### Generation Sessions

| Field                   | Validation                                           | Enforced By             |
| ----------------------- | ---------------------------------------------------- | ----------------------- |
| `sanitized_source_text` | NOT NULL, ≤10,000 characters                         | Zod + DB CHECK          |
| `status`                | IN ('in_progress', 'completed', 'failed', 'timeout') | DB CHECK                |
| `truncated_count`       | NULL or ≥0                                           | DB CHECK                |
| `error_message`         | NULL or ≤1,000 characters                            | DB CHECK                |
| `user_id`               | Only 1 'in_progress' session per user                | DB partial unique index |

### 4.2 Business Logic Implementation

#### BL-1: Draft-Only Editing

**Rule:** Cards and decks can only be edited when `deck.status = 'draft'`

**Implementation:**

- `PATCH /api/decks/:deckId`: Check `status = 'draft'` before allowing update
- `POST /api/decks/:deckId/cards`: Check `status = 'draft'` via JOIN with decks table
- `PATCH /api/cards/:cardId`: Check parent deck's `status = 'draft'` via JOIN
- `DELETE /api/cards/:cardId`: Check parent deck's `status = 'draft'` via JOIN
- RLS policies enforce this at DB level

**Error Response:**

```json
{
  "error": "deck_not_editable",
  "message": "Published decks cannot be edited"
}
```

---

#### BL-2: Batch Publication (All-or-Nothing)

**Rule:** Deck can only be published if ALL cards pass validation

**Implementation:**

- `POST /api/decks/:deckId/publish` calls DB RPC function `publish_deck(deck_id)`
- RPC function validates:
  1. Deck is owned by user (`user_id = auth.uid()`)
  2. Deck status is `draft`
  3. Deck is not soft-deleted
  4. Deck has 1-20 active cards
  5. All cards have `front` and `back` ≤200 chars (enforced by DB CHECK constraints)
- If any validation fails, entire transaction rolls back
- On success:
  - Hard-deletes cards beyond position 20 (sorted by `position ASC`)
  - Sets `status = 'published'` and `published_at = NOW()`
- Uses advisory lock to prevent race conditions

**Success Response:**

```json
{
  "success": true,
  "deck_id": "uuid"
}
```

**Validation Error Response:**

```json
{
  "success": false,
  "error": "invalid_card_count",
  "message": "Deck must have between 1 and 20 cards",
  "card_count": 0
}
```

---

#### BL-3: Max 20 Cards Per Deck

**Rule:** Deck cannot exceed 20 cards

**Implementation:**

- `POST /api/decks/:deckId/cards`: Check `COUNT(*) < 20` before inserting
- `POST /api/generations`: Backend truncates LLM output to first 20 cards
  - Sets `truncated_count` = number of cards discarded
  - Client UI shows warning if `truncated_count > 0`
- `POST /api/decks/:deckId/publish`: RPC function hard-deletes cards beyond position 20

**Error Response (manual add):**

```json
{
  "error": "card_limit_reached",
  "message": "Deck cannot have more than 20 cards",
  "current_count": 20,
  "max_count": 20
}
```

---

#### BL-4: One Concurrent Generation Per User

**Rule:** User can only have one active generation session at a time

**Implementation:**

- DB partial unique index: `CREATE UNIQUE INDEX idx_gen_sessions_user_in_progress ON generation_sessions(user_id) WHERE status = 'in_progress'`
- `POST /api/generations`: Check for existing `in_progress` session before creating new one
- If user tries to start new generation while one is active, return error

**Error Response:**

```json
{
  "error": "generation_in_progress",
  "message": "You already have a generation in progress. Please wait for it to complete.",
  "active_session_id": "uuid"
}
```

---

#### BL-5: 5-Minute Generation Timeout

**Rule:** AI generation must complete within 5 minutes

**Implementation:**

- Backend sets timeout on OpenRouter API call
- After 5 minutes, if not completed:
  - Cancel LLM request
  - Update `generation_session` status to `timeout`
  - Set `error_code = 'timeout'` and generic `error_message`
- Client can retry by initiating new generation

**Timeout Response (via polling):**

```json
{
  "id": "uuid",
  "status": "timeout",
  "error_code": "timeout",
  "error_message": "Generation took too long. Please try again with shorter text."
}
```

---

#### BL-6: Unique Deck Name Per User

**Rule:** Deck names must be unique per user (case-insensitive, excluding soft-deleted)

**Implementation:**

- DB partial unique index: `CREATE UNIQUE INDEX idx_decks_user_name_unique ON decks(user_id, LOWER(name)) WHERE deleted_at IS NULL`
- `POST /api/generations`: Check uniqueness if `deck_name` provided
- `PATCH /api/decks/:deckId`: Check uniqueness before updating name
- After soft-delete, name becomes available for reuse

**Error Response:**

```json
{
  "error": "validation_error",
  "message": "Deck name must be unique",
  "details": {
    "field": "name",
    "constraint": "unique"
  }
}
```

---

#### BL-7: Slug Auto-Generation

**Rule:** Slug is automatically generated from deck name

**Implementation:**

- DB trigger `set_deck_slug` fires on INSERT or UPDATE of `name`
- Slug generation function `slugify()`:
  - Convert to lowercase
  - Remove non-alphanumeric characters (except spaces and hyphens)
  - Replace spaces with hyphens
  - Trim leading/trailing hyphens
- Client never sends slug in request body (ignored if provided)
- Slug updates automatically when name changes

**Example:**

- Name: "Biology Exam 2024" → Slug: "biology-exam-2024"
- Name: "Français 101!" → Slug: "francais-101"

---

#### BL-8: Cascade Soft-Delete

**Rule:** When deck is soft-deleted, all its cards are also soft-deleted

**Implementation:**

- DB trigger `cascade_soft_delete_cards` fires AFTER UPDATE of `decks.deleted_at`
- When `deleted_at` changes from NULL to timestamp:
  - Updates all cards in deck: `SET deleted_at = NEW.deleted_at WHERE deck_id = NEW.id`
- `DELETE /api/decks/:deckId` sets deck's `deleted_at`, trigger handles cards
- No explicit API call needed for card deletion

---

#### BL-9: Position Uniqueness

**Rule:** Card positions must be unique within a deck (excluding soft-deleted)

**Implementation:**

- DB partial unique index: `CREATE UNIQUE INDEX idx_cards_deck_position_unique ON cards(deck_id, position) WHERE deleted_at IS NULL`
- `POST /api/decks/:deckId/cards`: If position not provided, auto-assign to `MAX(position) + 1`
- `PATCH /api/cards/:cardId`: Position change validated by unique index
- Position normalization (removing gaps) is handled by client, not API

**Error Response:**

```json
{
  "error": "conflict",
  "message": "Position already exists in this deck",
  "details": {
    "field": "position",
    "constraint": "unique"
  }
}
```

---

#### BL-10: Read-Only After Publication

**Rule:** Published decks and their cards are read-only

**Implementation:**

- RLS policies enforce at DB level:
  - UPDATE policies on `decks` require `status = 'draft'`
  - UPDATE/DELETE policies on `cards` require parent deck `status = 'draft'`
- API endpoints validate deck status before mutations
- Only `DELETE /api/decks/:deckId` (soft-delete entire deck) is allowed on published decks

**Error Response:**

```json
{
  "error": "deck_not_editable",
  "message": "Published decks cannot be edited"
}
```

---

#### BL-11: Input Sanitization

**Rule:** All text inputs are sanitized before processing

**Implementation:**

- `POST /api/generations`:
  - Strip HTML tags from `source_text`
  - Normalize whitespace (collapse multiple spaces/newlines)
  - Trim to 10,000 characters if necessary
  - Store sanitized version in `generation_sessions.sanitized_source_text`
- `POST /api/decks/:deckId/cards` and `PATCH /api/cards/:cardId`:
  - Trim whitespace from `front`, `back`, `hint`
  - Validate length after trimming
- `PATCH /api/decks/:deckId`:
  - Trim whitespace from `name`
  - Validate length after trimming

---

### 4.3 Zod Validation Schemas

All request bodies are validated using Zod schemas before processing:

**Deck Update Schema:**

```typescript
const DeckUpdateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
});
```

**Card Create Schema:**

```typescript
const CardCreateSchema = z.object({
  front: z.string().trim().min(1).max(200),
  back: z.string().trim().min(1).max(200),
  position: z.number().int().positive().optional(),
  hint: z.string().trim().max(200).nullable().optional(),
});
```

**Card Update Schema:**

```typescript
const CardUpdateSchema = z.object({
  front: z.string().trim().min(1).max(200).optional(),
  back: z.string().trim().min(1).max(200).optional(),
  position: z.number().int().positive().optional(),
  hint: z.string().trim().max(200).nullable().optional(),
});
```

**Generation Create Schema:**

```typescript
const GenerationCreateSchema = z.object({
  source_text: z.string().trim().min(1).max(10000),
  deck_name: z.string().trim().min(1).max(100).optional(),
});
```

**Deck Reject Schema:**

```typescript
const DeckRejectSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});
```

---

### 4.4 Error Codes Reference

Standard error codes used across all endpoints:

| Error Code               | HTTP Status | Description                                            |
| ------------------------ | ----------- | ------------------------------------------------------ |
| `validation_error`       | 400         | Request body failed Zod validation                     |
| `deck_not_found`         | 404         | Deck does not exist or not owned by user               |
| `card_not_found`         | 404         | Card does not exist or deck not owned by user          |
| `generation_not_found`   | 404         | Generation session does not exist or not owned by user |
| `deck_not_draft`         | 400         | Operation requires deck to be in draft status          |
| `deck_not_editable`      | 400         | Published decks cannot be edited                       |
| `card_not_editable`      | 400         | Cards in published decks cannot be edited              |
| `card_not_deletable`     | 400         | Cards in published decks cannot be deleted             |
| `card_limit_reached`     | 400         | Deck already has 20 cards (maximum)                    |
| `generation_in_progress` | 400         | User already has an active generation session          |
| `invalid_card_count`     | 400         | Deck must have 1-20 cards for publication              |
| `conflict`               | 409         | Uniqueness constraint violation (name, position)       |
| `unauthorized`           | 401         | Missing or invalid JWT token                           |
| `internal_error`         | 500         | Generic server error (details logged, not exposed)     |

---

## 5. Rate Limiting and Performance

### 5.1 Rate Limiting (Future Enhancement)

Rate limiting is **not implemented in MVP** but planned for post-MVP:

- Per-user limits on generation endpoint: 10 generations/day
- Per-IP limits on auth endpoints: 5 failed login attempts/hour
- Global rate limiting via reverse proxy (nginx/Caddy)

### 5.2 Performance Considerations

**Pagination:**

- All list endpoints support `limit` and `offset` parameters
- Default limits: 20-100 items per page depending on resource
- Total count included in pagination metadata

**Indexes:**

- All foreign keys have indexes for efficient JOINs
- Partial indexes for common queries (non-deleted items only)
- Composite indexes for frequent filter+sort combinations

**Database Query Optimization:**

- Use RLS policies for security, but avoid N+1 queries
- Fetch related data in single query with JOINs where appropriate
- Index on `(user_id, status, updated_at)` for deck listings

**Caching:**

- Not implemented in MVP
- Future: Cache published deck data (immutable after publication)

---

## 6. CORS Configuration

**Allowed Origins:**

- Production: `https://10x-cards.example.com`
- Development: `http://localhost:4321`, `http://localhost:3000`

**Allowed Methods:**

- `GET`, `POST`, `PATCH`, `DELETE`, `OPTIONS`

**Allowed Headers:**

- `Authorization`, `Content-Type`

**Credentials:**

- `Access-Control-Allow-Credentials: true` (for cookie-based sessions if needed)

**Implementation:**

- Configured in Astro middleware
- Rejects requests from unauthorized origins with 403

---

## 7. API Versioning

**Current Version:** v1 (implicit, no version prefix in URLs)

**Future Versioning Strategy:**

- When breaking changes are needed, introduce `/api/v2/` prefix
- Maintain v1 endpoints for backward compatibility (minimum 6 months)
- Deprecation notices returned in response headers: `X-API-Deprecation: true`

---

## 8. Monitoring and Observability (Post-MVP)

**Logging:**

- Structured JSON logs for all API requests
- Include: timestamp, user_id, endpoint, method, status_code, duration
- PII masking: Never log full card content, sanitized_source_text, or passwords

**Metrics:**

- Request count by endpoint
- Error rate by endpoint and error code
- Generation success/failure/timeout rates
- P50/P95/P99 latency by endpoint

**Error Tracking:**

- Server-side: Centralized logging (Sentry/similar)
- Client-side: Frontend telemetry (not in API scope)

---

## 9. Summary

This API plan provides:

✅ **Complete CRUD operations** for decks and cards
✅ **AI generation workflow** with status polling
✅ **Robust authentication** via Supabase GoTrue + RLS
✅ **Comprehensive validation** at API and DB levels
✅ **Business logic enforcement** for all PRD requirements
✅ **Scalable architecture** with pagination, indexes, and performance optimization
✅ **Security-first approach** with generic errors, CORS, and deny-by-default RLS

**Technology Stack:**

- **Frontend:** Astro 5 + React 19
- **Backend:** Astro server endpoints (SSR)
- **Database:** PostgreSQL (Supabase self-hosted)
- **Auth:** Supabase GoTrue (JWT)
- **Validation:** Zod schemas
- **AI:** OpenRouter (backend-only)

**Next Steps:**

1. Implement Supabase database schema and RLS policies from `db-plan.md`
2. Set up Astro middleware for JWT validation
3. Create API endpoints per this plan
4. Implement OpenRouter integration service
5. Build frontend UI components consuming these APIs
6. Test end-to-end workflows from PRD user stories
