import type { NextConfig } from "next";
import path from "node:path";

const workspaceRoot = path.resolve(process.cwd(), "../..");

const privateLanDevOrigins = [
  "10.*.*.*",
  "192.168.*.*",
  "172.16.*.*",
  "172.17.*.*",
  "172.18.*.*",
  "172.19.*.*",
  "172.20.*.*",
  "172.21.*.*",
  "172.22.*.*",
  "172.23.*.*",
  "172.24.*.*",
  "172.25.*.*",
  "172.26.*.*",
  "172.27.*.*",
  "172.28.*.*",
  "172.29.*.*",
  "172.30.*.*",
  "172.31.*.*",
];

const configuredAllowedDevOrigins = process.env.ALLOWED_DEV_ORIGINS
  ? process.env.ALLOWED_DEV_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean)
  : [];

const allowedDevOrigins = Array.from(new Set([
  ...privateLanDevOrigins,
  ...configuredAllowedDevOrigins,
]));

const nextConfig: NextConfig = {
  allowedDevOrigins,
  outputFileTracingRoot: workspaceRoot,
  reactStrictMode: true,
};

export default nextConfig;
