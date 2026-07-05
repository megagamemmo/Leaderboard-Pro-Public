import { serveLegacyAsset } from "@/lib/legacy-assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { path } = await context.params;
  return serveLegacyAsset(path || []);
}
