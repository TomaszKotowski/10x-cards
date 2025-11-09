import { createCardSchema, deckIdParamSchema, getCardsQuerySchema } from "@/lib/schemas/card.schema";
import { createCard, getCardsByDeckId } from "@/lib/services/card.service";
import { createErrorResponse } from "@/lib/utils/error-response";
import type { CardDTO, PaginatedCardsResponseDTO } from "@/types";
import type { APIContext } from "astro";
import { z } from "zod";

// Disable prerendering for this API route
export const prerender = false;

/**
 * GET /api/decks/:deckId/cards
 *
 * Returns a paginated list of cards from a deck belonging to the authenticated user.
 * Cards are sorted by position in ascending order and filtered by soft-delete.
 *
 * Path Parameters:
 * - deckId: UUID of the deck to retrieve cards from
 *
 * Query Parameters:
 * - limit: Number of cards per page (1-100, default 100)
 * - offset: Number of cards to skip (>=0, default 0)
 *
 * Responses:
 * - 200: Success with paginated cards
 * - 400: Invalid parameters
 * - 401: Unauthorized (missing or invalid token)
 * - 404: Deck not found (or user doesn't have access)
 * - 500: Internal server error
 */
export async function GET(context: APIContext): Promise<Response> {
  // Guard: Check Supabase client availability
  if (!context.locals.supabase) {
    return createErrorResponse(500, "internal_server_error", "Database connection not available");
  }

  // Guard: Check user authentication
  const userId = context.locals.user?.id;
  if (!userId) {
    return createErrorResponse(401, "unauthorized", "Authentication required");
  }

  try {
    // Validate path parameter
    const pathValidation = deckIdParamSchema.safeParse(context.params);
    if (!pathValidation.success) {
      return createErrorResponse(400, "validation_error", "Invalid deck ID format");
    }

    const { deckId } = pathValidation.data;

    // Validate query parameters
    const queryValidation = getCardsQuerySchema.safeParse({
      limit: context.url.searchParams.get("limit"),
      offset: context.url.searchParams.get("offset"),
    });

    if (!queryValidation.success) {
      const firstError = queryValidation.error.errors[0];
      return createErrorResponse(400, "validation_error", firstError.message);
    }

    const { limit, offset } = queryValidation.data;

    // Fetch cards from service layer
    const result = await getCardsByDeckId(context.locals.supabase, deckId, limit, offset);

    // Build paginated response
    const response: PaginatedCardsResponseDTO = {
      data: result.cards,
      pagination: {
        limit,
        offset,
        total: result.total,
      },
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    // Handle validation errors
    if (error instanceof z.ZodError) {
      const firstError = error.errors[0];
      return createErrorResponse(400, "validation_error", firstError.message);
    }

    // Handle unexpected errors
    console.error("[GET /api/decks/:deckId/cards] Unexpected error:", error);
    return createErrorResponse(500, "internal_error", "An unexpected error occurred");
  }
}

/**
 * POST /api/decks/:deckId/cards
 *
 * Creates a new card in a draft deck. Validates card data, checks deck status,
 * enforces card limit (max 20), and handles position conflicts.
 *
 * Path Parameters:
 * - deckId: UUID of the deck to add card to
 *
 * Request Body:
 * - front: Card front text (1-200 characters, required)
 * - back: Card back text (1-200 characters, required)
 * - position: Card position in deck (integer >0, required)
 * - hint: Optional hint text (max 200 characters)
 *
 * Responses:
 * - 201: Success with created card
 * - 400: Invalid input, card limit reached, or deck not editable
 * - 401: Unauthorized (missing or invalid token)
 * - 404: Deck not found (or user doesn't have access)
 * - 409: Position conflict (position already taken)
 * - 500: Internal server error
 */
export async function POST(context: APIContext): Promise<Response> {
  // Guard: Check Supabase client availability
  if (!context.locals.supabase) {
    return createErrorResponse(500, "internal_server_error", "Database connection not available");
  }

  // Guard: Check user authentication
  const userId = context.locals.user?.id;
  if (!userId) {
    return createErrorResponse(401, "unauthorized", "Authentication required");
  }

  try {
    // Validate path parameter
    const pathValidation = deckIdParamSchema.safeParse(context.params);
    if (!pathValidation.success) {
      return createErrorResponse(400, "validation_error", "Invalid deck ID format");
    }

    const { deckId } = pathValidation.data;

    // Parse and validate request body
    const body = await context.request.json();
    const bodyValidation = createCardSchema.safeParse(body);

    if (!bodyValidation.success) {
      const firstError = bodyValidation.error.errors[0];
      return createErrorResponse(400, "validation_error", firstError.message, {
        field: firstError.path.join("."),
        constraint: firstError.code,
      });
    }

    const cardData = bodyValidation.data;

    // Create card via service layer
    const createdCard = await createCard(context.locals.supabase, deckId, userId, cardData);

    // Return successful response
    const response: CardDTO = createdCard;
    return new Response(JSON.stringify(response), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    // Handle validation errors
    if (error instanceof z.ZodError) {
      const firstError = error.errors[0];
      return createErrorResponse(400, "validation_error", firstError.message);
    }

    // Handle business logic errors from service layer
    if (error instanceof Error) {
      switch (error.message) {
        case "deck_not_found":
          return createErrorResponse(404, "deck_not_found", "Deck not found");

        case "deck_not_editable":
          return createErrorResponse(400, "deck_not_editable", "Only draft decks can be edited");

        case "card_limit_reached":
          return createErrorResponse(400, "card_limit_reached", "Deck has reached maximum of 20 cards", {
            current_count: 20,
            max_count: 20,
          });

        case "position_conflict":
          console.error("[POST /api/decks/:deckId/cards] Position conflict");
          return createErrorResponse(409, "position_conflict", "Card position is already taken");
      }
    }

    // Handle unexpected errors
    console.error("[POST /api/decks/:deckId/cards] Unexpected error:", error);
    return createErrorResponse(500, "internal_error", "An unexpected error occurred");
  }
}
