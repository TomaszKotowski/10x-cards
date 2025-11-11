import { z } from "zod";

/**
 * Validation schema for sessionId path parameter.
 *
 * Validates that the sessionId is either:
 * - A valid UUID v4 format (production)
 * - A mock session ID in format: mock-session-id-[timestamp] (development/mock mode)
 *
 * Used in GET /api/generation-sessions/:sessionId endpoint.
 */
export const sessionIdParamSchema = z.object({
  sessionId: z.string().refine(
    (val) => {
      // Accept UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(val)) return true;

      // Accept mock session ID format: mock-session-id-[timestamp]
      const mockRegex = /^mock-session-id-\d+$/;
      return mockRegex.test(val);
    },
    { message: "Invalid session ID format" }
  ),
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
 * Handles both null (missing parameter) and string values from URL search params.
 */
export const getGenerationSessionsQuerySchema = z.object({
  limit: z
    .string()
    .nullable()
    .optional()
    .default("20")
    .transform((val) => parseInt(val || "20", 10))
    .pipe(
      z
        .number()
        .int("Limit must be an integer")
        .min(1, "Limit must be at least 1")
        .max(100, "Limit must not exceed 100")
    ),
  offset: z
    .string()
    .nullable()
    .optional()
    .default("0")
    .transform((val) => parseInt(val || "0", 10))
    .pipe(z.number().int("Offset must be an integer").min(0, "Offset must be at least 0")),
  status: z
    .string()
    .nullable()
    .optional()
    .transform((val) => (val ? val : undefined))
    .pipe(generationSessionStatusSchema.optional()),
});

/**
 * Inferred TypeScript types from validation schemas.
 */
export type SessionIdParam = z.infer<typeof sessionIdParamSchema>;
export type GetGenerationSessionsQuery = z.infer<typeof getGenerationSessionsQuerySchema>;
