export const operatorArchitecture = {
  role: "local-first tournament operations",
  sourceOfTruth: "operator-confirmed scores",
  publicReadPath: "Vercel cached JSON/API before Supabase direct reads",
  writePath: "Leaderboard Pro local state -> bridge RPC -> Supabase snapshot tables",
  realtimePolicy:
    "Operator polling is allowed for staging scores; public viewers must not use Supabase Realtime by default.",
  rosterPolicy:
    "Roster stays local until the operator explicitly publishes it with the roster action.",
} as const;

export const bridgeCadence = {
  scorePollMs: 10000,
  participantPollMs: 60000,
  catalogPollMs: 60000,
  autoPublishSnapshotMs: 300000,
  publicCacheSeconds: 300,
  publicStaleWhileRevalidateSeconds: 300,
} as const;

export const divisionScoringRules = {
  professionalMode: "handicap",
  system36Mode: "system36",
  overlapPolicy:
    "HCP ranges cannot overlap inside the same gender and scoring mode; WHS and S36 tracks may reuse ranges.",
  ts36ClaimPolicy:
    "TS36 users can only claim roster golfers in GO-created divisions marked S36.",
  publishPolicy:
    "Public snapshots contain operator-confirmed scores only; pending TS36 submissions stay in staging.",
} as const;
