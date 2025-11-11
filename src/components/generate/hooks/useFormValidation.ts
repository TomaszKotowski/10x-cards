import { useMemo } from "react";
import type { FormValidation, GenerateFormData } from "../types";
import { VALIDATION_LIMITS } from "../types";

/**
 * Custom hook for client-side form validation
 *
 * Validates source text and deck name according to business rules:
 * - Source text: required, 1-10,000 characters
 * - Deck name: optional, max 100 characters if provided
 *
 * @param formData - Current form data to validate
 * @returns Validation result with isValid flag and field-specific errors
 */
export function useFormValidation(formData: GenerateFormData): FormValidation {
  return useMemo(() => {
    const errors: FormValidation["errors"] = {};

    // Validate sourceText
    const trimmedSourceText = formData.sourceText.trim();

    if (!trimmedSourceText) {
      errors.sourceText = "Tekst źródłowy jest wymagany";
    } else if (formData.sourceText.length > VALIDATION_LIMITS.SOURCE_TEXT_MAX) {
      errors.sourceText = `Tekst źródłowy nie może przekraczać ${VALIDATION_LIMITS.SOURCE_TEXT_MAX.toLocaleString()} znaków`;
    }

    // Validate deckName (optional field)
    if (formData.deckName && formData.deckName.length > VALIDATION_LIMITS.DECK_NAME_MAX) {
      errors.deckName = `Nazwa talii nie może przekraczać ${VALIDATION_LIMITS.DECK_NAME_MAX} znaków`;
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors,
    };
  }, [formData.sourceText, formData.deckName]);
}
