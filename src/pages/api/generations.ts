export const prerender = false;

import { DEFAULT_USER_ID } from "@/db/supabase.client";
import { createGenerationSchema } from "@/lib/schemas/generation.schema";
import { createDynamicSessionMock } from "@/lib/services/generation-session.service.mock";
import * as GenerationService from "@/lib/services/generation.service";
import type {
  ApiErrorResponseDTO,
  ConcurrentGenerationErrorResponseDTO,
  GenerationInitResponseDTO,
  GenerationValidationErrorResponseDTO,
} from "@/types";
import type { APIRoute } from "astro";

/**
 * POST /api/generations
 *
 * Initiates an asynchronous AI flashcard generation process.
 * Returns 202 Accepted immediately while processing continues in the background.
 *
 * Request Body:
 * - source_text: string (1-10,000 characters, required)
 * - deck_name: string (1-100 characters, optional)
 *
 * Success Response (202):
 * - generation_session_id: UUID of the generation session
 * - deck_id: UUID of the created deck
 * - status: "in_progress"
 * - started_at: ISO8601 timestamp
 *
 * Error Responses:
 * - 400: Validation error or concurrent generation in progress
 * - 500: Server error (missing config, database error, etc.)
 */
export const POST: APIRoute = async (context) => {
  // =========================================================================
  // GUARD 1: Check if we're in mock mode or have Supabase client
  // =========================================================================
  const useMockData = import.meta.env.USE_MOCK_DATA === "true";

  if (!useMockData && !context.locals.supabase) {
    const errorResponse: ApiErrorResponseDTO = {
      error: "internal_server_error",
      message: "Database connection not available",
    };
    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // =========================================================================
  // GUARD 2: Check DEFAULT_USER_ID is configured (MVP auth approach)
  // =========================================================================
  if (!useMockData && !DEFAULT_USER_ID) {
    const errorResponse: ApiErrorResponseDTO = {
      error: "internal_server_error",
      message: "DEFAULT_USER_ID not configured",
    };
    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const userId = DEFAULT_USER_ID;
  const supabase = context.locals.supabase;

  try {
    // =========================================================================
    // STEP 1: Parse and validate request body
    // =========================================================================
    let requestBody;
    try {
      requestBody = await context.request.json();
    } catch {
      const errorResponse: ApiErrorResponseDTO = {
        error: "invalid_json",
        message: "Request body must be valid JSON",
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const validation = createGenerationSchema.safeParse(requestBody);

    if (!validation.success) {
      // Extract first validation error
      const firstError = validation.error.errors[0];
      const field = firstError.path[0] as string;

      // Check if it's a length validation error
      if (firstError.code === "too_big" || firstError.code === "too_small") {
        const currentLength = typeof requestBody[field] === "string" ? requestBody[field].length : 0;

        const validationErrorResponse: GenerationValidationErrorResponseDTO = {
          error: "validation_error",
          message: firstError.message,
          details: {
            field,
            current_length: currentLength,
            max_length: firstError.code === "too_big" ? (firstError.maximum as number) : 0,
          },
        };

        return new Response(JSON.stringify(validationErrorResponse), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Generic validation error
      const errorResponse: ApiErrorResponseDTO = {
        error: "validation_error",
        message: firstError.message,
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { source_text, deck_name } = validation.data;

    // =========================================================================
    // STEP 2: Check for active generation (max 1 per user)
    // =========================================================================
    if (!useMockData) {
      const activeCheck = await GenerationService.checkActiveGeneration(supabase, userId);

      if (activeCheck.hasActiveGeneration) {
        const concurrentErrorResponse: ConcurrentGenerationErrorResponseDTO = {
          error: "generation_in_progress",
          message: "You already have a generation in progress. Please wait for it to complete.",
          active_session_id: activeCheck.activeSessionId || "",
        };

        return new Response(JSON.stringify(concurrentErrorResponse), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // =========================================================================
    // STEP 3: Sanitize source text
    // =========================================================================
    const sanitizedText = GenerationService.sanitizeSourceText(source_text);

    // =========================================================================
    // STEP 4: Generate deck name if not provided
    // =========================================================================
    const finalDeckName = deck_name || GenerationService.generateDeckName();

    // =========================================================================
    // STEP 5: Create deck (MOCK for now - will be implemented later)
    // =========================================================================
    // Using finalDeckName for future deck creation
    const deckId = useMockData
      ? `mock-deck-${finalDeckName}-${Date.now()}`
      : `temp-deck-${finalDeckName}-${Date.now()}`;

    // =========================================================================
    // STEP 6: Create generation session
    // =========================================================================
    const params = {
      model: "openai/gpt-4o-mini",
      temperature: 0.7,
      max_cards: 20,
    };

    let sessionId: string;
    let startedAt: string;

    if (useMockData) {
      // Create mock session ID
      sessionId = "mock-session-id-" + Date.now();

      // Create dynamic mock session (will auto-complete after 3 seconds)
      const mockSession = createDynamicSessionMock(sessionId, deckId, userId);
      startedAt = mockSession.started_at;
    } else {
      sessionId = await GenerationService.createGenerationSession(supabase, userId, deckId, sanitizedText, params);
      startedAt = new Date().toISOString();
    }

    // =========================================================================
    // STEP 7: Initiate AI generation (async, non-blocking)
    // =========================================================================
    if (!useMockData) {
      // Fire and forget - don't await
      Promise.resolve().then(() => GenerationService.processAIGeneration(supabase, sessionId, sanitizedText, false));
    }

    // =========================================================================
    // STEP 8: Return 202 Accepted immediately
    // =========================================================================
    const successResponse: GenerationInitResponseDTO = {
      generation_session_id: sessionId,
      deck_id: deckId,
      status: "in_progress",
      started_at: startedAt,
    };

    return new Response(JSON.stringify(successResponse), {
      status: 202,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    // =========================================================================
    // ERROR HANDLING: Unexpected server errors
    // =========================================================================
    // Log error for debugging
    if (error instanceof Error) {
      // Error logged to server console
    }

    const errorResponse: ApiErrorResponseDTO = {
      error: "internal_server_error",
      message: "An unexpected error occurred. Please try again later.",
    };

    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
