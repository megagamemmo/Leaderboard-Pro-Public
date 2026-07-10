import { networkInterfaces } from "node:os";
import { NextResponse } from "next/server";
import {
  isLocalSnapshotRuntimeEnabled,
  writeLocalPublicSnapshot,
} from "@/lib/local-public-snapshots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

type ZipEntry = {
  path: string;
  data: Buffer;
};

const ASSET_PATH_PATTERN = /["'](\/(?:_next\/static|css|fonts|icons|images|img|media)\/[^"'?#]+)(?:[?#][^"']*)?["']/g;
const UTF8_FLAG = 0x0800;

function cleanSlug(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, "")
    .slice(0, 80);
}

function isLocalHostname(hostname: string) {
  const value = hostname.toLowerCase();
  return value === "localhost" || value === "127.0.0.1" || value === "::1" || value === "[::1]" || isWildcardHostname(value);
}

function isWildcardHostname(hostname: string) {
  const value = hostname.toLowerCase();
  return value === "0.0.0.0" || value === "::" || value === "[::]";
}

function isPrivateIpv4(address: string) {
  if (/^10\./.test(address) || /^192\.168\./.test(address)) return true;
  const match = address.match(/^172\.(\d+)\./);
  return !!match && Number(match[1]) >= 16 && Number(match[1]) <= 31;
}

function getPrivateIpv4Addresses() {
  const addresses: string[] = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family !== "IPv4" || entry.internal || !isPrivateIpv4(entry.address)) continue;
      addresses.push(entry.address);
    }
  }
  return Array.from(new Set(addresses));
}

