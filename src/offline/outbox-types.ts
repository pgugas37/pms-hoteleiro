import type { EntityKey } from '@/offline/db'
import type { Guest } from '@/types/guest'
import type { PaymentMethod } from '@/types/payment'
import type { CancellationReason, Reservation } from '@/types/reservation'

export type NewGuestRow = Omit<Guest, 'created_at' | 'updated_at'>
export type NewReservationRow = Omit<Reservation, 'created_at' | 'updated_at'>
export type GuestPatch = Partial<Omit<Guest, 'id' | 'created_at' | 'updated_at'>>
export type ReservationPatch = Partial<
  Pick<
    Reservation,
    'guest_id' | 'room_id' | 'check_in' | 'check_out' | 'adults' | 'children' | 'daily_rate' | 'occupant_name' | 'notes'
  >
>

/** Formato dos dados de cada tipo de ação do caderninho. */
export interface PayloadByKind {
  'guest.create': { row: NewGuestRow }
  'guest.update': { id: string; patch: GuestPatch }
  'reservation.create': { row: NewReservationRow }
  'reservation.update': { id: string; patch: ReservationPatch }
  'reservation.invoice': { id: string; invoice_issued: boolean; invoice_issued_at: string | null }
  'reservation.checkin': { id: string; at: string }
  'reservation.checkout': { id: string; at: string }
  'reservation.cancel': { id: string; reason: CancellationReason; notes: string | null }
  'room.clean': { id: string }
  'payment.create': {
    id: string
    reservation_id: string
    amount: number
    method: PaymentMethod
    notes: string | null
    at: string
  }
}

export type OutboxKind = keyof PayloadByKind
export type OutboxStatus = 'pendente' | 'enviando' | 'recusado'
export type RejectReason = 'conflito_quarto' | 'sem_permissao' | 'regra' | 'nao_encontrado' | 'dependencia' | 'erro'

export interface OutboxError {
  reason: RejectReason
  message: string
}

interface OutboxBase {
  /** Ordem no caderninho (gerada pelo banco local). */
  seq?: number
  /** Etiqueta do item. */
  id: string
  /** Registros que o item cria ou altera (o download não sobrescreve esses). */
  entityIds: EntityKey[]
  /** Registros que precisam existir no servidor antes deste item. */
  dependsOn: EntityKey[]
  /** Texto para a tela Pendências, montado na hora da ação. */
  description: string
  createdAt: string
  userId: string
  status: OutboxStatus
  error: OutboxError | null
  attempts: number
}

export type OutboxItem = {
  [K in OutboxKind]: OutboxBase & { kind: K; payload: PayloadByKind[K] }
}[OutboxKind]

export type NewOutboxItem = {
  [K in OutboxKind]: Omit<OutboxBase, 'seq' | 'id' | 'status' | 'error' | 'attempts' | 'createdAt'> & {
    kind: K
    payload: PayloadByKind[K]
  }
}[OutboxKind]
