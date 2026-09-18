export const PAYMENT_METHODS = ['dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'transferencia'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
  transferencia: 'Transferência',
}

export interface Payment {
  id: string
  reservation_id: string
  amount: number
  method: PaymentMethod
  notes: string | null
  registered_by: string | null
  created_at: string
}

export interface PaymentWithReservation extends Payment {
  reservations: {
    id: string
    check_in: string
    check_out: string
    guests: { id: string; full_name: string } | null
    rooms: { id: string; number: string } | null
  } | null
}
