import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['laz-perf', 'copc'],
};

export default nextConfig;
