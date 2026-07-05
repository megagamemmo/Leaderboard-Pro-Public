"use client";

import { useEffect, useState } from "react";

export const AWARD_ASSET_URLS = {
  bestGross:
    "https://iiyqalfejxcszmmoelzw.supabase.co/storage/v1/object/public/leaderboard-public-assets/leaderboard-pro/awards/bestgross-v2.png",
  rank1:
    "https://iiyqalfejxcszmmoelzw.supabase.co/storage/v1/object/public/leaderboard-public-assets/leaderboard-pro/awards/rank1-v2.png",
  rank2:
    "https://iiyqalfejxcszmmoelzw.supabase.co/storage/v1/object/public/leaderboard-public-assets/leaderboard-pro/awards/rank2-v2.png",
  rank3:
    "https://iiyqalfejxcszmmoelzw.supabase.co/storage/v1/object/public/leaderboard-public-assets/leaderboard-pro/awards/rank3-v2.png",
} as const;

export type AwardAssetId = keyof typeof AWARD_ASSET_URLS;

const AWARD_CACHE_NAME = "lbpro-awards-v2";
const EMPTY_ASSETS: Record<AwardAssetId, string | null> = {
  bestGross: null,
  rank1: null,
  rank2: null,
  rank3: null,
};

export function useAwardAssetUrls(enabled: boolean) {
  const [assetUrls, setAssetUrls] = useState(EMPTY_ASSETS);

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    const objectUrls: string[] = [];

    const loadAssets = async () => {
      if (!("caches" in window)) {
        setAssetUrls(AWARD_ASSET_URLS);
        return;
      }

      try {
        const cache = await window.caches.open(AWARD_CACHE_NAME);
        const entries = await Promise.all(
          (Object.entries(AWARD_ASSET_URLS) as Array<[AwardAssetId, string]>).map(
            async ([id, remoteUrl]) => {
              let response = await cache.match(remoteUrl);
              if (!response) {
                response = await fetch(remoteUrl, { cache: "force-cache", mode: "cors" });
                if (!response.ok) throw new Error(`award_asset_${response.status}`);
                await cache.put(remoteUrl, response.clone());
              }
              const objectUrl = URL.createObjectURL(await response.blob());
              objectUrls.push(objectUrl);
              return [id, objectUrl] as const;
            },
          ),
        );

        if (disposed) {
          objectUrls.forEach((url) => URL.revokeObjectURL(url));
          return;
        }
        setAssetUrls(Object.fromEntries(entries) as Record<AwardAssetId, string>);
      } catch {
        if (!disposed) setAssetUrls(AWARD_ASSET_URLS);
      }
    };

    void loadAssets();
    return () => {
      disposed = true;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [enabled]);

  return assetUrls;
}
