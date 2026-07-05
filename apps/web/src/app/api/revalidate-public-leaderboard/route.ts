import {
  publicLeaderboardRevalidateOptions,
  revalidatePublicLeaderboard,
} from "@/lib/cache/revalidate-public-leaderboard";

export const runtime = "nodejs";

export const POST = revalidatePublicLeaderboard;
export const OPTIONS = publicLeaderboardRevalidateOptions;
