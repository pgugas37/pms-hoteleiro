import { supabase } from '@/lib/supabase'

/** Rótulos compartilhados entre o card "Atividade recente" do Dashboard e a tela de Auditoria. */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  create: 'criou',
  update: 'atualizou',
  delete: 'removeu',
}

export const AUDIT_ENTITY_LABELS: Record<string, string> = {
  profile: 'um usuário',
  hotel: 'os dados do hotel',
  reservation: 'uma reserva',
  payment: 'um pagamento',
}

export async function fetchActorNames(actorIds: string[]): Promise<Record<string, string>> {
  if (actorIds.length === 0) return {}
  const { data, error } = await supabase.from('profiles').select('id, full_name').in('id', actorIds)
  if (error) throw error
  return Object.fromEntries((data ?? []).map((p) => [p.id, p.full_name]))
}
