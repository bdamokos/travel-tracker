/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  output: 'standalone',
  // Add this section to ensure images from OpenStreetMap are allowed
  images: {
    domains: ['tile.openstreetmap.org'],
  },
};

module.exports = nextConfig; 