function normalizeHttpBaseUrl(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    if (isWildcardHostname(url.hostname)) return "";
    url.pathname = url.pathname.replace(/\/+$/, "");
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function getSnapshotServerBaseUrl(request: Request, explicit: unknown) {
  const configured = normalizeHttpBaseUrl(explicit);
  if (configured) return configured;

  const requestUrl = new URL(request.url);
  if (!isLocalHostname(requestUrl.hostname)) {
    return `${requestUrl.protocol}//${requestUrl.hostname}:4333`;
  }

  const lanAddress = getPrivateIpv4Addresses()[0];
  if (lanAddress) return `http://${lanAddress}:4333`;
  if (isWildcardHostname(requestUrl.hostname)) return "http://localhost:4333";
  return `${requestUrl.protocol}//${requestUrl.hostname}:4333`;
}

function collectAssetPaths(html: string) {
  const assets = new Set<string>();
  for (const match of html.matchAll(ASSET_PATH_PATTERN)) {
    assets.add(match[1]);
  }
  return Array.from(assets);
}

function toZipPath(assetPath: string) {
  const pathname = assetPath.split(/[?#]/, 1)[0].replace(/^\/+/, "");
  return pathname
    .split("/")
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    })
    .join("/");
}

function rewriteAssetUrls(html: string, prefix: "." | "../..") {
  return html.replace(/((?:href|src)=["'])\/(_next\/static|css|fonts|icons|images|img|media)\//g, `$1${prefix}/$2/`);
}

function injectLiveConfig(html: string, scriptSrc: string) {
  const script = `<script src="${scriptSrc}"></script>`;
  if (html.includes("</head>")) return html.replace("</head>", `${script}</head>`);
  return `${script}${html}`;
}

function buildLiveConfigScript(input: {
  slug: string;
  snapshotServerBaseUrl: string;
  exportedAt: string;
}) {
  const encodedSlug = encodeURIComponent(input.slug);
  const config = {
    LOCAL_SNAPSHOT_SERVER_URL: input.snapshotServerBaseUrl,
    GO_SNAPSHOT_SERVER_URL: input.snapshotServerBaseUrl,
    LOCAL_SNAPSHOT_PROXY_URL: "",
    SNAPSHOT_FETCH_MODE: "auto",
    PUBLIC_SNAPSHOT_POLL_MS: 5000,
    PUBLIC_SNAPSHOT_REALTIME_ENABLED: false,
    EXPORTED_LIVE_PACKAGE: true,
  };
  const metadata = {
    slug: input.slug,
    snapshotServerBaseUrl: input.snapshotServerBaseUrl,
    exportedAt: input.exportedAt,
    sameOriginProxyPaths: {
      publicLeaderboard: `/api/public-leaderboard/${encodedSlug}`,
      tournamentState: `/api/tournament-state/${encodedSlug}`,
      snapshots: `/snapshots/${encodedSlug}`,
    },
    source: "Leaderboard Pro Mode 1 live React export",
  };

  return `window.ENV = {
  ...(window.ENV || {}),
  ...${JSON.stringify(config, null, 2)}
};
window.LB_EXPORTED_LIVE = ${JSON.stringify(metadata, null, 2)};
(function () {
  var goSnapshotBase = ${JSON.stringify(input.snapshotServerBaseUrl)};
  var slug = ${JSON.stringify(input.slug)};
  var encodedSlug = ${JSON.stringify(encodedSlug)};
  if (!goSnapshotBase || !slug || !window.fetch) return;
  var originalFetch = window.fetch.bind(window);
  var scriptUrl = "";
  try {
    scriptUrl = document.currentScript && document.currentScript.src ? document.currentScript.src : "";
  } catch (_) {}
  var packageRoot = scriptUrl ? new URL(".", scriptUrl).href : new URL(".", window.location.href).href;
  var staticSnapshotUrl = new URL("snapshot.json", packageRoot).href;
  var sameOriginApiPath = "/api/public-leaderboard/" + encodedSlug;
  var sameOriginTournamentStatePath = "/api/tournament-state/" + encodedSlug;
  var sameOriginSnapshotPath = "/snapshots/" + encodedSlug;
  var fetchMode = String(window.ENV && window.ENV.SNAPSHOT_FETCH_MODE || "auto").toLowerCase();

  function getGoSnapshotUrl() {
    return new URL("snapshots/" + encodedSlug, goSnapshotBase.replace(/\\/+$/, "") + "/").href;
  }

  function getSameOriginUrl(pathname) {
    return new URL(pathname, window.location.origin).href;
  }

  function isLocalHttpHost(hostname) {
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
  }

  function wouldBeMixedContent(targetUrl) {
    try {
      var url = new URL(targetUrl, window.location.href);
      return window.location.protocol === "https:" && url.protocol === "http:" && !isLocalHttpHost(url.hostname);
    } catch (_) {
      return false;
    }
  }

  function matchesExportedSnapshotRequest(url) {
    if (!url) return false;
    if (url.origin === window.location.origin) {
      return url.pathname === sameOriginApiPath ||
        url.pathname === sameOriginTournamentStatePath ||
        url.pathname === sameOriginSnapshotPath;
    }
    try {
      var direct = new URL(getGoSnapshotUrl());
      return url.origin === direct.origin && url.pathname === direct.pathname;
    } catch (_) {
      return false;
    }
  }

  async function fetchStaticSnapshot() {
    var response = await originalFetch(staticSnapshotUrl, { cache: "no-store" });
    if (!response.ok) return response;
    var snapshot = await response.json();
    return new Response(JSON.stringify({
      ok: true,
      snapshot: snapshot,
      updatedAt: snapshot && snapshot.tournament ? snapshot.tournament.updatedAt || "" : ""
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store, max-age=0"
      }
    });
  }

  async function fetchFromCandidates(resource, init) {
    var directUrl = getGoSnapshotUrl();
    var directAllowed = !wouldBeMixedContent(directUrl);
    var preferProxy = fetchMode === "same-origin-proxy" || (fetchMode !== "direct" && !directAllowed);
    var candidates = [];
    if (preferProxy) {
      candidates.push(getSameOriginUrl(sameOriginApiPath), getSameOriginUrl(sameOriginSnapshotPath));
      if (directAllowed) candidates.push(directUrl);
    } else {
      if (directAllowed) candidates.push(directUrl);
      candidates.push(getSameOriginUrl(sameOriginApiPath), getSameOriginUrl(sameOriginSnapshotPath));
    }
    for (var i = 0; i < candidates.length; i += 1) {
      try {
        var response = await originalFetch(candidates[i], init);
        if (response && response.ok) return response;
      } catch (_) {}
    }
    if (!init || !init.method || String(init.method).toUpperCase() === "GET") {
      return fetchStaticSnapshot();
    }
    return originalFetch(resource, init);
  }

  window.fetch = function (resource, init) {
    try {
      var rawUrl = typeof resource === "string" ? resource : resource && resource.url;
      var url = rawUrl ? new URL(rawUrl, window.location.href) : null;
      if (matchesExportedSnapshotRequest(url)) {
        return fetchFromCandidates(resource, init);
      }
    } catch (_) {}
    return originalFetch(resource, init);
  };
})();\n`;
}

function buildLivePackageConfig(input: {
  slug: string;
  snapshotServerBaseUrl: string;
  exportedAt: string;
}) {
  const encodedSlug = encodeURIComponent(input.slug);
  return {
    version: 1,
    slug: input.slug,
    exportedAt: input.exportedAt,
    goSnapshotServerUrl: input.snapshotServerBaseUrl,
    snapshotPollMs: 5000,
    fetchMode: "auto",
    sameOriginProxyPaths: {
      publicLeaderboard: `/api/public-leaderboard/${encodedSlug}`,
      tournamentState: `/api/tournament-state/${encodedSlug}`,
      snapshots: `/snapshots/${encodedSlug}`,
    },
  };
}

function buildNodeSelfHostServer() {
  return `const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const CONFIG_PATH = path.join(ROOT, "live-package.config.json");
const config = readJson(CONFIG_PATH);
const PORT = Number(process.env.PORT || process.env.LIVE_PACKAGE_PORT || 8080);
const HOST = process.env.HOST || process.env.LIVE_PACKAGE_HOST || "0.0.0.0";
const GO_SNAPSHOT_SERVER_URL = normalizeBaseUrl(process.env.GO_SNAPSHOT_SERVER_URL || config.goSnapshotServerUrl);

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return {};
  }
}

function normalizeBaseUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\\/+$/, "");
  } catch {
    return "";
  }
}

function cleanSlug(value) {
  return String(value || "").trim().replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80);
}

function send(res, status, headers, body) {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(String(body || ""));
  res.writeHead(status, {
    "Content-Length": payload.length,
    ...headers,
  });
  res.end(payload);
}

function sendJson(res, status, payload) {
  send(res, status, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Accept, Content-Type",
    "Cache-Control": "no-store, max-age=0",
    "Content-Type": "application/json; charset=utf-8",
  }, JSON.stringify(payload));
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".txt": "text/plain; charset=utf-8",
  }[ext] || "application/octet-stream";
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 10 * 1024 * 1024) {
        reject(new Error("payload_too_large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function getProxySlug(url) {
  const match = url.pathname.match(/^\\/(?:api\\/public-leaderboard|api\\/tournament-state|snapshots)\\/([^/]+)$/);
  return cleanSlug(match ? decodeURIComponent(match[1]) : "");
}

async function proxySnapshot(req, res, slug) {
  if (!GO_SNAPSHOT_SERVER_URL) {
    sendJson(res, 500, { ok: false, error: "missing_go_snapshot_server_url" });
    return;
  }
  const target = new URL("snapshots/" + encodeURIComponent(slug), GO_SNAPSHOT_SERVER_URL.replace(/\\/+$/, "") + "/");
  let body;
  if (req.method !== "GET" && req.method !== "HEAD") {
    body = await readBody(req);
  }
  try {
    const response = await fetch(target, {
      method: req.method,
      headers: {
        "Accept": req.headers.accept || "application/json",
        "Content-Type": req.headers["content-type"] || "application/json",
      },
      body,
      cache: "no-store",
    });
    const payload = Buffer.from(await response.arrayBuffer());
    send(res, response.status, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Accept, Content-Type",
      "Cache-Control": "no-store, max-age=0",
      "Content-Type": response.headers.get("content-type") || "application/json; charset=utf-8",
    }, payload);
  } catch (error) {
    sendJson(res, 502, { ok: false, error: "go_snapshot_unreachable", detail: String(error && error.message || error) });
  }
}

function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  if (pathname.endsWith("/")) pathname += "index.html";
  let filePath = path.resolve(ROOT, "." + pathname);
  if (!filePath.startsWith(ROOT)) {
    sendJson(res, 403, { ok: false, error: "forbidden" });
    return;
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  } else if (!fs.existsSync(filePath) && !path.extname(filePath)) {
    filePath = path.join(filePath, "index.html");
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    sendJson(res, 404, { ok: false, error: "not_found" });
    return;
  }
  const cacheControl = /[\\\\/]_next[\\\\/]static[\\\\/]/.test(filePath)
    ? "public, max-age=31536000, immutable"
    : "no-store, max-age=0";
  send(res, 200, {
    "Cache-Control": cacheControl,
    "Content-Type": getMimeType(filePath),
  }, fs.readFileSync(filePath));
}

async function handleRequest(req, res) {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  const url = new URL(req.url || "/", "http://" + (req.headers.host || "localhost"));
  if (req.method === "GET" && url.pathname === "/health") {
    sendJson(res, 200, {
      ok: true,
      service: "leaderboard-pro-live-export",
      slug: config.slug || "",
      goSnapshotServerUrl: GO_SNAPSHOT_SERVER_URL,
    });
    return;
  }

  const proxySlug = getProxySlug(url);
  if (proxySlug) {
    await proxySnapshot(req, res, proxySlug);
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    sendJson(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }
  serveStatic(req, res, url);
}

const keyPath = process.env.LIVE_PACKAGE_TLS_KEY || process.env.HTTPS_KEY || "";
const certPath = process.env.LIVE_PACKAGE_TLS_CERT || process.env.HTTPS_CERT || "";
const hasTls = keyPath && certPath && fs.existsSync(keyPath) && fs.existsSync(certPath);
const server = hasTls
  ? https.createServer({ key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) }, handleRequest)
  : http.createServer(handleRequest);

server.listen(PORT, HOST, () => {
  const scheme = hasTls ? "https" : "http";
  console.log("Leaderboard Pro live export listening on " + scheme + "://" + HOST + ":" + PORT);
  console.log("Proxying live snapshots from " + (GO_SNAPSHOT_SERVER_URL || "(not configured)"));
  console.log("Browser-safe paths: /api/public-leaderboard/:slug and /snapshots/:slug");
});
`;
}

function buildPackageJson() {
  return JSON.stringify(
    {
      private: true,
      name: "leaderboard-pro-live-export",
      version: "1.0.0",
      description: "Self-hosted Leaderboard Pro Mode 1 live React package with same-origin GO snapshot proxy.",
      scripts: {
        start: "node server.js",
      },
      engines: {
        node: ">=18",
      },
      dependencies: {},
    },
    null,
    2,
  );
}

function buildStartCmd() {
  return `@echo off
setlocal
if "%LIVE_PACKAGE_PORT%"=="" set "LIVE_PACKAGE_PORT=8080"
node "%~dp0server.js"
`;
}

function buildStartPowerShell() {
  return `$ErrorActionPreference = "Stop"
if (-not $env:LIVE_PACKAGE_PORT) { $env:LIVE_PACKAGE_PORT = "8080" }
node "$PSScriptRoot/server.js"
`;
}

function buildNginxExample(input: { snapshotServerBaseUrl: string }) {
  const target = input.snapshotServerBaseUrl.replace(/\/+$/, "");
  return `# Leaderboard Pro live export HTTPS-safe snapshot proxy
# Replace server_name and root, then reload nginx.
server {
    listen 80;
    server_name leaderboard.example.local;
    root /var/www/leaderboard-live;
    index index.html;

    location ~ ^/api/(public-leaderboard|tournament-state)/([^/]+)$ {
        proxy_pass ${target}/snapshots/$2;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        add_header Cache-Control "no-store, max-age=0" always;
    }

    location ~ ^/snapshots/([^/]+)$ {
        proxy_pass ${target}/snapshots/$1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        add_header Cache-Control "no-store, max-age=0" always;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
`;
}

function buildCaddyExample(input: { snapshotServerBaseUrl: string }) {
  const target = input.snapshotServerBaseUrl.replace(/\/+$/, "");
  return `# Leaderboard Pro live export HTTPS-safe snapshot proxy
# Caddy can terminate HTTPS automatically when the hostname has valid DNS.
leaderboard.example.local {
    root * /var/www/leaderboard-live
    file_server

    @publicLeaderboard path /api/public-leaderboard/*
    handle @publicLeaderboard {
        uri replace /api/public-leaderboard /snapshots
        reverse_proxy ${target}
    }

    @tournamentState path /api/tournament-state/*
    handle @tournamentState {
        uri replace /api/tournament-state /snapshots
        reverse_proxy ${target}
    }

    @snapshots path /snapshots/*
    handle @snapshots {
        reverse_proxy ${target}
    }
}
`;
}

function buildReadme(input: {
  slug: string;
  snapshotServerBaseUrl: string;
  exportedAt: string;
}) {
  return `Leaderboard Pro - Mode 1 live React export

Slug: ${input.slug}
Exported at: ${input.exportedAt}
GO snapshot endpoint: ${input.snapshotServerBaseUrl}/snapshots/${input.slug}

How to host:
1. Keep the GO computer running Leaderboard Pro and the LAN snapshot service.
2. Other devices must be able to reach ${input.snapshotServerBaseUrl}/health.
3. Upload all files in this folder to the web root of your host.
4. If the host serves HTTP, the page can read ${input.snapshotServerBaseUrl}/snapshots/${input.slug} directly.
5. If the host serves HTTPS, do one of these:
   - Run this folder with the included Node server: node server.js
   - Or configure your web server with nginx-go-snapshot-proxy.conf / Caddyfile.example.
   In both cases the browser calls same-origin HTTPS paths, while the server talks to the GO computer over HTTP.
6. If the GO computer IP changes, update live-package.config.json and live-config.js, or start the Node server with:
   GO_SNAPSHOT_SERVER_URL=http://NEW_GO_IP:4333 node server.js

Notes:
- This package contains the rendered live React page and the Next.js static assets it needs.
- The page polls the GO snapshot service for score updates.
- Browser mixed-content is handled automatically by preferring same-origin proxy paths whenever an HTTPS page would otherwise call an HTTP GO endpoint.
- A pure static HTTPS host cannot proxy LAN data by itself. Use the included Node server or a reverse proxy config for HTTPS hosting.
`;
}

function makeCrc32Table() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
}

const crc32Table = makeCrc32Table();

function crc32(data: Buffer) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = crc32Table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function getDosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const dosTime =
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    Math.floor(date.getSeconds() / 2);
  const dosDate =
    ((year - 1980) << 9) |
    ((date.getMonth() + 1) << 5) |
    date.getDate();
  return { dosDate, dosTime };
}

function createZip(entries: ZipEntry[]) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  const { dosDate, dosTime } = getDosDateTime();

  for (const entry of entries) {
    const name = Buffer.from(entry.path.replace(/\\/g, "/"), "utf8");
    const checksum = crc32(entry.data);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(UTF8_FLAG, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(entry.data.length, 18);
    localHeader.writeUInt32LE(entry.data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, name, entry.data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(UTF8_FLAG, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(entry.data.length, 20);
    centralHeader.writeUInt32LE(entry.data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, name);

    offset += localHeader.length + name.length + entry.data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

async function fetchBinary(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`asset_fetch_failed_${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

export async function POST(request: Request, context: RouteContext) {
  if (!isLocalSnapshotRuntimeEnabled()) {
    return NextResponse.json(
      { ok: false, error: "local_live_export_runtime_disabled" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }
  const { slug } = await context.params;
  const clean = cleanSlug(slug);
  if (!clean) {
    return NextResponse.json({ ok: false, error: "missing_slug" }, { status: 400 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const snapshot = await writeLocalPublicSnapshot(body?.snapshot || body, clean);
    if (!snapshot) {
      return NextResponse.json({ ok: false, error: "invalid_snapshot" }, { status: 400 });
    }

    const requestUrl = new URL(request.url);
    const origin = requestUrl.origin;
    const snapshotServerBaseUrl = getSnapshotServerBaseUrl(
      request,
      body?.snapshotServerUrl || body?.localSnapshotServerUrl,
    );
    const exportedAt = new Date().toISOString();
    const liveResponse = await fetch(`${origin}/live/${encodeURIComponent(clean)}`, { cache: "no-store" });
    if (!liveResponse.ok) throw new Error(`live_page_fetch_failed_${liveResponse.status}`);
    const sourceHtml = await liveResponse.text();
    const assetPaths = collectAssetPaths(sourceHtml);
    const liveConfig = buildLiveConfigScript({ slug: clean, snapshotServerBaseUrl, exportedAt });
    const livePackageConfig = buildLivePackageConfig({ slug: clean, snapshotServerBaseUrl, exportedAt });

    const rootHtml = injectLiveConfig(rewriteAssetUrls(sourceHtml, "."), "./live-config.js");
    const nestedHtml = injectLiveConfig(rewriteAssetUrls(sourceHtml, "../.."), "../../live-config.js");
    const entries: ZipEntry[] = [
      { path: "index.html", data: Buffer.from(rootHtml, "utf8") },
      { path: `live/${clean}/index.html`, data: Buffer.from(nestedHtml, "utf8") },
      { path: "live-config.js", data: Buffer.from(liveConfig, "utf8") },
      { path: "live-package.config.json", data: Buffer.from(JSON.stringify(livePackageConfig, null, 2), "utf8") },
      { path: "server.js", data: Buffer.from(buildNodeSelfHostServer(), "utf8") },
      { path: "package.json", data: Buffer.from(buildPackageJson(), "utf8") },
      { path: "start-live-server.bat", data: Buffer.from(buildStartCmd(), "utf8") },
      { path: "start-live-server.ps1", data: Buffer.from(buildStartPowerShell(), "utf8") },
      { path: "nginx-go-snapshot-proxy.conf", data: Buffer.from(buildNginxExample({ snapshotServerBaseUrl }), "utf8") },
      { path: "Caddyfile.example", data: Buffer.from(buildCaddyExample({ snapshotServerBaseUrl }), "utf8") },
      { path: "snapshot.json", data: Buffer.from(JSON.stringify(snapshot, null, 2), "utf8") },
      { path: "README.txt", data: Buffer.from(buildReadme({ slug: clean, snapshotServerBaseUrl, exportedAt }), "utf8") },
    ];

    for (const assetPath of assetPaths) {
      const assetUrl = new URL(assetPath, origin).toString();
      entries.push({
        path: toZipPath(assetPath),
        data: await fetchBinary(assetUrl),
      });
    }

    const zip = createZip(entries);
    return new NextResponse(zip, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Content-Disposition": `attachment; filename="${clean}-live-react.zip"`,
        "Content-Type": "application/zip",
        "Content-Length": String(zip.length),
      },
    });
  } catch (error) {
    console.error("[live-export-package] failed", { slug: clean, error: String(error) });
    return NextResponse.json(
      { ok: false, error: "live_export_failed", detail: String(error) },
      { status: 500 },
    );
  }
}
