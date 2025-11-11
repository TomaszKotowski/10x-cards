import type { Database } from "@/db/database.types";
import type { GenerationSessionDTO, GenerationSessionListItemDTO, GetGenerationSessionsQueryDTO } from "@/types";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Type alias for the Supabase client with proper database typing.
 */
type TypedSupabaseClient = SupabaseClient<Database>;

/**
 * Result type for listUserSessions function.
 */
interface ListUserSessionsResult {
  data: GenerationSessionListItemDTO[];
  total: number;
}

/**
 * Retrieves a single generation session by ID for a specific user.
 *
 * @param supabase - Authenticated Supabase client instance
 * @param sessionId - UUID of the generation session to retrieve
 * @param userId - UUID of the user (for RLS enforcement)
 * @returns Promise with the generation session DTO or null if not found
 *
 * @throws Error if database query fails
 *
 * @example
 * ```typescript
 * const session = await getSessionById(supabase, "session-uuid", "user-uuid");
 * if (!session) {
 *   // Session not found or doesn't belong to user
 * }
 * ```
 *
 * @remarks
 * - RLS policies ensure users can only access their own sessions
 * - Excludes internal fields: created_at, updated_at, sanitized_source_text
 * - Used for polling generation status
 */
export async function getSessionById(
  supabase: TypedSupabaseClient,
  sessionId: string,
  userId: string
): Promise<GenerationSessionDTO | null> {
  const { data, error } = await supabase
    .from("generation_sessions")
    .select(
      `
      id,
      user_id,
      deck_id,
      status,
      started_at,
      finished_at,
      params,
      truncated_count,
      error_code,
      error_message
    `
    )
    .eq("id", sessionId)
    .eq("user_id", userId)
    .single();

  if (error) {
    // PGRST116 is "not found" error code from PostgREST
    if (error.code === "PGRST116") {
      return null;
    }
    throw new Error(`Failed to fetch generation session: ${error.message}`);
  }

  return data as GenerationSessionDTO;
}

/**
 * Lists generation sessions for a specific user with filtering and pagination.
 *
 * @param supabase - Authenticated Supabase client instance
 * @param userId - UUID of the user whose sessions to retrieve
 * @param filters - Optional filters and pagination parameters
 * @returns Promise with paginated session list and total count
 *
 * @throws Error if database query fails
 *
 * @example
 * ```typescript
 * const result = await listUserSessions(
 *   supabase,
 *   "user-uuid",
 *   { status: "completed", limit: 20, offset: 0 }
 * );
 * ```
 *
 * @remarks
 * - RLS policies ensure users can only access their own sessions
 * - Joins with decks table to include deck_name
 * - Ordered by created_at DESC (most recent first)
 * - Separate COUNT query for total count
 */
export async function listUserSessions(
  supabase: TypedSupabaseClient,
  userId: string,
  filters: GetGenerationSessionsQueryDTO
): Promise<ListUserSessionsResult> {
  const { limit = 20, offset = 0, status } = filters;

  // Build base query with JOIN to decks table
  let query = supabase
    .from("generation_sessions")
    .select(
      `
      id,
      deck_id,
      status,
      started_at,
      finished_at,
      truncated_count,
      error_code,
      decks!inner(name)
    `,
      { count: "exact" }
    )
    .eq("user_id", userId);

  // Apply status filter if provided
  if (status) {
    query = query.eq("status", status);
  }

  // Apply ordering and pagination
  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error(`Failed to list generation sessions: ${error.message}`);
  }

  // Transform the joined data to match GenerationSessionListItemDTO
  const transformedData: GenerationSessionListItemDTO[] = (data || []).map((item) => {
    // Extract deck_name from the joined decks object
    // Supabase returns joined data as either an array or a single object
    const deckName = Array.isArray(item.decks) ? item.decks[0]?.name : (item.decks as { name: string } | null)?.name;

    return {
      id: item.id,
      deck_id: item.deck_id,
      status: item.status,
      started_at: item.started_at,
      finished_at: item.finished_at,
      truncated_count: item.truncated_count,
      error_code: item.error_code,
      deck_name: deckName || "Unknown Deck",
    };
  });

  return {
    data: transformedData,
    total: count || 0,
  };
}
