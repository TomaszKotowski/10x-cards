import { z } from "zod";

/**
 * Validation schema for GET /api/decks query parameters.
 *
 * Validates:
 * - status: Optional filter for deck status (draft, published, rejected)
 * - limit: Number of items per page (1-100, default 50)
 * - offset: Starting position for pagination (>=0, default 0)
 * - sort: Sort order (default: updated_at_desc)
 */
export const listDecksQuerySchema = z.object({
  status: z.preprocess((val) => val ?? undefined, z.enum(["draft", "published", "rejected"]).optional()),
  limit: z.preprocess((val) => (val ? parseInt(val as string, 10) : 50), z.number().int().min(1).max(100)),
  offset: z.preprocess((val) => (val ? parseInt(val as string, 10) : 0), z.number().int().min(0)),
  sort: z.preprocess(
    (val) => val || "updated_at_desc",
    z.enum(["updated_at_desc", "updated_at_asc", "created_at_desc", "created_at_asc"])
  ),
});

/**
 * Inferred TypeScript type from the validation schema.
 */
export type ListDecksQuery = z.infer<typeof listDecksQuerySchema>;

/**
 * Validation schema for GET /api/decks/:deckId path parameters.
 *
 * Validates:
 * - deckId: Must be a valid UUID format
 */
export const DeckIdParamSchema = z.object({
  deckId: z.string().uuid({ message: "Invalid deck ID format" }),
});

/**
 * Inferred TypeScript type for deck ID parameter.
 */
export type DeckIdParam = z.infer<typeof DeckIdParamSchema>;

/**
 * Validation schema for PATCH /api/decks/:deckId request body.
 *
 * Validates:
 * - name: Optional deck name (1-100 characters)
 * - At least one field must be provided for update
 */
export const updateDeckSchema = z
  .object({
    name: z.string().min(1, "Deck name cannot be empty").max(100, "Deck name exceeds maximum length").optional(),
  })
  .refine((data) => data.name !== undefined, {
    message: "At least one field must be provided for update",
  });

/**
 * Inferred TypeScript type for update deck request body.
 */
export type UpdateDeckBody = z.infer<typeof updateDeckSchema>;

/**
 * Validation schema for POST /api/decks/:deckId/publish path parameters.
 *
 * Validates:
 * - deckId: Must be a valid UUID format
 */
export const publishDeckParamsSchema = z.object({
  deckId: z.string().uuid({ message: "Invalid deck ID format" }),
});

/**
 * Inferred TypeScript type for publish deck parameters.
 */
export type PublishDeckParams = z.infer<typeof publishDeckParamsSchema>;

/**
 * Validation schema for POST /api/decks/:deckId/reject path parameters.
 *
 * Validates:
 * - deckId: Must be a valid UUID format
 */
export const rejectDeckParamsSchema = z.object({
  deckId: z.string().uuid({ message: "Invalid deck ID format" }),
});

/**
 * Validation schema for POST /api/decks/:deckId/reject request body.
 *
 * Validates:
 * - reason: Optional rejection reason (max 500 characters)
 */
export const rejectDeckBodySchema = z.object({
  reason: z.string().max(500, "Rejection reason exceeds maximum length of 500 characters").optional(),
});

/**
 * Inferred TypeScript type for reject deck parameters.
 */
export type RejectDeckParams = z.infer<typeof rejectDeckParamsSchema>;

/**
 * Inferred TypeScript type for reject deck request body.
 */
export type RejectDeckBody = z.infer<typeof rejectDeckBodySchema>;
