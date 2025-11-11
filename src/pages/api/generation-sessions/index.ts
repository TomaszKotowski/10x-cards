import { DEFAULT_USER_ID } from "@/db/supabase.client";
import { getGenerationSessionsQuerySchema } from "@/lib/schemas/generation-session.schema";
import { listUserSessions } from "@/lib/services/generation-session.service";
import { listUserSessionsMock } from "@/lib/services/generation-session.service.mock";
import type { ApiErrorResponseDTO, PaginatedGenerationSessionsResponseDTO } from "@/types";
import type { APIContext } from "astro";
import { z } from "zod";

// Disable prerendering for this API route
export const prerender = false;

/**
 * GET /api/generation-sessions
 *
 * Returns a paginated list of generation sessions belonging to the authenticated user.
 * Sessions are ordered by creation date (most recent first) and can be filtered by status.
 *
 * Query Parameters:
 * - status (optional): Filter by session status (in_progress, completed, failed, timeout)
 * - limit (optional): Number of items per page (1-100, default 20)
 * - offset (optional): Starting position (>=0, default 0)
 *
 * Responses:
 * - 200: Success with paginated session list
 * - 400: Invalid query parameters
 * - 401: Unauthorized (missing or invalid token)
 * - 500: Internal server error
 *
 * @example
 * ```
 * GET /api/generation-sessions?status=completed&limit=10&offset=0
 * Authorization: Bearer <jwt_token>
 *
 * Response 200:
 * {
 *   "data": [
 *     {
 *       "id": "session-uuid",
 *       "deck_id": "deck-uuid",
 *       "deck_name": "My Flashcards",
 *       "status": "completed",
 *       "started_at": "2024-01-15T10:30:00Z",
 *       "finished_at": "2024-01-15T10:31:23Z",
 *       "truncated_count": 0,
 *       "error_code": null
 *     }
 *   ],
 *   "pagination": {
 *     "limit": 10,
 *     "offset": 0,
 *     "total": 45
 *   }
 * }
 * ```
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
    };

    const params = getGenerationSessionsQuerySchema.parse(rawParams);

    // Get user ID (guaranteed to exist due to guard clause above)
    const userId = useMockData ? DEFAULT_USER_ID : context.locals.user?.id;

    // Fetch generation sessions from service layer (mock or real based on env)
    const result = useMockData
      ? await listUserSessionsMock({
          status: params.status,
          limit: params.limit,
          offset: params.offset,
        })
      : await listUserSessions(context.locals.supabase, userId as string, {
          status: params.status,
          limit: params.limit,
          offset: params.offset,
        });

    // Construct response DTO
    const response: PaginatedGenerationSessionsResponseDTO = {
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
    console.error("Error in GET /api/generation-sessions:", error);
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
