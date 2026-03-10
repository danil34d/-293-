const path = require('path');
/** @type {import('next').NextConfig} */
const runtimeDistDir = process.env.NEXT_DIST_DIR || '.next';

const nextConfig = {
  distDir: runtimeDistDir,
  experimental: {
    instrumentationHook: false,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
  webpack(config) {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      '@': path.join(__dirname, 'src'),
    };

    return config;
  },
  // Proxy API requests to Go backend when USE_GO_BACKEND is set.
  // Keep selected Next.js API routes local: shifts/requests/telegram-internal.
  async rewrites() {
    const useGoBackend = process.env.USE_GO_BACKEND === 'true';
    if (useGoBackend) {
      const goBackendUrl = process.env.GO_BACKEND_URL || 'http://localhost:8080';

      return [
        {
          source: '/api/:path((?!shifts|shift-swap-requests|shift-assignment-requests|telegram).*)*',
          destination: `${goBackendUrl}/api/:path*`,
        },
      ];
    }
    return [];
  },
};

module.exports = nextConfig;
