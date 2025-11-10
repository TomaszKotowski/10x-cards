# Plan implementacji widoku Generacja AI

## 1. Przegląd

Widok Generacja AI umożliwia użytkownikom szybkie tworzenie talii fiszek poprzez wklejenie tekstu źródłowego (do 10 000 znaków) i automatyczne wygenerowanie kart przez AI. Widok obsługuje:

- Wklejanie i walidację tekstu źródłowego (limit 10 000 znaków)
- Opcjonalne nadanie nazwy talii (1-100 znaków, unikalność weryfikowana na serwerze)
- Inicjowanie procesu generacji AI z wizualnym feedbackiem
- Śledzenie postępu generacji w czasie rzeczywistym (polling co ~2s)
- Obsługę stanów: oczekiwanie, w trakcie, sukces, błąd, timeout (5 min)
- Przekierowanie do widoku Draft po zakończeniu z informacją o przyciętych kartach

Widok jest kluczowym elementem MVP, realizującym główną propozycję wartości aplikacji - minimalizację czasu tworzenia wysokiej jakości fiszek.

## 2. Routing widoku

**Ścieżka:** `/generate`

**Typ:** Chroniona (wymaga autoryzacji)

**Middleware:** Astro middleware weryfikuje sesję użytkownika i przekierowuje niezalogowanych użytkowników na `/auth/login`

**Plik:** `src/pages/generate.astro`

**Przekierowania:**

- Po sukcesie generacji → `/decks/:slug-:id?banner=truncated_count` (jeśli truncated_count > 0)
- Po sukcesie generacji → `/decks/:slug-:id` (jeśli truncated_count = 0)
- Brak autoryzacji → `/auth/login`

## 3. Struktura komponentów

```
GeneratePage (Astro)
└── GenerateView (React)
    ├── GenerateForm (React)
    │   ├── TextareaWithCounter (React)
    │   ├── DeckNameInput (React)
    │   └── GenerateButton (React)
    ├── GenerationStatusPanel (React)
    │   ├── ProgressIndicator (React)
    │   └── StatusMessage (React)
    └── InfoBanner (React)
```

**Hierarchia komponentów:**

1. **GeneratePage** (Astro) - strona główna, weryfikuje autoryzację
2. **GenerateView** (React, `client:load`) - główny kontener zarządzający stanem
3. **GenerateForm** - formularz z polami wejściowymi
4. **TextareaWithCounter** - pole tekstowe z licznikiem znaków
5. **DeckNameInput** - pole nazwy talii
6. **GenerateButton** - przycisk inicjujący generację
7. **GenerationStatusPanel** - panel statusu generacji (widoczny podczas/po generacji)
8. **ProgressIndicator** - wizualizacja postępu (spinner/progress bar)
9. **StatusMessage** - komunikaty o statusie/błędach
10. **InfoBanner** - banner informacyjny o limitach i zasadach

## 4. Szczegóły komponentów

### 4.1 GenerateView (React)

**Opis:** Główny komponent kontenerowy zarządzający całym stanem widoku generacji. Odpowiada za koordynację formularza, wywołania API, polling statusu i przekierowania.

**Główne elementy:**

- Kontener `<div>` z layoutem mobile-first
- Warunkowe renderowanie: `GenerateForm` lub `GenerationStatusPanel`
- `InfoBanner` zawsze widoczny u góry

**Obsługiwane zdarzenia:**

- `onSubmit` - inicjowanie generacji (wywołanie POST /api/generations)
- `onPollTick` - okresowe sprawdzanie statusu (GET /api/generation-sessions/:sessionId)
- `onRetry` - ponowienie generacji po błędzie
- `onCancel` - anulowanie i powrót do formularza (opcjonalne w MVP)

**Warunki walidacji:**

- Tekst źródłowy: 1-10 000 znaków (walidacja client-side przed wysyłką)
- Nazwa talii: 1-100 znaków lub pusta (auto-generacja na serwerze)
- Brak aktywnej generacji (sprawdzane przez API, obsługa błędu 400)

**Typy:**

- `GenerateViewProps` - propsy komponentu (brak w MVP, może initialData w przyszłości)
- `GenerationState` - stan generacji (ViewModel)
- `CreateGenerationCommand` - DTO wysyłane do API
- `GenerationInitResponseDTO` - odpowiedź z API po inicjacji
- `GenerationSessionDTO` - pełny status sesji z pollingu

**Propsy:**

```typescript
interface GenerateViewProps {
  // Brak propsów w MVP - komponent samodzielny
}
```

---

### 4.2 GenerateForm (React)

**Opis:** Formularz zbierający dane wejściowe od użytkownika. Zawiera pole tekstowe, nazwę talii i przycisk generacji. Widoczny tylko przed rozpoczęciem generacji.

**Główne elementy:**

- `<form>` z `onSubmit` handler
- `TextareaWithCounter` dla tekstu źródłowego
- `DeckNameInput` dla nazwy talii
- `GenerateButton` do wysyłki

