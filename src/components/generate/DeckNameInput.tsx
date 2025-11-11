import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { ChangeEvent } from "react";

interface DeckNameInputProps {
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  label: string;
  placeholder?: string;
  helperText?: string;
  error?: string;
  disabled?: boolean;
}

/**
 * Input component for deck name with helper text
 *
 * Features:
 * - Optional field (empty = auto-generation on server)
 * - Helper text explaining auto-generation
 * - Error message display
 * - Accessibility: aria-describedby for helper text and errors
 */
export function DeckNameInput({
  value,
  onChange,
  maxLength,
  label,
  placeholder,
  helperText = "Opcjonalne. Jeśli puste, nazwa zostanie wygenerowana automatycznie.",
  error,
  disabled = false,
}: DeckNameInputProps) {
  const helperId = "deck-name-helper";
  const errorId = "deck-name-error";

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="deck-name">{label}</Label>
      <Input
        id="deck-name"
        type="text"
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={maxLength}
        className={cn(error && "border-destructive focus-visible:ring-destructive")}
        aria-describedby={`${helperId} ${error ? errorId : ""}`}
        aria-invalid={!!error}
      />
      <div className="space-y-1">
        {error ? (
          <p id={errorId} className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : (
          <p id={helperId} className="text-sm text-muted-foreground">
            {helperText}
          </p>
        )}
      </div>
    </div>
  );
}
