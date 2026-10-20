import { AlertTriangle, CloudOff, Loader2, ServerCrash, Wifi } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { cn } from '@/lib/utils'
import { useSync } from '@/offline/sync-context'

function elapsed(since: number | null): string {
  if (!since) return 'muito tempo'
  const minutes = Math.max(1, Math.round((Date.now() - since) / 60_000))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours} h`
  return `${Math.round(hours / 24)} dias`
}

/**
 * Aviso de conexão na barra de cima. Clicar abre Pendências.
 * `compact` é a versão do celular: mesmo ícone e cor, com texto curto (ou só o ícone quando está tudo certo).
 */
export function SyncStatus({ compact = false }: { compact?: boolean }) {
  const { state } = useSync()
  const navigate = useNavigate()
  const waiting = state.pending > 0 ? ` · ${state.pending} aguardando envio` : ''
  const waitingShort = state.pending > 0 ? ` · ${state.pending}` : ''

  let Icon = Wifi
  let label = 'Online'
  let short = ''
  let tone = 'text-mint-strong'
  if (state.rejected > 0) {
    Icon = AlertTriangle
    label = state.rejected === 1 ? '1 pendência' : `${state.rejected} pendências`
    short = String(state.rejected)
    tone = 'text-destructive'
  } else if (state.busy && state.pending > 0) {
    Icon = Loader2
    label = 'Enviando…'
    short = String(state.pending)
    tone = 'text-muted-foreground'
  } else if (state.connection === 'sem-internet') {
    Icon = CloudOff
    label = `Sem internet${waiting}`
    short = `Sem internet${waitingShort}`
    tone = 'text-[hsl(30_80%_32%)]'
  } else if (state.connection === 'servidor-fora') {
    Icon = ServerCrash
    label = `Sem falar com o servidor há ${elapsed(state.lastServerContactAt)}${waiting}`
    short = `Sem servidor${waitingShort}`
    tone = 'text-[hsl(30_80%_32%)]'
  } else if (state.pending > 0) {
    label = `${state.pending} aguardando envio`
    short = String(state.pending)
  }

  const text = compact ? short : label

  return (
    <button
      type="button"
      onClick={() => navigate('/pendencias')}
      className={cn(
        'flex items-center gap-1.5 rounded-full border text-xs font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        compact ? 'max-w-[9rem] px-2.5 py-1' : 'max-w-[18rem] px-3 py-1',
        tone
      )}
      title="Ver o que está aguardando envio"
      aria-label={label}
    >
      <Icon className={cn('h-3.5 w-3.5 shrink-0', Icon === Loader2 && 'animate-spin')} />
      {text && <span className="truncate">{text}</span>}
    </button>
  )
}
