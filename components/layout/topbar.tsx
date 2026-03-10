'use client'

import { Bell, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getInitials } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'

interface TopbarProps {
  title?: string
}

export function Topbar({ title }: TopbarProps) {
  const router = useRouter()
  const supabase = createClient()
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
    })
  }, [supabase])

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const userEmail = user?.email ?? ''
  const userName = user?.user_metadata?.full_name ?? userEmail.split('@')[0] ?? 'U'

  return (
    <header className="h-16 border-b bg-white flex items-center justify-between px-6 gap-4">
      {/* Título da página */}
      {title && (
        <h1 className="text-lg font-semibold text-slate-800 hidden md:block">
          {title}
        </h1>
      )}

      {/* Search */}
      <div className="flex-1 max-w-md ml-auto md:ml-0">
        <div className="relative">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <Input
            placeholder="Buscar..."
            className="pl-9 h-9 bg-slate-50 border-slate-200 text-sm focus-visible:ring-sky-500"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Notificações (futuro) */}
        <Button variant="ghost" size="icon" className="relative text-slate-500">
          <Bell size={18} />
        </Button>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-full focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2">
              <div className="w-8 h-8 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center text-xs font-semibold">
                {getInitials(userName)}
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium">{userName}</p>
                <p className="text-xs text-muted-foreground">{userEmail}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push('/empresa')}>
              Configurações
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleSignOut}
              className="text-red-600 focus:text-red-600"
            >
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
