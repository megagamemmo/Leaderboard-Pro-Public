import { fetchCachedPublicLeaderboardSnapshot } from "@/lib/cache/public-leaderboard";
import { readLocalPublicSnapshot } from "@/lib/local-public-snapshots";
import { PublicLeaderboard } from "../../share/[slug]/public-leaderboard";

export const dynamic = "force-dynamic";

type LivePageProps = {
  params: Promise<{ slug: string }>;
};

export default async function LivePage({ params }: LivePageProps) {
  const { slug } = await params;
  const localSnapshot = await readLocalPublicSnapshot(slug);
  const result = localSnapshot
    ? {
        ok: true as const,
        snapshot: localSnapshot,
        updatedAt: localSnapshot.tournament.updatedAt,
      }
    : await fetchCachedPublicLeaderboardSnapshot(slug);

  return (
    <PublicLeaderboard
      slug={slug}
      initialSnapshot={result.ok ? result.snapshot : null}
      initialUpdatedAt={result.ok ? result.updatedAt : undefined}
      initialError={result.ok ? undefined : result.error}
    />
  );
}
