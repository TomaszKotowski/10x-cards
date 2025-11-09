import type { Database } from "@/db/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GeneratedCard } from "./ai.service";

/**
 * Type alias for the Supabase client with proper database typing.
 */
type TypedSupabaseClient = SupabaseClient<Database>;

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
