import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { toast } from 'sonner'

import { GuestDialog } from '@/components/GuestDialog'
import { NotesDialog } from '@/components/NotesDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/lib/auth-context'
import { formatCurrency } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { DOCUMENT_TYPE_LABELS, type Guest } from '@/types/guest'
import type { Role } from '@/types/auth'
import {
  RESERVATION_STATUS_LABELS,
  nightsBetween,
  type ReservationStatus,
} from '@/types/reservation'

const STAFF_ROLES: Role[] = ['admin', 'gerente', 'recepcao']

interface GuestReservation {
  id: string
  guest_id: string
  check_in: string
  check_out: string
  daily_rate: number
  status: ReservationStatus
  rooms: { number: string } | null
}

async function fetchGuests(): Promise<Guest[]> {
  const { data, error } = await supabase.from('guests').select('*').order('full_name', { ascending: true })
  if (error) throw error
  return (data as Guest[]) ?? []
}

async function fetchGuestReservations(): Promise<GuestReservation[]> {
  const { data, error } = await supabase
    .from('reservations')
    .select('id, guest_id, check_in, check_out, daily_rate, status, rooms(number)')
    .order('check_in', { ascending: false })
  if (error) throw error
  return (data as unknown as GuestReservation[]) ?? []
}

function statusBadgeVariant(status: ReservationStatus) {
  if (status === 'confirmada') return 'default'
  if (status === 'em_andamento') return 'secondary'
  if (status === 'cancelada') return 'destructive'
  return 'outline'
}

export function GuestsPage() {
  const { profile } = useAuth()
  const isStaff = !!profile && STAFF_ROLES.includes(profile.role)
  const isAdmin = profile?.role === 'admin'
  const queryClient = useQueryClient()
  const [search, setSearch] = React.useState('')

  const { data: guests, isLoading } = useQuery({ queryKey: ['guests'], queryFn: fetchGuests })
  const { data: guestReservations } = useQuery({
    queryKey: ['guest-reservations'],
    queryFn: fetchGuestReservations,
  })

  const reservationsByGuest = React.useMemo(() => {
    const map = new Map<string, GuestReservation[]>()
    for (const reservation of guestReservations ?? []) {
      const list = map.get(reservation.guest_id) ?? []
      list.push(reservation)
      map.set(reservation.guest_id, list)
    }
    return map
  }, [guestReservations])

  const filteredGuests = React.useMemo(() => {
    if (!guests) return []
    const term = search.trim().toLowerCase()
    const termDigits = term.replace(/\D/g, '')
    if (!term) return guests
    return guests.filter((guest) => {
      const nameMatch = guest.full_name.toLowerCase().includes(term)
      const docMatch = termDigits.length > 0 && guest.document_number.replace(/\D/g, '').includes(termDigits)
      const docTextMatch = guest.document_number.toLowerCase().includes(term)
      return nameMatch || docMatch || docTextMatch
    })
  }, [guests, search])

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from('guests').update({ active }).eq('id', id)
      if (error) throw error
    },
    onSuccess: (_data, { active }) => {
      queryClient.invalidateQueries({ queryKey: ['guests'] })
      queryClient.invalidateQueries({ queryKey: ['guests-select'] })
      toast.success(active ? 'Hóspede reativado.' : 'Hóspede inativado.')
    },
    onError: () => toast.error('Não foi possível atualizar o status do hóspede.'),
  })

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Hóspedes</h1>
        <p className="text-sm text-muted-foreground">Cadastro de hóspedes do hotel.</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Hóspedes cadastrados</CardTitle>
            <CardDescription>Busque por nome ou documento.</CardDescription>
          </div>
          {isStaff && <GuestDialog />}
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Buscar por nome ou documento..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}

          {filteredGuests.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Documento</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Estadias</TableHead>
                  <TableHead>Notas</TableHead>
                  {isStaff && <TableHead className="text-right">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredGuests.map((guest) => (
                  <TableRow key={guest.id}>
                    <TableCell>{guest.full_name}</TableCell>
                    <TableCell>
                      {DOCUMENT_TYPE_LABELS[guest.document_type]}: {guest.document_number}
                    </TableCell>
                    <TableCell>
                      {guest.email || guest.phone ? (
                        <div className="flex flex-col text-xs">
                          {guest.email && <span>{guest.email}</span>}
                          {guest.phone && <span className="text-muted-foreground">{guest.phone}</span>}
                        </div>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={guest.active ? 'default' : 'outline'}>
                        {guest.active ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <GuestHistoryDialog
                        guestName={guest.full_name}
                        reservations={reservationsByGuest.get(guest.id) ?? []}
                      />
                    </TableCell>
                    <TableCell>
                      <NotesDialog subjectType="guest" subjectId={guest.id} subjectLabel={guest.full_name} />
                    </TableCell>
                    {isStaff && (
                      <TableCell className="space-x-2 text-right">
                        <GuestDialog guest={guest} />
                        {isAdmin && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const action = guest.active ? 'Inativar' : 'Reativar'
                              if (window.confirm(`${action} o hóspede "${guest.full_name}"?`)) {
                                toggleActive.mutate({ id: guest.id, active: !guest.active })
                              }
                            }}
                          >
                            {guest.active ? 'Inativar' : 'Reativar'}
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {!isLoading && guests && guests.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum hóspede cadastrado.</p>
          )}
          {!isLoading && guests && guests.length > 0 && filteredGuests.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum hóspede encontrado para "{search}".</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function GuestHistoryDialog({
  guestName,
  reservations,
}: {
  guestName: string
  reservations: GuestReservation[]
}) {
  const stays = reservations.filter((r) => r.status !== 'cancelada')

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={reservations.length === 0}>
          Histórico ({stays.length})
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Histórico de {guestName}</DialogTitle>
          <DialogDescription>
            {stays.length === 0
              ? 'Nenhuma estadia (fora reservas canceladas).'
              : `${stays.length} estadia${stays.length > 1 ? 's' : ''}, mais recente primeiro.`}
          </DialogDescription>
        </DialogHeader>
        {reservations.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quarto</TableHead>
                <TableHead>Período</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reservations.map((reservation) => {
                const nights = nightsBetween(reservation.check_in, reservation.check_out)
                return (
                  <TableRow key={reservation.id}>
                    <TableCell>{reservation.rooms?.number ?? '—'}</TableCell>
                    <TableCell>
                      {new Date(`${reservation.check_in}T00:00:00`).toLocaleDateString('pt-BR')} –{' '}
                      {new Date(`${reservation.check_out}T00:00:00`).toLocaleDateString('pt-BR')}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant(reservation.status)}>
                        {RESERVATION_STATUS_LABELS[reservation.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatCurrency(reservation.daily_rate * nights)}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  )
}
