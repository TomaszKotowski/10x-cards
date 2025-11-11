import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, CheckCircle, Info, XCircle } from "lucide-react";

interface StatusMessageProps {
  status: "in_progress" | "completed" | "failed" | "timeout";
  message: string;
  variant?: "default" | "success" | "error" | "warning";
}

/**
 * Status message component with appropriate icon and styling
 *
 * Displays different icons based on status:
 * - in_progress: Info icon
 * - completed: CheckCircle icon (success)
 * - failed: XCircle icon (error)
 * - timeout: AlertTriangle icon (warning)
 */
export function StatusMessage({ status, message, variant }: StatusMessageProps) {
  // Auto-determine variant from status if not provided
  const effectiveVariant =
    variant ||
    (status === "completed"
      ? "default"
      : status === "failed"
        ? "destructive"
        : status === "timeout"
          ? "destructive"
          : "default");

  // Select appropriate icon
  const Icon =
    status === "completed" ? CheckCircle : status === "failed" ? XCircle : status === "timeout" ? AlertTriangle : Info;

  return (
    <Alert variant={effectiveVariant}>
      <Icon className="size-4" />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
