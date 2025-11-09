import type { Database } from "@/db/database.types";
import type { CardDTO, CreateCardCommand } from "@/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getDeckById } from "./deck.service";
import type { GeneratedCard } from "./ai.service";

/**
 * Type alias for the Supabase client with proper database typing.
 */
type TypedSupabaseClient = SupabaseClient<Database>;

/**
 * Result type for getCardsByDeckId function.
 */
interface GetCardsByDeckIdResult {
  cards: CardDTO[];
  total: number;
}

/**
 * Validates a single card's data before insertion.
 *
 * @param card - Card data to validate
 * @param position - Position of the card in the deck
 * @returns Validation result with error message if invalid
 *
 * @example
 * ```typescript
 * const validation = validateCardData(card, 1);
 * if (!validation.valid) {
 *   console.error(validation.error);
 * }
 * ```
 */
export function validateCardData(card: GeneratedCard, position: number): { valid: boolean; error?: string } {
  // Validate front
  if (!card.front || card.front.trim().length === 0) {
    return { valid: false, error: "Card front is required" };
  }

  if (card.front.length > 200) {
    return { valid: false, error: `Card front exceeds 200 characters (position ${position})` };
  }

  // Validate back
  if (!card.back || card.back.trim().length === 0) {
    return { valid: false, error: "Card back is required" };
  }

  if (card.back.length > 500) {
    return { valid: false, error: `Card back exceeds 500 characters (position ${position})` };
  }

  // Validate hint (optional)
  if (card.hint && card.hint.length > 200) {
    return { valid: false, error: `Card hint exceeds 200 characters (position ${position})` };
  }

  return { valid: true };
}

/**
 * Creates multiple cards in a single batch operation.
 * Validates all cards before insertion.
 *
 * @param supabase - Authenticated Supabase client instance
 * @param deckId - UUID of the deck to add cards to
 * @param cards - Array of generated cards to insert
 * @returns Promise with count of created cards
 *
 * @throws Error if validation fails or database insert fails
 *
 * @example
 * ```typescript
 * const count = await createCards(supabase, "deck-uuid", generatedCards);
 * console.log(`Created ${count} cards`);
 * ```
 */
export async function createCards(
  supabase: TypedSupabaseClient,
  deckId: string,
  cards: GeneratedCard[]
): Promise<number> {
  if (cards.length === 0) {
    throw new Error("No cards to create");
  }

  if (cards.length > 20) {
    throw new Error(`Cannot create more than 20 cards (received ${cards.length})`);
  }

  // Validate all cards first
  for (let i = 0; i < cards.length; i++) {
    const validation = validateCardData(cards[i], i + 1);
    if (!validation.valid) {
      throw new Error(validation.error || "Card validation failed");
    }
  }

  // Prepare batch insert data
  const cardsToInsert = cards.map((card, index) => ({
    deck_id: deckId,
    front: card.front.trim(),
    back: card.back.trim(),
    hint: card.hint?.trim() || null,
    position: index + 1, // 1-based position
  }));

  // Batch insert
  const { data, error } = await supabase.from("cards").insert(cardsToInsert).select("id");

  if (error) {
    throw new Error(`Failed to create cards: ${error.message}`);
  }

  return data?.length || 0;
}

/**
 * Retrieves paginated cards for a specific deck.
 *
 * @param supabase - Authenticated Supabase client instance
 * @param deckId - UUID of the deck to retrieve cards from
 * @param limit - Maximum number of cards to return (1-100)
 * @param offset - Number of cards to skip for pagination
 * @returns Promise with cards array and total count
 *
 * @throws Error if database query fails
 *
 * @example
 * ```typescript
 * const result = await getCardsByDeckId(supabase, "deck-uuid", 20, 0);
 * console.log(`Retrieved ${result.cards.length} of ${result.total} cards`);
 * ```
 */
export async function getCardsByDeckId(
  supabase: TypedSupabaseClient,
  deckId: string,
  limit: number,
  offset: number
): Promise<GetCardsByDeckIdResult> {
  // Get total count of cards in the deck (excluding soft-deleted)
  const { count, error: countError } = await supabase
    .from("cards")
    .select("*", { count: "exact", head: true })
    .eq("deck_id", deckId)
    .is("deleted_at", null);

  if (countError) {
    throw new Error(`Failed to count cards: ${countError.message}`);
  }

  // Get paginated cards, ordered by position
  const { data: cards, error: selectError } = await supabase
    .from("cards")
    .select("*")
    .eq("deck_id", deckId)
    .is("deleted_at", null)
    .order("position", { ascending: true })
    .range(offset, offset + limit - 1);

  if (selectError) {
    throw new Error(`Failed to fetch cards: ${selectError.message}`);
  }

  // Map CardEntity to CardDTO (omit deleted_at)
  const cardDTOs: CardDTO[] =
    cards?.map((card) => ({
      id: card.id,
      deck_id: card.deck_id,
      front: card.front,
      back: card.back,
      position: card.position,
      hint: card.hint,
      is_active: card.is_active,
      locale: card.locale,
      metadata: card.metadata,
      created_at: card.created_at,
      updated_at: card.updated_at,
    })) || [];

  return {
    cards: cardDTOs,
    total: count ?? 0,
  };
}

