import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

const legacyRoot = path.join(/*turbopackIgnore: true*/ process.cwd(), "..", "..");

const rootFileTargets = {
  "env-config.js": path.join(legacyRoot, "env-config.js"),
  "favicon.ico": path.join(legacyRoot, "favicon.ico"),
  "index.html": path.join(legacyRoot, "index.html"),
  "manifest.webmanifest": path.join(legacyRoot, "manifest.webmanifest"),
  "runtime-env.js": path.join(legacyRoot, "runtime-env.js"),
  "share.html": path.join(legacyRoot, "share.html"),
} as const;

const directoryRoots = {
  assets: path.join(legacyRoot, "assets"),
  css: path.join(legacyRoot, "css"),
  fonts: path.join(legacyRoot, "fonts"),
  icons: path.join(legacyRoot, "icons"),
  images: path.join(legacyRoot, "images"),
  img: path.join(legacyRoot, "img"),
  js: path.join(legacyRoot, "js"),
  media: path.join(legacyRoot, "media"),
  "offline-data": path.join(legacyRoot, "offline-data"),
} as const;

const allowedExtensions = new Set([
  ".css",
  ".gif",
  ".html",
  ".ico",
  ".jpeg",
  ".jpg",
  ".js",
  ".json",
  ".map",
  ".png",
  ".svg",
  ".txt",
  ".webmanifest",
  ".webp",
  ".woff",
  ".woff2",
]);

const allowedRootFiles = new Set([
  "env-config.js",
  "favicon.ico",
  "index.html",
  "manifest.webmanifest",
  "runtime-env.js",
  "share.html",
]);

const allowedRootDirectories = new Set([
  "assets",
  "css",
  "fonts",
  "icons",
  "images",
  "img",
  "js",
  "media",
  "offline-data",
]);

const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const ts36PublicBaseUrl = readFirstEnv([
  "LB_PUBLIC_TS36_BASE_URL",
  "NEXT_PUBLIC_TS36_BASE_URL",
  "TOUR_SYSTEM_PUBLIC_URL",
  "TS36_PUBLIC_URL",
]) || "https://system36.vercel.app";

const publicEnvDefaults: Record<string, string | number | boolean> = {
  AUTH_STORAGE_KEY: "lbpro_supabase_auth",
  SITE_PUBLIC_URL: "",
  PUBLIC_STATE_BASE_URL: ts36PublicBaseUrl,
  PUBLIC_LEADERBOARD_BASE_URL: ts36PublicBaseUrl,
  PUBLIC_LIVE_BASE_URL: `${ts36PublicBaseUrl.replace(/\/+$/, "")}/`,
  PUBLIC_SNAPSHOT_POLL_MS: 15000,
  PUBLIC_SNAPSHOT_REALTIME_ENABLED: false,
  PUBLIC_SNAPSHOT_DIRECT_SUPABASE_FALLBACK: false,
  LOCAL_SNAPSHOT_SERVER_URL: "",
  OPERATOR_SCORE_POLL_MS: 10000,
  OPERATOR_SNAPSHOT_AUTO_PUBLISH_MS: 10000,
  OPERATOR_PARTICIPANT_POLL_MS: 60000,
  OPERATOR_CATALOG_POLL_MS: 60000,
  PUBLIC_STATE_REVALIDATE_URL: "",
  PUBLIC_STATE_REVALIDATE_TOKEN: "",
  LEADERBOARD_BRIDGE_ENDPOINT: `${ts36PublicBaseUrl.replace(/\/+$/, "")}/api/leaderboard-bridge`,
  LOCAL_OCR_ENDPOINT: "",
  GEMINI_SCORECARD_ENDPOINT: `${ts36PublicBaseUrl.replace(/\/+$/, "")}/api/gemini-scorecard-ocr`,
  OCR_MAX_IMAGE_SIDE: 1800,
  GOOGLE_AI_STUDIO_ENDPOINT: "",
  DEFAULT_SYNC_MODE: "local",
  LB_RUNTIME_MODE: "local",
  LB_RUNTIME_CLIENT: "local",
  LB_CLOUD_AUTH_DOMAIN: "operator.system36.app",
};

