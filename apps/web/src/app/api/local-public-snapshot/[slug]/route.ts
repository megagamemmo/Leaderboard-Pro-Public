import { NextResponse } from "next/server";
import {
  deleteLocalPublicSnapshot,
  deleteSimulatorLocalPublicSnapshots,
  readLocalPublicSnapshot,
  writeLocalPublicSnapshot,
} from "@/lib/local-public-snapshots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

const noStoreHeaders = {
  "Access-Control-Allow-Headers": "Accept, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store, max-age=0",
};

export async function GET(_request: Request, context: RouteContext) {
  const { slug } = await context.params;
  const snapshot = await readLocalPublicSnapshot(slug);
  if (!snapshot) {
    return NextResponse.json(
      { ok: false, error: "snapshot_not_found" },
      { status: 404, headers: noStoreHeaders },
    );
  }
  return NextResponse.json(
    { ok: true, snapshot, updatedAt: snapshot.tournament.updatedAt || "" },
    { headers: noStoreHeaders },
  );
}

export async function POST(request: Request, context: RouteContext) {
  const { slug } = await context.params;
  try {
    const snapshot = await writeLocalPublicSnapshot(await request.json(), slug);
    if (!snapshot) {
      return NextResponse.json(
        { ok: false, error: "invalid_snapshot" },
        { status: 400, headers: noStoreHeaders },
      );
    }
    return NextResponse.json(
      { ok: true, shareSlug: snapshot.shareSlug, updatedAt: snapshot.tournament.updatedAt || "" },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    console.error("[local-public-snapshot] publish failed", { slug, error: String(error) });
    return NextResponse.json(
      { ok: false, error: "publish_failed" },
      { status: 500, headers: noStoreHeaders },
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const { slug } = await context.params;
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("scope") === "simulator") {
      const deleted = await deleteSimulatorLocalPublicSnapshots();
      return NextResponse.json({ ok: true, deleted }, { headers: noStoreHeaders });
    }

    const deleted = await deleteLocalPublicSnapshot(slug, {
      simulatorOnly: url.searchParams.get("simulatorOnly") === "1",
    });
    return NextResponse.json({ ok: true, deleted }, { headers: noStoreHeaders });
  } catch (error) {
    console.error("[local-public-snapshot] delete failed", { slug, error: String(error) });
    return NextResponse.json(
      { ok: false, error: "delete_failed" },
      { status: 500, headers: noStoreHeaders },
    );
  }
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: noStoreHeaders });
}
