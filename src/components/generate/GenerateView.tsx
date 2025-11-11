import type { ConcurrentGenerationErrorResponseDTO, CreateGenerationCommand, GenerationInitResponseDTO } from "@/types";
import { useEffect, useState } from "react";
import { GenerateForm } from "./GenerateForm";
import { GenerationStatusPanel } from "./GenerationStatusPanel";
import { useGenerationPolling } from "./hooks";
import { InfoBanner } from "./InfoBanner";
import { DEFAULT_POLLING_CONFIG, type GenerateFormData, type GenerationState } from "./types";

/**
 * Main container component for the Generate AI view
 *
 * Manages the complete generation workflow:
 * 1. User fills form (idle)
 * 2. Submit triggers API call (submitting)
 * 3. Poll status every 2s (polling)
 * 4. Redirect on success (completed)
 * 5. Show error with retry option (error)
 *
 * MVP simplifications:
 * - No cancel functionality
 * - Simple error messages (no detailed error mapping)
 * - Direct window.location redirect (no client-side routing)
 * - No slug generation (use deck_id only for now)
 */
export function GenerateView() {
  const [state, setState] = useState<GenerationState>({ phase: "idle" });

  // Polling hook - only active when in polling phase
  const sessionId = state.phase === "polling" ? state.sessionId : null;
  const { status, error: pollingError } = useGenerationPolling(sessionId, DEFAULT_POLLING_CONFIG);

  // Handle form submission
  const handleSubmit = async (formData: GenerateFormData) => {
    setState({ phase: "submitting", data: formData });

    try {
      const command: CreateGenerationCommand = {
        source_text: formData.sourceText.trim(),
        deck_name: formData.deckName.trim() || "Nowa talia", // Fallback for empty name
      };

      const response = await fetch("/api/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
      });

      if (!response.ok) {
        const errorData = await response.json();

        // Handle concurrent generation error
        if (errorData.error === "generation_in_progress") {
          const concurrentError = errorData as ConcurrentGenerationErrorResponseDTO;
          setState({
            phase: "error",
            errorType: "concurrent_generation",
            message: concurrentError.message,
            canRetry: false,
          });
          return;
        }

        // Handle other errors
        setState({
          phase: "error",
          errorType: "validation_error",
          message: errorData.message || "Wystąpił błąd podczas inicjowania generacji",
          canRetry: true,
        });
        return;
      }

      const data: GenerationInitResponseDTO = await response.json();

      // Start polling
      setState({
        phase: "polling",
        sessionId: data.generation_session_id,
        deckId: data.deck_id,
        startedAt: data.started_at,
      });
    } catch {
      setState({
        phase: "error",
        errorType: "network_error",
        message: "Błąd połączenia. Sprawdź połączenie internetowe i spróbuj ponownie.",
        canRetry: true,
      });
    }
  };

  // Handle retry after error
  const handleRetry = () => {
    setState({ phase: "idle" });
  };

  // Monitor polling status and handle completion/errors
  useEffect(() => {
    if (state.phase !== "polling") return;

    // Handle polling error (timeout or network)
    if (pollingError) {
      setState({
        phase: "error",
        errorType: pollingError.message === "timeout" ? "timeout" : "network_error",
        message:
          pollingError.message === "timeout"
            ? "Generacja przekroczyła limit czasu (5 minut). Spróbuj z krótszym tekstem."
            : "Błąd podczas sprawdzania statusu. Spróbuj ponownie.",
        canRetry: true,
      });
      return;
    }

    // Handle status updates
    if (status) {
      if (status.state === "completed") {
        // MVP: Simple redirect without slug generation
        // In production, fetch deck details to get slug
        const url = `/decks/${state.deckId}`;

        // Small delay for better UX (user sees success message)
        setTimeout(() => {
          window.location.href = url;
        }, 1500);
      } else if (status.state === "failed" || status.state === "timeout") {
        setState({
          phase: "error",
          errorType: status.state === "timeout" ? "timeout" : "server_error",
          message: status.errorMessage || status.message,
          canRetry: true,
        });
      }
    }
  }, [status, pollingError, state.phase, state]);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      <InfoBanner />

      {(state.phase === "idle" || state.phase === "submitting") && (
        <GenerateForm onSubmit={handleSubmit} isSubmitting={state.phase === "submitting"} />
      )}

      {state.phase === "polling" && status && <GenerationStatusPanel status={status} onRetry={handleRetry} />}

      {state.phase === "error" && (
        <GenerationStatusPanel
          status={{
            state: "failed",
            message: state.message,
            startedAt: new Date().toISOString(),
          }}
          onRetry={state.canRetry ? handleRetry : undefined}
        />
      )}
    </div>
  );
}
