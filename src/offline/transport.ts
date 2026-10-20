import type { Guest } from '@/types/guest'

export interface TransportError {
  code?: string
  message: string
  details?: string
}

/** status 0 = sem resposta (rede). */
export type TransportResult = { ok: true } | { ok: false; status: number; error: TransportError }
export type TransportFailure = Extract<TransportResult, { ok: false }>

export type RpcName =
  | 'checkin_reservation'
  | 'checkout_reservation'
  | 'cancel_reservation'
  | 'mark_room_clean'
  | 'register_payment'

/** O que o caderninho precisa do servidor (a versão real fica em server.ts; os testes usam uma falsa). */
export interface Transport {
  insert(table: 'guests' | 'reservations', row: object): Promise<TransportResult>
  update(table: 'guests' | 'reservations', id: string, patch: object): Promise<TransportResult>
  rpc(fn: RpcName, args: Record<string, unknown>): Promise<TransportResult>
  /** Lança erro se não houver rede. */
  findGuestByDocument(documentType: string, documentNumber: string): Promise<Guest | null>
}
