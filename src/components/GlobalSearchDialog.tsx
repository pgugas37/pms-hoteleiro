import { useQuery } from '@tanstack/react-query'
import * as React from 'react'
import { useNavigate } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'
import { DOCUMENT_TYPE_LABELS, type DocumentType } from '@/types/guest'
import { RESERVATION_STATUS_LABELS, type ReservationStatus } from '@/types/reservation'
import { ROOM_STATUS_LABELS, type RoomStatus } from '@/types/room'

interface GuestResult {
  id: string
  full_name: string
  document_type: DocumentType
  document_number: string
}

interface RoomResult {
  id: string
  number: string
  status: RoomStatus
  room_types: { name: string } | null
}

interface ReservationResult {
  id: string
  check_in: string
  check_out: string
  status: ReservationStatus
  guests: { full_name: string } | null
  rooms: { number: string } | null
}

interface GlobalSearchResults {
  guests: GuestResult[]
  rooms: RoomResult[]
  reservations: ReservationResult[]
}

/** Remove caracteres que quebrariam a sintaxe de filtro do PostgREST (vírgula, parênteses, coringas). */
function sanitizeTerm(term: string): string {
  return term.replace(/[%_,()]/g, ' ').trim()
}

async function fetchGlobalSearch(term: string): Promise<GlobalSearchResults> {
  const safe = sanitizeTerm(term)
  if (!safe) return { guests: [], rooms: [], reservations: [] }
  const pattern = `%${safe}%`

  const [guestsResult, roomsResult, matchingGuestIds, matchingRoomIds] = await Promise.all([
    supabase
      .from('guests')
      .select('id, full_name, document_type, document_number')
      .or(`full_name.ilike.${pattern},document_number.ilike.${pattern}`)
      .order('full_name', { ascending: true })
      .limit(6),
    supabase
      .from('rooms')
      .select('id, number, status, room_types(name)')
      .ilike('number', pattern)
      .order('number', { ascending: true })
      .limit(6),
    supabase.from('guests').select('id').ilike('full_name', pattern).limit(30),
    supabase.from('rooms').select('id').ilike('number', pattern).limit(30),
  ])
  if (guestsResult.error) throw guestsResult.error
  if (roomsResult.error) throw roomsResult.error
  if (matchingGuestIds.error) throw matchingGuestIds.error
  if (matchingRoomIds.error) throw matchingRoomIds.error

  const guests = (guestsResult.data ?? []) as unknown as GuestResult[]
  const rooms = (roomsResult.data ?? []) as unknown as RoomResult[]
  const guestIds = (matchingGuestIds.data ?? []).map((g) => g.id)
  const roomIds = (matchingRoomIds.data ?? []).map((r) => r.id)

  let reservations: ReservationResult[] = []
  if (guestIds.length > 0 || roomIds.length > 0) {
    const orParts: string[] = []
    if (guestIds.length > 0) orParts.push(`guest_id.in.(${guestIds.join(',')})`)
    if (roomIds.length > 0) orParts.push(`room_id.in.(${roomIds.join(',')})`)
    const { data, error } = await supabase
      .from('reservations')
      .select('id, check_in, check_out, status, guests(full_name), rooms(number)')
      .or(orParts.join(','))
      .order('check_in', { ascending: false })
      .limit(8)
    if (error) throw error
    reservations = (data ?? []) as unknown as ReservationResult[]
  }

  return { guests, rooms, reservations }
}

function statusBadgeVariant(status: ReservationStatus) {
  if (status === 'confirmada') return 'default'
  if (status === 'em_andamento') return 'secondary'
  if (status === 'cancelada') return 'destructive'
  return 'outline'
}

/**
 * Busca global (hóspedes, quartos e reservas ao mesmo tempo), acessível de qualquer tela pelo
 * botão "Buscar" no cabeçalho ou pelo atalho Ctrl/Cmd+K. Clicar num resultado leva pra tela
 * correspondente já com o termo aplicado no filtro daquela tela (via parâmetro `q` na URL).
 */
export function GlobalSearchDialog() {
  const navigate = useNavigate()
  const [open, setOpen] = React.useState(false)
  const [term, setTerm] = React.useState('')
  const [debouncedTerm, setDebouncedTerm] = React.useState('')

  React.useEffect(() => {
    const handler = setTimeout(() => setDebouncedTerm(term), 300)
    return () => clearTimeout(handler)
  }, [term])

  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  React.useEffect(() => {
    if (open) {
      setTerm('')
      setDebouncedTerm('')
    }
  }, [open])

  const trimmed = debouncedTerm.trim()
  const { data: results, isFetching } = useQuery({
    queryKey: ['global-search', trimmed],
    queryFn: () => fetchGlobalSearch(trimmed),
    enabled: trimmed.length >= 2,
  })

  function goTo(path: string) {
    setOpen(false)
    navigate(`${path}?q=${encodeURIComponent(trimmed)}`)
  }

  const hasResults =
    !!results && (results.guests.length > 0 || results.rooms.length > 0 || results.reservations.length > 0)

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="gap-2">
        Buscar
        <kbd className="hidden rounded border bg-muted px-1.5 py-0.5 text-xs text-muted-foreground sm:inline">
          Ctrl+K
        </kbd>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Busca global</DialogTitle>
            <DialogDescription>Hóspedes, quartos e reservas — tudo de uma vez.</DialogDescription>
          </DialogHeader>

          <Input
            autoFocus
            placeholder="Nome, documento ou número do quarto..."
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />

          <div className="space-y-4">
            {trimmed.length > 0 && trimmed.length < 2 && (
              <p className="text-sm text-muted-foreground">Digite ao menos 2 caracteres.</p>
            )}
            {isFetching && <p className="text-sm text-muted-foreground">Buscando...</p>}
            {!isFetching && trimmed.length >= 2 && !hasResults && (
              <p className="text-sm text-muted-foreground">Nenhum resultado para "{trimmed}".</p>
            )}

            {results && results.guests.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase text-muted-foreground">Hóspedes</p>
                {results.guests.map((guest) => (
                  <button
                    key={guest.id}
                    type="button"
                    onClick={() => goTo('/hospedes')}
                    className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    <span>{guest.full_name}</span>
                    <span className="text-xs text-muted-foreground">
                      {DOCUMENT_TYPE_LABELS[guest.document_type]} {guest.document_number}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {results && results.rooms.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase text-muted-foreground">Quartos</p>
                {results.rooms.map((room) => (
                  <button
                    key={room.id}
                    type="button"
                    onClick={() => goTo('/quartos')}
                    className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    <span>
                      Quarto {room.number}
                      {room.room_types?.name ? ` · ${room.room_types.name}` : ''}
                    </span>
                    <Badge variant="outline">{ROOM_STATUS_LABELS[room.status]}</Badge>
                  </button>
                ))}
              </div>
            )}

            {results && results.reservations.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase text-muted-foreground">Reservas</p>
                {results.reservations.map((reservation) => (
                  <button
                    key={reservation.id}
                    type="button"
                    onClick={() => goTo('/reservas')}
                    className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    <span>
                      {reservation.guests?.full_name ?? '—'} · Quarto {reservation.rooms?.number ?? '—'}
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({new Date(`${reservation.check_in}T00:00:00`).toLocaleDateString('pt-BR')} –{' '}
                        {new Date(`${reservation.check_out}T00:00:00`).toLocaleDateString('pt-BR')})
                      </span>
                    </span>
                    <Badge variant={statusBadgeVariant(reservation.status)}>
                      {RESERVATION_STATUS_LABELS[reservation.status]}
                    </Badge>
                  </button>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
