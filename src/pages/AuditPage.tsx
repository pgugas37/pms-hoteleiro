import { useQuery } from '@tanstack/react-query'
import * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AUDIT_ACTION_LABELS, AUDIT_ENTITY_LABELS, fetchActorNames } from '@/lib/audit'
import { supabase } from '@/lib/supabase'
import { AUDIT_ACTIONS, AUDIT_ENTITIES, type AuditAction, type AuditEntityType, type AuditLogEntry } from '@/types/audit'

const LOG_LIMIT = 300

async function fetchAuditLog(): Promise<AuditLogEntry[]> {
  const { data, error } = await supabase
    .from('audit_log')
    .select('id, action, entity, entity_id, actor_id, before, after, created_at')
    .order('created_at', { ascending: false })
    .limit(LOG_LIMIT)
  if (error) throw error
  return (data ?? []) as AuditLogEntry[]
}

function actionBadgeVariant(action: string) {
  if (action === 'create') return 'default'
  if (action === 'delete') return 'destructive'
  return 'secondary'
}

export function AuditPage() {
  const [entityFilter, setEntityFilter] = React.useState<AuditEntityType | 'todas'>('todas')
  const [actionFilter, setActionFilter] = React.useState<AuditAction | 'todas'>('todas')
  const [detailEntry, setDetailEntry] = React.useState<AuditLogEntry | null>(null)

  const { data: entries, isLoading } = useQuery({ queryKey: ['audit-log-full'], queryFn: fetchAuditLog })

  const actorIds = React.useMemo(
    () => Array.from(new Set((entries ?? []).map((e) => e.actor_id).filter((id): id is string => !!id))),
    [entries]
  )
  const { data: actorNames } = useQuery({
    queryKey: ['audit-log-actor-names', actorIds],
    queryFn: () => fetchActorNames(actorIds),
    enabled: actorIds.length > 0,
  })

  const filteredEntries = React.useMemo(() => {
    return (entries ?? []).filter((entry) => {
      if (entityFilter !== 'todas' && entry.entity !== entityFilter) return false
      if (actionFilter !== 'todas' && entry.action !== actionFilter) return false
      return true
    })
  }, [entries, entityFilter, actionFilter])

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Auditoria</h1>
        <p className="text-sm text-muted-foreground">
          Histórico de criações, edições e exclusões de usuários, dados do hotel, reservas e pagamentos — os últimos{' '}
          {LOG_LIMIT} registros. Só admin tem acesso a esta tela.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Registros</CardTitle>
          <CardDescription>Mais recentes primeiro.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Select value={entityFilter} onValueChange={(value) => setEntityFilter(value as AuditEntityType | 'todas')}>
              <SelectTrigger className="sm:max-w-[200px]">
                <SelectValue placeholder="Tipo de dado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todos os tipos</SelectItem>
                {AUDIT_ENTITIES.map((entity) => (
                  <SelectItem key={entity} value={entity}>
                    {AUDIT_ENTITY_LABELS[entity]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={actionFilter} onValueChange={(value) => setActionFilter(value as AuditAction | 'todas')}>
              <SelectTrigger className="sm:max-w-[180px]">
                <SelectValue placeholder="Ação" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as ações</SelectItem>
                {AUDIT_ACTIONS.map((action) => (
                  <SelectItem key={action} value={action}>
                    {AUDIT_ACTION_LABELS[action]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
          {!isLoading && filteredEntries.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum registro encontrado com esse filtro.</p>
          )}

          {filteredEntries.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data/hora</TableHead>
                  <TableHead>Quem</TableHead>
                  <TableHead>Ação</TableHead>
                  <TableHead>Tipo de dado</TableHead>
                  <TableHead className="text-right">Detalhes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEntries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="whitespace-nowrap">
                      {new Date(entry.created_at).toLocaleString('pt-BR')}
                    </TableCell>
                    <TableCell>{entry.actor_id ? actorNames?.[entry.actor_id] ?? 'Alguém' : 'Sistema'}</TableCell>
                    <TableCell>
                      <Badge variant={actionBadgeVariant(entry.action)}>
                        {AUDIT_ACTION_LABELS[entry.action] ?? entry.action}
                      </Badge>
                    </TableCell>
                    <TableCell>{AUDIT_ENTITY_LABELS[entry.entity] ?? entry.entity}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" onClick={() => setDetailEntry(entry)}>
                        Ver
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!detailEntry} onOpenChange={(open) => !open && setDetailEntry(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {detailEntry && (AUDIT_ACTION_LABELS[detailEntry.action] ?? detailEntry.action)}{' '}
              {detailEntry && (AUDIT_ENTITY_LABELS[detailEntry.entity] ?? detailEntry.entity)}
            </DialogTitle>
            <DialogDescription>
              {detailEntry && new Date(detailEntry.created_at).toLocaleString('pt-BR')}
              {detailEntry?.entity_id && ` — ID ${detailEntry.entity_id}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {detailEntry?.before && (
              <div>
                <p className="mb-1 text-sm font-medium">Antes</p>
                <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
                  {JSON.stringify(detailEntry.before, null, 2)}
                </pre>
              </div>
            )}
            {detailEntry?.after && (
              <div>
                <p className="mb-1 text-sm font-medium">Depois</p>
                <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
                  {JSON.stringify(detailEntry.after, null, 2)}
                </pre>
              </div>
            )}
            {detailEntry && !detailEntry.before && !detailEntry.after && (
              <p className="text-sm text-muted-foreground">Sem detalhes registrados pra esse evento.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
