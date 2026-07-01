const { loadEnvConfig } = require("@next/env");

const { i18n } = require("./next-i18next.config");

loadEnvConfig(process.cwd());

const allowedDevOrigins = [
  ...new Set(
    (process.env.HOMEPAGE_ALLOWED_HOSTS || "")
      .split(",")
      .map((host) => host.trim())
      .filter((host) => host && host !== "*")
      .map((host) => host.split(":")[0]),
  ),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  allowedDevOrigins,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.jsdelivr.net",
      },
    ],
    unoptimized: true,
  },
  i18n,
};

module.exports = nextConfig;
