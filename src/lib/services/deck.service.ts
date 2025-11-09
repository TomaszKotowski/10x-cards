import type { Database } from "@/db/database.types";
import type { ListDecksQuery } from "@/lib/schemas/deck.schema";
import type { DeckListItemDTO } from "@/types";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Type alias for the Supabase client with proper database typing.
 */
type TypedSupabaseClient = SupabaseClient<Database>;

/**
 * Result type for listUserDecks function.
 */
interface ListUserDecksResult {
  data: DeckListItemDTO[];
  total: number;
}

/**
 * Maps sort parameter to Supabase order configuration.
 */
function getSortConfig(sort: string): { column: "updated_at" | "created_at"; ascending: boolean } {
  switch (sort) {
    case "updated_at_asc":
      return { column: "updated_at", ascending: true };
    case "created_at_desc":
      return { column: "created_at", ascending: false };
    case "created_at_asc":
      return { column: "created_at", ascending: true };
    case "updated_at_desc":
    default:
      return { column: "updated_at", ascending: false };
  }
}

/**
 * Lists decks belonging to a specific user with filtering, sorting, and pagination.
 *
 * @param supabase - Authenticated Supabase client instance
 * @param userId - UUID of the user whose decks to retrieve
 * @param filters - Optional filters (status)
 * @param pagination - Pagination parameters (limit, offset)
 * @param sort - Sort order parameter
 * @returns Promise with paginated deck list and total count
 *
 * @throws Error if database query fails
 *
 * @example
 * ```typescript
 * const result = await listUserDecks(
 *   supabase,
 *   "user-uuid",
 *   { status: "draft" },
 *   { limit: 50, offset: 0 },
 *   "updated_at_desc"
 * );
 * ```
 */
export async function listUserDecks(
  supabase: TypedSupabaseClient,
  userId: string,
  filters: Pick<ListDecksQuery, "status">,
  pagination: Pick<ListDecksQuery, "limit" | "offset">,
  sort: ListDecksQuery["sort"]
): Promise<ListUserDecksResult> {
  // Build base query with user isolation and soft-delete filter
  let query = supabase.from("decks").select("*", { count: "exact" }).eq("user_id", userId).is("deleted_at", null);

  // Apply status filter if provided
  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  // Apply sorting
  const sortConfig = getSortConfig(sort);
  query = query.order(sortConfig.column, { ascending: sortConfig.ascending });

  // Apply pagination
  const { limit, offset } = pagination;
  query = query.range(offset, offset + limit - 1);

  // Execute query
  const { data: decks, error, count } = await query;

  if (error) {
    throw new Error(`Failed to fetch decks: ${error.message}`);
  }

  // Get card counts for each deck
  // Note: We need to fetch card counts separately as Supabase doesn't support
  // aggregate functions in the main select with proper typing
  const deckIds = decks?.map((deck) => deck.id) || [];
  const cardCounts = await getCardCounts(supabase, deckIds);

  // Map database entities to DTOs
  const data: DeckListItemDTO[] =
    decks?.map((deck) => ({
      id: deck.id,
      name: deck.name,
      slug: deck.slug,
      status: deck.status as "draft" | "published" | "rejected",
      published_at: deck.published_at,
      rejected_at: deck.rejected_at,
      rejected_reason: deck.rejected_reason,
      card_count: cardCounts[deck.id] || 0,
      created_at: deck.created_at,
      updated_at: deck.updated_at,
    })) || [];

  return {
    data,
    total: count || 0,
  };
}

/**
 * Fetches card counts for multiple decks in a single query.
 *
 * @param supabase - Authenticated Supabase client instance
 * @param deckIds - Array of deck UUIDs
 * @returns Promise with map of deck_id to card count
 */
async function getCardCounts(supabase: TypedSupabaseClient, deckIds: string[]): Promise<Record<string, number>> {
  if (deckIds.length === 0) {
    return {};
  }

  const { data, error } = await supabase.from("cards").select("deck_id").in("deck_id", deckIds).is("deleted_at", null);

  if (error) {
    console.error("Failed to fetch card counts:", error);
    return {};
  }

  // Count cards per deck
  const counts: Record<string, number> = {};
  data?.forEach((card) => {
    counts[card.deck_id] = (counts[card.deck_id] || 0) + 1;
  });

  return counts;
}
