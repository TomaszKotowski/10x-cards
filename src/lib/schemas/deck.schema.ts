import { z } from "zod";

/**
 * Zod schema for validating GET /api/decks query parameters.
 *
 * Validates and transforms query parameters with proper defaults and constraints:
 * - status: optional filter by deck status
 * - limit: pagination limit (default: 20, max: 100)
 * - offset: pagination offset (default: 0, min: 0)
 * - sort: sort order (default: created_at_desc)
 */
export const GetDecksQuerySchema = z.object({
  status: z.enum(["draft", "published", "rejected"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  sort: z.enum(["created_at_asc", "created_at_desc", "name_asc", "name_desc"]).default("created_at_desc"),
});

/**
 * TypeScript type inferred from GetDecksQuerySchema.
 * Use this type for type-safe query parameter handling.
 */
export type GetDecksQuery = z.infer<typeof GetDecksQuerySchema>;
