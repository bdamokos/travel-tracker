/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // Add this section to ensure images from OpenStreetMap are allowed
  images: {
    domains: ['tile.openstreetmap.org'],
  },
  eslint: {
    // Show ESLint issues but don't fail the build
    ignoreDuringBuilds: false,
  },
  typescript: {
    // Only fail build on type errors, not linting issues
    ignoreBuildErrors: false,
  },
};

export default nextConfig; 