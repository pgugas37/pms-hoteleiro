import type { BadgeProps } from '@/components/ui/badge'
import type { ReservationStatus } from '@/types/reservation'
import type { RoomStatus } from '@/types/room'

type BadgeVariant = NonNullable<BadgeProps['variant']>

/**
 * Cores de status usadas no sistema inteiro (badges, Quadro de quartos, Mapa de ocupação).
 * Regra: pinho = hóspede no quarto, azul = reserva confirmada, menta = livre,
 * âmbar = limpeza, coral = manutenção/cancelamento.
 */
export function reservationStatusVariant(status: ReservationStatus): BadgeVariant {
  if (status === 'confirmada') return 'info'
  if (status === 'em_andamento') return 'solid'
  if (status === 'cancelada') return 'destructive'
  return 'outline'
}

export function roomStatusVariant(status: RoomStatus): BadgeVariant {
  if (status === 'disponivel') return 'success'
  if (status === 'ocupado') return 'solid'
  if (status === 'limpeza') return 'warning'
  if (status === 'manutencao') return 'destructive'
  return 'outline'
}

/** Classes do "ladrilho" de quarto no Quadro de quartos do Dashboard. */
export const ROOM_TILE_CLASSES: Record<RoomStatus, string> = {
  disponivel: 'border-status-free/60 bg-status-free/10 text-pine hover:bg-status-free/20',
  ocupado: 'border-pine bg-pine text-white hover:bg-pine-soft',
  limpeza: 'border-status-cleaning/70 bg-status-cleaning/20 text-[hsl(30_80%_28%)] hover:bg-status-cleaning/30',
  manutencao:
    'border-status-maintenance/60 bg-[repeating-linear-gradient(135deg,hsl(var(--status-maintenance)/0.14)_0_6px,hsl(var(--status-maintenance)/0.04)_6px_12px)] text-[hsl(6_68%_38%)] hover:bg-status-maintenance/20',
  inativo: 'border-dashed border-status-inactive bg-transparent text-muted-foreground hover:bg-muted',
}

/** Cor sólida (legendas, barra de ocupação). */
export const ROOM_STATUS_DOT: Record<RoomStatus, string> = {
  disponivel: 'bg-status-free',
  ocupado: 'bg-status-occupied',
  limpeza: 'bg-status-cleaning',
  manutencao: 'bg-status-maintenance',
  inativo: 'bg-status-inactive',
}
