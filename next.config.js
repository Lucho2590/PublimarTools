/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,  // ← Ignorar errores de TypeScript durante build
  },
};

module.exports = nextConfig;
