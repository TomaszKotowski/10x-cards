import { useState, type FormEvent } from "react";
import { DeckNameInput } from "./DeckNameInput";
import { GenerateButton } from "./GenerateButton";
import { useFormValidation } from "./hooks";
import { TextareaWithCounter } from "./TextareaWithCounter";
import { VALIDATION_LIMITS, type GenerateFormData } from "./types";

interface GenerateFormProps {
  onSubmit: (data: GenerateFormData) => void;
  isSubmitting: boolean;
}

/**
 * Form for collecting generation input from user
 *
 * Features:
 * - Source text textarea with character counter
 * - Optional deck name input
 * - Client-side validation
 * - Disabled state during submission
 * - Accessible form structure
 */
export function GenerateForm({ onSubmit, isSubmitting }: GenerateFormProps) {
  const [formData, setFormData] = useState<GenerateFormData>({
    sourceText: "",
    deckName: "",
  });

  const validation = useFormValidation(formData);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Don't submit if validation fails
    if (!validation.isValid) {
      return;
    }

    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <TextareaWithCounter
        value={formData.sourceText}
        onChange={(value) => setFormData((prev) => ({ ...prev, sourceText: value }))}
        maxLength={VALIDATION_LIMITS.SOURCE_TEXT_MAX}
        label="Tekst źródłowy"
        placeholder="Wklej tutaj tekst, z którego chcesz wygenerować fiszki..."
        error={validation.errors.sourceText}
        disabled={isSubmitting}
      />

      <DeckNameInput
        value={formData.deckName}
        onChange={(value) => setFormData((prev) => ({ ...prev, deckName: value }))}
        maxLength={VALIDATION_LIMITS.DECK_NAME_MAX}
        label="Nazwa talii"
        placeholder="np. Biologia - Fotosynteza"
        error={validation.errors.deckName}
        disabled={isSubmitting}
      />

      <div className="flex justify-end">
        <GenerateButton isSubmitting={isSubmitting} isValid={validation.isValid} />
      </div>
    </form>
  );
}
