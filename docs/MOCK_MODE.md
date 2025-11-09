# Mock Mode - Development Guide

## Overview

Mock mode allows you to develop and test the UI without setting up a real database or authentication. It uses predefined mock data that simulates realistic deck scenarios.

## Enabling Mock Mode

### 1. Set Environment Variable

Create or edit `.env` file in the project root:

```bash
USE_MOCK_DATA=true
```

### 2. Start Development Server

```bash
npm run dev
```

The application will now use mock data instead of connecting to Supabase.

## Mock Data

The mock dataset includes **8 decks** with various statuses:

### Draft Decks (3)

- **Historia Polski - Średniowiecze** (5 cards)
- **Matematyka - Pochodne** (8 cards)
- **Angielski - Phrasal Verbs** (3 cards)

### Published Decks (3)

- **Fizyka - Mechanika** (15 cards)
- **Chemia - Układ Okresowy** (12 cards)
- **Geografia - Stolice Europy** (20 cards - max limit)

### Rejected Decks (2)

- **Biologia - Komórka** (2 cards) - Reason: "Zbyt mało kart w talii"
- **Informatyka - Algorytmy** (1 card) - Reason: "Karty wymagają poprawy jakości"

## Mock User

When mock mode is enabled, all requests are authenticated as:

```
Email: test@example.com
User ID: 00000000-0000-0000-0000-000000000001
```

No JWT token is required in mock mode.

## Testing API Endpoints

### List All Decks

```bash
curl http://localhost:4321/api/decks
```

### Filter by Status

```bash
# Draft decks only
curl http://localhost:4321/api/decks?status=draft

# Published decks only
curl http://localhost:4321/api/decks?status=published

# Rejected decks only
curl http://localhost:4321/api/decks?status=rejected
```

### Pagination

```bash
# First 5 decks
curl http://localhost:4321/api/decks?limit=5&offset=0

# Next 5 decks
curl http://localhost:4321/api/decks?limit=5&offset=5
```

### Sorting

```bash
# Sort by updated_at descending (default)
curl http://localhost:4321/api/decks?sort=updated_at_desc

# Sort by created_at ascending
curl http://localhost:4321/api/decks?sort=created_at_asc
```

### Combined Filters

```bash
curl "http://localhost:4321/api/decks?status=published&limit=2&sort=updated_at_desc"
```

## Features

### ✅ What Works in Mock Mode

- Full API endpoint functionality (GET /api/decks)
- Query parameter validation (Zod schemas)
- Filtering by status
- Sorting (4 variants)
- Pagination
- Realistic response times (100ms simulated delay)
- Error handling for invalid parameters

### ❌ What Doesn't Work

- Real database operations
- JWT authentication (bypassed with mock user)
- Data persistence (changes are not saved)
- Other endpoints not yet implemented

## Switching Back to Real Mode

### 1. Update Environment Variable

In `.env`:

```bash
USE_MOCK_DATA=false
# or remove the line entirely
```

### 2. Ensure Supabase is Running

```bash
supabase status
# Should show: supabase local development setup is running
```

### 3. Restart Development Server

```bash
npm run dev
```

## Implementation Details

### Files Involved

- **`src/lib/services/deck.service.mock.ts`** - Mock data and service implementation
- **`src/middleware/index.ts`** - Mock user injection
- **`src/pages/api/decks/index.ts`** - Feature flag logic
- **`src/env.d.ts`** - Environment variable type definition

### Feature Flag Logic

```typescript
const useMockData = import.meta.env.USE_MOCK_DATA === "true";
const result = useMockData
  ? await listUserDecksMock(...)
  : await listUserDecks(...);
```

## Best Practices

1. **Use mock mode for UI development** - No database setup required
2. **Test with real data before production** - Ensure database queries work
3. **Don't commit `.env` file** - It's gitignored for security
4. **Update mock data as needed** - Edit `deck.service.mock.ts` to add scenarios

## Troubleshooting

### Mock mode not working?

1. Check `.env` file exists and contains `USE_MOCK_DATA=true`
2. Restart dev server after changing `.env`
3. Clear browser cache if seeing old data

### Getting 401 Unauthorized?

- In mock mode, you should NOT get 401 errors
- If you do, check that `USE_MOCK_DATA=true` is set correctly
- Verify middleware is loading the mock user

### Mock data not matching expectations?

- Check `src/lib/services/deck.service.mock.ts`
- Modify the `MOCK_DECKS` array to suit your needs
- Restart dev server after changes

## Next Steps

Once UI is ready, switch to real mode to:

1. Test with actual database
2. Implement authentication flow
3. Add data persistence
4. Deploy to production

---

**Note:** Mock mode is for development only. Never deploy to production with `USE_MOCK_DATA=true`.
