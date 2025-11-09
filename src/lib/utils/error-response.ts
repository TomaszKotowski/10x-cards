/**
 * Creates a standardized JSON error response.
 *
 * @param status - HTTP status code
 * @param error - Error code identifier (e.g., "validation_error", "deck_not_found")
 * @param message - Human-readable error message
 * @param details - Optional additional error details
 * @returns Response object with JSON error body
 *
 * @example
 * ```typescript
 * return createErrorResponse(
 *   400,
 *   "validation_error",
 *   "Invalid input data",
 *   { field: "name", constraint: "max_length" }
 * );
 * ```
 */
export function createErrorResponse(status: number, error: string, message: string, details?: unknown): Response {
  const body: Record<string, unknown> = {
    error,
    message,
  };

  if (details !== undefined) {
    body.details = details;
  }

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}
