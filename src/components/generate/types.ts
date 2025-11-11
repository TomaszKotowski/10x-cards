/**
 * ViewModels and types for Generate AI view
 *
 * These types define the client-side state management and UI logic
 * for the card generation flow, separate from API DTOs in src/types.ts
 */

/**
 * Main state machine for the generation process
 * Represents all possible phases of the generation workflow
 */
export type GenerationState =
  | { phase: "idle" } // Initial state - form visible, no generation
  | { phase: "submitting"; data: GenerateFormData } // Sending POST request
  | { phase: "polling"; sessionId: string; deckId: string; startedAt: string } // Polling status
  | { phase: "completed"; deckId: string; deckSlug: string; truncatedCount: number } // Success, before redirect
  | { phase: "error"; errorType: GenerationErrorType; message: string; canRetry: boolean }; // Error state

/**
 * Types of errors that can occur during generation
 */
export type GenerationErrorType =
  | "validation_error" // Validation error (400)
  | "concurrent_generation" // Another generation already in progress (400)
  | "timeout" // Timeout exceeded (5 minutes)
  | "network_error" // Network/connectivity error
  | "server_error" // Server error (500)
  | "unknown"; // Unknown error

/**
 * Form data collected from user input
 */
export interface GenerateFormData {
  sourceText: string;
  deckName: string; // Empty string = auto-generation on server
}

/**
 * Form validation result
 */
export interface FormValidation {
  isValid: boolean;
  errors: {
    sourceText?: string;
    deckName?: string;
  };
}

/**
 * Generation status for UI display
 * Maps from GenerationSessionDTO to UI-friendly format
 */
export interface GenerationStatus {
  state: "in_progress" | "completed" | "failed" | "timeout";
  message: string;
  startedAt: string;
  finishedAt?: string;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Configuration for polling behavior
 */
export interface PollingConfig {
  intervalMs: number; // Polling interval (default: 2000ms = 2s)
  timeoutMs: number; // Maximum polling duration (default: 300000ms = 5min)
  maxAttempts?: number; // Optional: max attempts instead of timeout
}

/**
 * Constants for validation
 */
export const VALIDATION_LIMITS = {
  SOURCE_TEXT_MIN: 1,
  SOURCE_TEXT_MAX: 10000,
  DECK_NAME_MIN: 1,
  DECK_NAME_MAX: 100,
} as const;

/**
 * Default polling configuration
 */
export const DEFAULT_POLLING_CONFIG: PollingConfig = {
  intervalMs: 2000, // Poll every 2 seconds
  timeoutMs: 300000, // 5 minutes timeout
} as const;
