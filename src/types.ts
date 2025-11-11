/**
 * Data Transfer Objects (DTOs) and Command Models for 10x-cards API
 *
 * All types in this file are derived from database entity definitions
 * in src/db/database.types.ts to maintain type safety and consistency
 * between the database schema and API contracts.
 */

import type { Tables, TablesInsert, TablesUpdate } from "./db/database.types";

// =============================================================================
// Entity Type Aliases
// =============================================================================

/**
 * Base entity types for reference throughout the application.
 * These are direct references to the database table Row types.
 */
export type DeckEntity = Tables<"decks">;
export type CardEntity = Tables<"cards">;
export type GenerationSessionEntity = Tables<"generation_sessions">;

// =============================================================================
// Deck DTOs
// =============================================================================

/**
 * DTO for deck list item representation.
 * Used in GET /api/decks endpoint.
 *
 * Omits internal fields (user_id, deleted_at) and includes computed card_count.
 */
export type DeckListItemDTO = Omit<DeckEntity, "user_id" | "deleted_at"> & {
  card_count: number;
};

/**
 * DTO for detailed deck representation.
 * Used in GET /api/decks/:deckId endpoint.
 *
 * Currently identical to DeckListItemDTO but separated for future extensibility
 * (e.g., including related cards, generation session details, etc.).
 */
export type DeckDetailDTO = DeckListItemDTO;

// =============================================================================
// Deck Command Models
// =============================================================================

/**
 * Command model for updating a deck.
 * Used in PATCH /api/decks/:deckId endpoint.
 *
 * Only allows updating the deck name. Other fields are managed by business logic
 * (e.g., slug is auto-generated, status is updated via publish/reject endpoints).
 */
export type UpdateDeckCommand = Pick<TablesUpdate<"decks">, "name">;

/**
 * Command model for rejecting a deck.
 * Used in POST /api/decks/:deckId/reject endpoint.
 *
 * Allows providing an optional rejection reason for admin feedback.
 */
export interface RejectDeckCommand {
  reason?: string;
}

// =============================================================================
// Card DTOs
// =============================================================================

/**
 * DTO for card representation.
 * Used in card-related endpoints (GET, POST, PATCH).
 *
 * Omits soft-delete field (deleted_at) from public API representation.
 */
export type CardDTO = Omit<CardEntity, "deleted_at">;

// =============================================================================
// Card Command Models
// =============================================================================

/**
 * Command model for creating a new card.
 * Used in POST /api/decks/:deckId/cards endpoint.
 *
 * Requires front, back, and position. The hint field is optional.
 * deck_id is provided via URL parameter, not in the request body.
 */
export type CreateCardCommand = Pick<TablesInsert<"cards">, "front" | "back" | "position" | "hint">;

/**
 * Command model for updating an existing card.
 * Used in PATCH /api/cards/:cardId endpoint.
 *
 * All fields are optional to support partial updates.
 * Business logic ensures cards can only be updated when deck is in draft status.
 */
export type UpdateCardCommand = Partial<Pick<TablesUpdate<"cards">, "front" | "back" | "position" | "hint">>;

// =============================================================================
// Generation Session DTOs
// =============================================================================

/**
 * DTO for detailed generation session representation.
 * Used in GET /api/generation-sessions/:sessionId endpoint.
 *
 * Omits internal fields (created_at, updated_at, sanitized_source_text)
 * that are not relevant to API consumers.
 */
export type GenerationSessionDTO = Omit<GenerationSessionEntity, "created_at" | "updated_at" | "sanitized_source_text">;

/**
 * DTO for generation session list item.
 * Used in GET /api/generation-sessions endpoint.
 *
 * Includes deck_name from joined deck table and omits detailed fields
 * like user_id, params, and error_message for list view performance.
 */
export type GenerationSessionListItemDTO = Pick<
  GenerationSessionEntity,
  "id" | "deck_id" | "status" | "started_at" | "finished_at" | "truncated_count" | "error_code"
> & {
  deck_name: string;
};

/**
 * DTO for generation session initialization response.
 * Used in POST /api/generations endpoint response.
 *
 * Returns minimal information needed to track the newly created generation session.
 */
export interface GenerationInitResponseDTO {
  generation_session_id: string;
  deck_id: string;
  status: string;
  started_at: string;
}

// =============================================================================
// Generation Command Models
// =============================================================================

/**
 * Command model for initiating a new card generation session.
 * Used in POST /api/generations endpoint.
 *
 * Requires source text to generate cards from and a name for the new deck.
 * Business logic enforces max text length and one concurrent generation per user.
 */
export interface CreateGenerationCommand {
  source_text: string;
  deck_name: string;
}

/**
 * Query DTO for filtering and paginating generation sessions list.
 * Used in GET /api/generation-sessions endpoint.
 *
 * All parameters are optional:
 * - limit: Number of items per page (1-100, default: 20)
 * - offset: Starting position for pagination (>=0, default: 0)
 * - status: Filter by session status
 */
