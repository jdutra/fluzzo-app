'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  UserCheck,
  Handshake,
  Target,
  FolderKanban,
  TrendingUp,
  Receipt,
  BarChart3,
  Building2,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Package,
  UploadCloud,
  Tag,
  Landmark,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface NavItem {
  href: string
  label: string
  icon: React.ElementType
  group?: string
}

const navItems: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, group: 'Principal' },
  // Vendas
  { href: '/leads', label: 'Leads', icon: TrendingUp, group: 'Vendas' },
  { href: '/projetos', label: 'Projetos', icon: FolderKanban, group: 'Vendas' },
  // Gestão
  { href: '/metas', label: 'Metas', icon: Target, group: 'Gestão' },
  // Financeiro
  { href: '/lancamentos', label: 'Lançamentos', icon: Receipt, group: 'Financeiro' },
  { href: '/fluxo', label: 'Fluxo de Caixa', icon: BarChart3, group: 'Financeiro' },
  { href: '/extrato', label: 'Extrato', icon: Landmark, group: 'Financeiro' },
  { href: '/importar', label: 'Importar', icon: UploadCloud, group: 'Financeiro' },
  // Cadastros
  { href: '/clientes', label: 'Clientes', icon: Users, group: 'Cadastros' },
  { href: '/parceiros', label: 'Parceiros', icon: Handshake, group: 'Cadastros' },
  { href: '/consultores', label: 'Consultores', icon: UserCheck, group: 'Cadastros' },
  { href: '/produtos', label: 'Produtos', icon: Package, group: 'Cadastros' },
  { href: '/classificacoes', label: 'Classificações', icon: Tag, group: 'Cadastros' },
  { href: '/empresa', label: 'Empresa', icon: Building2, group: 'Cadastros' },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [collapsed, setCollapsed] = useState(false)

  const groups = [...new Set(navItems.map((i) => i.group))]

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          'relative flex flex-col h-full bg-slate-900 text-slate-100 transition-all duration-300',
          collapsed ? 'w-16' : 'w-60'
        )}
      >
        {/* Logo */}
        <div
          className={cn(
            'flex items-center h-16 px-4 border-b border-slate-700',
            collapsed ? 'justify-center' : 'gap-3'
          )}
        >
          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-sky-500 flex items-center justify-center font-bold text-white text-sm">
            F
          </div>
          {!collapsed && (
            <span className="font-semibold text-lg tracking-tight">Fluzzo</span>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-2">
          {groups.map((group) => {
            const items = navItems.filter((i) => i.group === group)
            return (
              <div key={group} className="mb-4">
                {!collapsed && (
                  <p className="px-3 mb-1 text-xs font-medium text-slate-500 uppercase tracking-wider">
                    {group}
                  </p>
                )}
                <ul className="space-y-0.5">
                  {items.map((item) => {
                    const isActive =
                      item.href === '/'
                        ? pathname === '/'
                        : pathname.startsWith(item.href)
                    const Icon = item.icon

                    return (
                      <li key={item.href}>
                        {collapsed ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Link
                                href={item.href}
                                className={cn(
                                  'flex items-center justify-center w-full h-10 rounded-md transition-colors',
                                  isActive
                                    ? 'bg-sky-600 text-white'
                                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                                )}
                              >
                                <Icon size={18} />
                              </Link>
                            </TooltipTrigger>
                            <TooltipContent side="right">
                              {item.label}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <Link
                            href={item.href}
                            className={cn(
                              'flex items-center gap-3 px-3 h-10 rounded-md text-sm transition-colors',
                              isActive
                                ? 'bg-sky-600 text-white font-medium'
                                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                            )}
                          >
                            <Icon size={16} className="flex-shrink-0" />
                            <span>{item.label}</span>
                          </Link>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </nav>

        {/* Sign out */}
        <div className="border-t border-slate-700 p-2">
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleSignOut}
                  className="flex items-center justify-center w-full h-10 rounded-md text-slate-400 hover:bg-slate-800 hover:text-red-400 transition-colors"
                >
                  <LogOut size={18} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Sair</TooltipContent>
            </Tooltip>
          ) : (
            <button
              onClick={handleSignOut}
              className="flex items-center gap-3 px-3 h-10 w-full rounded-md text-sm text-slate-400 hover:bg-slate-800 hover:text-red-400 transition-colors"
            >
              <LogOut size={16} />
              <span>Sair</span>
            </button>
          )}
        </div>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-slate-300 hover:bg-slate-600 transition-colors z-10"
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>
      </aside>
    </TooltipProvider>
  )
}
