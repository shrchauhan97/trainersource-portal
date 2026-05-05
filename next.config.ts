import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "cdn11.bigcommerce.com", pathname: "/**" },
      { protocol: "https", hostname: "cdn.bigcommerce.com", pathname: "/**" },
    ],
  },
};

export default nextConfig;
