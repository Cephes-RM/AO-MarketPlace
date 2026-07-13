import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@albion/db",
    "@albion/ui",
    "@albion/rating-engine",
    "@albion/albion-client",
  ],
};

export default nextConfig;
