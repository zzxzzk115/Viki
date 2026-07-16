import type { NextConfig } from 'next'

// '/Viki' for the github.io project page; '' once a custom domain is in play.
// Kept on in dev too, so basePath bugs surface locally instead of on Pages.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '/Viki'

export default {
  output: 'export',
  basePath,
  trailingSlash: true,
  // Required: the default loader needs a server, which a static export has no room for.
  images: { unoptimized: true },
  reactStrictMode: true,
} satisfies NextConfig