**Obsługiwane zdarzenia:**

- `onSubmit(e: FormEvent)` - walidacja i przekazanie danych do rodzica
- `onSourceTextChange(value: string)` - aktualizacja tekstu źródłowego
- `onDeckNameChange(value: string)` - aktualizacja nazwy talii

**Warunki walidacji:**

- Tekst źródłowy nie może być pusty
- Tekst źródłowy ≤ 10 000 znaków
- Nazwa talii (jeśli podana): 1-100 znaków
- Przycisk zablokowany, jeśli walidacja nie przechodzi

**Typy:**

- `GenerateFormProps`
- `GenerateFormData` (ViewModel)

**Propsy:**

```typescript
interface GenerateFormProps {
  onSubmit: (data: GenerateFormData) => void;
  isSubmitting: boolean;
}

interface GenerateFormData {
  sourceText: string;
  deckName: string;
}
```

---

### 4.3 TextareaWithCounter (React)

**Opis:** Pole tekstowe z licznikiem znaków i wczesną walidacją. Wyświetla licznik w formacie "X / 10 000" i zmienia kolor na czerwony przy przekroczeniu limitu.

**Główne elementy:**

- `<Textarea>` z shadcn/ui
- `<Label>` z opisem pola
- `<div>` z licznikiem znaków
- Komunikat walidacji (jeśli przekroczono limit)

**Obsługiwane zdarzenia:**

- `onChange(e: ChangeEvent<HTMLTextAreaElement>)` - aktualizacja wartości i licznika
- `onBlur` - walidacja po opuszczeniu pola (opcjonalne)

**Warunki walidacji:**

- Minimum 1 znak (wymagane pole)
- Maksimum 10 000 znaków
- Licznik czerwony, gdy > 10 000
- Komunikat błędu: "Tekst źródłowy nie może przekraczać 10 000 znaków"

**Typy:**

- `TextareaWithCounterProps`

**Propsy:**

```typescript
interface TextareaWithCounterProps {
  value: string;
  onChange: (value: string) => void;
  maxLength: number; // 10000
  label: string;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
}
```

---

### 4.4 DeckNameInput (React)

**Opis:** Pole tekstowe do wprowadzenia nazwy talii. Opcjonalne - jeśli puste, nazwa zostanie wygenerowana automatycznie przez serwer w formacie "Deck YYYY-MM-DD HH:mm".

**Główne elementy:**

- `<Input>` z shadcn/ui
- `<Label>` z opisem pola
- Tekst pomocniczy: "Opcjonalne. Jeśli puste, nazwa zostanie wygenerowana automatycznie."
- Informacja o weryfikacji unikalności na serwerze

**Obsługiwane zdarzenia:**

- `onChange(e: ChangeEvent<HTMLInputElement>)` - aktualizacja wartości
- `onBlur` - walidacja długości (opcjonalne)

**Warunki walidacji:**

- Jeśli podana: 1-100 znaków
- Unikalność weryfikowana przez serwer (obsługa błędu 400 z API)
- Komunikat błędu: "Nazwa talii musi mieć od 1 do 100 znaków"

**Typy:**

- `DeckNameInputProps`

**Propsy:**

```typescript
interface DeckNameInputProps {
  value: string;
  onChange: (value: string) => void;
  maxLength: number; // 100
  label: string;
  placeholder?: string;
  helperText?: string;
  error?: string;
  disabled?: boolean;
}
```

---

### 4.5 GenerateButton (React)

**Opis:** Przycisk inicjujący proces generacji AI. Wyświetla spinner podczas wysyłania żądania i jest blokowany, gdy walidacja formularza nie przechodzi.

**Główne elementy:**

- `<Button>` z shadcn/ui (variant="default", size="lg")
- Ikona loadera (Lucide `Loader2`) podczas submitu
- Tekst: "Generuj fiszki" lub "Generowanie..." (podczas submitu)

**Obsługiwane zdarzenia:**

- `onClick` - wywołanie submit formularza (obsługiwane przez form)

**Warunki walidacji:**

- Przycisk `disabled`, gdy:
  - `isSubmitting === true`
  - `isValid === false` (walidacja formularza nie przechodzi)
  - Tekst źródłowy pusty lub > 10 000 znaków

**Typy:**

- `GenerateButtonProps`

**Propsy:**

```typescript
interface GenerateButtonProps {
  isSubmitting: boolean;
  isValid: boolean;
  onClick?: () => void;
}
```

---

### 4.6 GenerationStatusPanel (React)

**Opis:** Panel wyświetlający status generacji w czasie rzeczywistym. Widoczny po wysłaniu formularza, zastępuje `GenerateForm`. Zawiera wizualizację postępu, komunikaty statusu i akcje (ponowienie/anulowanie).

**Główne elementy:**

