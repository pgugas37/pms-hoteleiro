import { AlertTriangle, Clock } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import type { EntityKey } from '@/offline/db'
import { useSync } from '@/offline/sync-context'

/** "Aguardando envio" (ainda no caderninho) ou "Recusada" (está em Pendências). */
export function PendingBadge({ entity }: { entity: EntityKey }) {
  const status = useSync().entityStatus.get(entity)
  if (!status) return null
  return status === 'recusado' ? (
    <Badge variant="destructive">
      <AlertTriangle className="h-3 w-3" />
      Recusada
    </Badge>
  ) : (
    <Badge variant="outline">
      <Clock className="h-3 w-3" />
      Aguardando envio
    </Badge>
  )
}
