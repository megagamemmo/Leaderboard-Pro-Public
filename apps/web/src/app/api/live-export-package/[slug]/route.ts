import { networkInterfaces } from "node:os";
import { NextResponse } from "next/server";
import { writeLocalPublicSnapshot } from "@/lib/local-public-snapshots";

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
  return value === "localhost" || value === "127.0.0.1" || value === "::1" || value === "[::1]";
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
  const config = {
    LOCAL_SNAPSHOT_SERVER_URL: input.snapshotServerBaseUrl,
    PUBLIC_SNAPSHOT_POLL_MS: 5000,
    PUBLIC_SNAPSHOT_REALTIME_ENABLED: false,
    EXPORTED_LIVE_PACKAGE: true,
  };
  const metadata = {
    slug: input.slug,
    snapshotServerBaseUrl: input.snapshotServerBaseUrl,
    exportedAt: input.exportedAt,
    source: "Leaderboard Pro Mode 0 live React export",
  };

  return `window.ENV = {
  ...(window.ENV || {}),
  ...${JSON.stringify(config, null, 2)}
};
window.LB_EXPORTED_LIVE = ${JSON.stringify(metadata, null, 2)};
(function () {
  var snapshotBase = ${JSON.stringify(input.snapshotServerBaseUrl)};
  var slug = ${JSON.stringify(input.slug)};
  if (!snapshotBase || !slug || !window.fetch) return;
  var originalFetch = window.fetch.bind(window);
  window.fetch = function (resource, init) {
    try {
      var rawUrl = typeof resource === "string" ? resource : resource && resource.url;
      var url = rawUrl ? new URL(rawUrl, window.location.href) : null;
      if (url && url.pathname === "/api/public-leaderboard/" + encodeURIComponent(slug)) {
        return originalFetch(snapshotBase.replace(/\\/+$/, "") + "/snapshots/" + encodeURIComponent(slug), init);
      }
    } catch (_) {}
    return originalFetch(resource, init);
  };
})();\n`;
}

function buildReadme(input: {
  slug: string;
  snapshotServerBaseUrl: string;
  exportedAt: string;
}) {
  return `Leaderboard Pro - Mode 0 live React export

Slug: ${input.slug}
Exported at: ${input.exportedAt}
GO snapshot endpoint: ${input.snapshotServerBaseUrl}/snapshots/${input.slug}

How to host:
1. Upload all files in this folder to the web root of your host.
2. Keep the GO computer running Leaderboard Pro and the LAN snapshot service.
3. Other devices must be able to reach ${input.snapshotServerBaseUrl}/health.
4. If the GO computer IP changes, edit live-config.js and update LOCAL_SNAPSHOT_SERVER_URL.

Notes:
- This package contains the rendered live React page and the Next.js static assets it needs.
- The page polls the GO snapshot service for score updates.
- Serve this package over HTTP on the same LAN unless you also provide HTTPS for the GO snapshot service; browsers block HTTP snapshot reads from an HTTPS page.
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

    const rootHtml = injectLiveConfig(rewriteAssetUrls(sourceHtml, "."), "./live-config.js");
    const nestedHtml = injectLiveConfig(rewriteAssetUrls(sourceHtml, "../.."), "../../live-config.js");
    const entries: ZipEntry[] = [
      { path: "index.html", data: Buffer.from(rootHtml, "utf8") },
      { path: `live/${clean}/index.html`, data: Buffer.from(nestedHtml, "utf8") },
      { path: "live-config.js", data: Buffer.from(liveConfig, "utf8") },
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