- Kontener `<Card>` z shadcn/ui
- `ProgressIndicator` (spinner lub progress bar)
- `StatusMessage` z opisem aktualnego stanu
- Przycisk "Spróbuj ponownie" (widoczny po błędzie/timeout)
- Przycisk "Anuluj" (opcjonalnie, widoczny podczas "in_progress")
- Informacja o szacowanym czasie ("Generacja może potrwać do 5 minut")

**Obsługiwane zdarzenia:**

- `onRetry()` - ponowienie generacji (reset stanu, powrót do formularza)
- `onCancel()` - anulowanie i powrót do formularza (opcjonalne w MVP)

**Warunki walidacji:**

- Brak - komponent wyświetla dane otrzymane z API

**Typy:**

- `GenerationStatusPanelProps`
- `GenerationStatus` (ViewModel)

**Propsy:**

```typescript
interface GenerationStatusPanelProps {
  status: GenerationStatus;
  onRetry: () => void;
  onCancel?: () => void;
}

type GenerationStatus = {
  state: "in_progress" | "completed" | "failed" | "timeout";
  message: string;
  startedAt: string;
  finishedAt?: string;
  errorCode?: string;
  errorMessage?: string;
};
```

---

### 4.7 ProgressIndicator (React)

**Opis:** Wizualizacja postępu generacji. Wyświetla animowany spinner podczas generacji.

**Główne elementy:**

- Ikona `Loader2` z Lucide (animacja spin)
- Alternatywnie: `<Progress>` z shadcn/ui (jeśli będziemy mieć procenty postępu)

**Obsługiwane zdarzenia:**

- Brak - komponent czysto prezentacyjny

**Warunki walidacji:**

- Brak

**Typy:**

- `ProgressIndicatorProps`

**Propsy:**

```typescript
interface ProgressIndicatorProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}
```

---

### 4.8 StatusMessage (React)

**Opis:** Komunikat tekstowy opisujący aktualny stan generacji. Wyświetla różne komunikaty w zależności od statusu.

**Główne elementy:**

- `<p>` lub `<Alert>` z shadcn/ui
- Ikona odpowiednia do statusu (Info, CheckCircle, XCircle, AlertTriangle)
- Tekst komunikatu

**Obsługiwane zdarzenia:**

- Brak - komponent czysto prezentacyjny

**Warunki walidacji:**

- Brak

**Typy:**

- `StatusMessageProps`

**Propsy:**

```typescript
interface StatusMessageProps {
  status: "in_progress" | "completed" | "failed" | "timeout";
  message: string;
  variant?: "default" | "success" | "error" | "warning";
}
```

**Przykładowe komunikaty:**

- `in_progress`: "Generowanie fiszek w toku... Może to potrwać do 5 minut."
- `completed`: "Generacja zakończona pomyślnie! Przekierowywanie..."
- `failed`: "Wystąpił błąd podczas generacji. Spróbuj ponownie."
- `timeout`: "Generacja przekroczyła limit czasu (5 minut). Spróbuj z krótszym tekstem."

---

### 4.9 InfoBanner (React)

**Opis:** Banner informacyjny wyświetlany u góry widoku, zawierający kluczowe informacje o limitach i zasadach generacji.

**Główne elementy:**

- `<Alert>` z shadcn/ui (variant="default" lub "info")
- Ikona `Info` z Lucide
- Lista limitów i zasad

**Obsługiwane zdarzenia:**

- Brak - komponent statyczny

**Warunki walidacji:**

- Brak

**Typy:**

- `InfoBannerProps` (brak propsów w MVP)

**Propsy:**

```typescript
interface InfoBannerProps {
  // Brak propsów - treść statyczna
}
```

**Treść bannera:**

- "Wklej tekst do 10 000 znaków"
- "AI wygeneruje maksymalnie 20 fiszek"
- "Każda strona fiszki może mieć do 200 znaków"
- "Generacja może potrwać do 5 minut"
- "Możesz mieć tylko jedną aktywną generację jednocześnie"

## 5. Typy

### 5.1 DTO (Data Transfer Objects) - z API

Typy już zdefiniowane w `src/types.ts`:

```typescript
// Request DTO
export interface CreateGenerationCommand {
  source_text: string; // 1-10,000 characters
  deck_name: string; // 1-100 characters, optional
}

// Response DTO - inicjacja generacji
export interface GenerationInitResponseDTO {
  generation_session_id: string;
  deck_id: string;
  status: string; // "in_progress"
  started_at: string; // ISO8601
}

// Response DTO - status sesji (polling)
export type GenerationSessionDTO = Omit<GenerationSessionEntity, "created_at" | "updated_at" | "sanitized_source_text">;

// Błędy API
export interface ApiErrorResponseDTO {
  error: string;
  message: string;
}

export interface GenerationValidationErrorResponseDTO extends ApiErrorResponseDTO {
  error: "validation_error";
  details: {
    field: string;
    current_length: number;
    max_length: number;
  };
}

export interface ConcurrentGenerationErrorResponseDTO extends ApiErrorResponseDTO {
  error: "generation_in_progress";
  active_session_id: string;
}
```

