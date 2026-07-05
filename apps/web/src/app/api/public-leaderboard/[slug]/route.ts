import { NextResponse } from "next/server";
import {
  fetchCachedPublicLeaderboardSnapshot,
  getPublicLeaderboardCacheHeaders,
} from "@/lib/cache/public-leaderboard";
import { buildPublicLeaderboardRankingResult } from "@/lib/contracts/leaderboard-ranking";
import { readLocalPublicSnapshot } from "@/lib/local-public-snapshots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = {
  params: Promise<{ slug: string }>;
};

type PublicSnapshot = NonNullable<Awaited<ReturnType<typeof readLocalPublicSnapshot>>>;

const localSnapshotHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store, max-age=0",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
};

function getSnapshotTime(snapshot: PublicSnapshot | null, fallback = "") {
  const time = new Date(fallback || snapshot?.tournament.updatedAt || "").getTime();
  return Number.isFinite(time) ? time : 0;
}

function buildSnapshotResponse(
  snapshot: PublicSnapshot,
  updatedAt = "",
  cacheHeaders = getPublicLeaderboardCacheHeaders(),
) {
  const ranking = buildPublicLeaderboardRankingResult(
    snapshot.leaderboard,
    snapshot.course?.holes || [],
    snapshot.finalResults?.status === "published" ? snapshot.finalResults?.netCutLimit : undefined
  );
  return NextResponse.json(
    {
      ok: true,
      snapshot: {
        ...snapshot,
        leaderboard: ranking.rankedRowsByDivisionMode,
        divisionLeaderboards: ranking.divisionLeaderboards,
      },
      ranking,
      updatedAt: updatedAt || snapshot.tournament.updatedAt,
    },
    {
      headers: {
        ...cacheHeaders,
        "Access-Control-Allow-Headers": "Accept, Content-Type",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}

export async function GET(_request: Request, context: RouteContext) {
  const { slug } = await context.params;
  const [localSnapshot, result] = await Promise.all([
    readLocalPublicSnapshot(slug),
    fetchCachedPublicLeaderboardSnapshot(slug),
  ]);
  const publicSnapshot = result.ok ? result.snapshot : null;
  const publicUpdatedAt = result.ok ? result.updatedAt || "" : "";

  if (
    localSnapshot &&
    (!publicSnapshot || getSnapshotTime(localSnapshot) >= getSnapshotTime(publicSnapshot, publicUpdatedAt))
  ) {
    return buildSnapshotResponse(localSnapshot, "", localSnapshotHeaders);
  }

  if (publicSnapshot) {
    return buildSnapshotResponse(publicSnapshot, publicUpdatedAt);
  }

  const cacheHeaders = getPublicLeaderboardCacheHeaders();
  const error = result.ok ? "snapshot_not_found" : result.error;
  const status = result.ok ? 404 : result.status;
  return NextResponse.json(
    { ok: false, error },
    {
      status,
      headers: {
        ...cacheHeaders,
        "Access-Control-Allow-Headers": "Accept, Content-Type",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Headers": "Accept, Content-Type",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
