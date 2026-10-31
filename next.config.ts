import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // self-contained server in .next/standalone, which the Docker image runs
  output: 'standalone',
  poweredByHeader: false,
}

export default nextConfig
