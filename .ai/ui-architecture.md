# UI Architecture – 10x-cards MVP

## 1. Struktura nawigacji

### 1.1 Mobile Navigation (< 768px)
**Bottom Navigation Bar** z 4 głównymi sekcjami:
- 🏠 **Decks** (`/decks`) - lista talii
- ✨ **Generate** (`/generate`) - generowanie nowych kart
- 🎓 **Learn** (`/learn`) - wybór talii do nauki
- 👤 **Profile** (`/profile`) - ustawienia i wylogowanie

### 1.2 Desktop Navigation (≥ 768px)
**Left Sidebar** z tymi samymi sekcjami, rozwinięty z ikonami i etykietami tekstowymi.

### 1.3 Główna zawartość
- Centrowana z `max-width: 1200px`
- Padding responsywny: `16px` (mobile), `24px` (tablet), `32px` (desktop)

---

## 2. Mapa widoków i routing

### 2.1 Publiczne (niezalogowani)
| Route | Widok | Opis |
|-------|-------|------|
| `/` | Landing Page | Opis produktu + CTA do rejestracji |
| `/login` | Login Form | Email/hasło, link do `/signup` |
| `/signup` | Signup Form | Email/hasło, link do `/login` |

### 2.2 Chronione (wymagają auth)
| Route | Widok | Opis |
|-------|-------|------|
| `/decks` | Deck List | Lista talii z zakładkami Draft/Published/Rejected |
| `/decks/:deckId` | Deck Detail | Szczegóły talii (read-only dla published) |
| `/decks/:deckId/edit` | Draft Editor | Edycja kart w Draft (inline list) |
| `/generate` | Generation Form | Formularz generowania + progress tracking |
| `/learn` | Learn Deck Selector | Wybór talii do nauki |
| `/learn/:deckId` | Learn Session | Pełnoekranowa sesja nauki |
| `/profile` | User Profile | Ustawienia konta, wylogowanie |

### 2.3 Przekierowania
- `/` → `/decks` (jeśli zalogowany)
- `/decks` → `/login` (jeśli niezalogowany)
- Wszystkie chronione → `/login` (jeśli sesja wygasła)

---

## 3. Szczegółowe widoki

### 3.1 `/decks` - Lista talii

#### Layout
```
┌─────────────────────────────────────┐
│ Header: "Moje talie"                │
├─────────────────────────────────────┤
│ Tabs: [Draft (3)] [Published (12)]  │
│       [Rejected (1)]                 │
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │ Deck Card                       │ │
│ │ Name: "Biology Exam 2024"       │ │
│ │ Cards: 15 | Updated: 2h ago     │ │
│ │ [View] [Edit] [Delete]          │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ Deck Card (Published)           │ │
│ │ Name: "History 101"             │ │
│ │ Cards: 20 | Published: 3d ago   │ │
│ │ [View] [Learn] [Delete]         │ │
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│ Pagination: [< 1 2 3 >]             │
└─────────────────────────────────────┘
```

#### Komponenty
- **DeckCard** (shadcn/ui Card)
  - Props: `deck`, `onView`, `onEdit`, `onDelete`, `onLearn`
  - Warianty: `draft`, `published`, `rejected`
  - Badge ze statusem i licznikiem kart
  
- **DeckTabs** (shadcn/ui Tabs)
  - Zakładki z licznikami
  - Filtrowanie po `status`
  - Query param: `?status=draft|published|rejected`

#### Interakcje
- Kliknięcie karty → `/decks/:deckId`
- "Edit" (Draft) → `/decks/:deckId/edit`
- "Learn" (Published) → `/learn/:deckId`
- "Delete" → Modal potwierdzenia → soft delete → toast "Talia została usunięta"

#### API Calls
- `GET /api/decks?status={status}&limit=50&offset=0`
- `DELETE /api/decks/:deckId`

---

### 3.2 `/generate` - Generowanie kart

#### Layout (Idle State)
```
┌─────────────────────────────────────┐
│ Header: "Wygeneruj nowe karty"      │
├─────────────────────────────────────┤
│ Deck Name (optional):               │
│ [_____________________________]     │
│                                     │
│ Source Text:                        │
│ ┌─────────────────────────────────┐ │
│ │                                 │ │
│ │  [Textarea 10k chars]           │ │
│ │                                 │ │
│ │                                 │ │
│ └─────────────────────────────────┘ │
│ Character count: 1,234 / 10,000    │
│ [████████░░░░░░░░░░░░] 12%         │
│                                     │
│ [Generuj karty] (disabled if >10k) │
└─────────────────────────────────────┘
```

