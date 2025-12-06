const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Explicitly enable SWC
  swcMinify: true,

  // Configure any additional SWC options if needed
  experimental: {
    // Disable optimizeCss as we're using critters directly
    optimizeCss: false,
    scrollRestoration: true,
  },

  // Optimize build output
  poweredByHeader: false,
  reactStrictMode: true,
  compress: true,

  // Error handling
  onError: async (err, req, res) => {
    console.error('Server Error:', err);
    res.statusCode = 500;
    res.end('Internal Server Error');
  },

  // Configure webpack if needed
  webpack: (config, { dev, isServer }) => {
    // Handle Web Workers
    config.module.rules.push({
      test: /\.worker\.(js|ts)$/,
      loader: 'worker-loader',
      options: {
        filename: 'static/[hash].worker.js',
        publicPath: '/_next/',
      },
    });

    // Optimize for production
    if (!dev) {
      config.optimization = {
        ...config.optimization,
        minimize: true,
        splitChunks: {
          chunks: 'all',
          minSize: 20000,
          maxSize: 244000,
          minChunks: 1,
          maxAsyncRequests: 30,
          maxInitialRequests: 30,
          cacheGroups: {
            defaultVendors: {
              test: /[\\/]node_modules[\\/]/,
              priority: -10,
              reuseExistingChunk: true,
            },
            default: {
              minChunks: 2,
              priority: -20,
              reuseExistingChunk: true,
            },
          },
        },
      }
    }
    return config;
  },
}

// Export the config with bundle analyzer wrapper
module.exports = withBundleAnalyzer(nextConfig)