### 5.2 ViewModels - nowe typy dla widoku

Typy do utworzenia w `src/components/generate/types.ts`:

```typescript
// Stan głównego komponentu GenerateView
export type GenerationState =
  | { phase: "idle" } // Formularz widoczny, brak generacji
  | { phase: "submitting"; data: GenerateFormData } // Wysyłanie żądania POST
  | { phase: "polling"; sessionId: string; deckId: string; startedAt: string } // Polling statusu
  | { phase: "completed"; deckId: string; deckSlug: string; truncatedCount: number } // Sukces, przed redirectem
  | { phase: "error"; errorType: GenerationErrorType; message: string; canRetry: boolean }; // Błąd

// Typy błędów generacji
export type GenerationErrorType =
  | "validation_error" // Błąd walidacji (400)
  | "concurrent_generation" // Już trwa generacja (400)
  | "timeout" // Timeout 5 min
  | "network_error" // Błąd sieci
  | "server_error" // Błąd serwera (500)
  | "unknown"; // Nieznany błąd

// Dane formularza
export interface GenerateFormData {
  sourceText: string;
  deckName: string; // Puste string = auto-generacja na serwerze
}

// Walidacja formularza
export interface FormValidation {
  isValid: boolean;
  errors: {
    sourceText?: string;
    deckName?: string;
  };
}

// Status generacji (dla UI)
export interface GenerationStatus {
  state: "in_progress" | "completed" | "failed" | "timeout";
  message: string;
  startedAt: string;
  finishedAt?: string;
  errorCode?: string;
  errorMessage?: string;
}

// Konfiguracja pollingu
export interface PollingConfig {
  intervalMs: number; // 2000 (2s)
  timeoutMs: number; // 300000 (5 min)
  maxAttempts?: number; // Opcjonalnie, zamiast timeout
}
```

### 5.3 Mapowanie typów

**Z formularza do API:**

```typescript
GenerateFormData → CreateGenerationCommand
```

**Z API do ViewModelu:**

```typescript
GenerationInitResponseDTO → GenerationState (phase: 'polling')
GenerationSessionDTO → GenerationStatus
```

**Błędy API do ViewModelu:**

```typescript
ApiErrorResponseDTO → GenerationState (phase: 'error')
GenerationValidationErrorResponseDTO → GenerationState (phase: 'error', errorType: 'validation_error')
ConcurrentGenerationErrorResponseDTO → GenerationState (phase: 'error', errorType: 'concurrent_generation')
```

## 6. Zarządzanie stanem

### 6.1 Stan lokalny komponentu GenerateView

Główny komponent `GenerateView` używa `useState` do zarządzania stanem generacji:

```typescript
const [generationState, setGenerationState] = useState<GenerationState>({ phase: "idle" });
const [formData, setFormData] = useState<GenerateFormData>({
  sourceText: "",
  deckName: "",
});
```

### 6.2 Przejścia stanu (State Machine)

```
idle → submitting → polling → completed → [redirect]
                   ↓
                 error → idle (retry)
```

**Szczegółowe przejścia:**

1. **idle → submitting**
   - Trigger: Użytkownik klika "Generuj fiszki"
   - Warunek: Formularz przechodzi walidację
   - Akcja: Wywołanie `POST /api/generations`

2. **submitting → polling**
   - Trigger: Otrzymanie odpowiedzi 202 Accepted z API
   - Akcja: Start pollingu `GET /api/generation-sessions/:sessionId` co 2s

3. **polling → completed**
   - Trigger: Status sesji = "completed"
   - Akcja: Zatrzymanie pollingu, przygotowanie danych do redirectu

4. **completed → [redirect]**
   - Trigger: Automatycznie po 1-2s (opcjonalnie natychmiast)
   - Akcja: `window.location.href = '/decks/:slug-:id?banner=...'`

5. **submitting/polling → error**
   - Trigger: Błąd API, timeout, błąd sieci
   - Akcja: Zatrzymanie pollingu, wyświetlenie komunikatu

6. **error → idle**
   - Trigger: Użytkownik klika "Spróbuj ponownie"
   - Akcja: Reset stanu, powrót do formularza

### 6.3 Custom Hook: useGenerationPolling

Hook do obsługi pollingu statusu generacji:

