import { createRequire } from 'module';
const require = createRequire(import.meta.url);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  transpilePackages: ['@modelcontextprotocol/sdk'],
  // Add this section to ensure images from OpenStreetMap are allowed
  images: {
    domains: ['tile.openstreetmap.org'],
  },
  async headers() {
    return [
      // Public map pages – allow CDN caching for a day
      {
        source: '/map/:id*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800'
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
      // Calendar pages
      {
        source: '/calendars/:tripId*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800'
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
  eslint: {
    // Show ESLint issues but don't fail the build
    ignoreDuringBuilds: false,
  },
  typescript: {
    // Only fail build on type errors, not linting issues
    ignoreBuildErrors: false,
  },
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      zod: require.resolve('zod')
    };
    return config;
  },
};

export default nextConfig; 