export interface GetGenerationSessionsQueryDTO {
  limit?: number;
  offset?: number;
  status?: "in_progress" | "completed" | "failed" | "timeout";
}

// =============================================================================
// Pagination Types
// =============================================================================

/**
 * DTO for pagination metadata.
 * Used in all paginated list endpoints.
 *
 * - limit: Number of items requested per page
 * - offset: Starting position in the result set
 * - total: Total number of items available (for calculating total pages)
 */
export interface PaginationDTO {
  limit: number;
  offset: number;
  total: number;
}

/**
 * Generic DTO wrapper for paginated responses.
 * Used in all list endpoints (decks, cards, generation sessions).
 *
 * @template T - The type of items in the data array
 */
export interface PaginatedResponseDTO<T> {
  data: T[];
  pagination: PaginationDTO;
}

// =============================================================================
// Type Exports for Common Paginated Response Types
// =============================================================================

/**
 * Pre-defined paginated response types for common use cases.
 * These provide better IDE autocomplete and documentation.
 */
export type PaginatedDecksResponseDTO = PaginatedResponseDTO<DeckListItemDTO>;
export type PaginatedCardsResponseDTO = PaginatedResponseDTO<CardDTO>;
export type PaginatedGenerationSessionsResponseDTO = PaginatedResponseDTO<GenerationSessionListItemDTO>;

// =============================================================================
// Error Response Types
// =============================================================================

/**
 * Base error response structure.
 * Used across all endpoints for consistent error handling.
 */
export interface ApiErrorResponseDTO {
  error: string;
  message: string;
}

/**
 * Validation error detail for field-level validation failures.
 * Used in validation error responses to provide specific field information.
 */
export interface ValidationErrorDetailDTO {
  field: string;
  constraint: string;
  min?: number;
  max?: number;
}

/**
 * Validation error response with detailed field information.
 * Used in endpoints that perform field validation (PATCH decks, POST/PATCH cards).
 */
export interface ValidationErrorResponseDTO extends ApiErrorResponseDTO {
  details: ValidationErrorDetailDTO | ValidationErrorDetailDTO[];
}

/**
 * Card-specific validation error detail for publish operation.
 * Used in publish deck endpoint when individual cards fail validation.
 */
export interface CardValidationErrorDetailDTO {
  card_id: string;
  field: string;
  error: string;
  current_length: number;
  max_length: number;
}

/**
 * Publish deck error response with card validation details.
 * Used in POST /api/decks/:deckId/publish when validation fails.
 */
export interface PublishDeckErrorResponseDTO {
  success: false;
  error: "invalid_card_count" | "deck_not_draft" | "validation_failed";
  message: string;
  card_count?: number;
  validation_errors?: CardValidationErrorDetailDTO[];
}

/**
 * Card limit error response.
 * Used when attempting to add cards beyond the 20-card limit.
 */
export interface CardLimitErrorResponseDTO extends ApiErrorResponseDTO {
  error: "card_limit_reached";
  current_count: number;
  max_count: number;
}

/**
 * Concurrent generation error response.
 * Used when user attempts to start a generation while one is already in progress.
 */
export interface ConcurrentGenerationErrorResponseDTO extends ApiErrorResponseDTO {
  error: "generation_in_progress";
  active_session_id: string;
}

/**
 * Generation validation error response with text length details.
 * Used in POST /api/generations when source_text validation fails.
 */
export interface GenerationValidationErrorResponseDTO extends ApiErrorResponseDTO {
  error: "validation_error";
  details: {
    field: string;
    current_length: number;
    max_length: number;
  };
}

/**
 * Deck not editable error response.
 * Used when attempting to edit a published or rejected deck.
 */
export interface DeckNotEditableErrorResponseDTO extends ApiErrorResponseDTO {
  error: "deck_not_editable";
}

// =============================================================================
// Operation Response Types
// =============================================================================

/**
 * Success response for deck publish operation.
 * Used in POST /api/decks/:deckId/publish on successful publication.
 */
export interface PublishDeckSuccessResponseDTO {
  success: true;
  deck_id: string;
}

/**
 * Union type for all possible publish deck responses.
 * Covers both success and error cases.
 */
export type PublishDeckResponseDTO = PublishDeckSuccessResponseDTO | PublishDeckErrorResponseDTO;

/**
 * Success response for deck reject operation.
 * Used in POST /api/decks/:deckId/reject on successful rejection.
 */
export interface RejectDeckSuccessResponseDTO {
  success: true;
  deck_id: string;
}

/**
 * Error response for deck reject operation.
 * Used when rejection fails (e.g., deck not in draft status).
 */
export interface RejectDeckErrorResponseDTO {
  success: false;
  error: "deck_not_draft" | "reason_too_long";
  message: string;
}

/**
 * Union type for all possible reject deck responses.
 * Covers both success and error cases.
 */
export type RejectDeckResponseDTO = RejectDeckSuccessResponseDTO | RejectDeckErrorResponseDTO;
