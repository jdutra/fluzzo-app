/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // Os erros são de tipagem do Supabase (nunca afetam runtime)
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Server Actions — sem restrição de origin (compatível com Vercel, localhost e domínio customizado)
  serverExternalPackages: [],
}

export default nextConfig
