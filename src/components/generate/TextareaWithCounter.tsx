import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ChangeEvent } from "react";

interface TextareaWithCounterProps {
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  label: string;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
}

/**
 * Textarea component with character counter and validation
 *
 * Features:
 * - Real-time character counter (X / maxLength)
 * - Visual feedback when limit exceeded (red counter)
 * - Error message display
 * - Accessibility: aria-describedby for counter and errors
 */
export function TextareaWithCounter({
  value,
  onChange,
  maxLength,
  label,
  placeholder,
  error,
  disabled = false,
}: TextareaWithCounterProps) {
  const currentLength = value.length;
  const isOverLimit = currentLength > maxLength;
  const counterId = "textarea-counter";
  const errorId = "textarea-error";

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="source-text">{label}</Label>
      <Textarea
        id="source-text"
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        className={cn("min-h-[200px] resize-y", error && "border-destructive focus-visible:ring-destructive")}
        aria-describedby={`${counterId} ${error ? errorId : ""}`}
        aria-invalid={!!error}
      />
      <div className="flex items-center justify-between gap-2">
        <div>
          {error && (
            <p id={errorId} className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>
        <p
          id={counterId}
          className={cn("text-sm tabular-nums", isOverLimit ? "font-medium text-destructive" : "text-muted-foreground")}
          aria-live="polite"
        >
          {currentLength.toLocaleString()} / {maxLength.toLocaleString()}
        </p>
      </div>
    </div>
  );
}
