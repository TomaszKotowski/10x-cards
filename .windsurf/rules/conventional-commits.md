# Conventional Commits Specification for Zed

This document provides guidance for Zed to generate commit messages following the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) specification (v1.0.0). When asked to write or suggest commit messages, use this structure to ensure they are structured, semantic, and machine-readable.

## Core Structure

Every commit message MUST follow this format:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Key Elements

- **`<type>`** (REQUIRED): A noun that indicates the kind of change. Use lowercase letters. Common types:
  - `feat`: A new feature (corresponds to MINOR in SemVer).
  - `fix`: A bug fix (corresponds to PATCH in SemVer).
  - Other allowed types (no SemVer impact unless breaking):
    - `docs`: Documentation changes.
    - `style`: Formatting, missing semicolons, etc. (no code change).
    - `refactor`: Code changes that neither fix a bug nor add a feature.
    - `test`: Adding missing tests or correcting broken tests.
    - `build`: Changes that affect the build system or external dependencies.
    - `ci`: Changes to CI configuration files and scripts.
    - `chore`: Other changes that don't modify source or test files.
    - `perf`: Performance improvements.
    - `revert`: Reverting previous commits.

- **`[optional scope]`**: An optional noun in parentheses after the type, describing the part of the codebase affected (e.g., `(api)`, `(ui)`, `(parser)`). Keep it concise and relevant to the project structure (e.g., `frontend`, `backend`, `db`).

- **`<description>`** (REQUIRED): A short summary (50 characters max preferred). Use imperative, present tense: "add", "fix", "update" (not "added", "fixed"). Start with a capital letter? No, conventional is lowercase start after the colon.

- **`[optional body]`**: Longer explanation of the change. Use bullet points if needed. Separate from description with a blank line. Explain motivation and context.

- **`[optional footer(s)]`**: Additional info, like references or breaking changes. Use git trailer format (e.g., `Refs: #123` or `Signed-off-by: Name`).

## Handling Breaking Changes

Breaking changes (correspond to MAJOR in SemVer) MUST be indicated in one of two ways:

1. **In the type prefix**: Append `!` before the colon (e.g., `feat!: ...` or `feat(api)!: ...`).
2. **In the footer**: Use `BREAKING CHANGE:` followed by a description (uppercase, with colon and space).

If using `!`, the description should explain the breaking change, and the footer can be omitted.

### Examples of Breaking Changes

```
feat!: remove deprecated APIs

BREAKING CHANGE: The old endpoints are no longer supported; migrate to v2.
```

```
fix(api)!: change response format from XML to JSON
```

```
chore!: drop Node.js v14 support

BREAKING CHANGE: Requires Node.js v16+ for new ES features.
```

## Full Examples

### Simple Feature

```
feat: add user authentication flow
```

### Feature with Scope and Body

```
feat(ui): implement dark mode toggle

Add a button in the navbar to switch between light and dark themes.
Uses Tailwind's dark: variant for styling.
Supports persistence via localStorage.
```

### Bug Fix with Scope

```
fix(backend): resolve race condition in Supabase queries

Prevent concurrent requests from overwriting data by adding request IDs.
```

### Documentation Update

```
docs: update API endpoint descriptions in README
```

### Refactor with Body and Footer

```
refactor(lib): extract validation logic into Zod schemas

- Move inline validation to dedicated functions in src/lib/validation.ts
- Update API routes to use new schemas
- Improves maintainability and type safety

Refs: #456
```

### Multi-Paragraph Body

```
fix: handle empty arrays in form submissions

Previously, empty arrays caused validation errors in React forms.
Now we validate length only when the array is non-empty.

This aligns with shadcn/ui component expectations and prevents crashes
during optimistic updates.

Reviewed-by: Team Lead
```

### Revert Example

```
revert: undo accidental merge of feature branch

Refs: abc1234
```

## Guidelines for Zed

- **When generating commits**: Analyze the changes (diff, files modified) to determine the appropriate type. If unsure, default to `chore` or ask for clarification.
- **Be precise**: Match the type to the change's intent. Split large changes into multiple commits if they fit multiple types.
- **Imperative mood**: Always use present tense (e.g., "fix bug" not "fixed bug").
- **Consistency**: Use scopes based on project structure (e.g., `astro`, `react`, `supabase` from your tech stack).
- **Length**: Keep description under 72 characters for the first line. Body lines under 100.
- **Edge cases**: For initial commits or complex reverts, use `chore` or `revert` as appropriate. Always validate against SemVer implications.
- **No unrelated changes**: Commits should be atomic; group related changes but not unrelated ones.
- **Project fit**: Reference relevant parts of the tech stack (Astro, React, Supabase, Tailwind) in scopes or descriptions.

## Why This Matters

- Enables automatic changelog generation.
- Supports semantic versioning for releases.
- Improves team collaboration and history readability.
- Integrates with tools like commitlint for enforcement.

Follow this spec strictly when Zed suggests or writes commits in the 10x-cards workspace. For full details, see the [official spec](https://www.conventionalcommits.org/en/v1.0.0/).

License: This is based on Creative Commons - CC BY 3.0.
