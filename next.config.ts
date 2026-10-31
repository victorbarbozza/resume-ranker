import type { NextConfig } from 'next'

/**
 * Next.js settings.
 *
 * - `output`: a self-contained server in .next/standalone, which the Docker image runs
 * - `agentRules`: off, so `next dev` does not write an AGENTS.md into the repo
 */
const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  agentRules: false,
}

export default nextConfig
