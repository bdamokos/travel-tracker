// import { createRequire } from 'module';
// const require = createRequire(import.meta.url);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // Allow loading map tiles from OpenStreetMap
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'tile.openstreetmap.org',
        pathname: '/**',
      },
    ],
  },
  async headers() {
    return [
      // Map pages are host-sensitive: admin hosts include planning/shadow data.
      {
        source: '/map/:id*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store'
          }
        ],
      },
      // Embeddable maps
      {
        source: '/embed/:id*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800'
          }
        ],
      },
      // Maps list
      {
        source: '/maps',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400'
          }
        ],
      },
      // Calendar pages are host-sensitive: admin hosts include planning/shadow data.
      {
        source: '/calendars/:tripId*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store'
          }
        ],
      },
      {
        source: '/calendars',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400'
          }
        ],
      },
    ];
  },
  typescript: {
    // Only fail build on type errors, not linting issues
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
