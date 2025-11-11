import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, CheckCircle, Info, XCircle } from "lucide-react";

interface StatusMessageProps {
  status: "in_progress" | "completed" | "failed" | "timeout";
  message: string;
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
export function StatusMessage({ status, message }: StatusMessageProps) {
  // Auto-determine variant from status
  const variant: "default" | "destructive" = status === "failed" || status === "timeout" ? "destructive" : "default";

  // Select appropriate icon
  const Icon =
    status === "completed" ? CheckCircle : status === "failed" ? XCircle : status === "timeout" ? AlertTriangle : Info;

  return (
    <Alert variant={variant}>
      <Icon className="size-4" />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
