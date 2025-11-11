import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { ProgressIndicator } from "./ProgressIndicator";
import { StatusMessage } from "./StatusMessage";
import type { GenerationStatus } from "./types";

interface GenerationStatusPanelProps {
  status: GenerationStatus;
  onRetry?: () => void;
  onCancel?: () => void;
}

/**
 * Panel displaying generation status with progress indicator and actions
 *
 * Features:
 * - Progress indicator (spinner) during generation
 * - Status message with appropriate icon
 * - Retry button for errors/timeout
 * - Optional cancel button (not implemented in MVP)
 * - Estimated time information
 */
export function GenerationStatusPanel({ status, onRetry, onCancel }: GenerationStatusPanelProps) {
  const isInProgress = status.state === "in_progress";
  const hasError = status.state === "failed" || status.state === "timeout";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-center">{isInProgress && <ProgressIndicator size="lg" />}</div>
      </CardHeader>
      <CardContent className="space-y-4">
        <StatusMessage status={status.state} message={status.message} />

        {isInProgress && (
          <p className="text-center text-sm text-muted-foreground">
            Generacja może potrwać do 5 minut. Proszę czekać...
          </p>
        )}

        {status.errorMessage && (
          <div className="rounded-md bg-muted p-3">
            <p className="text-sm text-muted-foreground">{status.errorMessage}</p>
          </div>
        )}

        <div className="text-center text-xs text-muted-foreground">
          <p>Rozpoczęto: {new Date(status.startedAt).toLocaleString("pl-PL")}</p>
          {status.finishedAt && <p>Zakończono: {new Date(status.finishedAt).toLocaleString("pl-PL")}</p>}
        </div>
      </CardContent>

      {((hasError && onRetry) || (onCancel && isInProgress)) && (
        <CardFooter className="flex justify-center gap-2">
          {hasError && onRetry && (
            <Button onClick={onRetry} variant="default">
              Spróbuj ponownie
            </Button>
          )}
          {onCancel && isInProgress && (
            <Button onClick={onCancel} variant="outline">
              Anuluj
            </Button>
          )}
        </CardFooter>
      )}
    </Card>
  );
}
