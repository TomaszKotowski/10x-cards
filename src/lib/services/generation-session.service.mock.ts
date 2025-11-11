import type { GenerationSessionDTO, GenerationSessionListItemDTO, GetGenerationSessionsQueryDTO } from "@/types";

/**
 * Mock data for development and testing.
 * Simulates realistic generation sessions with various statuses.
 */
const MOCK_SESSIONS: GenerationSessionDTO[] = [
  // Completed sessions
  {
    id: "123e4567-e89b-12d3-a456-426614174000",
    user_id: "00000000-0000-0000-0000-000000000001",
    deck_id: "10000000-0000-0000-0000-000000000001",
    status: "completed",
    started_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    finished_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 45 * 1000).toISOString(),
    params: { model: "gpt-4", temperature: 0.7 },
    truncated_count: 0,
    error_code: null,
    error_message: null,
  },
  {
    id: "223e4567-e89b-12d3-a456-426614174000",
    user_id: "00000000-0000-0000-0000-000000000001",
    deck_id: "10000000-0000-0000-0000-000000000002",
    status: "completed",
    started_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    finished_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000 + 62 * 1000).toISOString(),
    params: { model: "gpt-4", temperature: 0.7 },
    truncated_count: 2,
    error_code: null,
    error_message: null,
  },
  {
    id: "323e4567-e89b-12d3-a456-426614174000",
    user_id: "00000000-0000-0000-0000-000000000001",
    deck_id: "10000000-0000-0000-0000-000000000004",
    status: "completed",
    started_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    finished_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000 + 38 * 1000).toISOString(),
    params: { model: "gpt-4", temperature: 0.7 },
    truncated_count: 0,
    error_code: null,
    error_message: null,
  },

  // In-progress session
  {
    id: "423e4567-e89b-12d3-a456-426614174000",
    user_id: "00000000-0000-0000-0000-000000000001",
    deck_id: "10000000-0000-0000-0000-000000000003",
    status: "in_progress",
    started_at: new Date(Date.now() - 30 * 1000).toISOString(),
    finished_at: null,
    params: { model: "gpt-4", temperature: 0.7 },
    truncated_count: null,
    error_code: null,
    error_message: null,
  },

  // Failed session
  {
    id: "523e4567-e89b-12d3-a456-426614174000",
    user_id: "00000000-0000-0000-0000-000000000001",
    deck_id: "10000000-0000-0000-0000-000000000007",
    status: "failed",
    started_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    finished_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 + 15 * 1000).toISOString(),
    params: { model: "gpt-4", temperature: 0.7 },
    truncated_count: null,
    error_code: "api_error",
    error_message: "OpenRouter API rate limit exceeded",
  },

  // Timeout session
  {
    id: "623e4567-e89b-12d3-a456-426614174000",
    user_id: "00000000-0000-0000-0000-000000000001",
    deck_id: "10000000-0000-0000-0000-000000000008",
    status: "timeout",
    started_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
    finished_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000 + 5 * 60 * 1000).toISOString(),
    params: { model: "gpt-4", temperature: 0.7 },
    truncated_count: null,
    error_code: "timeout",
    error_message: "Generation exceeded maximum time limit (5 minutes)",
  },
];

/**
 * Mock deck names for JOIN simulation
 */
const MOCK_DECK_NAMES: Record<string, string> = {
  "10000000-0000-0000-0000-000000000001": "Historia Polski - Średniowiecze",
  "10000000-0000-0000-0000-000000000002": "Matematyka - Pochodne",
  "10000000-0000-0000-0000-000000000003": "Angielski - Phrasal Verbs",
  "10000000-0000-0000-0000-000000000004": "Fizyka - Mechanika",
  "10000000-0000-0000-0000-000000000007": "Biologia - Komórka",
  "10000000-0000-0000-0000-000000000008": "Informatyka - Algorytmy",
};

/**
 * Result type for listUserSessionsMock function.
 */
interface ListUserSessionsResult {
  data: GenerationSessionListItemDTO[];
  total: number;
}

/**
 * Mock implementation of getSessionById.
 * Returns a single generation session by ID.
 *
 * @param sessionId - UUID of the session to retrieve
 * @returns Promise with the session DTO or null if not found
 */
export async function getSessionByIdMock(sessionId: string): Promise<GenerationSessionDTO | null> {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 50));

  const session = MOCK_SESSIONS.find((s) => s.id === sessionId);
  return session || null;
}

/**
 * Mock implementation of listUserSessions.
 * Returns a paginated list of generation sessions with filtering.
 *
 * @param filters - Query parameters for filtering and pagination
 * @returns Promise with paginated session list
 */
export async function listUserSessionsMock(filters: GetGenerationSessionsQueryDTO): Promise<ListUserSessionsResult> {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 100));

  const { limit = 20, offset = 0, status } = filters;

  // Filter by status if provided
  let filteredSessions = MOCK_SESSIONS;
  if (status) {
    filteredSessions = MOCK_SESSIONS.filter((s) => s.status === status);
  }

  // Sort by created_at DESC (most recent first)
  // Note: We don't have created_at in DTO, so we use started_at as proxy
  const sortedSessions = [...filteredSessions].sort((a, b) => {
    return new Date(b.started_at).getTime() - new Date(a.started_at).getTime();
  });

  // Apply pagination
  const paginatedSessions = sortedSessions.slice(offset, offset + limit);

  // Transform to list item DTOs (simulate JOIN with decks table)
  const listItems: GenerationSessionListItemDTO[] = paginatedSessions.map((session) => ({
    id: session.id,
    deck_id: session.deck_id,
    status: session.status,
    started_at: session.started_at,
    finished_at: session.finished_at,
    truncated_count: session.truncated_count,
    error_code: session.error_code,
    deck_name: MOCK_DECK_NAMES[session.deck_id] || "Unknown Deck",
  }));

  return {
    data: listItems,
    total: filteredSessions.length,
  };
}
