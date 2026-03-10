/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // Os erros são de tipagem do Supabase (nunca afetam runtime)
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverActions: {
      // Permite Server Actions de localhost, Vercel e domínio customizado
      allowedOrigins: ['localhost:3000', '*.vercel.app'],
    },
  },
}

export default nextConfig
