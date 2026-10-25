/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api',
    NEXT_PUBLIC_WEB_URL: process.env.NEXT_PUBLIC_WEB_URL || 'http://localhost:3000',
  },
  transpilePackages: ['@petra/shared'],
  async redirects() {
    return [
      // The redesign renamed Features to Platform. Permanent, so search
      // engines and old links move over.
      { source: '/features', destination: '/platform', permanent: true },
    ];
  },
};

module.exports = nextConfig;
