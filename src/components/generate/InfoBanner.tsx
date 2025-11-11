import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info } from "lucide-react";

/**
 * Informational banner displaying generation limits and rules
 *
 * Displays key information about:
 * - Text length limit (10,000 characters)
 * - Maximum cards generated (20)
 * - Card length limit (200 characters per side)
 * - Generation timeout (5 minutes)
 * - Concurrent generation limit (1 per user)
 */
export function InfoBanner() {
  return (
    <Alert>
      <Info className="size-4" />
      <AlertTitle>Zasady generowania fiszek</AlertTitle>
      <AlertDescription>
        <ul className="mt-2 space-y-1 text-sm">
          <li>• Wklej tekst do 10 000 znaków</li>
          <li>• AI wygeneruje maksymalnie 20 fiszek</li>
          <li>• Każda strona fiszki może mieć do 200 znaków</li>
          <li>• Generacja może potrwać do 5 minut</li>
          <li>• Możesz mieć tylko jedną aktywną generację jednocześnie</li>
        </ul>
      </AlertDescription>
    </Alert>
  );
}
