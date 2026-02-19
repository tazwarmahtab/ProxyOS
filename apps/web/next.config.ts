import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable Turbopack to use Webpack instead (fixes LightningCSS issues)
  experimental: {},
  webpack: (config, { isServer }) => {
    // Handle lightningcss native bindings
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
      };
    }
    return config;
  },
};

export default nextConfig;
