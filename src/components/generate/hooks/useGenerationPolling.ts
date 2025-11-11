import type { GenerationSessionDTO } from "@/types";
import { useEffect, useRef, useState } from "react";
import type { GenerationStatus, PollingConfig } from "../types";

/**
 * Maps generation session status to user-friendly messages
 */
function getStatusMessage(status: string): string {
  switch (status) {
    case "in_progress":
      return "Generowanie fiszek w toku... Może to potrwać do 5 minut.";
    case "completed":
      return "Generacja zakończona pomyślnie! Przekierowywanie...";
    case "failed":
      return "Wystąpił błąd podczas generacji. Spróbuj ponownie.";
    case "timeout":
      return "Generacja przekroczyła limit czasu (5 minut). Spróbuj z krótszym tekstem.";
    default:
      return "Sprawdzanie statusu generacji...";
  }
}

/**
 * Custom hook for polling generation session status
 *
 * Automatically polls the generation status endpoint at regular intervals
 * until the generation completes, fails, times out, or an error occurs.
 *
 * Features:
 * - Automatic polling with configurable interval
 * - Client-side timeout enforcement
 * - Automatic cleanup on unmount
 * - Error handling for network issues
 *
 * @param sessionId - Generation session ID to poll (null to disable polling)
 * @param config - Polling configuration (interval, timeout)
 * @returns Current status, polling state, and any errors
 */
export function useGenerationPolling(
  sessionId: string | null,
  config: PollingConfig
): {
  status: GenerationStatus | null;
  isPolling: boolean;
  error: Error | null;
} {
  const [status, setStatus] = useState<GenerationStatus | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Use ref to track if component is mounted (prevent state updates after unmount)
  const isMountedRef = useRef(true);

  useEffect(() => {
    // Reset mounted flag on mount
    isMountedRef.current = true;

    // Cleanup function to mark component as unmounted
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    // Don't start polling if no session ID
    if (!sessionId) {
      return;
    }

    setIsPolling(true);
    setError(null);

    const startTime = Date.now();
    let intervalId: NodeJS.Timeout | null = null;

    const pollStatus = async () => {
      try {
        // Check client-side timeout
        const elapsed = Date.now() - startTime;
        if (elapsed > config.timeoutMs) {
          if (intervalId) clearInterval(intervalId);

          if (isMountedRef.current) {
            setError(new Error("timeout"));
            setIsPolling(false);
          }
          return;
        }

        // Fetch generation status from API
        const response = await fetch(`/api/generation-sessions/${sessionId}`);

        if (!response.ok) {
          throw new Error(`Failed to fetch status: ${response.status}`);
        }

        const data: GenerationSessionDTO = await response.json();

        // Map API response to UI-friendly status
        const mappedStatus: GenerationStatus = {
          state: data.status as GenerationStatus["state"],
          message: getStatusMessage(data.status),
          startedAt: data.started_at,
          finishedAt: data.finished_at || undefined,
          errorCode: data.error_code || undefined,
          errorMessage: data.error_message || undefined,
        };

        // Only update state if component is still mounted
        if (isMountedRef.current) {
          setStatus(mappedStatus);
        }

        // Stop polling if generation is complete
        const terminalStates = ["completed", "failed", "timeout"];
        if (terminalStates.includes(data.status)) {
          if (intervalId) clearInterval(intervalId);

          if (isMountedRef.current) {
            setIsPolling(false);
          }
        }
      } catch (err) {
        if (intervalId) clearInterval(intervalId);

        if (isMountedRef.current) {
          setError(err as Error);
          setIsPolling(false);
        }
      }
    };

    // Start polling immediately, then at intervals
    pollStatus();
    intervalId = setInterval(pollStatus, config.intervalMs);

    // Cleanup function
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [sessionId, config.intervalMs, config.timeoutMs]);

  return { status, isPolling, error };
}
