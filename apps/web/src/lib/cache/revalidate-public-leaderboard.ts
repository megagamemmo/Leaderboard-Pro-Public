import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import {
  getPublicLeaderboardCacheTag,
  normalizePublicLeaderboardSlug,
} from "@/lib/cache/public-leaderboard";

const CORS_HEADERS = {
  "Access-Control-Allow-Headers": "Accept, Authorization, Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store, max-age=0",
};

function json(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(CORS_HEADERS);
  new Headers(init.headers).forEach((value, key) => {
    headers.set(key, value);
  });
  const { headers: _headers, ...rest } = init;
  return NextResponse.json(body, {
    ...rest,
    headers,
  });
}

function getBearerToken(request: Request) {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

function getRevalidateSecret() {
  return (
    process.env.PUBLIC_STATE_REVALIDATE_TOKEN ||
    process.env.LEADERBOARD_REVALIDATE_TOKEN ||
    process.env.REVALIDATE_TOKEN ||
    ""
  ).trim();
}

export function publicLeaderboardRevalidateOptions() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function revalidatePublicLeaderboard(request: Request) {
  const body = await request.json().catch(() => ({}));
  const url = new URL(request.url);
  const slug = normalizePublicLeaderboardSlug(body.slug || url.searchParams.get("slug") || "");
  if (!slug) {
    return json({ ok: false, error: "missing_slug" }, { status: 400 });
  }

  const secret = getRevalidateSecret();
  if (!secret) {
    return json(
      { ok: false, error: "revalidate_secret_not_configured" },
      { status: 503 },
    );
  }

  const token = getBearerToken(request) || String(body.token || "").trim();
  if (token !== secret) {
    return json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const tag = getPublicLeaderboardCacheTag(slug);
  // @ts-ignore
  revalidateTag(tag);
  revalidatePath(`/api/public-leaderboard/${slug}`);
  revalidatePath(`/api/tournament-state/${slug}`);
  revalidatePath(`/live/${slug}`);
  revalidatePath(`/share/${slug}`);

  return json({
    ok: true,
    slug,
    tag,
    revalidatedAt: new Date().toISOString(),
  });
}
