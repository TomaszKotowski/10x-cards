import { DEFAULT_USER_ID } from "@/db/supabase.client";
import { rejectDeckBodySchema, rejectDeckParamsSchema } from "@/lib/schemas/deck.schema";
import { rejectDeck } from "@/lib/services/deck.service";
import type { ApiErrorResponseDTO, RejectDeckResponseDTO } from "@/types";
import type { APIContext } from "astro";
import { z } from "zod";

// Disable prerendering for this API route
export const prerender = false;

/**
 * POST /api/decks/:deckId/reject
 *
 * Rejects a draft deck with an optional reason.
 * This operation is irreversible - once rejected, the deck becomes read-only.
 *
 * Path Parameters:
 * - deckId: UUID of the deck to reject
 *
 * Request Body:
 * - reason: Optional rejection reason (max 500 characters)
 *
 * Responses:
 * - 200: Success with deck_id or business logic error (deck_not_draft)
 * - 400: Invalid deck ID format or reason too long
 * - 401: Unauthorized (missing or invalid token)
 * - 404: Deck not found (or user doesn't have access)
 * - 500: Internal server error
 */
export async function POST(context: APIContext): Promise<Response> {
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
    const paramsValidation = rejectDeckParamsSchema.safeParse(context.params);
    if (!paramsValidation.success) {
      const errorResponse: ApiErrorResponseDTO = {
        error: "validation_error",
        message: "Invalid deck ID format",
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { deckId } = paramsValidation.data;

    // Parse and validate request body
    const body = await context.request.json();
    const bodyValidation = rejectDeckBodySchema.safeParse(body);
    if (!bodyValidation.success) {
      const firstError = bodyValidation.error.errors[0];
      const errorResponse: ApiErrorResponseDTO = {
        error: "validation_error",
        message: firstError.message,
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { reason } = bodyValidation.data;

    // Mock mode is not supported for reject operation
    // Rejecting requires database transactions and RLS policies
    if (useMockData) {
      const errorResponse: ApiErrorResponseDTO = {
        error: "not_implemented",
        message: "Reject operation is not available in mock mode",
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 501,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Call service layer to reject deck
    const result = await rejectDeck(context.locals.supabase, deckId, reason);

    // Handle success case
    if (result.success) {
      const response: RejectDeckResponseDTO = result;
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Handle business logic errors
    const response: RejectDeckResponseDTO = result;
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

    // Handle "Deck not found" error from service
    if (error instanceof Error && error.message === "Deck not found") {
      const errorResponse: ApiErrorResponseDTO = {
        error: "deck_not_found",
        message: "Deck not found or you don't have permission to access it",
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Handle unexpected errors
    console.error("[POST /api/decks/:deckId/reject] Unexpected error:", error);
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
