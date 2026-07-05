import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const url = new URL(request.url);
  const slug = url.searchParams.get("t")?.trim();
  if (!slug) {
    return NextResponse.json({ ok: false, error: "missing_slug" }, { status: 400 });
  }

  return NextResponse.redirect(new URL(`/live/${encodeURIComponent(slug)}`, url), 308);
}
