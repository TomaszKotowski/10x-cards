import { z } from "zod";

/**
 * Validation schema for POST /api/generations request body.
 *
 * Validates:
 * - source_text: Required text to generate flashcards from (1-10,000 characters)
 * - deck_name: Optional name for the new deck (1-100 characters)
 *
 * If deck_name is not provided, it will be auto-generated in the format "Deck YYYY-MM-DD HH:mm"
 */
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

/**
 * Inferred TypeScript type from the validation schema.
 */
export type CreateGenerationInput = z.infer<typeof createGenerationSchema>;
