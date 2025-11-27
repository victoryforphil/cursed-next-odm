import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['laz-perf', 'copc'],
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
