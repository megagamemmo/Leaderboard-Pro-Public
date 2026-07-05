import { unstable_cache } from "next/cache";
import { fetchPublicLeaderboardSnapshot } from "@/lib/supabase/public-leaderboard";

const DEFAULT_PUBLIC_CACHE_SECONDS = 300;
const DEFAULT_PUBLIC_STALE_SECONDS = 300;

function readPositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

export const publicLeaderboardCacheSeconds = readPositiveInt(
  process.env.PUBLIC_LEADERBOARD_CACHE_SECONDS,
  DEFAULT_PUBLIC_CACHE_SECONDS,
);

export const publicLeaderboardStaleSeconds = readPositiveInt(
  process.env.PUBLIC_LEADERBOARD_STALE_SECONDS,
  DEFAULT_PUBLIC_STALE_SECONDS,
);

export function normalizePublicLeaderboardSlug(slug: string) {
  return String(slug || "").trim().toLowerCase();
}

export function getPublicLeaderboardCacheTag(slug: string) {
  return `public-leaderboard:${normalizePublicLeaderboardSlug(slug)}`;
}

export function getPublicLeaderboardCacheHeaders() {
  const cdnValue = `public, s-maxage=${publicLeaderboardCacheSeconds}, stale-while-revalidate=${publicLeaderboardStaleSeconds}`;
  return {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=0, must-revalidate",
    "CDN-Cache-Control": cdnValue,
    "Vercel-CDN-Cache-Control": cdnValue,
  };
}

export async function fetchCachedPublicLeaderboardSnapshot(slug: string) {
  const cleanSlug = String(slug || "").trim();
  const cacheSlug = normalizePublicLeaderboardSlug(slug);
  return unstable_cache(
    () => fetchPublicLeaderboardSnapshot(cleanSlug),
    ["public-leaderboard-snapshot", cacheSlug],
    {
      revalidate: publicLeaderboardCacheSeconds,
      tags: [getPublicLeaderboardCacheTag(cacheSlug)],
    },
  )();
}
