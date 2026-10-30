import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Minimal self-contained server bundle for the VM deploy.
  output: "standalone",
  cacheComponents: true,
  // Spawns the local `qloo mcp` stdio server; keep it out of the bundle.
  serverExternalPackages: ["@modelcontextprotocol/sdk"],
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
