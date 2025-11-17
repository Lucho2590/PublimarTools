/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // Configuración para SSR con Firebase
  reactStrictMode: true,
  swcMinify: true,
  // No usar output: 'export' porque queremos SSR
  // Configuración para Firebase Hosting
  poweredByHeader: false,
  compress: true,
};

module.exports = nextConfig;