/**
 * Gets the count of non-deleted cards in a deck.
 *
 * @param supabase - Authenticated Supabase client instance
 * @param deckId - UUID of the deck
 * @returns Promise with card count
 *
 * @throws Error if database query fails
 *
 * @example
 * ```typescript
 * const count = await getCardCount(supabase, "deck-uuid");
 * console.log(`Deck has ${count} cards`);
 * ```
 */
export async function getCardCount(supabase: TypedSupabaseClient, deckId: string): Promise<number> {
  const { count, error } = await supabase
    .from("cards")
    .select("*", { count: "exact", head: true })
    .eq("deck_id", deckId)
    .is("deleted_at", null);

  if (error) {
    throw new Error(`Failed to count cards: ${error.message}`);
  }

  return count ?? 0;
}

/**
 * Gets the next available position for a new card in a deck.
 * Returns MAX(position) + 1, or 1 if deck has no cards.
 *
 * @param supabase - Authenticated Supabase client instance
 * @param deckId - UUID of the deck
 * @returns Promise with next position number
 *
 * @throws Error if database query fails
 *
 * @example
 * ```typescript
 * const nextPos = await getNextPosition(supabase, "deck-uuid");
 * console.log(`Next card should be at position ${nextPos}`);
 * ```
 */
export async function getNextPosition(supabase: TypedSupabaseClient, deckId: string): Promise<number> {
  const { data, error } = await supabase
    .from("cards")
    .select("position")
    .eq("deck_id", deckId)
    .is("deleted_at", null)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to get next position: ${error.message}`);
  }

  // If no cards exist, start at position 1
  return data ? data.position + 1 : 1;
}

/**
 * Creates a new card in a deck with validation.
 *
 * Performs the following validations:
 * - Verifies deck exists and user has access (via RLS)
 * - Checks deck status is 'draft' (only draft decks can be edited)
 * - Validates card limit (max 20 cards per deck)
 * - Auto-assigns position if not provided
 * - Handles position conflicts (unique constraint)
 *
 * @param supabase - Authenticated Supabase client instance
 * @param deckId - UUID of the deck to add card to
 * @param userId - UUID of the user creating the card
 * @param cardData - Card data (front, back, position, hint)
 * @returns Promise with created card DTO
 *
 * @throws Error with message "deck_not_found" if deck doesn't exist or user doesn't have access
 * @throws Error with message "deck_not_editable" if deck status is not draft
 * @throws Error with message "card_limit_reached" if deck already has 20 cards
 * @throws Error with message "position_conflict" if position is already taken
 * @throws Error if database operation fails
 *
 * @example
 * ```typescript
 * const card = await createCard(
 *   supabase,
 *   "deck-uuid",
 *   "user-uuid",
 *   { front: "Question", back: "Answer", position: 1 }
 * );
 * ```
 */
export async function createCard(
  supabase: TypedSupabaseClient,
  deckId: string,
  userId: string,
  cardData: CreateCardCommand
): Promise<CardDTO> {
  // Guard: Verify deck exists, user has access, and get deck status
  const deck = await getDeckById(supabase, deckId, userId);

  if (!deck) {
    throw new Error("deck_not_found");
  }

  // Guard: Check if deck is editable (only draft decks can have cards added)
  if (deck.status !== "draft") {
    throw new Error("deck_not_editable");
  }

  // Guard: Check card limit (max 20 cards per deck)
  const currentCount = await getCardCount(supabase, deckId);

  if (currentCount >= 20) {
    throw new Error("card_limit_reached");
  }

  // Auto-assign position if not provided
  let position = cardData.position;
  if (!position) {
    position = await getNextPosition(supabase, deckId);
  }

  // Prepare card data for insertion
  const cardToInsert = {
    deck_id: deckId,
    front: cardData.front.trim(),
    back: cardData.back.trim(),
    position,
    hint: cardData.hint?.trim() || null,
  };

  // Insert card
  const { data: insertedCard, error } = await supabase.from("cards").insert(cardToInsert).select().single();

  // Handle unique constraint violation (position conflict)
  if (error?.code === "23505") {
    throw new Error("position_conflict");
  }

  if (error || !insertedCard) {
    throw new Error(`Failed to create card: ${error?.message || "Unknown error"}`);
  }

  // Map CardEntity to CardDTO (omit deleted_at)
  return {
    id: insertedCard.id,
    deck_id: insertedCard.deck_id,
    front: insertedCard.front,
    back: insertedCard.back,
    position: insertedCard.position,
    hint: insertedCard.hint,
    is_active: insertedCard.is_active,
    locale: insertedCard.locale,
    metadata: insertedCard.metadata,
    created_at: insertedCard.created_at,
    updated_at: insertedCard.updated_at,
  };
}
