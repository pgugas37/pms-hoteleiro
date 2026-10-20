import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

import { GuestDialog } from '@/components/GuestDialog'
import { NotesDialog } from '@/components/NotesDialog'
import { useConfirm } from '@/components/ConfirmDialog'
import { PageHeader } from '@/components/PageHeader'
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
import { reservationStatusVariant } from '@/lib/status'
import { supabase } from '@/lib/supabase'
import { listGuests, listReservationsWithRelations } from '@/offline/queries'
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

// Leituras da cópia local (funcionam sem internet).
const fetchGuests: () => Promise<Guest[]> = listGuests

async function fetchGuestReservations(): Promise<GuestReservation[]> {
  return (await listReservationsWithRelations()).map((r) => ({
    id: r.id,
    guest_id: r.guest_id,
    check_in: r.check_in,
    check_out: r.check_out,
    daily_rate: r.daily_rate,
    status: r.status,
    rooms: r.rooms ? { number: r.rooms.number } : null,
  }))
}

export function GuestsPage() {
  const { profile } = useAuth()
  const isStaff = !!profile && STAFF_ROLES.includes(profile.role)
  const isAdmin = profile?.role === 'admin'
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const [searchParams] = useSearchParams()
  const [search, setSearch] = React.useState(() => searchParams.get('q') ?? '')

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
    <div className="page">
      <PageHeader title="Hóspedes" description="Cadastro de hóspedes, histórico de estadias e observações." />

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
                      <TableCell className="space-x-1.5 whitespace-nowrap text-right">
                        <GuestDialog guest={guest} />
                        {isAdmin && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              const action = guest.active ? 'Inativar' : 'Reativar'
                              const ok = await confirm({
                                title: `${action} ${guest.full_name}?`,
                                description: guest.active
                                  ? 'O cadastro e o histórico continuam guardados, mas o hóspede não aparece mais na hora de criar reservas.'
                                  : 'O hóspede volta a aparecer na hora de criar reservas.',
                                confirmLabel: `${action} hóspede`,
                              })
                              if (ok) toggleActive.mutate({ id: guest.id, active: !guest.active })
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
                      <Badge variant={reservationStatusVariant(reservation.status)}>
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
