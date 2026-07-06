# Leaderboard Pro Public

Production-clean source for Leaderboard Pro.

This public project intentionally excludes local developer state, agent instructions,
MCP/Codex/Cursor settings, tests, artifacts, logs, private env files, Vercel links,
node_modules, and local simulator/admin tooling.

Runtime modes:

- Mode 1: Local Only, stored in browser/local runtime.
- Mode 2: Fixed TourSystem36 bridge, using the TS36 server proxy plus server-side RLS/RPC checks.
- Mode 3: Flexible cloud operator runtime hosted by TourSystem36 at `/leaderboard/manage`.

Secrets are not stored in this repository. Gemini and Supabase secret/service keys must stay
on the TourSystem36 server, Vercel environment, or Supabase Edge Function secrets.
