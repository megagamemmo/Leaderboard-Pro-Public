import { NextResponse } from "next/server";
import {
  deleteLocalPublicSnapshot,
  deleteSimulatorLocalPublicSnapshots,
  isLocalSnapshotRuntimeEnabled,
  readLocalPublicSnapshot,
  writeLocalPublicSnapshot,
} from "@/lib/local-public-snapshots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

const baseNoStoreHeaders = {
  "Access-Control-Allow-Headers": "Accept, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Cache-Control": "no-store, max-age=0",
};

function getHeaders(request?: Request) {
  const requestOrigin = request?.headers.get("origin") || "";
  const ownOrigin = request ? new URL(request.url).origin : "";
  return {
    ...baseNoStoreHeaders,
    ...(requestOrigin && requestOrigin === ownOrigin
      ? { "Access-Control-Allow-Origin": requestOrigin, Vary: "Origin" }
      : {}),
  };
}

function runtimeUnavailable(request?: Request) {
  return NextResponse.json(
    { ok: false, error: "local_snapshot_runtime_disabled" },
    { status: 404, headers: getHeaders(request) },
  );
}

function writeOriginAllowed(request: Request) {
  const requestOrigin = request.headers.get("origin") || "";
  return !requestOrigin || requestOrigin === new URL(request.url).origin;
}

export async function GET(request: Request, context: RouteContext) {
  if (!isLocalSnapshotRuntimeEnabled()) return runtimeUnavailable(request);
  const { slug } = await context.params;
  const snapshot = await readLocalPublicSnapshot(slug);
  if (!snapshot) {
    return NextResponse.json(
      { ok: false, error: "snapshot_not_found" },
      { status: 404, headers: getHeaders(request) },
    );
  }
  return NextResponse.json(
    { ok: true, snapshot, updatedAt: snapshot.tournament.updatedAt || "" },
    { headers: getHeaders(request) },
  );
}

export async function POST(request: Request, context: RouteContext) {
  if (!isLocalSnapshotRuntimeEnabled()) return runtimeUnavailable(request);
  if (!writeOriginAllowed(request)) {
    return NextResponse.json({ ok: false, error: "origin_not_allowed" }, { status: 403, headers: getHeaders(request) });
  }
  const { slug } = await context.params;
  try {
    const snapshot = await writeLocalPublicSnapshot(await request.json(), slug);
    if (!snapshot) {
      return NextResponse.json(
        { ok: false, error: "invalid_snapshot" },
        { status: 400, headers: getHeaders(request) },
      );
    }
    return NextResponse.json(
      { ok: true, shareSlug: snapshot.shareSlug, updatedAt: snapshot.tournament.updatedAt || "" },
      { headers: getHeaders(request) },
    );
  } catch (error) {
    console.error("[local-public-snapshot] publish failed", { slug, error: String(error) });
    return NextResponse.json(
      { ok: false, error: "publish_failed" },
      { status: 500, headers: getHeaders(request) },
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  if (!isLocalSnapshotRuntimeEnabled()) return runtimeUnavailable(request);
  if (!writeOriginAllowed(request)) {
    return NextResponse.json({ ok: false, error: "origin_not_allowed" }, { status: 403, headers: getHeaders(request) });
  }
  const { slug } = await context.params;
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("scope") === "simulator") {
      const deleted = await deleteSimulatorLocalPublicSnapshots();
      return NextResponse.json({ ok: true, deleted }, { headers: getHeaders(request) });
    }

    const deleted = await deleteLocalPublicSnapshot(slug, {
      simulatorOnly: url.searchParams.get("simulatorOnly") === "1",
    });
    return NextResponse.json({ ok: true, deleted }, { headers: getHeaders(request) });
  } catch (error) {
    console.error("[local-public-snapshot] delete failed", { slug, error: String(error) });
    return NextResponse.json(
      { ok: false, error: "delete_failed" },
      { status: 500, headers: getHeaders(request) },
    );
  }
}

export function OPTIONS(request: Request) {
  if (!isLocalSnapshotRuntimeEnabled()) return new NextResponse(null, { status: 404, headers: getHeaders(request) });
  if (!writeOriginAllowed(request)) return new NextResponse(null, { status: 403, headers: getHeaders(request) });
  return new NextResponse(null, { status: 204, headers: getHeaders(request) });
}