const publicEnvSources: Record<string, string[]> = {
  SUPABASE_URL: ["LB_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"],
  SUPABASE_ANON_KEY: ["LB_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
  AUTH_STORAGE_KEY: ["LB_PUBLIC_AUTH_STORAGE_KEY", "NEXT_PUBLIC_AUTH_STORAGE_KEY"],
  SITE_PUBLIC_URL: ["LB_PUBLIC_SITE_URL", "NEXT_PUBLIC_SITE_URL", "SITE_PUBLIC_URL", "VERCEL_PROJECT_PRODUCTION_URL"],
  PUBLIC_STATE_BASE_URL: ["LB_PUBLIC_STATE_BASE_URL", "NEXT_PUBLIC_STATE_BASE_URL", "PUBLIC_STATE_BASE_URL"],
  PUBLIC_LEADERBOARD_BASE_URL: ["LB_PUBLIC_LEADERBOARD_BASE_URL", "NEXT_PUBLIC_LEADERBOARD_BASE_URL", "PUBLIC_LEADERBOARD_BASE_URL"],
  PUBLIC_LIVE_BASE_URL: ["LB_PUBLIC_LIVE_BASE_URL", "NEXT_PUBLIC_LIVE_BASE_URL", "PUBLIC_LIVE_BASE_URL"],
  PUBLIC_SNAPSHOT_POLL_MS: ["LB_PUBLIC_SNAPSHOT_POLL_MS", "NEXT_PUBLIC_SNAPSHOT_POLL_MS", "PUBLIC_SNAPSHOT_POLL_MS"],
  PUBLIC_SNAPSHOT_REALTIME_ENABLED: ["LB_PUBLIC_SNAPSHOT_REALTIME_ENABLED", "NEXT_PUBLIC_SNAPSHOT_REALTIME_ENABLED", "PUBLIC_SNAPSHOT_REALTIME_ENABLED"],
  PUBLIC_SNAPSHOT_DIRECT_SUPABASE_FALLBACK: [
    "LB_PUBLIC_SNAPSHOT_DIRECT_SUPABASE_FALLBACK",
    "NEXT_PUBLIC_SNAPSHOT_DIRECT_SUPABASE_FALLBACK",
    "PUBLIC_SNAPSHOT_DIRECT_SUPABASE_FALLBACK",
  ],
  LOCAL_SNAPSHOT_SERVER_URL: ["LB_PUBLIC_LOCAL_SNAPSHOT_SERVER_URL", "NEXT_PUBLIC_LOCAL_SNAPSHOT_SERVER_URL"],
  OPERATOR_SCORE_POLL_MS: ["LB_PUBLIC_OPERATOR_SCORE_POLL_MS", "NEXT_PUBLIC_OPERATOR_SCORE_POLL_MS", "OPERATOR_SCORE_POLL_MS"],
  OPERATOR_SNAPSHOT_AUTO_PUBLISH_MS: [
    "LB_PUBLIC_OPERATOR_SNAPSHOT_AUTO_PUBLISH_MS",
    "NEXT_PUBLIC_OPERATOR_SNAPSHOT_AUTO_PUBLISH_MS",
    "OPERATOR_SNAPSHOT_AUTO_PUBLISH_MS",
  ],
  OPERATOR_PARTICIPANT_POLL_MS: [
    "LB_PUBLIC_OPERATOR_PARTICIPANT_POLL_MS",
    "NEXT_PUBLIC_OPERATOR_PARTICIPANT_POLL_MS",
    "OPERATOR_PARTICIPANT_POLL_MS",
  ],
  OPERATOR_CATALOG_POLL_MS: ["LB_PUBLIC_OPERATOR_CATALOG_POLL_MS", "NEXT_PUBLIC_OPERATOR_CATALOG_POLL_MS", "OPERATOR_CATALOG_POLL_MS"],
  PUBLIC_STATE_REVALIDATE_URL: ["LB_PUBLIC_STATE_REVALIDATE_URL", "NEXT_PUBLIC_STATE_REVALIDATE_URL", "PUBLIC_STATE_REVALIDATE_URL"],
  LEADERBOARD_BRIDGE_ENDPOINT: ["LB_PUBLIC_LEADERBOARD_BRIDGE_ENDPOINT", "NEXT_PUBLIC_LEADERBOARD_BRIDGE_ENDPOINT", "LEADERBOARD_BRIDGE_ENDPOINT"],
  LOCAL_OCR_ENDPOINT: ["LB_PUBLIC_LOCAL_OCR_ENDPOINT", "NEXT_PUBLIC_LOCAL_OCR_ENDPOINT"],
  GEMINI_SCORECARD_ENDPOINT: ["LB_PUBLIC_GEMINI_SCORECARD_ENDPOINT", "NEXT_PUBLIC_GEMINI_SCORECARD_ENDPOINT", "GEMINI_SCORECARD_ENDPOINT"],
  OCR_MAX_IMAGE_SIDE: ["LB_PUBLIC_OCR_MAX_IMAGE_SIDE", "NEXT_PUBLIC_OCR_MAX_IMAGE_SIDE", "OCR_MAX_IMAGE_SIDE"],
  GOOGLE_AI_STUDIO_ENDPOINT: ["LB_PUBLIC_GOOGLE_AI_STUDIO_ENDPOINT", "NEXT_PUBLIC_GOOGLE_AI_STUDIO_ENDPOINT", "GOOGLE_AI_STUDIO_ENDPOINT"],
  DEFAULT_SYNC_MODE: ["LB_PUBLIC_DEFAULT_SYNC_MODE", "NEXT_PUBLIC_DEFAULT_SYNC_MODE", "DEFAULT_SYNC_MODE"],
  LB_RUNTIME_MODE: ["LB_PUBLIC_RUNTIME_MODE", "NEXT_PUBLIC_LB_RUNTIME_MODE", "LB_RUNTIME_MODE"],
  LB_RUNTIME_CLIENT: ["LB_PUBLIC_RUNTIME_CLIENT", "NEXT_PUBLIC_LB_RUNTIME_CLIENT", "LB_RUNTIME_CLIENT"],
  LB_CLOUD_AUTH_DOMAIN: ["LB_PUBLIC_CLOUD_AUTH_DOMAIN", "NEXT_PUBLIC_LB_CLOUD_AUTH_DOMAIN", "LB_CLOUD_AUTH_DOMAIN"],
};

function readFirstEnv(names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return "";
}

function coercePublicEnvValue(key: string, rawValue: string, fallback: string | number | boolean) {
  if (typeof fallback === "number") {
    const parsed = Number(rawValue);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  if (typeof fallback === "boolean") return /^(1|true|yes)$/i.test(rawValue);
  if (key === "SUPABASE_ANON_KEY" && isSupabaseServiceRoleKey(rawValue)) return "";
  return rawValue;
}

function isSupabaseServiceRoleKey(value: string) {
  const parts = value.split(".");
  if (parts.length < 2) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    return payload?.role === "service_role";
  } catch {
    return false;
  }
}

function buildPublicEnvConfig() {
  const env: Record<string, string | number | boolean> = {};
  for (const [key, fallback] of Object.entries(publicEnvDefaults)) {
    const rawValue = readFirstEnv(publicEnvSources[key] || []);
    env[key] = rawValue ? coercePublicEnvValue(key, rawValue, fallback) : fallback;
  }

  const supabaseUrl = readFirstEnv(publicEnvSources.SUPABASE_URL);
  const supabaseAnonKey = readFirstEnv(publicEnvSources.SUPABASE_ANON_KEY);
  env.SUPABASE_URL = supabaseUrl || "";
  env.SUPABASE_ANON_KEY = supabaseAnonKey && !isSupabaseServiceRoleKey(supabaseAnonKey) ? supabaseAnonKey : "";
  return env;
}

function serveGeneratedEnvConfig() {
  const body = `window.ENV = ${JSON.stringify(buildPublicEnvConfig(), null, 2)};\n`;
  return new NextResponse(body, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "Content-Type": "text/javascript; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function resolveLegacyPath(parts: string[]) {
  const cleanParts = parts.filter(Boolean);
  if (cleanParts.length === 0) cleanParts.push("index.html");

  if (
    cleanParts.length === 1 &&
    !path.extname(cleanParts[0]) &&
    allowedRootFiles.has(`${cleanParts[0]}.html`)
  ) {
    cleanParts[0] = `${cleanParts[0]}.html`;
  }

  const firstPart = cleanParts[0];
  let target = "";
  let base = "";
  if (cleanParts.length === 1) {
    if (!allowedRootFiles.has(firstPart)) return null;
    target = rootFileTargets[firstPart as keyof typeof rootFileTargets];
    base = legacyRoot;
  } else {
    if (!allowedRootDirectories.has(firstPart)) return null;
    base = directoryRoots[firstPart as keyof typeof directoryRoots];
    target = path.join(base, ...cleanParts.slice(1));
  }

  const relative = path.relative(base, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return null;

  const ext = path.extname(target).toLowerCase();
  if (!allowedExtensions.has(ext)) return null;
  return { target, ext };
}

export async function serveLegacyAsset(parts: string[]) {
  if (parts.length === 1 && parts[0] === "env-config.js" && process.env.LB_GENERATE_PUBLIC_ENV_CONFIG !== "false") {
    return serveGeneratedEnvConfig();
  }

  const resolved = resolveLegacyPath(parts);
  if (!resolved) {
    return NextResponse.json({ ok: false, error: "legacy_asset_not_allowed" }, { status: 404 });
  }

  try {
    const file = await readFile(resolved.target);
    return new NextResponse(file, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Content-Type": contentTypes[resolved.ext] || "application/octet-stream",
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "legacy_asset_not_found" }, { status: 404 });
  }
}
