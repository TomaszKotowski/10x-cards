import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface GenerateButtonProps {
  isSubmitting: boolean;
  isValid: boolean;
  onClick?: () => void;
}

/**
 * Submit button for generation form
 *
 * Features:
 * - Disabled when form is invalid or submitting
 * - Shows spinner during submission
 * - Changes text during submission
 * - Large size for better touch targets (44px minimum)
 */
export function GenerateButton({ isSubmitting, isValid, onClick }: GenerateButtonProps) {
  const isDisabled = !isValid || isSubmitting;

  return (
    <Button type="submit" size="lg" disabled={isDisabled} onClick={onClick} className="w-full sm:w-auto">
      {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
      {isSubmitting ? "Generowanie..." : "Generuj fiszki"}
    </Button>
  );
}
