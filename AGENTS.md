# Repository Guidelines

## Project Structure & Module Organization
- `src/pages/` Astro routes; `src/components/` React + shadcn/ui; `src/layouts/` shared templates.
- `src/lib/` utilities (e.g., Supabase client); `public/` static assets.
- `.ai/` product docs (e.g., `prd.md`, `tech-stack.md`).
- `supabase/migrations/` SQL migrations; `scripts/` developer tooling.

## Build, Test, and Development Commands
- `npm ci` install exact, pinned dependencies.
- `npm run dev` start local Astro dev server.
- `npm run build` production build; `npm run preview` serve built app.
- `npm run lint` run ESLint; `npm run typecheck` run TypeScript in noEmit mode.
- `npm test` run unit tests (Vitest) if present.
- Supabase (local): `supabase start`, `supabase db reset`, `supabase migration new <name>`.

## Coding Style & Naming Conventions
- TypeScript strict, 2‑space indentation, no unused exports.
- Prettier + ESLint (recommended + TypeScript). Keep imports ordered and grouped.
- Filenames: React components `PascalCase.tsx`; Astro pages `kebab-case.astro`.
- Styling: Tailwind utility‑first; prefer `cn()` helper for conditional classes.
- Do not downgrade/upgrade framework versions without approval (versions are pinned).

## Testing Guidelines
- Unit tests with Vitest: `*.test.ts(x)` colocated with source or under `tests/`.
- Focus on: input validation (10k chars), card length checks (<=200), draft publish rules, AI result clipping (<=20).
- Optional later: Playwright e2e for learn flow and auth.

## Commit & Pull Request Guidelines
- Use Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`.
- PRs: concise description, linked issue, screenshots for UI changes, notes on DB migrations and breaking changes, manual test plan.
- Keep PRs small and focused; update `.ai/tech-stack.md` or docs when behavior changes.

## Security & Configuration Tips
- Secrets server‑only: `OPENROUTER_API_KEY`, Supabase service role; never expose to browser.
- Env: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (client); service keys only in server/runtime.
- CORS restricted to known origins; TLS via reverse proxy in production.
- RLS/polityki: planned for later—enforce DB constraints and unique indexes now.

## Agent‑Specific Instructions
- Scope: this file governs the entire repo.
- Respect pinned versions; avoid adding heavy dependencies without discussion.
- When touching DB, add a migration under `supabase/migrations/` and document changes.
- Keep changes minimal and aligned with PRD; prefer simple, testable implementations.

