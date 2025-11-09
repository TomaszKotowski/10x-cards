import type { Database, Json } from "@/db/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { callOpenRouter, generateMockCards } from "./ai.service";
import { createCards } from "./card.service";

/**
 * Type alias for the Supabase client with proper database typing.
 */
type TypedSupabaseClient = SupabaseClient<Database>;

/**
 * Result type for checkActiveGeneration function.
 */
interface ActiveGenerationResult {
  hasActiveGeneration: boolean;
  activeSessionId?: string;
}

/**
 * Checks if a user has an active generation session in progress.
 *
 * @param supabase - Authenticated Supabase client instance
 * @param userId - UUID of the user to check
 * @returns Promise with boolean indicating if active generation exists and optional session ID
 *
 * @throws Error if database query fails
 *
 * @example
 * ```typescript
 * const result = await checkActiveGeneration(supabase, "user-uuid");
 * if (result.hasActiveGeneration) {
 *   console.log("Active session:", result.activeSessionId);
 * }
 * ```
 */
export async function checkActiveGeneration(
  supabase: TypedSupabaseClient,
  userId: string
): Promise<ActiveGenerationResult> {
  const { data, error } = await supabase
    .from("generation_sessions")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "in_progress")
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to check active generation: ${error.message}`);
  }

  return {
    hasActiveGeneration: !!data,
    activeSessionId: data?.id,
  };
}

/**
 * Sanitizes source text by removing HTML tags, normalizing whitespace, and trimming.
 *
 * @param text - Raw source text from user input
 * @returns Sanitized text safe for storage and AI processing
 *
 * @example
 * ```typescript
 * const sanitized = sanitizeSourceText("<p>Hello   world</p>");
 * // Returns: "Hello world"
 * ```
 */
export function sanitizeSourceText(text: string): string {
  // Remove HTML tags
  let sanitized = text.replace(/<[^>]*>/g, "");

  // Normalize whitespace (replace multiple spaces/newlines with single space)
  sanitized = sanitized.replace(/\s+/g, " ");

  // Trim leading and trailing whitespace
  sanitized = sanitized.trim();

  return sanitized;
}

/**
 * Generates a default deck name in the format "Deck YYYY-MM-DD HH:mm".
 *
 * @returns Generated deck name with current timestamp
 *
 * @example
 * ```typescript
 * const name = generateDeckName();
 * // Returns: "Deck 2024-11-09 13:45"
 * ```
 */
export function generateDeckName(): string {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");

  return `Deck ${year}-${month}-${day} ${hours}:${minutes}`;
}

/**
 * Creates a new generation session in the database.
 *
 * @param supabase - Authenticated Supabase client instance
 * @param userId - UUID of the user creating the generation
 * @param deckId - UUID of the associated deck
 * @param sanitizedText - Sanitized source text for AI processing
 * @param params - Generation parameters (model, temperature, etc.)
 * @returns Promise with the created session ID
 *
 * @throws Error if database insert fails
 *
 * @example
 * ```typescript
 * const sessionId = await createGenerationSession(
 *   supabase,
 *   "user-uuid",
 *   "deck-uuid",
 *   "Sanitized text...",
 *   { model: "gpt-4", temperature: 0.7 }
 * );
 * ```
 */
export async function createGenerationSession(
  supabase: TypedSupabaseClient,
  userId: string,
  deckId: string,
  sanitizedText: string,
  params: Json
): Promise<string> {
  const { data, error } = await supabase
    .from("generation_sessions")
    .insert({
      user_id: userId,
      deck_id: deckId,
      status: "in_progress",
      sanitized_source_text: sanitizedText,
      started_at: new Date().toISOString(),
      params,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to create generation session: ${error.message}`);
  }

  if (!data) {
    throw new Error("Failed to create generation session: No data returned");
  }

  return data.id;
}

/**
 * Updates the status of a generation session.
 *
 * @param supabase - Authenticated Supabase client instance
 * @param sessionId - UUID of the generation session to update
 * @param status - New status (completed, failed, timeout)
 * @param errorCode - Optional error code if status is failed/timeout
 * @param errorMessage - Optional error message if status is failed/timeout
 * @param truncatedCount - Optional count of truncated cards if applicable
 *
 * @throws Error if database update fails
 *
 * @example
 * ```typescript
 * await updateSessionStatus(
 *   supabase,
 *   "session-uuid",
 *   "completed",
 *   undefined,
 *   undefined,
 *   5
 * );
 * ```
 */
