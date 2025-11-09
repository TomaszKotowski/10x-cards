import type { DeckDetailDTO, DeckListItemDTO } from "@/types";
import type { ListDecksQuery } from "@/lib/schemas/deck.schema";

/**
 * Mock data for development and testing.
 * Simulates a realistic set of decks with various statuses and card counts.
 */
const MOCK_DECKS: DeckListItemDTO[] = [
  // Draft decks
  {
    id: "10000000-0000-0000-0000-000000000001",
    name: "Historia Polski - Średniowiecze",
    slug: "historia-polski-sredniowiecze",
    status: "draft",
    published_at: null,
    rejected_at: null,
    rejected_reason: null,
    card_count: 5,
    created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "10000000-0000-0000-0000-000000000002",
    name: "Matematyka - Pochodne",
    slug: "matematyka-pochodne",
    status: "draft",
    published_at: null,
    rejected_at: null,
    rejected_reason: null,
    card_count: 8,
    created_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "10000000-0000-0000-0000-000000000003",
    name: "Angielski - Phrasal Verbs",
    slug: "angielski-phrasal-verbs",
    status: "draft",
    published_at: null,
    rejected_at: null,
    rejected_reason: null,
    card_count: 3,
    created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
  },

  // Published decks
  {
    id: "10000000-0000-0000-0000-000000000004",
    name: "Fizyka - Mechanika",
    slug: "fizyka-mechanika",
    status: "published",
    published_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
    rejected_at: null,
    rejected_reason: null,
    card_count: 15,
    created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "10000000-0000-0000-0000-000000000005",
    name: "Chemia - Układ Okresowy",
    slug: "chemia-uklad-okresowy",
    status: "published",
    published_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    rejected_at: null,
    rejected_reason: null,
    card_count: 12,
    created_at: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "10000000-0000-0000-0000-000000000006",
    name: "Geografia - Stolice Europy",
    slug: "geografia-stolice-europy",
    status: "published",
    published_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    rejected_at: null,
    rejected_reason: null,
    card_count: 20,
    created_at: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
  },

  // Rejected decks
  {
    id: "10000000-0000-0000-0000-000000000007",
    name: "Biologia - Komórka",
    slug: "biologia-komorka",
    status: "rejected",
    published_at: null,
    rejected_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    rejected_reason: "Zbyt mało kart w talii",
    card_count: 2,
    created_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "10000000-0000-0000-0000-000000000008",
    name: "Informatyka - Algorytmy",
    slug: "informatyka-algorytmy",
    status: "rejected",
    published_at: null,
    rejected_at: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
    rejected_reason: "Karty wymagają poprawy jakości",
    card_count: 1,
    created_at: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

/**
 * Result type for mock listUserDecks function.
 */
interface MockListUserDecksResult {
  data: DeckListItemDTO[];
  total: number;
}

/**
 * Mock implementation of listUserDecks for development/testing.
 * Simulates filtering, sorting, and pagination without database access.
 *
 * @param filters - Optional filters (status)
 * @param pagination - Pagination parameters (limit, offset)
 * @param sort - Sort order parameter
 * @returns Promise with paginated deck list and total count
 */
export async function listUserDecksMock(
  filters: Pick<ListDecksQuery, "status">,
  pagination: Pick<ListDecksQuery, "limit" | "offset">,
  sort: ListDecksQuery["sort"]
): Promise<MockListUserDecksResult> {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 100));

  let filteredDecks = [...MOCK_DECKS];

  // Apply status filter
  if (filters.status) {
    filteredDecks = filteredDecks.filter((deck) => deck.status === filters.status);
  }

  // Apply sorting
  filteredDecks.sort((a, b) => {
    switch (sort) {
      case "updated_at_desc":
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      case "updated_at_asc":
        return new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
      case "created_at_desc":
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      case "created_at_asc":
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      default:
        return 0;
    }
  });

  const total = filteredDecks.length;

  // Apply pagination
  const { limit, offset } = pagination;
  const paginatedDecks = filteredDecks.slice(offset, offset + limit);

  return {
    data: paginatedDecks,
    total,
  };
}

/**
 * Mock implementation of getDeckById for development/testing.
 * Simulates fetching a single deck by ID without database access.
 *
 * @param deckId - UUID of the deck to retrieve
 * @returns Promise with deck details or null if not found
 */
export async function getDeckByIdMock(deckId: string): Promise<DeckDetailDTO | null> {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 50));

  // Find deck in mock data
  const deck = MOCK_DECKS.find((d) => d.id === deckId);

  // Return null if not found (simulates 404)
  if (!deck) {
    return null;
  }

  // Return deck as DeckDetailDTO (currently same as DeckListItemDTO)
  return deck;
}
