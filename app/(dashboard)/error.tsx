'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Dashboard error:', error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100">
        <AlertTriangle size={24} className="text-red-600" />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-slate-800">Ocorreu um erro inesperado</h2>
        <p className="text-sm text-slate-500 mt-1 max-w-sm">
          {error.message || 'Algo deu errado ao carregar esta página.'}
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => window.location.reload()}>
          Recarregar página
        </Button>
        <Button onClick={reset} className="bg-teal-600 hover:bg-teal-700">
          Tentar novamente
        </Button>
      </div>
    </div>
  )
}