export async function updateSessionStatus(
  supabase: TypedSupabaseClient,
  sessionId: string,
  status: "completed" | "failed" | "timeout",
  errorCode?: string,
  errorMessage?: string,
  truncatedCount?: number
): Promise<void> {
  const updateData: Record<string, unknown> = {
    status,
    finished_at: new Date().toISOString(),
  };

  if (errorCode) {
    updateData.error_code = errorCode;
  }

  if (errorMessage) {
    // Truncate error message to max 1000 characters
    updateData.error_message = errorMessage.substring(0, 1000);
  }

  if (truncatedCount !== undefined) {
    updateData.truncated_count = truncatedCount;
  }

  const { error } = await supabase.from("generation_sessions").update(updateData).eq("id", sessionId);

  if (error) {
    throw new Error(`Failed to update session status: ${error.message}`);
  }
}

/**
 * Processes AI generation in the background (asynchronous, non-blocking).
 * This function orchestrates the entire AI generation workflow:
 * 1. Call AI service (or use mock data)
 * 2. Create cards in database
 * 3. Update session status
 *
 * @param supabase - Authenticated Supabase client instance
 * @param sessionId - UUID of the generation session
 * @param sanitizedText - Sanitized source text for AI processing
 * @param useMockData - Whether to use mock data instead of real AI
 *
 * Note: This function runs asynchronously and does not block the API response.
 * Errors are caught and logged to the session status.
 *
 * @example
 * ```typescript
 * // Fire and forget - don't await
 * Promise.resolve().then(() =>
 *   processAIGeneration(supabase, sessionId, text, false)
 * );
 * ```
 */
export async function processAIGeneration(
  supabase: TypedSupabaseClient,
  sessionId: string,
  sanitizedText: string,
  useMockData: boolean
): Promise<void> {
  try {
    // Get the deck_id from the session
    const { data: session, error: sessionError } = await supabase
      .from("generation_sessions")
      .select("deck_id")
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      throw new Error("Failed to fetch generation session");
    }

    const deckId = session.deck_id;

    // Step 1: Generate cards using AI or mock data
    let aiResult;
    if (useMockData) {
      console.log(`[Generation ${sessionId}] Using mock data`);
      aiResult = generateMockCards(sanitizedText);
    } else {
      console.log(`[Generation ${sessionId}] Calling OpenRouter API`);
      aiResult = await callOpenRouter(sanitizedText, 300000); // 5 minute timeout
    }

    console.log(`[Generation ${sessionId}] Generated ${aiResult.cards.length} cards`);

    // Step 2: Create cards in database
    const createdCount = await createCards(supabase, deckId, aiResult.cards);

    console.log(`[Generation ${sessionId}] Created ${createdCount} cards in database`);

    // Step 3: Update session status to completed
    await updateSessionStatus(supabase, sessionId, "completed");

    console.log(`[Generation ${sessionId}] Completed successfully`);
  } catch (error) {
    // Log error and update session status
    console.error(`[Generation ${sessionId}] Error:`, error);

    let errorCode = "unknown_error";
    let errorMessage = "An unexpected error occurred during generation";

    if (error instanceof Error) {
      errorMessage = error.message;

      // Determine error code based on error message
      if (errorMessage.includes("timed out") || errorMessage.includes("timeout")) {
        errorCode = "timeout_exceeded";
      } else if (errorMessage.includes("OpenRouter")) {
        errorCode = "openrouter_error";
      } else if (errorMessage.includes("parse") || errorMessage.includes("JSON")) {
        errorCode = "parse_error";
      } else if (errorMessage.includes("validation") || errorMessage.includes("invalid")) {
        errorCode = "validation_error";
      }
    }

    // Update session with error status
    try {
      await updateSessionStatus(supabase, sessionId, "failed", errorCode, errorMessage);
    } catch (updateError) {
      console.error(`[Generation ${sessionId}] Failed to update error status:`, updateError);
    }
  }
}