#### Layout (Generating State)
```
┌─────────────────────────────────────┐
│ Header: "Generowanie w toku..."     │
├─────────────────────────────────────┤
│        [Spinner Animation]          │
│                                     │
│ Czas: 00:32 / 05:00                │
│ [████████████░░░░░░░░] 40%         │
│                                     │
│ Generowanie może potrwać do 5 minut│
│                                     │
│ [Anuluj]                            │
└─────────────────────────────────────┘
```

#### Komponenty
- **GenerationForm** (React)
  - Textarea z licznikiem znaków (realtime)
  - Progress bar wizualizujący 10k limit
  - Walidacja: blokada przycisku przy >10k
  - Input dla nazwy talii (opcjonalny)

- **GenerationProgress** (React)
  - Polling `GET /api/generation-sessions/:sessionId` co 2s
  - Timer odliczający do 5 min
  - Progress bar (czas/timeout)
  - Przycisk anulowania (opcjonalny w MVP)

#### Przepływ
1. User wkleja tekst → licznik aktualizuje się realtime
2. Klik "Generuj" → `POST /api/generations` → 202 Accepted
3. Zapisz `generation_session_id` w localStorage
4. Przełącz na GenerationProgress
5. Poll status co 2s
6. Status `completed` → redirect `/decks/:deckId/edit` + toast "Wygenerowano X kart"
7. Status `timeout`/`failed` → wyświetl błąd + przycisk "Spróbuj ponownie"

#### Obsługa beforeunload
```javascript
window.addEventListener('beforeunload', (e) => {
  if (generationInProgress) {
    e.preventDefault();
    e.returnValue = 'Generowanie w toku. Czy na pewno chcesz opuścić stronę?';
  }
});
```

#### API Calls
- `POST /api/generations` → `{ generation_session_id, deck_id, status }`
- `GET /api/generation-sessions/:sessionId` (polling)

---

### 3.3 `/decks/:deckId/edit` - Edytor Draft

#### Layout
```
┌─────────────────────────────────────┐
│ Header: "Biology Exam 2024" [Edit] │
│ Status: Draft | Cards: 15/20        │
├─────────────────────────────────────┤
│ [Opublikuj talię] [Odrzuć]          │
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │ Card #1                    [×]  │ │
│ │ Front: [___________________]    │ │
│ │        150/200 ████████░░       │ │
│ │ Back:  [___________________]    │ │
│ │        180/200 █████████░       │ │
│ │ Hint:  [___________________]    │ │
│ │        50/200  ██░░░░░░░░       │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ Card #2 ⚠️ Przekroczono limit  │ │
│ │ Front: [___________________]    │ │
│ │        210/200 ██████████░ 🔴   │ │
│ │ Back:  [___________________]    │ │
│ │        195/200 █████████░       │ │
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│ [+ Dodaj kartę] (disabled if 20)   │
└─────────────────────────────────────┘
```

#### Komponenty
- **CardEditor** (React)
  - Inline edycja z auto-save (debounce 500ms)
  - Liczniki znaków z kolorami:
    - Szary: <160
    - Pomarańczowy: 160-200
    - Czerwony: >200 + ikona ostrzeżenia
  - Przycisk usunięcia (z potwierdzeniem)
  - Drag handle do zmiany kolejności (opcjonalnie w MVP)

- **PublishButton** (React)
  - Disabled jeśli jakakolwiek karta >200 znaków
  - Tooltip wyjaśniający powód blokady
  - Klik → Modal walidacji

- **PublishModal** (shadcn/ui Dialog)
  - Etap 1: Walidacja
    - Lista błędów (jeśli są)
    - Linki do kart wymagających poprawy
  - Etap 2: Potwierdzenie
    - "Po publikacji nie będzie można edytować kart"
    - [Anuluj] [Opublikuj]

#### Interakcje
- Auto-save po każdej zmianie (debounce 500ms) → `PATCH /api/cards/:cardId`
- Usunięcie karty → `DELETE /api/cards/:cardId` → usunięcie z listy
- Dodanie karty → `POST /api/decks/:deckId/cards` → dodanie do listy
- Publikacja → Modal → `POST /api/decks/:deckId/publish`
  - Success → redirect `/decks/:deckId` + toast "Talia opublikowana"
  - Error → wyświetl listę błędów w modalu

