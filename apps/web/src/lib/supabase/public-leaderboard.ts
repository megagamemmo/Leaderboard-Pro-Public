import { createClient } from "@supabase/supabase-js";
import type {
  PublicFinalResults,
  PublicLeaderboardFetchResult,
  PublicLeaderboardState,
} from "@/lib/contracts/public-leaderboard";
import { buildPublicLeaderboardRankingResult } from "@/lib/contracts/leaderboard-ranking";

const DEFAULT_PUBLIC_STATE_BASE_URL = "https://system36.vercel.app";
const DEFAULT_PUBLIC_REFRESH_MS = 300_000;
const MIN_PUBLIC_REFRESH_MS = 5_000;
const MAX_PUBLIC_REFRESH_MS = 300_000;

function getSupabasePublicConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) return null;
  return { url, anonKey };
}

function normalizeMs(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(MAX_PUBLIC_REFRESH_MS, Math.max(MIN_PUBLIC_REFRESH_MS, Math.trunc(parsed)));
}

function normalizeCount(value: unknown, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(0, Math.trunc(parsed)));
}

function normalizeRangeMs(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function normalizePrizeList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function normalizeSnapshotSync(snapshot: Partial<PublicLeaderboardState>) {
  const source = snapshot as Partial<PublicLeaderboardState> & {
    operator?: { scorePollMs?: unknown; snapshotAutoPublishMs?: unknown };
    publicPollMs?: unknown;
    publicRefreshMs?: unknown;
    snapshotAutoPublishMs?: unknown;
  };
  const sync = source.sync || {};
  const simulatorRefreshMs = normalizeMs(
    sync.simulatorRefreshMs ?? source.simulator?.debugRefreshMs,
    DEFAULT_PUBLIC_REFRESH_MS,
  );
  const snapshotAutoPublishMs = normalizeMs(
    sync.snapshotAutoPublishMs ??
      source.snapshotAutoPublishMs ??
      source.operator?.snapshotAutoPublishMs,
    DEFAULT_PUBLIC_REFRESH_MS,
  );
  const publicRefreshMs = normalizeMs(
    (source.simulator ? simulatorRefreshMs : undefined) ??
      sync.publicRefreshMs ??
      sync.publicPollMs ??
      source.publicRefreshMs ??
      source.publicPollMs,
    snapshotAutoPublishMs,
  );
  const scorePollMs = normalizeMs(
    sync.scorePollMs ?? source.operator?.scorePollMs,
    DEFAULT_PUBLIC_REFRESH_MS,
  );
  return {
    scorePollMs,
    snapshotAutoPublishMs,
    publicRefreshMs,
    publicPollMs: publicRefreshMs,
    liveNotificationDisplayMs: normalizeRangeMs(
      sync.liveNotificationDisplayMs,
      3_800,
      2_400,
      8_000,
    ),
    liveNotificationMaxAgeMs: normalizeRangeMs(
      sync.liveNotificationMaxAgeMs,
      45 * 60 * 1000,
      60_000,
      6 * 60 * 60 * 1000,
    ),
    liveNotificationMaxItems: normalizeCount(
      sync.liveNotificationMaxItems,
      20,
      48,
    ),
    liveNotificationRetentionMode:
      sync.liveNotificationRetentionMode === "count" ? "count" as const : "time" as const,
    ...(source.simulator ? { simulatorRefreshMs } : {}),
  };
}

function normalizeFinalResults(value: unknown): PublicFinalResults | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Partial<PublicFinalResults> & {
    holeInOneAwards?: Array<Partial<PublicFinalResults["holeInOneAwards"][number]>>;
  };
  if (source.status !== "published") return undefined;
  const holeInOneAwards = Array.isArray(source.holeInOneAwards)
    ? source.holeInOneAwards
        .map((award, index) => ({
          slot: Number(award?.slot) || index + 1,
          playerId: String(award?.playerId || ""),
          hole: String(award?.hole || "").trim(),
          prizes: normalizePrizeList(award?.prizes),
        }))
        .filter((award) => award.playerId && award.hole && award.prizes.length > 0)
    : [];
  return {
    status: "published",
    publishedAt: String(source.publishedAt || ""),
    rankingScope: source.rankingScope === "gender" ? "gender" : "division",
    bestGrossPlayerId: String(source.bestGrossPlayerId || ""),
    podiums: Array.isArray(source.podiums) ? source.podiums : [],
    technicalGenderMode: source.technicalGenderMode === "separate" ? "separate" : "combined",
    technicalAwardCounts: source.technicalAwardCounts,
    longestDrive: Array.isArray(source.longestDrive) ? source.longestDrive : [],
    nearestToPin: Array.isArray(source.nearestToPin) ? source.nearestToPin : [],
    nearToTheLine: Array.isArray(source.nearToTheLine) ? source.nearToTheLine : [],
    longestPutt: Array.isArray(source.longestPutt) ? source.longestPutt : [],
    holeInOneCount: normalizeCount(source.holeInOneCount, holeInOneAwards.length, 4),
    holeInOneAwards,
    specialAwards: Array.isArray(source.specialAwards) ? source.specialAwards : [],
  };
}

