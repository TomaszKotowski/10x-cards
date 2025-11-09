import { listDecksQuerySchema } from "@/lib/schemas/deck.schema";
import { listUserDecks } from "@/lib/services/deck.service";
import { listUserDecksMock } from "@/lib/services/deck.service.mock";
import type { ApiErrorResponseDTO, PaginatedDecksResponseDTO } from "@/types";
import type { APIContext } from "astro";
import { z } from "zod";

// Disable prerendering for this API route
export const prerender = false;

/**
 * GET /api/decks
 *
 * Returns a paginated list of decks belonging to the authenticated user.
 *
 * Query Parameters:
 * - status (optional): Filter by deck status (draft, published, rejected)
 * - limit (optional): Number of items per page (1-100, default 50)
 * - offset (optional): Starting position (>=0, default 0)
 * - sort (optional): Sort order (default: updated_at_desc)
 *
 * Responses:
 * - 200: Success with paginated deck list
 * - 400: Invalid query parameters
 * - 401: Unauthorized (missing or invalid token)
 * - 500: Internal server error
 */
export async function GET(context: APIContext): Promise<Response> {
  const useMockData = import.meta.env.USE_MOCK_DATA === "true";

  // Guard: Check authentication (required for real mode)
  if (!useMockData && !context.locals.user) {
    const errorResponse: ApiErrorResponseDTO = {
      error: "unauthorized",
      message: "Authentication required",
    };
    return new Response(JSON.stringify(errorResponse), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Guard: Check Supabase client availability (required for real mode)
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

  try {
    // Parse and validate query parameters
    const url = new URL(context.request.url);
    const rawParams = {
      status: url.searchParams.get("status"),
      limit: url.searchParams.get("limit"),
      offset: url.searchParams.get("offset"),
      sort: url.searchParams.get("sort"),
    };

    const params = listDecksQuerySchema.parse(rawParams);

    // Get user ID (guaranteed to exist due to guard clause above)
    const userId = useMockData ? "00000000-0000-0000-0000-000000000001" : context.locals.user?.id;

    // Fetch decks from service layer (mock or real based on env)
    const result = useMockData
      ? await listUserDecksMock({ status: params.status }, { limit: params.limit, offset: params.offset }, params.sort)
      : await listUserDecks(
          context.locals.supabase,
          userId as string,
          { status: params.status },
          { limit: params.limit, offset: params.offset },
          params.sort
        );

    // Construct response DTO
    const response: PaginatedDecksResponseDTO = {
      data: result.data,
      pagination: {
        limit: params.limit,
        offset: params.offset,
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
    console.error("Error in GET /api/decks:", error);
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
