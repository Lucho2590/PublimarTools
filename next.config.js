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
  // La sección "Rentabilidad" se renombró a "Analíticas": se mantienen vivos
  // los links y favoritos viejos. 307 (no permanente) para no dejar el rename
  // cacheado en los navegadores si algún día se revierte.
  async redirects() {
    return [
      {
        source: "/publimar/administracion/rentabilidad/ventas-por-dia",
        destination: "/publimar/administracion/analiticas/ritmo-de-ventas",
        permanent: false,
      },
      {
        source: "/publimar/administracion/rentabilidad/:path*",
        destination: "/publimar/administracion/analiticas/:path*",
        permanent: false,
      },
    ];
  },
};

module.exports = nextConfig;