#### Zarządzanie stanem
- React Query dla cache'owania i synchronizacji
- Optimistic updates dla edycji (rollback przy błędzie)
- Invalidate cache po publikacji

#### API Calls
- `GET /api/decks/:deckId/cards`
- `PATCH /api/cards/:cardId`
- `DELETE /api/cards/:cardId`
- `POST /api/decks/:deckId/cards`
- `POST /api/decks/:deckId/publish`

---

### 3.4 `/decks/:deckId` - Szczegóły talii (Read-only)

#### Layout (Published)
```
┌─────────────────────────────────────┐
│ Header: "History 101"               │
│ Status: Published | Cards: 20       │
│ Published: 3 days ago               │
├─────────────────────────────────────┤
│ [Ucz się] [Usuń talię]              │
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │ Card #1                         │ │
│ │ Front: "What is photosynthesis?"│ │
│ │ Back:  "Process by which..."    │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ Card #2                         │ │
│ │ Front: "Define mitosis"         │ │
│ │ Back:  "Cell division..."       │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

#### Komponenty
- **CardPreview** (shadcn/ui Card)
  - Read-only wyświetlanie front/back
  - Brak edycji dla published
  - Accordion do rozwijania/zwijania

#### Interakcje
- "Ucz się" → redirect `/learn/:deckId`
- "Usuń talię" → Modal potwierdzenia → `DELETE /api/decks/:deckId` → redirect `/decks`

---

### 3.5 `/learn/:deckId` - Sesja nauki

#### Layout (Pytanie)
```
┌─────────────────────────────────────┐
│                          [Zakończ] │
│                                     │
│         Karta 5 / 20                │
│                                     │
│  ┌───────────────────────────────┐  │
│  │                               │  │
│  │   What is photosynthesis?     │  │
│  │                               │  │
│  └───────────────────────────────┘  │
│                                     │
│         [Pokaż odpowiedź]           │
│                                     │
└─────────────────────────────────────┘
```

#### Layout (Odpowiedź)
```
┌─────────────────────────────────────┐
│                          [Zakończ] │
│                                     │
│         Karta 5 / 20                │
│                                     │
│  ┌───────────────────────────────┐  │
│  │ Q: What is photosynthesis?    │  │
│  ├───────────────────────────────┤  │
│  │ A: Process by which plants    │  │
│  │    convert light energy...    │  │
│  └───────────────────────────────┘  │
│                                     │
│      [Pomiń]      [Następna]        │
│                                     │
└─────────────────────────────────────┘
```

#### Layout (Zakończenie)
```
┌─────────────────────────────────────┐
│         🎉 Gratulacje!              │
│                                     │
│   Przejrzałeś wszystkie karty!      │
│                                     │
│         20 / 20 kart                │
│                                     │
│  [Wróć do talii] [Ucz się ponownie] │
│                                     │
└─────────────────────────────────────┘
```

#### Komponenty
- **LearnCard** (React)
  - Stan: `question` | `answer`
  - Animacja flip przy przejściu question → answer
  - Duża, czytelna czcionka
  - Minimalistyczny design (bez rozpraszaczy)

- **LearnProgress** (React)
  - Progress bar: X / Total
  - Licznik w rogu

- **LearnControls** (React)
  - "Pokaż odpowiedź" (stan question)
  - "Pomiń" / "Następna" (stan answer)
  - "Zakończ" (zawsze widoczny, mały przycisk w rogu)

#### Przepływ
1. `GET /api/decks/:deckId/cards` → shuffle po stronie klienta
2. Wyświetl pierwszą kartę (front)
3. User klika "Pokaż odpowiedź" → flip animation → wyświetl back
4. User klika "Następna" lub "Pomiń" → następna karta
5. Po ostatniej karcie → ekran zakończenia
6. "Wróć do talii" → redirect `/decks/:deckId`
7. "Ucz się ponownie" → shuffle + restart sesji

#### Obsługa przerwania
- "Zakończ" → Modal: "Czy na pewno chcesz zakończyć? (X/Y kart przejrzano)"
- [Anuluj] [Zakończ sesję] → redirect `/decks/:deckId`

#### Tryb pełnoekranowy
- Ukryj główną nawigację (bottom bar / sidebar)
- Tylko przycisk "Zakończ" w prawym górnym rogu
- Opcjonalnie: fullscreen API dla immersive mode

---

## 4. Komponenty UI (shadcn/ui)

### 4.1 Wykorzystane komponenty
- **Button** - wszystkie akcje
- **Card** - kontenery dla talii i kart
- **Dialog** - modale (publikacja, potwierdzenia)
- **Input** / **Textarea** - formularze
- **Tabs** - zakładki statusów talii
- **Badge** - statusy, liczniki
- **Progress** - progress bary (generowanie, nauka)
- **Toast** - notyfikacje (sukces, błędy)
- **Accordion** - rozwijane karty (read-only view)
- **Alert** - komunikaty błędów, ostrzeżenia

### 4.2 Niestandardowe komponenty
- **CharacterCounter** - licznik z progress barem i kolorami
- **DeckCard** - karta talii z akcjami
- **CardEditor** - edytor karty z walidacją
- **LearnCard** - karta w trybie nauki z animacją flip
- **GenerationProgress** - status generowania z timerem

---

## 5. Zarządzanie stanem

### 5.1 Globalne (React Context / Zustand)
- **AuthContext** - user, session, logout
- **GenerationContext** - aktywna sesja generacji (dla beforeunload)

### 5.2 Lokalne (React Query)
- **Decks** - lista talii, cache, invalidation
- **Cards** - lista kart, optimistic updates
- **GenerationSessions** - polling statusu

### 5.3 Lokalne (React useState)
- **LearnSession** - aktualny indeks karty, stan (question/answer)
- **FormState** - wartości formularzy, walidacja

---

## 6. Obsługa błędów

### 6.1 Strategie
- **Network errors** - Toast z "Błąd połączenia. Spróbuj ponownie."
- **Validation errors** - Inline pod polem + blokada przycisku
- **Auth errors (401)** - Redirect `/login` + toast "Sesja wygasła"
- **Not found (404)** - Redirect `/decks` + toast "Nie znaleziono zasobu"
- **Server errors (500)** - Toast z "Wystąpił błąd. Spróbuj ponownie."

### 6.2 Komunikaty generyczne
Wszystkie błędy API wyświetlane jako przyjazne komunikaty bez szczegółów technicznych:
- ✅ "Nie udało się zapisać zmian"
- ❌ "Database constraint violation: unique_index_violation"

---

## 7. Responsywność

### 7.1 Breakpointy (Tailwind)
- `sm`: 640px - telefony landscape
- `md`: 768px - tablety (przełączenie na sidebar)
- `lg`: 1024px - desktopy małe
- `xl`: 1280px - desktopy duże

### 7.2 Adaptacje
| Element | Mobile (<768px) | Desktop (≥768px) |
|---------|-----------------|------------------|
| Nawigacja | Bottom bar (ikony) | Left sidebar (ikony + tekst) |
| Deck cards | 1 kolumna | 2-3 kolumny (grid) |
| Card editor | Stack vertical | Side-by-side (front/back) |
| Learn card | Full width | Max-width 600px centered |
| Modals | Full screen | Centered dialog |

---

## 8. Dostępność (a11y)

### 8.1 Wymagania WCAG 2.1 AA
- **Kontrast** - min 4.5:1 dla tekstu, 3:1 dla UI
- **Focus visible** - wyraźne outline dla keyboard navigation
- **ARIA labels** - wszystkie interaktywne elementy
- **Semantic HTML** - `<main>`, `<nav>`, `<article>`, `<button>`
- **Alt text** - dla ikon i obrazów (jeśli będą)

### 8.2 Keyboard navigation
- Tab order logiczny (top-to-bottom, left-to-right)
- Enter/Space dla przycisków
- Escape dla zamykania modali
- Arrow keys dla nawigacji w listach (opcjonalnie)

### 8.3 Screen readers
- ARIA live regions dla dynamicznych zmian (toast, progress)
- ARIA labels dla ikon bez tekstu
- Skip links dla głównej zawartości

---

## 9. Performance

### 9.1 Optymalizacje
- **Code splitting** - lazy load widoków (`React.lazy`)
- **Image optimization** - Astro Image (jeśli będą obrazy)
- **Bundle size** - tree-shaking, minimalizacja
- **Caching** - React Query z stale-while-revalidate
- **Debouncing** - auto-save w edytorze (500ms)

### 9.2 Metryki docelowe
- **FCP** (First Contentful Paint) < 1.5s
- **LCP** (Largest Contentful Paint) < 2.5s
- **TTI** (Time to Interactive) < 3.5s
- **CLS** (Cumulative Layout Shift) < 0.1

---

## 10. Bezpieczeństwo UI

### 10.1 Ochrona danych
- Nigdy nie wyświetlaj JWT tokenów w UI
- Sanityzacja user input przed wyświetleniem (XSS protection)
- HTTPS only (wymuszane przez middleware)

### 10.2 Sesje
- Auto-logout po wygaśnięciu tokenu (401 → redirect `/login`)
- Wyświetl toast "Sesja wygasła. Zaloguj się ponownie."
- Nie cache'uj wrażliwych danych w localStorage (tylko session_id)

---

## 11. Testowanie UI

### 11.1 Unit tests (Vitest + React Testing Library)
- Komponenty formularzy (walidacja)
- Liczniki znaków
- Logika shuffle kart w sesji nauki

### 11.2 Integration tests (opcjonalnie Playwright)
- Flow: generowanie → edycja → publikacja
- Flow: wybór talii → sesja nauki → zakończenie
- Auth: login → logout

### 11.3 Manual testing checklist
- [ ] Responsywność na 3 rozmiarach (mobile, tablet, desktop)
- [ ] Keyboard navigation
- [ ] Screen reader (VoiceOver/NVDA)
- [ ] Długie teksty (overflow handling)
- [ ] Błędy sieci (offline mode)

---

## 12. Kolejność implementacji (priorytet)

### Faza 1: Auth + Podstawowa nawigacja
1. Layout z nawigacją (bottom bar / sidebar)
2. Login / Signup forms
3. Auth middleware + protected routes
4. Logout

### Faza 2: Listy i CRUD
5. `/decks` - lista talii z zakładkami
6. `/decks/:deckId` - szczegóły (read-only)
7. Delete deck (soft delete)

### Faza 3: Generowanie
8. `/generate` - formularz z licznikiem
9. Generation progress z pollingiem
10. Obsługa beforeunload

### Faza 4: Edycja Draft
11. `/decks/:deckId/edit` - lista kart
12. Inline edycja z auto-save
13. Dodawanie/usuwanie kart
14. Publikacja z walidacją

### Faza 5: Nauka
15. `/learn/:deckId` - sesja nauki
16. Flip animation
17. Progress tracking
18. Ekran zakończenia

### Faza 6: Polish
19. Toast notifications
20. Error handling
21. Loading states
22. Accessibility audit

---

## 13. Design System (kolory, typografia)

### 13.1 Kolory (Tailwind + shadcn/ui)
- **Primary** - `blue-600` (akcje główne)
- **Success** - `green-600` (publikacja, sukces)
- **Warning** - `orange-500` (ostrzeżenia, 160-200 znaków)
- **Error** - `red-600` (błędy, >200 znaków)
- **Neutral** - `gray-*` (tła, borders)

### 13.2 Typografia
- **Headings** - `font-bold`, `text-2xl` (H1), `text-xl` (H2)
- **Body** - `font-normal`, `text-base`
- **Small** - `text-sm` (metadane, liczniki)
- **Font family** - System fonts (Tailwind default)

### 13.3 Spacing
- **Padding** - `p-4` (mobile), `p-6` (desktop)
- **Gap** - `gap-4` (listy), `gap-2` (inline elementy)
- **Margin** - `mb-4` (sekcje), `mb-2` (elementy)

---

## 14. Notatki implementacyjne

### 14.1 Astro + React integration
- Astro pages dla statycznych widoków (landing, login)
- React components dla interaktywnych widoków (editor, nauka)
- `client:load` dla krytycznych komponentów
- `client:idle` dla secondary features

### 14.2 Supabase client
- Inicjalizacja w Astro middleware
- Przekazanie do React via context
- Refresh token handling automatyczny

### 14.3 React Query setup
```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 min
      cacheTime: 10 * 60 * 1000, // 10 min
      refetchOnWindowFocus: false,
    },
  },
});
```

---

## 15. Checklist przed deployment

- [ ] Wszystkie widoki responsywne (mobile + desktop)
- [ ] Auth flow kompletny (signup, login, logout, session refresh)
- [ ] Wszystkie limity egzekwowane w UI (10k, 200, 20)
- [ ] Liczniki znaków z kolorami
- [ ] Generowanie z pollingiem i timeoutem
- [ ] Edycja Draft z auto-save
- [ ] Publikacja z walidacją
- [ ] Sesja nauki z shuffle i progress
- [ ] Soft delete z potwierdzeniem
- [ ] Toast notifications dla wszystkich akcji
- [ ] Generyczne komunikaty błędów
- [ ] Keyboard navigation działa
- [ ] Screen reader friendly
- [ ] Loading states dla wszystkich async operations
- [ ] Beforeunload dla generowania
- [ ] Error boundaries (React)
