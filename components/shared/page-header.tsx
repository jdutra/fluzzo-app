import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'

interface PageHeaderProps {
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">{title}</h2>
        {description && (
          <p className="text-muted-foreground mt-1 text-sm">{description}</p>
        )}
      </div>
      {action && (
        <Button onClick={action.onClick} className="bg-sky-600 hover:bg-sky-700">
          <Plus size={16} />
          {action.label}
        </Button>
      )}
    </div>
  )
}
