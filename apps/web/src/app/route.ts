import { serveLegacyAsset } from "@/lib/legacy-assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return serveLegacyAsset(["index.html"]);
}
