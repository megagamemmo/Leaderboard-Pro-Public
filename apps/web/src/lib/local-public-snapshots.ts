import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import type { PublicLeaderboardState } from "@/lib/contracts/public-leaderboard";

function cleanSnapshotSlug(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, "")
    .slice(0, 80);
}

export function isLocalSnapshotRuntimeEnabled() {
  const configured = process.env.LB_ENABLE_LOCAL_SNAPSHOT_RUNTIME?.trim();
  if (/^(1|true|yes|on)$/i.test(configured || "")) return true;
  if (/^(0|false|no|off)$/i.test(configured || "")) return false;
  return process.env.VERCEL !== "1" && !process.env.VERCEL_ENV;
}

function getSnapshotDirectory() {
  const configured = process.env.LB_LAN_SNAPSHOT_DIR?.trim();
  if (configured) return path.resolve(/* turbopackIgnore: true */ configured);
  return path.join(/* turbopackIgnore: true */ tmpdir(), "leaderboard-pro", "lan-snapshots");
}

function getSnapshotPath(slug: string) {
  return path.join(getSnapshotDirectory(), `${slug}.json`);
}

async function resolveExistingSnapshotPath(cleanSlug: string) {
  const exactPath = getSnapshotPath(cleanSlug);
  try {
    await readFile(/* turbopackIgnore: true */ exactPath, "utf8");
    return exactPath;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const expectedName = `${cleanSlug}.json`.toLowerCase();
  try {
    const entries = await readdir(/* turbopackIgnore: true */ getSnapshotDirectory(), { withFileTypes: true });
    const match = entries.find(
      (entry) => entry.isFile() && entry.name.toLowerCase() === expectedName,
    );
    return match ? path.join(getSnapshotDirectory(), match.name) : "";
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return "";
  }
}

function isSimulatorPublicSnapshot(snapshot: PublicLeaderboardState) {
  return (
    snapshot.simulator?.localOnly === true ||
    snapshot.tournament?.operatorName === "LB Simulator" ||
    /^SIM Blind Competition\b/i.test(snapshot.tournament?.name || "")
  );
}

export function normalizeLocalPublicSnapshot(
  value: unknown,
  fallbackSlug = "",
): PublicLeaderboardState | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<PublicLeaderboardState> & { snapshot?: unknown };
  const snapshot = (source.snapshot && typeof source.snapshot === "object"
    ? source.snapshot
    : source) as Partial<PublicLeaderboardState>;
  const shareSlug = cleanSnapshotSlug(snapshot.shareSlug || fallbackSlug);
  if (!shareSlug || !snapshot.tournament || !Array.isArray(snapshot.leaderboard)) return null;
  return {
    ...snapshot,
    version: Number(snapshot.version || 1),
    shareSlug,
    tournament: {
      ...snapshot.tournament,
      id: String(snapshot.tournament.id || shareSlug),
      name: String(snapshot.tournament.name || "Leaderboard Pro"),
      updatedAt: snapshot.tournament.updatedAt || new Date().toISOString(),
    },
    leaderboard: snapshot.leaderboard,
  } as PublicLeaderboardState;
}

async function readExactLocalPublicSnapshot(cleanSlug: string) {
  try {
    const existingPath = await resolveExistingSnapshotPath(cleanSlug);
    if (!existingPath) return null;
    const raw = await readFile(/* turbopackIgnore: true */ existingPath, "utf8");
    return normalizeLocalPublicSnapshot(JSON.parse(raw), cleanSlug);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("[local-public-snapshot] read failed", {
        slug: cleanSlug,
        error: String(error),
      });
    }
    return null;
  }
}

export async function readLocalPublicSnapshot(slug: string) {
  if (!isLocalSnapshotRuntimeEnabled()) return null;
  const cleanSlug = cleanSnapshotSlug(slug);
  if (!cleanSlug) return null;
  const exact = await readExactLocalPublicSnapshot(cleanSlug);
  if (exact) return exact;
  return null;
}

export async function writeLocalPublicSnapshot(value: unknown, fallbackSlug = "") {
  if (!isLocalSnapshotRuntimeEnabled()) return null;
  const snapshot = normalizeLocalPublicSnapshot(value, fallbackSlug);
  if (!snapshot) return null;
  await mkdir(/* turbopackIgnore: true */ getSnapshotDirectory(), { recursive: true });
  const targetPath = getSnapshotPath(snapshot.shareSlug);
  const temporaryPath = `${targetPath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(/* turbopackIgnore: true */ temporaryPath, JSON.stringify(snapshot, null, 2), "utf8");
    await rename(/* turbopackIgnore: true */ temporaryPath, targetPath);
  } catch (error) {
    await rm(/* turbopackIgnore: true */ temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
  return snapshot;
}

export async function deleteLocalPublicSnapshot(
  slug: string,
  options: { simulatorOnly?: boolean } = {},
) {
  if (!isLocalSnapshotRuntimeEnabled()) return false;
  const cleanSlug = cleanSnapshotSlug(slug);
  if (!cleanSlug) return false;
  const existingPath = await resolveExistingSnapshotPath(cleanSlug);
  if (!existingPath) return false;
  if (options.simulatorOnly) {
    const raw = await readFile(/* turbopackIgnore: true */ existingPath, "utf8");
    const snapshot = normalizeLocalPublicSnapshot(JSON.parse(raw), cleanSlug);
    if (!snapshot || !isSimulatorPublicSnapshot(snapshot)) return false;
  }
  await rm(/* turbopackIgnore: true */ existingPath, { force: true });
  return true;
}

export async function deleteSimulatorLocalPublicSnapshots() {
  if (!isLocalSnapshotRuntimeEnabled()) return 0;
  let deleted = 0;
  try {
    const entries = await readdir(/* turbopackIgnore: true */ getSnapshotDirectory(), { withFileTypes: true });
    await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
        .map(async (entry) => {
          const snapshotPath = path.join(getSnapshotDirectory(), entry.name);
          try {
            const raw = await readFile(/* turbopackIgnore: true */ snapshotPath, "utf8");
            const snapshot = normalizeLocalPublicSnapshot(JSON.parse(raw), entry.name.slice(0, -5));
            if (!snapshot || !isSimulatorPublicSnapshot(snapshot)) return;
            await rm(/* turbopackIgnore: true */ snapshotPath, { force: true });
            deleted += 1;
          } catch {
            // Ignore malformed/stale files during best-effort cleanup.
          }
        }),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return deleted;
}
