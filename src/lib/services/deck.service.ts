import type { SupabaseClient } from "../../db/supabase.client";
import type { GetDecksQuery } from "../schemas/deck.schema";
import type { PaginatedDecksResponseDTO } from "../../types";

/**
 * Service class for deck-related business logic.
 * Handles data fetching, transformation, and business rules for decks.
 */
export class DeckService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Fetches a paginated list of decks with optional filtering and sorting.
   *
   * @param userId - The authenticated user's ID
   * @param query - Validated query parameters (status, limit, offset, sort)
   * @returns Promise resolving to paginated deck list with card counts
   * @throws Error if database query fails
   */
  async listDecks(userId: string, query: GetDecksQuery): Promise<PaginatedDecksResponseDTO> {
    const { status, limit, offset, sort } = query;

    // Parse sort parameter into column and direction
    const [sortColumn, sortDirection] = this.parseSortParameter(sort);
    const orderByColumn = sortColumn as "created_at" | "updated_at";
    const orderDirection = sortDirection as "asc" | "desc";

    // Build base query with user filter and soft-delete exclusion
    let decksQuery = this.supabase
      .from("decks")
      .select("*, cards!inner(id)", { count: "exact" })
      .eq("user_id", userId)
      .is("deleted_at", null);

    // Apply status filter if provided
    if (status) {
      decksQuery = decksQuery.eq("status", status);
    }

    // Apply soft-delete filter on cards relation
    decksQuery = decksQuery.is("cards.deleted_at", null);

    // Apply sorting and pagination
    decksQuery = decksQuery
      .order(orderByColumn, { ascending: orderDirection === "asc" })
      .range(offset, offset + limit - 1);

    // Execute query
    const { data, error, count } = await decksQuery;

    if (error) {
      // Log error for debugging (console statement acceptable for error logging)
      // eslint-disable-next-line no-console
      console.error("[DeckService.listDecks] Database error:", {
        userId,
        query,
        error: error.message,
        code: error.code,
      });
      throw new Error(`Failed to fetch decks: ${error.message}`);
    }

    // Transform data to DTOs with card counts
    const decksWithCount = (data || []).map((deck) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { cards, user_id, deleted_at, ...deckData } = deck;
      return {
        ...deckData,
        card_count: Array.isArray(cards) ? cards.length : 0,
      };
    });

    return {
      data: decksWithCount,
      pagination: {
        limit,
        offset,
        total: count ?? 0,
      },
    };
  }

  /**
   * Parses sort parameter string into column name and direction.
   *
   * @param sort - Sort parameter (e.g., "created_at_desc", "updated_at_asc")
   * @returns Tuple of [column, direction]
   * @private
   */
  private parseSortParameter(sort: string): [string, string] {
    const parts = sort.split("_");
    const direction = parts.pop() as string; // "asc" or "desc"
    const column = parts.join("_"); // "created_at" or "updated_at"
    return [column, direction];
  }
}

/**
 * Factory function to create a DeckService instance.
 *
 * @param supabase - Supabase client instance
 * @returns New DeckService instance
 */
export function createDeckService(supabase: SupabaseClient): DeckService {
  return new DeckService(supabase);
}
