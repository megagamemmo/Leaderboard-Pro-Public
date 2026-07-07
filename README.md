# Leaderboard Pro Public

Production-clean source for Leaderboard Pro.

This public project intentionally excludes local developer state, agent instructions,
MCP/Codex/Cursor settings, tests, artifacts, logs, private env files, Vercel links,
node_modules, simulator2/admin lab tooling, and local-only development services.

Runtime modes:

- Mode 1 Free: local runtime, no paid order, and self-hosted live React export only.
- Mode 2 Basic: paid fixed TourSystem36 bridge with online and LAN live.
- Mode 3 Pro: paid flexible cloud operator runtime hosted by TourSystem36 at `/leaderboard/manage`.
- Mode 3+ Pro+: paid Mode 3 runtime with tournament-wide sync included.

Secrets are not stored in this repository. Gemini and Supabase secret/service keys must stay
on the TourSystem36 server, Vercel environment, or Supabase Edge Function secrets.
