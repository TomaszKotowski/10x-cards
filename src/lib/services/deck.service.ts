import type { Database } from "@/db/database.types";
import type { ListDecksQuery } from "@/lib/schemas/deck.schema";
import type {
  DeckDetailDTO,
  DeckListItemDTO,
  PublishDeckErrorResponseDTO,
  PublishDeckSuccessResponseDTO,
  RejectDeckErrorResponseDTO,
  RejectDeckSuccessResponseDTO,
  UpdateDeckCommand,
} from "@/types";
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
 * Result type from the publish_deck RPC function.
 * This matches the JSONB structure returned by the database function.
 */
interface PublishDeckRpcResult {
  success: boolean;
  error?: string;
  card_count?: number;
  deck_id?: string;
}

/**
 * Result type from the reject_deck RPC function.
 * This matches the JSONB structure returned by the database function.
 */
interface RejectDeckRpcResult {
  success: boolean;
  error?: string;
  deck_id?: string;
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

/**
 * Retrieves a single deck by ID with card count.
 *
 * @param supabase - Authenticated Supabase client instance
 * @param deckId - UUID of the deck to retrieve
 * @param userId - UUID of the user who owns the deck
 * @returns Promise with deck details or null if not found
 *
 * @throws Error if database query fails
 *
 * @example
 * ```typescript
 * const deck = await getDeckById(
 *   supabase,
 *   "550e8400-e29b-41d4-a716-446655440000",
 *   "user-uuid"
 * );
 * ```
 */
export async function getDeckById(
  supabase: TypedSupabaseClient,
  deckId: string,
  userId: string
): Promise<DeckDetailDTO | null> {
  // Query deck with user isolation and soft-delete filter
  const { data: deck, error } = await supabase
    .from("decks")
    .select("*")
    .eq("id", deckId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .single();

  // Return null if deck not found or error occurred
  if (error || !deck) {
    return null;
  }

  // Get card count for the deck
  const { count, error: countError } = await supabase
    .from("cards")
    .select("*", { count: "exact", head: true })
    .eq("deck_id", deckId)
    .is("deleted_at", null);

  // Log error but continue with count = 0 if card count fails
  if (countError) {
    console.error("Failed to fetch card count:", countError);
  }

  // Map database entity to DTO
  return {
    id: deck.id,
    name: deck.name,
    slug: deck.slug,
    status: deck.status as "draft" | "published" | "rejected",
    published_at: deck.published_at,
    rejected_at: deck.rejected_at,
    rejected_reason: deck.rejected_reason,
    card_count: count ?? 0,
    created_at: deck.created_at,
    updated_at: deck.updated_at,
  };
}

/**
 * Updates a deck's name. Only draft decks can be updated.
 *
 * @param supabase - Authenticated Supabase client instance
 * @param userId - UUID of the user who owns the deck
 * @param deckId - UUID of the deck to update
 * @param command - Update command containing the new name
 * @returns Promise with updated deck details
 *
 * @throws Error with message "Deck not found" if deck doesn't exist or user doesn't have access
 * @throws Error with message "Deck not editable" if deck status is not draft
 * @throws Error with message "Name not unique" if deck name already exists for this user
 * @throws Error if database query fails
 *
 * @example
 * ```typescript
 * const updatedDeck = await updateDeck(
 *   supabase,
 *   "user-uuid",
 *   "550e8400-e29b-41d4-a716-446655440000",
 *   { name: "Advanced JavaScript Concepts" }
 * );
 * ```
 */
export async function updateDeck(
  supabase: TypedSupabaseClient,
  userId: string,
  deckId: string,
  command: UpdateDeckCommand
): Promise<DeckDetailDTO> {
  // Guard: Verify ownership and get current status
  const { data: deck, error: fetchError } = await supabase
    .from("decks")
    .select("status")
    .eq("id", deckId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .single();

  if (fetchError || !deck) {
    throw new Error("Deck not found");
  }

  // Guard: Check if deck is editable (only draft decks can be updated)
  if (deck.status !== "draft") {
    throw new Error("Deck not editable");
  }

  // Update deck name
  const { data: updatedDeck, error: updateError } = await supabase
    .from("decks")
    .update({ name: command.name })
    .eq("id", deckId)
    .select()
    .single();

  // Handle unique constraint violation (duplicate deck name for user)
  if (updateError?.code === "23505") {
    throw new Error("Name not unique");
  }

  if (updateError || !updatedDeck) {
    throw new Error(`Failed to update deck: ${updateError?.message || "Unknown error"}`);
  }

  // Get card count for the updated deck
  const { count, error: countError } = await supabase
    .from("cards")
    .select("*", { count: "exact", head: true })
    .eq("deck_id", deckId)
    .is("deleted_at", null);

  // Log error but continue with count = 0 if card count fails
  if (countError) {
    console.error("Failed to fetch card count:", countError);
  }

  // Map database entity to DTO
  return {
    id: updatedDeck.id,
    name: updatedDeck.name,
    slug: updatedDeck.slug,
    status: updatedDeck.status as "draft" | "published" | "rejected",
    published_at: updatedDeck.published_at,
    rejected_at: updatedDeck.rejected_at,
    rejected_reason: updatedDeck.rejected_reason,
    card_count: count ?? 0,
    created_at: updatedDeck.created_at,
    updated_at: updatedDeck.updated_at,
  };
}

/**
 * Publishes a draft deck atomically with validations.
 *
 * This operation is irreversible. Once published, the deck and its cards become read-only.
 * The function performs the following validations and operations:
 * - Verifies deck ownership and draft status
 * - Validates card count (must be between 1 and 20)
 * - Validates card content length (≤200 characters per side)
 * - Hard-deletes cards beyond position 20
 * - Updates deck status to 'published' with timestamp
 *
 * @param supabase - Authenticated Supabase client instance
 * @param deckId - UUID of the deck to publish
 * @returns Promise with success response containing deck_id
 *
 * @throws Error with message "Deck not found" if deck doesn't exist or user doesn't have access
 * @throws Error with message "Deck not draft" if deck status is not draft
 * @throws Error with message "Invalid card count" if deck has <1 or >20 cards
 * @throws Error with message "Validation failed" if any card exceeds length limits
 * @throws Error if database RPC call fails
 *
 * @example
 * ```typescript
 * const result = await publishDeck(
 *   supabase,
 *   "550e8400-e29b-41d4-a716-446655440000"
 * );
 * // Returns: { success: true, deck_id: "550e8400-e29b-41d4-a716-446655440000" }
 * ```
 */
export async function publishDeck(
  supabase: TypedSupabaseClient,
  deckId: string
): Promise<PublishDeckSuccessResponseDTO | PublishDeckErrorResponseDTO> {
  // Call the publish_deck RPC function
  const { data, error } = await supabase.rpc("publish_deck", {
    deck_id_param: deckId,
  });

  // Handle RPC execution errors
  if (error) {
    console.error("[DeckService.publishDeck] RPC error:", error);
    throw new Error(`Failed to publish deck: ${error.message}`);
  }

  // Parse the JSONB result
  const result = data as unknown as PublishDeckRpcResult;

  // Handle success case
  if (result.success && result.deck_id) {
    return {
      success: true,
      deck_id: result.deck_id,
    };
  }

  // Handle business logic errors from RPC
  switch (result.error) {
    case "deck_not_found":
    case "unauthorized":
      throw new Error("Deck not found");

    case "deck_not_draft":
      return {
        success: false,
        error: "deck_not_draft",
        message: "Only draft decks can be published",
      };

    case "invalid_card_count":
      return {
        success: false,
        error: "invalid_card_count",
        message: "Deck must have between 1 and 20 cards",
        card_count: result.card_count,
      };

    default:
      // Unexpected error from RPC
      console.error("[DeckService.publishDeck] Unexpected RPC error:", result.error);
      throw new Error(`Unexpected error during deck publication: ${result.error}`);
  }
}

/**
 * Rejects a draft deck with an optional reason.
 *
 * This operation is irreversible. Once rejected, the deck status changes to 'rejected'
 * and the deck becomes read-only. The function performs the following operations:
 * - Verifies deck ownership and draft status
 * - Updates deck status to 'rejected' with timestamp
 * - Optionally stores rejection reason (max 500 characters)
 *
 * @param supabase - Authenticated Supabase client instance
 * @param deckId - UUID of the deck to reject
 * @param reason - Optional rejection reason (max 500 characters)
 * @returns Promise with success response containing deck_id or error response
 *
 * @throws Error with message "Deck not found" if deck doesn't exist or user doesn't have access
 * @throws Error if database RPC call fails
 *
 * @example
 * ```typescript
 * const result = await rejectDeck(
 *   supabase,
 *   "550e8400-e29b-41d4-a716-446655440000",
 *   "Cards are too difficult for beginners"
 * );
 * // Returns: { success: true, deck_id: "550e8400-e29b-41d4-a716-446655440000" }
 * ```
 */
export async function rejectDeck(
  supabase: TypedSupabaseClient,
  deckId: string,
  reason?: string
): Promise<RejectDeckSuccessResponseDTO | RejectDeckErrorResponseDTO> {
  // Call the reject_deck RPC function
  const { data, error } = await supabase.rpc("reject_deck", {
    deck_id_param: deckId,
    reason_param: reason ?? undefined,
  });

  // Handle RPC execution errors
  if (error) {
    console.error("[DeckService.rejectDeck] RPC error:", error);
    throw new Error(`Failed to reject deck: ${error.message}`);
  }

  // Parse the JSONB result
  const result = data as unknown as RejectDeckRpcResult;

  // Handle success case
  if (result.success && result.deck_id) {
    return {
      success: true,
      deck_id: result.deck_id,
    };
  }

  // Handle business logic errors from RPC
  switch (result.error) {
    case "deck_not_found":
    case "unauthorized":
      throw new Error("Deck not found");

    case "deck_not_draft":
      return {
        success: false,
        error: "deck_not_draft",
        message: "Only draft decks can be rejected",
      };

    default:
      // Unexpected error from RPC
      console.error("[DeckService.rejectDeck] Unexpected RPC error:", result.error);
      throw new Error(`Unexpected error during deck rejection: ${result.error}`);
  }
}
