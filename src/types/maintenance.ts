export const MAINTENANCE_STATUSES = ['aberto', 'resolvido'] as const
export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number]

export const MAINTENANCE_STATUS_LABELS: Record<MaintenanceStatus, string> = {
  aberto: 'Aberto',
  resolvido: 'Resolvido',
}

export interface MaintenanceRequest {
  id: string
  room_id: string
  description: string
  status: MaintenanceStatus
  reported_by: string | null
  resolved_by: string | null
  created_at: string
  resolved_at: string | null
}

export interface MaintenanceRequestWithRoom extends MaintenanceRequest {
  rooms: { id: string; number: string } | null
}
