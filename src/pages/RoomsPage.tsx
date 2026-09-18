import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { NotesDialog } from '@/components/NotesDialog'
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
import { formatCurrency } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import {
  roomSchema,
  roomTypeSchema,
  seasonalRateSchema,
  type RoomInput,
  type RoomTypeInput,
  type SeasonalRateInput,
} from '@/lib/validations'
import { ROOM_STATUSES, ROOM_STATUS_LABELS, type RoomType, type RoomWithType } from '@/types/room'
import type { SeasonalRateWithType } from '@/types/seasonalRate'

async function fetchRoomTypes(): Promise<RoomType[]> {
  const { data, error } = await supabase.from('room_types').select('*').order('name', { ascending: true })
  if (error) throw error
  return (data as RoomType[]) ?? []
}

async function fetchRooms(): Promise<RoomWithType[]> {
  const { data, error } = await supabase
    .from('rooms')
    .select('*, room_types(id, name)')
    .order('number', { ascending: true })
  if (error) throw error
  return (data as unknown as RoomWithType[]) ?? []
}

async function fetchSeasonalRates(): Promise<SeasonalRateWithType[]> {
  const { data, error } = await supabase
    .from('seasonal_rates')
    .select('*, room_types(id, name)')
    .order('start_date', { ascending: true })
  if (error) throw error
  return (data as unknown as SeasonalRateWithType[]) ?? []
}

function errorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return (error as { code?: string }).code
  }
  return undefined
}

