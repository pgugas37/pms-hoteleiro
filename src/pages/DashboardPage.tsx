import { useQuery } from '@tanstack/react-query'
import * as React from 'react'
import { Link } from 'react-router-dom'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/lib/auth-context'
import { fetchHotel } from '@/lib/hotel'
import { supabase } from '@/lib/supabase'
import { ROLES, ROLE_LABELS, type Role } from '@/types/auth'

interface AuditEntry {
  id: number
  action: string
  entity: string
  entity_id: string | null
  actor_id: string | null
  created_at: string
}

const ACTION_LABELS: Record<string, string> = {
  create: 'criou',
  update: 'atualizou',
  delete: 'removeu',
}

const ENTITY_LABELS: Record<string, string> = {
  profile: 'um usuário',
  hotel: 'os dados do hotel',
}

async function fetchUserStats(): Promise<{ role: Role; active: boolean }[]> {
  const { data, error } = await supabase.from('profiles').select('role, active')
  if (error) throw error
  return (data ?? []) as { role: Role; active: boolean }[]
}

async function fetchRoomStats(): Promise<{ status: string }[]> {
  const { data, error } = await supabase.from('rooms').select('status')
  if (error) throw error
  return (data ?? []) as { status: string }[]
}

async function fetchAuditLog(): Promise<AuditEntry[]> {
  const { data, error } = await supabase
    .from('audit_log')
    .select('id, action, entity, entity_id, actor_id, created_at')
    .order('created_at', { ascending: false })
    .limit(10)
  if (error) throw error
  return (data ?? []) as AuditEntry[]
}

async function fetchActorNames(actorIds: string[]): Promise<Record<string, string>> {
  if (actorIds.length === 0) return {}
  const { data, error } = await supabase.from('profiles').select('id, full_name').in('id', actorIds)
  if (error) throw error
  return Object.fromEntries((data ?? []).map((p) => [p.id, p.full_name]))
}

export function DashboardPage() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'

  const { data: hotel } = useQuery({ queryKey: ['hotel'], queryFn: fetchHotel })

  const { data: userStats } = useQuery({
    queryKey: ['dashboard-user-stats'],
    queryFn: fetchUserStats,
    enabled: isAdmin,
  })

  const { data: roomStats } = useQuery({
    queryKey: ['dashboard-room-stats'],
    queryFn: fetchRoomStats,
  })

  const { data: auditLog } = useQuery({
    queryKey: ['dashboard-audit-log'],
    queryFn: fetchAuditLog,
    enabled: isAdmin,
  })

  const actorIds = React.useMemo(
    () =>
      Array.from(
        new Set((auditLog ?? []).map((entry) => entry.actor_id).filter((id): id is string => !!id))
      ),
    [auditLog]
  )

  const { data: actorNames } = useQuery({
    queryKey: ['dashboard-actor-names', actorIds],
    queryFn: () => fetchActorNames(actorIds),
    enabled: isAdmin && actorIds.length > 0,
  })

  const roleCounts = React.useMemo(() => {
    const counts = new Map<Role, number>()
    for (const role of ROLES) counts.set(role, 0)
    let activeCount = 0
    let inactiveCount = 0
    for (const user of userStats ?? []) {
      counts.set(user.role, (counts.get(user.role) ?? 0) + 1)
      if (user.active) activeCount++
      else inactiveCount++
    }
    return { counts, activeCount, inactiveCount, total: (userStats ?? []).length }
  }, [userStats])

  const occupancy = React.useMemo(() => {
    const total = (roomStats ?? []).length
    const occupied = (roomStats ?? []).filter((r) => r.status === 'ocupado').length
    const available = (roomStats ?? []).filter((r) => r.status === 'disponivel').length
    const cleaning = (roomStats ?? []).filter((r) => r.status === 'limpeza').length
    const maintenance = (roomStats ?? []).filter((r) => r.status === 'manutencao').length
    const rate = total > 0 ? Math.round((occupied / total) * 100) : 0
    return { total, occupied, available, cleaning, maintenance, rate }
  }, [roomStats])

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Bem-vindo(a){profile ? `, ${profile.full_name.split(' ')[0]}` : ''}
        </h1>
        <p className="text-sm text-muted-foreground">
          {profile ? ROLE_LABELS[profile.role] : 'Carregando seu perfil...'}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{hotel ? hotel.name : 'Hotel'}</CardTitle>
          <CardDescription>
            {hotel?.address
              ? `${hotel.address.city} - ${hotel.address.state}`
              : 'Nenhum hotel cadastrado ainda.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link to="/hotel" className="text-sm text-primary underline-offset-4 hover:underline">
            Ver configurações do hotel
          </Link>
        </CardContent>
      </Card>

      {occupancy.total > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Ocupação atual</CardTitle>
            <CardDescription>
              {occupancy.occupied} de {occupancy.total} quartos ocupados ({occupancy.rate}%)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Disponíveis</span>
              <span>{occupancy.available}</span>
            </div>
            {occupancy.cleaning > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Aguardando limpeza</span>
                <span>{occupancy.cleaning}</span>
              </div>
            )}
            {occupancy.maintenance > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Em manutenção</span>
                <span>{occupancy.maintenance}</span>
              </div>
            )}
            <Link to="/reservas" className="mt-2 inline-block text-sm text-primary underline-offset-4 hover:underline">
              Ver reservas
            </Link>
          </CardContent>
        </Card>
      )}

      {isAdmin && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Usuários</CardTitle>
              <CardDescription>
                {roleCounts.total} no total · {roleCounts.activeCount} ativos · {roleCounts.inactiveCount}{' '}
                inativos
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              {ROLES.map((role) => (
                <div key={role} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{ROLE_LABELS[role]}</span>
                  <span>{roleCounts.counts.get(role) ?? 0}</span>
                </div>
              ))}
              <Link
                to="/usuarios"
                className="mt-2 inline-block text-sm text-primary underline-offset-4 hover:underline"
              >
                Gerenciar usuários
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Atividade recente</CardTitle>
              <CardDescription>Últimas ações registradas</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(auditLog ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhuma atividade registrada ainda.</p>
              )}
              {(auditLog ?? []).map((entry) => (
                <div key={entry.id} className="text-sm">
                  <span className="font-medium">
                    {entry.actor_id ? actorNames?.[entry.actor_id] ?? 'Alguém' : 'Sistema'}
                  </span>{' '}
                  {ACTION_LABELS[entry.action] ?? entry.action} {ENTITY_LABELS[entry.entity] ?? entry.entity}
                  <div className="text-xs text-muted-foreground">
                    {new Date(entry.created_at).toLocaleString('pt-BR')}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="border-dashed">
        <CardContent className="pt-6 text-sm text-muted-foreground">
          Indicadores financeiros (receita, diárias) vão aparecer aqui quando o módulo de Financeiro for
          implementado.
        </CardContent>
      </Card>
    </div>
  )
}
