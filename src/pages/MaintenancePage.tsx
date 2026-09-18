import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { maintenanceRequestSchema, type MaintenanceRequestInput } from '@/lib/validations'
import type { Role } from '@/types/auth'
import { MAINTENANCE_STATUS_LABELS, type MaintenanceRequestWithRoom } from '@/types/maintenance'

const REPORT_ROLES: Role[] = ['admin', 'gerente', 'recepcao', 'governanca', 'manutencao']
const RESOLVE_ROLES: Role[] = ['admin', 'gerente', 'manutencao']

async function fetchMaintenanceRequests(): Promise<MaintenanceRequestWithRoom[]> {
  const { data, error } = await supabase
    .from('maintenance_requests')
    .select('*, rooms(id, number)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data as unknown as MaintenanceRequestWithRoom[]) ?? []
}

async function fetchRoomsForSelect(): Promise<{ id: string; number: string }[]> {
  const { data, error } = await supabase.from('rooms').select('id, number').order('number', { ascending: true })
  if (error) throw error
  return data ?? []
}

function rpcErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: string }).message
    if (message) return message
  }
  return fallback
}

export function MaintenancePage() {
  const { profile } = useAuth()
  const canReport = !!profile && REPORT_ROLES.includes(profile.role)
  const canResolve = !!profile && RESOLVE_ROLES.includes(profile.role)
  const queryClient = useQueryClient()

  const { data: requests, isLoading } = useQuery({
    queryKey: ['maintenance-requests'],
    queryFn: fetchMaintenanceRequests,
  })

  const { data: rooms } = useQuery({
    queryKey: ['rooms-select'],
    queryFn: fetchRoomsForSelect,
    enabled: canReport,
  })

  const resolveRequest = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('resolve_maintenance_request', { p_request_id: id })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-requests'] })
      queryClient.invalidateQueries({ queryKey: ['rooms-select'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-room-stats'] })
      toast.success('Chamado resolvido.')
    },
    onError: (error) => toast.error(rpcErrorMessage(error, 'Não foi possível resolver o chamado.')),
  })

  const openRequests = React.useMemo(() => (requests ?? []).filter((r) => r.status === 'aberto'), [requests])
  const resolvedRequests = React.useMemo(
    () => (requests ?? []).filter((r) => r.status === 'resolvido'),
    [requests]
  )

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Manutenção</h1>
        <p className="text-sm text-muted-foreground">Chamados de manutenção reportados nos quartos.</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Chamados abertos</CardTitle>
            <CardDescription>Problemas ainda não resolvidos.</CardDescription>
          </div>
          {canReport && <ReportDialog rooms={rooms ?? []} />}
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}

          {!isLoading && openRequests.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum chamado aberto no momento.</p>
          )}

          {openRequests.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quarto</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Reportado em</TableHead>
                  {canResolve && <TableHead className="text-right">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {openRequests.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell>{request.rooms?.number ?? '—'}</TableCell>
                    <TableCell>{request.description}</TableCell>
                    <TableCell>{new Date(request.created_at).toLocaleString('pt-BR')}</TableCell>
                    {canResolve && (
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          onClick={() => resolveRequest.mutate(request.id)}
                          disabled={resolveRequest.isPending}
                        >
                          Resolver
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {resolvedRequests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Resolvidos recentemente</CardTitle>
            <CardDescription>Histórico dos últimos chamados já resolvidos.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quarto</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Resolvido em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resolvedRequests.slice(0, 10).map((request) => (
                  <TableRow key={request.id}>
                    <TableCell>{request.rooms?.number ?? '—'}</TableCell>
                    <TableCell>{request.description}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{MAINTENANCE_STATUS_LABELS[request.status]}</Badge>
                    </TableCell>
                    <TableCell>
                      {request.resolved_at ? new Date(request.resolved_at).toLocaleString('pt-BR') : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function ReportDialog({ rooms }: { rooms: { id: string; number: string }[] }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = React.useState(false)

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<MaintenanceRequestInput>({
    resolver: zodResolver(maintenanceRequestSchema),
    defaultValues: { room_id: '', description: '' },
  })

  const reportIssue = useMutation({
    mutationFn: async (values: MaintenanceRequestInput) => {
      const { error } = await supabase.rpc('report_maintenance_issue', {
        p_room_id: values.room_id,
        p_description: values.description,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-requests'] })
      queryClient.invalidateQueries({ queryKey: ['rooms-select'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-room-stats'] })
      toast.success('Problema reportado.')
      reset()
      setOpen(false)
    },
    onError: (error) => toast.error(rpcErrorMessage(error, 'Não foi possível reportar o problema.')),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={rooms.length === 0}>Reportar problema</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reportar problema</DialogTitle>
          <DialogDescription>
            Descreva o problema encontrado no quarto. Se o quarto não estiver ocupado, ele será marcado como "Em
            manutenção" automaticamente.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit((values) => reportIssue.mutate(values))} className="space-y-4">
          <div className="space-y-2">
            <Label>Quarto</Label>
            <Select value={watch('room_id')} onValueChange={(value) => setValue('room_id', value)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o quarto" />
              </SelectTrigger>
              <SelectContent>
                {rooms.map((room) => (
                  <SelectItem key={room.id} value={room.id}>
                    {room.number}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.room_id && <p className="text-sm text-destructive">{errors.room_id.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrição do problema</Label>
            <Input id="description" {...register('description')} placeholder="Ex.: chuveiro não esquenta" />
            {errors.description && <p className="text-sm text-destructive">{errors.description.message}</p>}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={reportIssue.isPending}>
              {reportIssue.isPending ? 'Enviando...' : 'Reportar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
