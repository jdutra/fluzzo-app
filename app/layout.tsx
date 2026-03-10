import type { Metadata } from 'next'
import './globals.css'
import { Providers } from './providers'

export const metadata: Metadata = {
  title: 'Fluzzo — Gestão de Leads e Financeiro',
  description:
    'SaaS gerencial para consultoras e empresas de serviço. CRM de leads, projetos e controle financeiro.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR" className="h-full">
      <body className="font-sans antialiased h-full overflow-hidden">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