```typescript
function useGenerationPolling(
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

  useEffect(() => {
    if (!sessionId) return;

    setIsPolling(true);
    const startTime = Date.now();

    const pollInterval = setInterval(async () => {
      try {
        // Sprawdzenie timeout
        if (Date.now() - startTime > config.timeoutMs) {
          clearInterval(pollInterval);
          setError(new Error("timeout"));
          setIsPolling(false);
          return;
        }

        // Wywołanie API
        const response = await fetch(`/api/generation-sessions/${sessionId}`);
        const data: GenerationSessionDTO = await response.json();

        // Mapowanie do GenerationStatus
        const mappedStatus: GenerationStatus = {
          state: data.status as GenerationStatus["state"],
          message: getStatusMessage(data.status),
          startedAt: data.started_at,
          finishedAt: data.finished_at || undefined,
          errorCode: data.error_code || undefined,
          errorMessage: data.error_message || undefined,
        };

        setStatus(mappedStatus);

        // Zatrzymanie pollingu po zakończeniu
        if (["completed", "failed", "timeout"].includes(data.status)) {
          clearInterval(pollInterval);
          setIsPolling(false);
        }
      } catch (err) {
        clearInterval(pollInterval);
        setError(err as Error);
        setIsPolling(false);
      }
    }, config.intervalMs);

    return () => clearInterval(pollInterval);
  }, [sessionId, config]);

  return { status, isPolling, error };
}
```

### 6.4 Custom Hook: useFormValidation

Hook do walidacji formularza:

```typescript
function useFormValidation(formData: GenerateFormData): FormValidation {
  const errors: FormValidation["errors"] = {};

  // Walidacja sourceText
  if (!formData.sourceText.trim()) {
    errors.sourceText = "Tekst źródłowy jest wymagany";
  } else if (formData.sourceText.length > 10000) {
    errors.sourceText = "Tekst źródłowy nie może przekraczać 10 000 znaków";
  }

  // Walidacja deckName (opcjonalne)
  if (formData.deckName && formData.deckName.length > 100) {
    errors.deckName = "Nazwa talii nie może przekraczać 100 znaków";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}
```

## 7. Integracja API

### 7.1 Endpoint: POST /api/generations

**Cel:** Inicjowanie procesu generacji AI.

**Request:**

```typescript
type RequestBody = CreateGenerationCommand;

const requestBody: RequestBody = {
  source_text: formData.sourceText.trim(),
  deck_name: formData.deckName.trim() || undefined, // Puste = auto-generacja
};
```

**Response (202 Accepted):**

```typescript
type SuccessResponse = GenerationInitResponseDTO;

const response: SuccessResponse = {
  generation_session_id: "uuid",
  deck_id: "uuid",
  status: "in_progress",
  started_at: "2024-11-10T20:30:00Z",
};
```

**Error Responses:**

1. **400 Bad Request - Walidacja:**

```typescript
type ValidationError = GenerationValidationErrorResponseDTO;

const error: ValidationError = {
  error: "validation_error",
  message: "Source text must not exceed 10,000 characters",
  details: {
    field: "source_text",
    current_length: 12000,
    max_length: 10000,
  },
};
```

2. **400 Bad Request - Concurrent Generation:**

```typescript
type ConcurrentError = ConcurrentGenerationErrorResponseDTO;

const error: ConcurrentError = {
  error: "generation_in_progress",
  message: "You already have a generation in progress. Please wait for it to complete.",
  active_session_id: "uuid",
};
```

3. **500 Internal Server Error:**

```typescript
type ServerError = ApiErrorResponseDTO;

const error: ServerError = {
  error: "internal_server_error",
  message: "An unexpected error occurred. Please try again later.",
};
```

**Implementacja wywołania:**

```typescript
async function initiateGeneration(data: GenerateFormData): Promise<GenerationInitResponseDTO> {
  const response = await fetch("/api/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      source_text: data.sourceText.trim(),
      deck_name: data.deckName.trim() || undefined,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || "Failed to initiate generation");
  }

  return response.json();
}
```

### 7.2 Endpoint: GET /api/generation-sessions/:sessionId

**Cel:** Sprawdzenie statusu generacji (polling).

**Request:**

```typescript
const sessionId = "uuid";
const url = `/api/generation-sessions/${sessionId}`;
```

**Response (200 OK):**

```typescript
type StatusResponse = GenerationSessionDTO;

// Przykład: in_progress
const response1: StatusResponse = {
  id: "uuid",
  user_id: "uuid",
  deck_id: "uuid",
  status: "in_progress",
  started_at: "2024-11-10T20:30:00Z",
  finished_at: null,
  params: { model: "openai/gpt-4o-mini", temperature: 0.7 },
  truncated_count: null,
  error_code: null,
  error_message: null,
};

// Przykład: completed
const response2: StatusResponse = {
  id: "uuid",
  user_id: "uuid",
  deck_id: "uuid",
  status: "completed",
  started_at: "2024-11-10T20:30:00Z",
  finished_at: "2024-11-10T20:32:15Z",
  params: { model: "openai/gpt-4o-mini", temperature: 0.7 },
  truncated_count: 5, // 5 kart przyciętych
  error_code: null,
  error_message: null,
};

// Przykład: timeout
const response3: StatusResponse = {
  id: "uuid",
  user_id: "uuid",
  deck_id: "uuid",
  status: "timeout",
  started_at: "2024-11-10T20:30:00Z",
  finished_at: "2024-11-10T20:35:00Z",
  params: { model: "openai/gpt-4o-mini", temperature: 0.7 },
  truncated_count: null,
  error_code: "timeout",
  error_message: "Generation took too long. Please try again with shorter text.",
};
```

