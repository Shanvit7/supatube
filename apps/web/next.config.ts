import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  output: "export",
  // Disable image optimization for static export compatibility
  images: {
    unoptimized: true,
  },
}

export default nextConfig
