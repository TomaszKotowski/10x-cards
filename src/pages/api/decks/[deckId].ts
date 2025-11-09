import { DEFAULT_USER_ID } from "@/db/supabase.client";
import { DeckIdParamSchema } from "@/lib/schemas/deck.schema";
import { getDeckById } from "@/lib/services/deck.service";
import { getDeckByIdMock } from "@/lib/services/deck.service.mock";
import type { ApiErrorResponseDTO, DeckDetailDTO } from "@/types";
import type { APIContext } from "astro";
import { z } from "zod";

// Disable prerendering for this API route
export const prerender = false;

/**
 * GET /api/decks/:deckId
 *
 * Returns detailed information about a single deck belonging to the authenticated user.
 *
 * Path Parameters:
 * - deckId: UUID of the deck to retrieve
 *
 * Responses:
 * - 200: Success with deck details
 * - 400: Invalid deck ID format
 * - 401: Unauthorized (missing or invalid token)
 * - 404: Deck not found (or user doesn't have access)
 * - 500: Internal server error
 */
export async function GET(context: APIContext): Promise<Response> {
  // Guard: Check Supabase client availability (required for real mode)
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

  // Guard: Check user authentication
  const userId = useMockData ? DEFAULT_USER_ID : context.locals.user?.id;
  if (!userId) {
    const errorResponse: ApiErrorResponseDTO = {
      error: "unauthorized",
      message: "Authentication required",
    };
    return new Response(JSON.stringify(errorResponse), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // Validate path parameter
    const validationResult = DeckIdParamSchema.safeParse(context.params);
    if (!validationResult.success) {
      const errorResponse: ApiErrorResponseDTO = {
        error: "validation_error",
        message: "Invalid deck ID format",
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { deckId } = validationResult.data;

    // Fetch deck from service layer (mock or real based on env)
    const deck = useMockData
      ? await getDeckByIdMock(deckId)
      : await getDeckById(context.locals.supabase, deckId, userId);

    // Guard: Check if deck exists and user has access
    if (!deck) {
      const errorResponse: ApiErrorResponseDTO = {
        error: "deck_not_found",
        message: "Deck not found",
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Return successful response
    const response: DeckDetailDTO = deck;
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    // Handle validation errors
    if (error instanceof z.ZodError) {
      const firstError = error.errors[0];
      const errorResponse: ApiErrorResponseDTO = {
        error: "validation_error",
        message: firstError.message,
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Handle unexpected errors
    console.error("Error in GET /api/decks/:deckId:", error);
    const errorResponse: ApiErrorResponseDTO = {
      error: "internal_server_error",
      message: "An unexpected error occurred",
    };
    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
