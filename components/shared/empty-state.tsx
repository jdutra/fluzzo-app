import { Button } from '@/components/ui/button'
import { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {Icon && (
        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-4">
          <Icon size={22} className="text-slate-400" />
        </div>
      )}
      <p className="font-medium text-slate-700">{title}</p>
      {description && (
        <p className="text-sm text-muted-foreground mt-1 max-w-xs">{description}</p>
      )}
      {action && (
        <Button
          size="sm"
          className="mt-4 bg-sky-600 hover:bg-sky-700"
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      )}
    </div>
  )
}
