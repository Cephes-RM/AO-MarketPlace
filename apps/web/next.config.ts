import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // This app is part of a monorepo, but Prisma's generated files are stored
  // in the root node_modules directory. Start file tracing from the repo root
  // so Vercel can include files that live outside apps/web.
  outputFileTracingRoot: path.join(__dirname, "../../"),
  outputFileTracingIncludes: {
    // Prisma loads a native query-engine file at runtime. It is not detected
    // automatically, so include it in the serverless function for player pages.
    "/players/**": [
      "./node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client/**/*",
    ],
  },
  // Keep Prisma outside the server bundle. This allows it to load the native
  // query engine file copied by the tracing rule above.
  serverExternalPackages: ["@prisma/client", "prisma"],
  transpilePackages: [
    "@albion/db",
    "@albion/ui",
    "@albion/rating-engine",
    "@albion/albion-client",
  ],
};

export default nextConfig;
