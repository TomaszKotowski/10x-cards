import type { APIRoute } from "astro";

import { GetDecksQuerySchema } from "@/lib/schemas/deck.schema";
import { createDeckService } from "@/lib/services/deck.service";
import type { ApiErrorResponseDTO } from "@/types";

/**
 * Disable prerendering for this API endpoint.
 * This ensures the endpoint runs on-demand with access to request context.
 */
export const prerender = false;

/**
 * GET /api/decks
 *
 * Returns a paginated list of decks for the authenticated user.
 *
 * Query Parameters:
 * - status: optional filter by deck status (draft, published, rejected)
 * - limit: pagination limit (default: 50, max: 100)
 * - offset: pagination offset (default: 0, min: 0)
 * - sort: sort order (default: updated_at_desc)
 *
 * Responses:
 * - 200 OK: Returns paginated deck list with card counts
 * - 400 Bad Request: Invalid query parameters
 * - 401 Unauthorized: Missing or invalid authentication
 * - 500 Internal Server Error: Unexpected server error
 */
export const GET: APIRoute = async ({ request, locals }) => {
  try {
    // 1. Check authentication
    const {
      data: { user },
      error: authError,
    } = await locals.supabase.auth.getUser();

    if (authError || !user) {
      const errorResponse: ApiErrorResponseDTO = {
        error: "unauthorized",
        message: "Authentication required",
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 2. Parse and validate query parameters
    const url = new URL(request.url);
    const rawQuery = {
      status: url.searchParams.get("status"),
      limit: url.searchParams.get("limit"),
      offset: url.searchParams.get("offset"),
      sort: url.searchParams.get("sort"),
    };

    const validationResult = GetDecksQuerySchema.safeParse(rawQuery);

    if (!validationResult.success) {
      const errorResponse: ApiErrorResponseDTO = {
        error: "validation_error",
        message: "Invalid query parameters",
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 3. Call service layer
    const deckService = createDeckService(locals.supabase);
    const result = await deckService.listDecks(user.id, validationResult.data);

    // 4. Return success response
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    // 5. Handle unexpected errors
    // eslint-disable-next-line no-console
    console.error("[GET /api/decks] Unexpected error:", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    const errorResponse: ApiErrorResponseDTO = {
      error: "internal_server_error",
      message: "An unexpected error occurred",
    };

    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
