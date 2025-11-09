/**
 * AI Service for generating flashcards using OpenRouter API
 *
 * Supports mock mode for development/testing without API calls.
 */

/**
 * Structure of a generated flashcard from AI.
 */
export interface GeneratedCard {
  front: string;
  back: string;
  hint?: string;
}

/**
 * Result of AI card generation.
 */
export interface AIGenerationResult {
  cards: GeneratedCard[];
  model?: string;
  tokensUsed?: number;
}

/**
 * System prompt for AI to generate exactly 20 flashcards.
 * Instructs the model to create high-quality, educational flashcards.
 */
const SYSTEM_PROMPT = `You are an expert educational content creator specializing in creating high-quality flashcards for spaced repetition learning.

Your task is to generate EXACTLY 20 flashcards from the provided source text.

Guidelines:
1. Create exactly 20 flashcards - no more, no less
2. Each flashcard should focus on a single concept or fact
3. Front: A clear, concise question or prompt
4. Back: A complete, accurate answer
5. Hint (optional): A helpful clue without giving away the answer
6. Use simple, clear language
7. Avoid ambiguity
8. Ensure answers are factually correct
9. Cover the most important concepts from the source text

Return ONLY a JSON object with this structure:
{
  "cards": [
    {
      "front": "Question or prompt",
      "back": "Complete answer",
      "hint": "Optional hint"
    }
  ]
}`;

/**
 * Calls OpenRouter API to generate flashcards from source text.
 * Includes timeout protection and proper error handling.
 *
 * @param sourceText - Sanitized source text to generate cards from
 * @param timeoutMs - Timeout in milliseconds (default: 300000 = 5 minutes)
 * @returns Promise with AI generation result
 *
 * @throws Error if API call fails or times out
 *
 * @example
 * ```typescript
 * const result = await callOpenRouter("Photosynthesis is...", 300000);
 * console.log(`Generated ${result.cards.length} cards`);
 * ```
 */
export async function callOpenRouter(sourceText: string, timeoutMs = 300000): Promise<AIGenerationResult> {
  const apiKey = import.meta.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY not configured");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": import.meta.env.SITE_URL || "http://localhost:4321",
        "X-Title": "10x-cards",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini", // Cost-effective model for MVP
        messages: [
          {
            role: "system",
            content: SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: `Generate exactly 20 flashcards from this text:\n\n
            <source-text>
            ${sourceText}
            </source-text>`,
          },
        ],
        temperature: 0.7,
        max_tokens: 4000,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    // Extract content from OpenRouter response
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("No content in OpenRouter response");
    }

    // Parse the AI response
    const result = parseAIResponse(content);

    // Add metadata
    return {
      ...result,
      model: data.model,
      tokensUsed: data.usage?.total_tokens,
    };
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error) {
      if (error.name === "AbortError") {
        throw new Error("OpenRouter API call timed out");
      }
      throw error;
    }

    throw new Error("Unknown error during OpenRouter API call");
  }
}

/**
 * Parses AI response text into structured card data.
 * Handles JSON extraction and validation.
 *
 * @param responseText - Raw text response from AI
 * @returns Parsed generation result with cards
 *
 * @throws Error if response cannot be parsed or is invalid
 *
 * @example
 * ```typescript
 * const result = parseAIResponse('{"cards": [...]}');
 * console.log(`Parsed ${result.cards.length} cards`);
 * ```
 */
export function parseAIResponse(responseText: string): AIGenerationResult {
  try {
    // Try to extract JSON from response (AI might wrap it in markdown code blocks)
    let jsonText = responseText.trim();

    // Remove markdown code blocks if present
    const codeBlockMatch = jsonText.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
    if (codeBlockMatch) {
      jsonText = codeBlockMatch[1];
    }

    const parsed = JSON.parse(jsonText);

    // Validate structure
    if (!parsed.cards || !Array.isArray(parsed.cards)) {
      throw new Error("Response missing 'cards' array");
    }

    // Validate each card
    const validCards: GeneratedCard[] = [];
    for (const card of parsed.cards) {
      if (!card.front || !card.back) {
        console.warn("Skipping invalid card (missing front or back):", card);
        continue;
      }

      validCards.push({
        front: String(card.front).trim(),
        back: String(card.back).trim(),
        hint: card.hint ? String(card.hint).trim() : undefined,
      });
    }

    if (validCards.length === 0) {
      throw new Error("No valid cards found in AI response");
    }

    return { cards: validCards };
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Failed to parse AI response as JSON: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Generates mock flashcards for development/testing.
 * Returns exactly 20 cards based on source text length.
 *
 * @param sourceText - Source text (used to determine card content)
 * @returns Mock generation result with 20 cards
 *
 * @example
 * ```typescript
 * const result = generateMockCards("Photosynthesis is...");
 * console.log(`Generated ${result.cards.length} mock cards`);
 * ```
 */
export function generateMockCards(sourceText: string): AIGenerationResult {
  const cardCount = 20;
  const cards: GeneratedCard[] = [];

  const preview = sourceText.substring(0, 50);

  for (let i = 1; i <= cardCount; i++) {
    cards.push({
      front: `Question ${i} about: ${preview}...`,
      back: `Answer ${i}: This is a mock answer generated from the source text. In production, this would be an AI-generated answer based on the actual content.`,
      hint: i % 3 === 0 ? `Hint ${i}: Think about the key concepts` : undefined,
    });
  }

  return {
    cards,
    model: "mock-model",
    tokensUsed: 0,
  };
}
