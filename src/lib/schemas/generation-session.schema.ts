import { z } from "zod";

/**
 * Validation schema for sessionId path parameter.
 *
 * Validates that the sessionId is a valid UUID v4 format.
 * Used in GET /api/generation-sessions/:sessionId endpoint.
 */
export const sessionIdParamSchema = z.object({
  sessionId: z.string().uuid("Invalid session ID format"),
});

/**
 * Validation schema for generation session status enum.
 *
 * Defines the allowed status values for filtering generation sessions.
 */
const generationSessionStatusSchema = z.enum(["in_progress", "completed", "failed", "timeout"]);

/**
 * Validation schema for GET /api/generation-sessions query parameters.
 *
 * Validates:
 * - limit: Number of items per page (1-100, default: 20)
 * - offset: Starting position for pagination (>=0, default: 0)
 * - status: Optional filter by session status
 *
 * All parameters are optional and will be coerced to appropriate types.
 */
export const getGenerationSessionsQuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .default("20")
    .transform((val) => parseInt(val, 10))
    .pipe(
      z
        .number()
        .int("Limit must be an integer")
        .min(1, "Limit must be at least 1")
        .max(100, "Limit must not exceed 100")
    ),
  offset: z
    .string()
    .optional()
    .default("0")
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int("Offset must be an integer").min(0, "Offset must be at least 0")),
  status: generationSessionStatusSchema.optional(),
});

/**
 * Inferred TypeScript types from validation schemas.
 */
export type SessionIdParam = z.infer<typeof sessionIdParamSchema>;
export type GetGenerationSessionsQuery = z.infer<typeof getGenerationSessionsQuerySchema>;