function normalizeSnapshot(value: unknown): PublicLeaderboardState | null {
  if (!value || typeof value !== "object") return null;
  const snapshot = value as Partial<PublicLeaderboardState>;
  if (!snapshot.shareSlug || !snapshot.tournament || !Array.isArray(snapshot.leaderboard)) {
    return null;
  }
  const courseHoles = snapshot.course?.holes || [];
  const ranking = buildPublicLeaderboardRankingResult(snapshot.leaderboard, courseHoles);
  return {
    version: Number(snapshot.version || 1),
    shareSlug: String(snapshot.shareSlug),
    tournament: {
      id: String(snapshot.tournament.id || snapshot.shareSlug),
      name: String(snapshot.tournament.name || "Leaderboard Pro"),
      operatorName: snapshot.tournament.operatorName || "",
      courseName: snapshot.tournament.courseName || "",
      startHole: Number(snapshot.tournament.startHole || 1),
      scoringFormat: snapshot.tournament.scoringFormat || "stroke_net",
      updatedAt: snapshot.tournament.updatedAt || "",
    },
    course: snapshot.course || { holes: [] },
    leaderboard: ranking.rankedRowsByDivisionMode,
    divisionLeaderboards: ranking.divisionLeaderboards,
    liveNotifications: Array.isArray(snapshot.liveNotifications) ? snapshot.liveNotifications : undefined,
    finalResults: normalizeFinalResults(snapshot.finalResults),
    sync: normalizeSnapshotSync(snapshot),
    simulator: snapshot.simulator,
    metrics: snapshot.metrics || {},
  };
}

function getPublicStateBaseUrl() {
  return String(
    process.env.PUBLIC_STATE_BASE_URL ||
      process.env.PUBLIC_LEADERBOARD_BASE_URL ||
      DEFAULT_PUBLIC_STATE_BASE_URL,
  ).replace(/\/+$/, "");
}

async function fetchCachedBridgeSnapshot(slug: string) {
  const endpoint = `${getPublicStateBaseUrl()}/api/tournament-state/${encodeURIComponent(slug)}`;
  try {
    const response = await fetch(endpoint, {
      headers: { Accept: "application/json" },
      next: { revalidate: 300 },
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      snapshot?: unknown;
      data?: { snapshot?: unknown };
      updatedAt?: string;
    };
    const snapshot = normalizeSnapshot(payload.snapshot || payload.data?.snapshot);
    return snapshot ? { snapshot, updatedAt: payload.updatedAt } : null;
  } catch {
    return null;
  }
}

export async function fetchPublicLeaderboardSnapshot(
  slug: string,
): Promise<PublicLeaderboardFetchResult> {
  const cleanSlug = slug.trim();
  if (!cleanSlug) return { ok: false, status: 400, error: "missing_slug" };

  const cached = await fetchCachedBridgeSnapshot(cleanSlug);
  if (cached) {
    return {
      ok: true,
      snapshot: cached.snapshot,
      updatedAt: cached.updatedAt || cached.snapshot.tournament.updatedAt,
    };
  }

  const config = getSupabasePublicConfig();
  if (!config) {
    return { ok: false, status: 503, error: "supabase_not_configured" };
  }

  const supabase = createClient(config.url, config.anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data, error } = await supabase
    .from("leaderboard_public_snapshots")
    .select("payload,updated_at")
    .ilike("share_slug", cleanSlug)
    .eq("is_public", true)
    .maybeSingle();

  if (error) {
    return { ok: false, status: 502, error: error.message };
  }

  const snapshot = normalizeSnapshot(data?.payload);
  if (!snapshot) return { ok: false, status: 404, error: "snapshot_not_found" };

  return { ok: true, snapshot, updatedAt: data?.updated_at || undefined };
}
