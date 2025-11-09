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
