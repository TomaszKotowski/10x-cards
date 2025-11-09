import { z } from "zod";

/**
 * Validation schema for GET /api/decks/:deckId/cards query parameters.
 *
 * Validates:
 * - limit: Number of items per page (1-100, default 100)
 * - offset: Starting position for pagination (>=0, default 0)
 */
export const getCardsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * Inferred TypeScript type from the validation schema.
 */
export type GetCardsQuery = z.infer<typeof getCardsQuerySchema>;

/**
 * Validation schema for deck ID path parameter.
 *
 * Validates:
 * - deckId: Must be a valid UUID format
 */
export const deckIdParamSchema = z.object({
  deckId: z.string().uuid({ message: "Invalid deck ID format" }),
});

/**
 * Inferred TypeScript type for deck ID parameter.
 */
export type DeckIdParam = z.infer<typeof deckIdParamSchema>;

/**
 * Validation schema for POST /api/decks/:deckId/cards request body.
 *
 * Validates:
 * - front: Card front text (1-200 characters, required)
 * - back: Card back text (1-200 characters, required)
 * - position: Card position in deck (integer >0, required)
 * - hint: Optional hint text (max 200 characters)
 */
export const createCardSchema = z.object({
  front: z.string().min(1, "Front text is required").max(200, "Front text exceeds maximum length of 200 characters"),
  back: z.string().min(1, "Back text is required").max(200, "Back text exceeds maximum length of 200 characters"),
  position: z.number().int().min(1, "Position must be a positive integer"),
  hint: z.string().max(200, "Hint exceeds maximum length of 200 characters").optional(),
});

/**
 * Inferred TypeScript type for create card request body.
 */
export type CreateCardBody = z.infer<typeof createCardSchema>;