**Error Responses:**

1. **404 Not Found:**

```typescript
const error: ApiErrorResponseDTO = {
  error: "not_found",
  message: "Generation session not found",
};
```

**Implementacja wywołania:**

```typescript
async function fetchGenerationStatus(sessionId: string): Promise<GenerationSessionDTO> {
  const response = await fetch(`/api/generation-sessions/${sessionId}`);

  if (!response.ok) {
    throw new Error("Failed to fetch generation status");
  }

  return response.json();
}
```

### 7.3 Obsługa błędów API

**Strategia obsługi:**

1. **Walidacja (400):** Wyświetl komunikat z API w formularzu
2. **Concurrent Generation (400):** Wyświetl komunikat + link do aktywnej sesji (opcjonalnie)
3. **Timeout:** Wyświetl komunikat + przycisk "Spróbuj ponownie"
4. **Server Error (500):** Generyczny komunikat + przycisk "Spróbuj ponownie"
5. **Network Error:** Komunikat o problemach z połączeniem + przycisk "Spróbuj ponownie"

**Mapowanie błędów:**

```typescript
function mapApiErrorToState(error: any): GenerationState {
  if (error.error === "validation_error") {
    return {
      phase: "error",
      errorType: "validation_error",
      message: error.message,
      canRetry: true,
    };
  }

  if (error.error === "generation_in_progress") {
    return {
      phase: "error",
      errorType: "concurrent_generation",
      message: error.message,
      canRetry: false, // Nie można ponowić, musi poczekać
    };
  }

  if (error.error === "timeout") {
    return {
      phase: "error",
      errorType: "timeout",
      message: "Generacja przekroczyła limit czasu (5 minut). Spróbuj z krótszym tekstem.",
      canRetry: true,
    };
  }

  // Domyślnie: server error lub unknown
  return {
    phase: "error",
    errorType: "server_error",
    message: "Wystąpił nieoczekiwany błąd. Spróbuj ponownie później.",
    canRetry: true,
  };
}
```

## 8. Interakcje użytkownika

### 8.1 Wypełnianie formularza

**Scenariusz:** Użytkownik wkleja tekst i opcjonalnie podaje nazwę talii.

**Kroki:**

1. Użytkownik wkleja tekst do `TextareaWithCounter`
2. Licznik znaków aktualizuje się w czasie rzeczywistym ("X / 10 000")
3. Jeśli tekst > 10 000 znaków:
   - Licznik zmienia kolor na czerwony
   - Wyświetla się komunikat błędu pod polem
   - Przycisk "Generuj fiszki" zostaje zablokowany
4. Użytkownik opcjonalnie wpisuje nazwę talii w `DeckNameInput`
5. Jeśli nazwa > 100 znaków:
   - Wyświetla się komunikat błędu
   - Przycisk zostaje zablokowany

**Rezultat:** Formularz jest gotowy do wysłania, gdy wszystkie walidacje przechodzą.

### 8.2 Inicjowanie generacji

**Scenariusz:** Użytkownik klika "Generuj fiszki".

**Kroki:**

1. Użytkownik klika przycisk `GenerateButton`
2. Przycisk zmienia tekst na "Generowanie..." i wyświetla spinner
3. Przycisk zostaje zablokowany (`disabled`)
4. Formularz zostaje zablokowany (wszystkie pola `disabled`)
5. Wysyłane jest żądanie `POST /api/generations`
6. Po otrzymaniu odpowiedzi 202:
   - Formularz znika
   - Pojawia się `GenerationStatusPanel` z komunikatem "Generowanie w toku..."
   - Rozpoczyna się polling statusu co 2s

**Rezultat:** Użytkownik widzi panel statusu z informacją o postępie.

### 8.3 Śledzenie postępu generacji

**Scenariusz:** Użytkownik czeka na zakończenie generacji.

**Kroki:**

1. `GenerationStatusPanel` wyświetla:
   - Animowany spinner (`ProgressIndicator`)
   - Komunikat: "Generowanie fiszek w toku... Może to potrwać do 5 minut."
   - Czas rozpoczęcia generacji
   - Opcjonalnie: przycisk "Anuluj" (w MVP może być pominięty)
2. Co 2 sekundy wysyłane jest żądanie `GET /api/generation-sessions/:sessionId`
3. Status aktualizuje się w czasie rzeczywistym
4. Jeśli status = "completed":
   - Spinner zmienia się na ikonę sukcesu (CheckCircle)
   - Komunikat: "Generacja zakończona pomyślnie! Przekierowywanie..."
   - Po 1-2s następuje przekierowanie do `/decks/:slug-:id`

