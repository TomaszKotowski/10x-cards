import { DEFAULT_USER_ID } from "@/db/supabase.client";
import { sessionIdParamSchema } from "@/lib/schemas/generation-session.schema";
import { getSessionById } from "@/lib/services/generation-session.service";
import { getSessionByIdMock } from "@/lib/services/generation-session.service.mock";
import type { ApiErrorResponseDTO, GenerationSessionDTO } from "@/types";
import type { APIContext } from "astro";
import { z } from "zod";

// Disable prerendering for this API route
export const prerender = false;

/**
 * GET /api/generation-sessions/:sessionId
 *
 * Returns detailed information about a single generation session belonging to the authenticated user.
 * This endpoint is primarily used for polling the status of ongoing AI card generation.
 *
 * Path Parameters:
 * - sessionId: UUID of the generation session to retrieve
 *
 * Responses:
 * - 200: Success with generation session details
 * - 400: Invalid session ID format
 * - 401: Unauthorized (missing or invalid token)
 * - 404: Generation session not found (or user doesn't have access)
 * - 500: Internal server error
 *
 * @example
 * ```
 * GET /api/generation-sessions/123e4567-e89b-12d3-a456-426614174000
 * Authorization: Bearer <jwt_token>
 *
 * Response 200:
 * {
 *   "id": "123e4567-e89b-12d3-a456-426614174000",
 *   "user_id": "user-uuid",
 *   "deck_id": "deck-uuid",
 *   "status": "in_progress",
 *   "started_at": "2024-01-15T10:30:00Z",
 *   "finished_at": null,
 *   "params": { "model": "gpt-4", "temperature": 0.7 },
 *   "truncated_count": null,
 *   "error_code": null,
 *   "error_message": null
 * }
 * ```
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
    const validationResult = sessionIdParamSchema.safeParse(context.params);
    if (!validationResult.success) {
      const errorResponse: ApiErrorResponseDTO = {
        error: "validation_error",
        message: "Invalid session ID format",
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { sessionId } = validationResult.data;

    // Fetch generation session from service layer (mock or real based on env)
    const session = useMockData
      ? await getSessionByIdMock(sessionId)
      : await getSessionById(context.locals.supabase, sessionId, userId);

    // Guard: Check if session exists and user has access
    if (!session) {
      const errorResponse: ApiErrorResponseDTO = {
        error: "not_found",
        message: "Generation session not found",
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Return successful response
    const response: GenerationSessionDTO = session;
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
    console.error("Error in GET /api/generation-sessions/:sessionId:", error);
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
