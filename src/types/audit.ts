export const AUDIT_ACTIONS = ['create', 'update', 'delete'] as const
export type AuditAction = (typeof AUDIT_ACTIONS)[number]

export const AUDIT_ENTITIES = ['profile', 'hotel', 'reservation', 'payment'] as const
export type AuditEntityType = (typeof AUDIT_ENTITIES)[number]

export interface AuditLogEntry {
  id: number
  action: string
  entity: string
  entity_id: string | null
  actor_id: string | null
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  created_at: string
}
