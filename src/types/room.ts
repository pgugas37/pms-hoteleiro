export interface RoomType {
  id: string
  name: string
  description: string | null
  capacity_adults: number
  capacity_children: number
  base_price: number
  created_at: string
  updated_at: string
}

export const ROOM_STATUSES = ['disponivel', 'ocupado', 'limpeza', 'manutencao', 'inativo'] as const
export type RoomStatus = (typeof ROOM_STATUSES)[number]

export const ROOM_STATUS_LABELS: Record<RoomStatus, string> = {
  disponivel: 'Disponível',
  ocupado: 'Ocupado',
  limpeza: 'Aguardando limpeza',
  manutencao: 'Em manutenção',
  inativo: 'Inativo',
}

export interface Room {
  id: string
  room_type_id: string
  number: string
  floor: string | null
  status: RoomStatus
  notes: string | null
  created_at: string
  updated_at: string
}

export interface RoomWithType extends Room {
  room_types: { id: string; name: string } | null
}