**Rezultat:** Użytkownik jest przekierowywany do widoku Draft z wygenerowanymi kartami.

### 8.4 Obsługa błędu walidacji

**Scenariusz:** API zwraca błąd walidacji (400).

**Kroki:**

1. Po wysłaniu formularza API zwraca:
   ```json
   {
     "error": "validation_error",
     "message": "Source text must not exceed 10,000 characters",
     "details": { "field": "source_text", "current_length": 12000, "max_length": 10000 }
   }
   ```
2. `GenerationStatusPanel` wyświetla:
   - Ikona błędu (XCircle)
   - Komunikat z API
   - Przycisk "Spróbuj ponownie"
3. Użytkownik klika "Spróbuj ponownie"
4. Widok wraca do formularza z poprzednimi danymi
5. Błąd jest wyświetlony pod odpowiednim polem

**Rezultat:** Użytkownik może poprawić dane i spróbować ponownie.

### 8.5 Obsługa concurrent generation

**Scenariusz:** Użytkownik próbuje uruchomić generację, gdy inna już trwa.

**Kroki:**

1. API zwraca:
   ```json
   {
     "error": "generation_in_progress",
     "message": "You already have a generation in progress. Please wait for it to complete.",
     "active_session_id": "uuid"
   }
   ```
2. `GenerationStatusPanel` wyświetla:
   - Ikona ostrzegawcza (AlertTriangle)
   - Komunikat z API
   - Informacja: "Masz już aktywną generację. Poczekaj na jej zakończenie."
   - Brak przycisku "Spróbuj ponownie" (canRetry = false)
   - Opcjonalnie: link do aktywnej sesji (przyszłość)

**Rezultat:** Użytkownik musi poczekać na zakończenie aktywnej generacji.

### 8.6 Obsługa timeout

**Scenariusz:** Generacja przekracza 5 minut.

**Kroki:**

1. Po 5 minutach pollingu:
   - Hook `useGenerationPolling` wykrywa timeout
   - LUB API zwraca status "timeout"
2. `GenerationStatusPanel` wyświetla:
   - Ikona ostrzegawcza (AlertTriangle)
   - Komunikat: "Generacja przekroczyła limit czasu (5 minut). Spróbuj z krótszym tekstem."
   - Przycisk "Spróbuj ponownie"
3. Użytkownik klika "Spróbuj ponownie"
4. Widok wraca do formularza z poprzednimi danymi

**Rezultat:** Użytkownik może skrócić tekst i spróbować ponownie.

### 8.7 Obsługa błędu serwera

**Scenariusz:** Wystąpił błąd serwera (500) lub błąd sieci.

**Kroki:**

1. API zwraca błąd 500 lub występuje błąd sieci
2. `GenerationStatusPanel` wyświetla:
   - Ikona błędu (XCircle)
   - Generyczny komunikat: "Wystąpił nieoczekiwany błąd. Spróbuj ponownie później."
   - Przycisk "Spróbuj ponownie"
3. Użytkownik klika "Spróbuj ponownie"
4. Widok wraca do formularza

**Rezultat:** Użytkownik może spróbować ponownie później.

### 8.8 Sukces z przycięciem kart

**Scenariusz:** Generacja zakończyła się sukcesem, ale >20 kart zostało przyciętych.

**Kroki:**

1. API zwraca status "completed" z `truncated_count: 5`
2. `GenerationStatusPanel` wyświetla sukces
3. Następuje przekierowanie do `/decks/:slug-:id?banner=5`
4. Widok Draft wyświetla banner:
   - "Wygenerowano 20 kart. 5 dodatkowych kart zostało pominiętych (limit: 20 kart na talię)."

**Rezultat:** Użytkownik jest informowany o przycięciu i może przejrzeć karty.

## 9. Warunki i walidacja

### 9.1 Walidacja client-side (przed wysłaniem)

**Komponent:** `GenerateForm` + `useFormValidation`

**Warunki:**

1. **Tekst źródłowy (sourceText):**
   - **Wymagane:** Nie może być pusty
   - **Minimum:** 1 znak (po trim)
   - **Maksimum:** 10 000 znaków
   - **Błąd:** "Tekst źródłowy jest wymagany" lub "Tekst źródłowy nie może przekraczać 10 000 znaków"
   - **Wpływ na UI:** Przycisk zablokowany, licznik czerwony, komunikat błędu pod polem

2. **Nazwa talii (deckName):**
   - **Opcjonalne:** Może być pusta (auto-generacja na serwerze)
   - **Maksimum:** 100 znaków (jeśli podana)
   - **Błąd:** "Nazwa talii nie może przekraczać 100 znaków"
   - **Wpływ na UI:** Przycisk zablokowany, komunikat błędu pod polem