export function RoomsPage() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const queryClient = useQueryClient()

  const { data: roomTypes, isLoading: loadingTypes } = useQuery({
    queryKey: ['room-types'],
    queryFn: fetchRoomTypes,
  })
  const { data: rooms, isLoading: loadingRooms } = useQuery({ queryKey: ['rooms'], queryFn: fetchRooms })
  const { data: seasonalRates, isLoading: loadingSeasonalRates } = useQuery({
    queryKey: ['seasonal-rates'],
    queryFn: fetchSeasonalRates,
  })

  const deleteRoomType = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('room_types').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['room-types'] })
      toast.success('Tipo de quarto excluído.')
    },
    onError: (error) => {
      toast.error(
        errorCode(error) === '23503'
          ? 'Não é possível excluir: há quartos cadastrados com esse tipo.'
          : 'Não foi possível excluir o tipo de quarto.'
      )
    },
  })

  const deleteRoom = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('rooms').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      toast.success('Quarto excluído.')
    },
    onError: (error) => {
      toast.error(
        errorCode(error) === '23503'
          ? 'Não é possível excluir: há reservas vinculadas a este quarto.'
          : 'Não foi possível excluir o quarto.'
      )
    },
  })

  const deleteSeasonalRate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('seasonal_rates').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seasonal-rates'] })
      toast.success('Tarifa sazonal excluída.')
    },
    onError: () => toast.error('Não foi possível excluir a tarifa sazonal.'),
  })

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Quartos</h1>
        <p className="text-sm text-muted-foreground">Tipos de quarto e unidades do hotel.</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Tipos de quarto</CardTitle>
            <CardDescription>Categorias com capacidade e preço base da diária.</CardDescription>
          </div>
          {isAdmin && <RoomTypeDialog />}
        </CardHeader>
        <CardContent>
          {loadingTypes && <p className="text-sm text-muted-foreground">Carregando...</p>}
          {roomTypes && roomTypes.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Capacidade</TableHead>
                  <TableHead>Preço/diária</TableHead>
                  {isAdmin && <TableHead className="text-right">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {roomTypes.map((type) => (
                  <TableRow key={type.id}>
                    <TableCell>{type.name}</TableCell>
                    <TableCell>
                      {type.capacity_adults} adulto{type.capacity_adults !== 1 ? 's' : ''}
                      {type.capacity_children > 0
                        ? ` + ${type.capacity_children} criança${type.capacity_children !== 1 ? 's' : ''}`
                        : ''}
                    </TableCell>
                    <TableCell>{formatCurrency(type.base_price)}</TableCell>
                    {isAdmin && (
                      <TableCell className="space-x-2 text-right">
                        <RoomTypeDialog roomType={type} />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (window.confirm(`Excluir o tipo de quarto "${type.name}"?`)) {
                              deleteRoomType.mutate(type.id)
                            }
                          }}
                        >
                          Excluir
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {roomTypes && roomTypes.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum tipo de quarto cadastrado.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Quartos</CardTitle>
            <CardDescription>Unidades físicas do hotel.</CardDescription>
          </div>
          {isAdmin && <RoomDialog roomTypes={roomTypes ?? []} />}
        </CardHeader>
        <CardContent>
          {loadingRooms && <p className="text-sm text-muted-foreground">Carregando...</p>}
          {!loadingTypes && (roomTypes ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">
              Cadastre pelo menos um tipo de quarto antes de adicionar quartos.
            </p>
          )}
          {rooms && rooms.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Andar</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Notas</TableHead>
                  {isAdmin && <TableHead className="text-right">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rooms.map((room) => (
                  <TableRow key={room.id}>
                    <TableCell>{room.number}</TableCell>
                    <TableCell>{room.room_types?.name ?? '—'}</TableCell>
                    <TableCell>{room.floor ?? '—'}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          room.status === 'disponivel'
                            ? 'default'
                            : room.status === 'ocupado'
                              ? 'destructive'
                              : room.status === 'limpeza' || room.status === 'manutencao'
                                ? 'secondary'
                                : 'outline'
                        }
                      >
                        {ROOM_STATUS_LABELS[room.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <NotesDialog subjectType="room" subjectId={room.id} subjectLabel={room.number} />
                    </TableCell>
                    {isAdmin && (
                      <TableCell className="space-x-2 text-right">
                        <RoomDialog room={room} roomTypes={roomTypes ?? []} />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (window.confirm(`Excluir o quarto "${room.number}"?`)) {
                              deleteRoom.mutate(room.id)
                            }
                          }}
                        >
                          Excluir
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {rooms && rooms.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum quarto cadastrado.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Tarifas sazonais</CardTitle>
            <CardDescription>
              Diárias diferentes por período (ex.: alta temporada, feriados), por tipo de quarto. Quando o período de
              uma reserva cai dentro de um intervalo cadastrado aqui, a diária sugerida na tela Reservas usa esse
              valor em vez do preço base do tipo de quarto.
            </CardDescription>
          </div>
          {isAdmin && <SeasonalRateDialog roomTypes={roomTypes ?? []} />}
        </CardHeader>
        <CardContent>
          {loadingSeasonalRates && <p className="text-sm text-muted-foreground">Carregando...</p>}
          {!loadingTypes && (roomTypes ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">
              Cadastre pelo menos um tipo de quarto antes de adicionar tarifas sazonais.
            </p>
          )}
          {seasonalRates && seasonalRates.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Tipo de quarto</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead>Diária</TableHead>
                  {isAdmin && <TableHead className="text-right">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {seasonalRates.map((rate) => (
                  <TableRow key={rate.id}>
                    <TableCell>{rate.label}</TableCell>
                    <TableCell>{rate.room_types?.name ?? '—'}</TableCell>
                    <TableCell>
                      {new Date(`${rate.start_date}T00:00:00`).toLocaleDateString('pt-BR')} –{' '}
                      {new Date(`${rate.end_date}T00:00:00`).toLocaleDateString('pt-BR')}
                    </TableCell>
                    <TableCell>{formatCurrency(rate.daily_rate)}</TableCell>
                    {isAdmin && (
                      <TableCell className="space-x-2 text-right">
                        <SeasonalRateDialog seasonalRate={rate} roomTypes={roomTypes ?? []} />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (window.confirm(`Excluir a tarifa "${rate.label}"?`)) {
                              deleteSeasonalRate.mutate(rate.id)
                            }
                          }}
                        >
                          Excluir
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {seasonalRates && seasonalRates.length === 0 && (roomTypes ?? []).length > 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma tarifa sazonal cadastrada.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function RoomTypeDialog({ roomType }: { roomType?: RoomType }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = React.useState(false)
  const isEdit = !!roomType

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RoomTypeInput>({
    resolver: zodResolver(roomTypeSchema),
    defaultValues: roomType
      ? {
          name: roomType.name,
          description: roomType.description ?? '',
          capacity_adults: roomType.capacity_adults,
          capacity_children: roomType.capacity_children,
          base_price: roomType.base_price,
        }
      : { name: '', description: '', capacity_adults: 2, capacity_children: 0, base_price: 0 },
  })

  const saveRoomType = useMutation({
    mutationFn: async (values: RoomTypeInput) => {
      const payload = {
        name: values.name,
        description: values.description || null,
        capacity_adults: values.capacity_adults,
        capacity_children: values.capacity_children,
        base_price: values.base_price,
      }
      const { error } = isEdit
        ? await supabase.from('room_types').update(payload).eq('id', roomType.id)
        : await supabase.from('room_types').insert(payload)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['room-types'] })
      toast.success(isEdit ? 'Tipo de quarto atualizado.' : 'Tipo de quarto criado.')
      reset()
      setOpen(false)
    },
    onError: () => toast.error('Não foi possível salvar o tipo de quarto.'),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={isEdit ? 'outline' : 'default'} size={isEdit ? 'sm' : 'default'}>
          {isEdit ? 'Editar' : 'Novo tipo'}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar tipo de quarto' : 'Novo tipo de quarto'}</DialogTitle>
          <DialogDescription>Categoria usada para agrupar os quartos.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit((values) => saveRoomType.mutate(values))} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome</Label>
            <Input id="name" {...register('name')} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Descrição (opcional)</Label>
            <Input id="description" {...register('description')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="capacity_adults">Adultos</Label>
              <Input id="capacity_adults" type="number" min={1} {...register('capacity_adults')} />
              {errors.capacity_adults && (
                <p className="text-sm text-destructive">{errors.capacity_adults.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="capacity_children">Crianças</Label>
              <Input id="capacity_children" type="number" min={0} {...register('capacity_children')} />
              {errors.capacity_children && (
                <p className="text-sm text-destructive">{errors.capacity_children.message}</p>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="base_price">Preço base da diária (R$)</Label>
            <Input id="base_price" type="number" step="0.01" min={0} {...register('base_price')} />
            {errors.base_price && <p className="text-sm text-destructive">{errors.base_price.message}</p>}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saveRoomType.isPending}>
              {saveRoomType.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function RoomDialog({ room, roomTypes }: { room?: RoomWithType; roomTypes: RoomType[] }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = React.useState(false)
  const isEdit = !!room

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<RoomInput>({
    resolver: zodResolver(roomSchema),
    defaultValues: room
      ? {
          room_type_id: room.room_type_id,
          number: room.number,
          floor: room.floor ?? '',
          status: room.status,
          notes: room.notes ?? '',
        }
      : { room_type_id: '', number: '', floor: '', status: 'disponivel', notes: '' },
  })

  const saveRoom = useMutation({
    mutationFn: async (values: RoomInput) => {
      const payload = {
        room_type_id: values.room_type_id,
        number: values.number,
        floor: values.floor || null,
        status: values.status,
        notes: values.notes || null,
      }
      const { error } = isEdit
        ? await supabase.from('rooms').update(payload).eq('id', room.id)
        : await supabase.from('rooms').insert(payload)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      toast.success(isEdit ? 'Quarto atualizado.' : 'Quarto criado.')
      reset()
      setOpen(false)
    },
    onError: (error) => {
      toast.error(errorCode(error) === '23505' ? 'Já existe um quarto com esse número.' : 'Não foi possível salvar o quarto.')
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant={isEdit ? 'outline' : 'default'}
          size={isEdit ? 'sm' : 'default'}
          disabled={!isEdit && roomTypes.length === 0}
        >
          {isEdit ? 'Editar' : 'Novo quarto'}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? `Editar quarto ${room.number}` : 'Novo quarto'}</DialogTitle>
          <DialogDescription>Unidade física do hotel.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit((values) => saveRoom.mutate(values))} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="number">Número</Label>
            <Input id="number" {...register('number')} />
            {errors.number && <p className="text-sm text-destructive">{errors.number.message}</p>}
          </div>
          <div className="space-y-2">
            <Label>Tipo de quarto</Label>
            <Controller
              control={control}
              name="room_type_id"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {roomTypes.map((type) => (
                      <SelectItem key={type.id} value={type.id}>
                        {type.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.room_type_id && (
              <p className="text-sm text-destructive">{errors.room_type_id.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="floor">Andar (opcional)</Label>
            <Input id="floor" {...register('floor')} />
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROOM_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {ROOM_STATUS_LABELS[status]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Observações (opcional)</Label>
            <Input id="notes" {...register('notes')} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saveRoom.isPending}>
              {saveRoom.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function SeasonalRateDialog({
  seasonalRate,
  roomTypes,
}: {
  seasonalRate?: SeasonalRateWithType
  roomTypes: RoomType[]
}) {
  const queryClient = useQueryClient()
  const [open, setOpen] = React.useState(false)
  const isEdit = !!seasonalRate

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<SeasonalRateInput>({
    resolver: zodResolver(seasonalRateSchema),
    defaultValues: seasonalRate
      ? {
          room_type_id: seasonalRate.room_type_id,
          label: seasonalRate.label,
          start_date: seasonalRate.start_date,
          end_date: seasonalRate.end_date,
          daily_rate: seasonalRate.daily_rate,
        }
      : { room_type_id: '', label: '', start_date: '', end_date: '', daily_rate: 0 },
  })

  const saveSeasonalRate = useMutation({
    mutationFn: async (values: SeasonalRateInput) => {
      const payload = {
        room_type_id: values.room_type_id,
        label: values.label,
        start_date: values.start_date,
        end_date: values.end_date,
        daily_rate: values.daily_rate,
      }
      const { error } = isEdit
        ? await supabase.from('seasonal_rates').update(payload).eq('id', seasonalRate.id)
        : await supabase.from('seasonal_rates').insert(payload)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seasonal-rates'] })
      toast.success(isEdit ? 'Tarifa sazonal atualizada.' : 'Tarifa sazonal criada.')
      reset()
      setOpen(false)
    },
    onError: (error) => {
      toast.error(
        errorCode(error) === '23P01'
          ? 'Esse período se sobrepõe a outra tarifa já cadastrada para esse tipo de quarto.'
          : 'Não foi possível salvar a tarifa sazonal.'
      )
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant={isEdit ? 'outline' : 'default'}
          size={isEdit ? 'sm' : 'default'}
          disabled={!isEdit && roomTypes.length === 0}
        >
          {isEdit ? 'Editar' : 'Nova tarifa'}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar tarifa sazonal' : 'Nova tarifa sazonal'}</DialogTitle>
          <DialogDescription>
            Diária diferente do preço base, válida num intervalo de datas, pra um tipo de quarto.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit((values) => saveSeasonalRate.mutate(values))} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="label">Nome</Label>
            <Input id="label" placeholder="Ex.: Alta temporada, Réveillon" {...register('label')} />
            {errors.label && <p className="text-sm text-destructive">{errors.label.message}</p>}
          </div>
          <div className="space-y-2">
            <Label>Tipo de quarto</Label>
            <Controller
              control={control}
              name="room_type_id"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {roomTypes.map((type) => (
                      <SelectItem key={type.id} value={type.id}>
                        {type.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.room_type_id && <p className="text-sm text-destructive">{errors.room_type_id.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start_date">Início</Label>
              <Input id="start_date" type="date" {...register('start_date')} />
              {errors.start_date && <p className="text-sm text-destructive">{errors.start_date.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="end_date">Fim</Label>
              <Input id="end_date" type="date" {...register('end_date')} />
              {errors.end_date && <p className="text-sm text-destructive">{errors.end_date.message}</p>}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="seasonal_daily_rate">Diária nesse período (R$)</Label>
            <Input id="seasonal_daily_rate" type="number" step="0.01" min={0.01} {...register('daily_rate')} />
            {errors.daily_rate && <p className="text-sm text-destructive">{errors.daily_rate.message}</p>}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saveSeasonalRate.isPending}>
              {saveSeasonalRate.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
