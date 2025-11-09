# GET /api/decks

## Description

Retrieves a paginated list of decks for the authenticated user. Supports filtering by deck status and sorting by various fields.

## Authentication

**Required:** Yes

The endpoint requires a valid Supabase authentication token. Users can only access their own decks.

## Endpoint

```
GET /api/decks
```

## Query Parameters

| Parameter | Type   | Required | Default           | Description                                                                              |
| --------- | ------ | -------- | ----------------- | ---------------------------------------------------------------------------------------- |
| `status`  | string | No       | -                 | Filter decks by status. Allowed values: `draft`, `published`, `rejected`                 |
| `limit`   | number | No       | 20                | Number of items per page. Min: 1, Max: 100                                               |
| `offset`  | number | No       | 0                 | Starting position for pagination. Min: 0                                                 |
| `sort`    | string | No       | `created_at_desc` | Sort order. Allowed values: `created_at_asc`, `created_at_desc`, `name_asc`, `name_desc` |

## Response

### Success Response (200 OK)

```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Spanish Vocabulary",
      "slug": "spanish-vocabulary",
      "status": "published",
      "published_at": "2024-01-15T10:30:00Z",
      "rejected_at": null,
      "rejected_reason": null,
      "card_count": 15,
      "created_at": "2024-01-10T08:00:00Z",
      "updated_at": "2024-01-15T10:30:00Z"
    },
    {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "name": "JavaScript Concepts",
      "slug": "javascript-concepts",
      "status": "draft",
      "published_at": null,
      "rejected_at": null,
      "rejected_reason": null,
      "card_count": 8,
      "created_at": "2024-01-12T14:20:00Z",
      "updated_at": "2024-01-12T14:20:00Z"
    }
  ],
  "pagination": {
    "limit": 20,
    "offset": 0,
    "total": 42
  }
}
```

### Error Responses

#### 401 Unauthorized

User is not authenticated.

```json
{
  "error": "unauthorized",
  "message": "Authentication required"
}
```

#### 400 Bad Request

Invalid query parameters.

```json
{
  "error": "validation_error",
  "message": "Expected number, received nan"
}
```

#### 500 Internal Server Error

Server error occurred while processing the request.

```json
{
  "error": "internal_server_error",
  "message": "Failed to fetch decks. Please try again later."
}
```

## Examples

### Basic Request

Fetch the first 20 decks sorted by creation date (newest first):

```bash
curl -X GET "https://example.com/api/decks" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Filter by Status

Fetch only published decks:

```bash
curl -X GET "https://example.com/api/decks?status=published" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Pagination with Custom Limit

Fetch 10 decks starting from position 20:

```bash
curl -X GET "https://example.com/api/decks?limit=10&offset=20" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Sort by Name

Fetch decks sorted alphabetically by name (ascending):

```bash
curl -X GET "https://example.com/api/decks?sort=name_asc" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Combined Filters

Fetch draft decks, sorted by name, with pagination:

```bash
curl -X GET "https://example.com/api/decks?status=draft&sort=name_asc&limit=5&offset=0" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Response Fields

### Deck Object

| Field             | Type           | Description                                         |
| ----------------- | -------------- | --------------------------------------------------- |
| `id`              | string (UUID)  | Unique identifier for the deck                      |
| `name`            | string         | Name of the deck                                    |
| `slug`            | string         | URL-friendly version of the deck name               |
| `status`          | string         | Current status: `draft`, `published`, or `rejected` |
| `published_at`    | string \| null | ISO 8601 timestamp when deck was published          |
| `rejected_at`     | string \| null | ISO 8601 timestamp when deck was rejected           |
| `rejected_reason` | string \| null | Reason for rejection (if applicable)                |
| `card_count`      | number         | Number of active cards in the deck                  |
| `created_at`      | string         | ISO 8601 timestamp when deck was created            |
| `updated_at`      | string         | ISO 8601 timestamp when deck was last updated       |

### Pagination Object

| Field    | Type   | Description                                        |
| -------- | ------ | -------------------------------------------------- |
| `limit`  | number | Number of items requested per page                 |
| `offset` | number | Starting position in the result set                |
| `total`  | number | Total number of decks matching the filter criteria |

## Notes

- Soft-deleted decks (where `deleted_at` is not null) are automatically excluded from results
- Cards marked as deleted are not included in `card_count`
- Only decks belonging to the authenticated user are returned
- Default sort order is `created_at_desc` (newest first)
- Maximum limit is 100 items per page to prevent performance issues
