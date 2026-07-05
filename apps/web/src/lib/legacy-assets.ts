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