3. **Przycisk "Generuj fiszki":**
   - **Zablokowany (`disabled`), gdy:**
     - `isSubmitting === true` (wysyłanie w toku)
     - `isValid === false` (walidacja nie przechodzi)
     - Tekst źródłowy pusty lub > 10 000 znaków
     - Nazwa talii > 100 znaków

**Implementacja:**

```typescript
const validation = useFormValidation(formData);
const isSubmitDisabled = !validation.isValid || isSubmitting;
```

### 9.2 Walidacja server-side (przez API)

**Endpoint:** `POST /api/generations`

**Warunki weryfikowane przez serwer:**

1. **Tekst źródłowy:**
   - Długość: 1-10 000 znaków (Zod schema)
   - Sanityzacja: usunięcie HTML, nadmiarowych spacji
   - Błąd 400: `GenerationValidationErrorResponseDTO`

2. **Nazwa talii:**
   - Długość: 1-100 znaków (jeśli podana)
   - Unikalność: per użytkownik (case-insensitive, wykluczając soft-deleted)
   - Błąd 400: `ApiErrorResponseDTO` z message o nieunikalnej nazwie

3. **Concurrent generation:**
   - Maksymalnie 1 aktywna generacja na użytkownika
   - Sprawdzane przez DB unique index na `generation_sessions(user_id) WHERE status = 'in_progress'`
   - Błąd 400: `ConcurrentGenerationErrorResponseDTO`

4. **Autoryzacja:**
   - Wymagany ważny JWT token
   - Błąd 401: Przekierowanie do `/auth/login`

### 9.3 Warunki pollingu

**Hook:** `useGenerationPolling`

**Konfiguracja:**

```typescript
const pollingConfig: PollingConfig = {
  intervalMs: 2000, // Polling co 2 sekundy
  timeoutMs: 300000, // Timeout po 5 minutach (300 000 ms)
};
```

**Warunki zatrzymania pollingu:**

1. **Status = "completed":**
   - Generacja zakończona sukcesem
   - Akcja: Zatrzymanie pollingu, przygotowanie do redirectu

2. **Status = "failed":**
   - Błąd podczas generacji (LLM error, network error)
   - Akcja: Zatrzymanie pollingu, wyświetlenie błędu

3. **Status = "timeout":**
   - Generacja przekroczyła 5 minut na serwerze
   - Akcja: Zatrzymanie pollingu, wyświetlenie komunikatu timeout

4. **Client-side timeout:**
   - Polling trwa > 5 minut (300 000 ms)
   - Akcja: Zatrzymanie pollingu, wyświetlenie błędu timeout

5. **Błąd sieci:**
   - Nieudane żądanie GET podczas pollingu
   - Akcja: Zatrzymanie pollingu, wyświetlenie błędu sieci

### 9.4 Warunki przekierowania

**Trigger:** Status generacji = "completed"

**Warunki:**

1. **Pobranie danych talii:**
   - Wymagane: `deck_id` z `GenerationInitResponseDTO`
   - Wymagane: `slug` talii (pobrany z API lub wygenerowany z nazwy)
   - Opcjonalne: `truncated_count` z `GenerationSessionDTO`

2. **Konstrukcja URL:**
   - Jeśli `truncated_count > 0`: `/decks/:slug-:id?banner=:truncated_count`
   - Jeśli `truncated_count === 0` lub `null`: `/decks/:slug-:id`

3. **Wykonanie przekierowania:**
   - Metoda: `window.location.href = url` (full page reload)
   - Timing: Po 1-2s od wyświetlenia komunikatu sukcesu (opcjonalnie natychmiast)

**Przykład:**

```typescript
if (generationState.phase === "completed") {
  const { deckId, deckSlug, truncatedCount } = generationState;
  const url =
    truncatedCount > 0 ? `/decks/${deckSlug}-${deckId}?banner=${truncatedCount}` : `/decks/${deckSlug}-${deckId}`;

  setTimeout(() => {
    window.location.href = url;
  }, 1500); // 1.5s opóźnienia dla UX
}
```

### 9.5 Warunki dostępności (A11y)

**Wymagania:**

1. **Etykiety pól:**
   - Każde pole ma `<Label>` powiązane przez `htmlFor`
   - Etykiety opisowe: "Tekst źródłowy", "Nazwa talii (opcjonalne)"

2. **Komunikaty statusu:**
   - `GenerationStatusPanel` ma `aria-live="polite"`
   - Komunikaty o błędach mają `role="alert"`

3. **Focus management:**
   - Po błędzie: focus wraca do pierwszego pola z błędem
   - Po kliknięciu "Spróbuj ponownie": focus wraca do textarea

4. **Przycisk:**
   - Minimalny rozmiar: 44x44px (touch target)
   - Widoczny focus ring (Tailwind `focus-visible:ring-2`)
   - Stan disabled jasno zaznaczony (opacity, cursor)

5. **Licznik znaków:**
   - `aria-describedby` powiązany z textarea
   - Komunikat: "Pozostało X z 10 000 znaków" (screen reader)
