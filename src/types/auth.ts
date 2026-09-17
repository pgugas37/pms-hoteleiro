export const ROLES = [
  'admin',
  'gerente',
  'recepcao',
  'governanca',
  'financeiro',
  'manutencao',
] as const

export type Role = (typeof ROLES)[number]

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrador',
  gerente: 'Gerente',
  recepcao: 'Recepção',
  governanca: 'Governança',
  financeiro: 'Financeiro',
  manutencao: 'Manutenção',
}

export interface Profile {
  id: string
  full_name: string
  role: Role
  active: boolean
  hotel_id: string | null
  created_at: string
  updated_at: string
}
