import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // CI builds a self-contained server for Azure App Service (see
  // .github/workflows/azure.yml); local `npm run start` keeps `next start`.
  output: process.env.BUILD_STANDALONE === "1" ? "standalone" : undefined,
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
