import { useQuery } from '@tanstack/react-query'
import { BedDouble, ClipboardList, Search, Users, type LucideIcon } from 'lucide-react'
import * as React from 'react'
import { useNavigate } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { reservationStatusVariant, roomStatusVariant } from '@/lib/status'
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

const RESULT_BUTTON_CLASS =
  'flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none'

function ResultGroup({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="flex items-center gap-1.5 px-3 text-xs font-semibold text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </p>
      {children}
    </div>
  )
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
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Buscar hóspede, quarto ou reserva"
        className="flex h-9 w-full max-w-sm items-center gap-2 rounded-lg border border-input bg-card px-3 text-sm text-muted-foreground transition-colors hover:border-pine/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate text-left">
          <span className="hidden sm:inline">Buscar hóspede, quarto ou reserva</span>
          <span className="sm:hidden">Buscar</span>
        </span>
        <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 font-sans text-[11px] font-medium sm:inline">
          Ctrl K
        </kbd>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-[12%] max-h-[76vh] translate-y-0 gap-3 p-0 sm:max-w-xl">
          <DialogHeader className="sr-only">
            <DialogTitle>Busca global</DialogTitle>
            <DialogDescription>Encontre hóspedes, quartos e reservas de qualquer tela.</DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2 border-b px-4 pr-12">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Nome, documento ou número do quarto"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              className="h-12 border-0 bg-transparent px-0 text-base shadow-none hover:border-0 focus-visible:ring-0"
            />
          </div>

          <div className="space-y-4 px-2 pb-3">
            {trimmed.length === 0 && (
              <p className="px-3 py-2 text-sm text-muted-foreground">
                Digite o nome ou documento do hóspede, ou o número do quarto.
              </p>
            )}
            {trimmed.length > 0 && trimmed.length < 2 && (
              <p className="px-3 py-2 text-sm text-muted-foreground">Digite pelo menos 2 caracteres.</p>
            )}
            {isFetching && <p className="px-3 py-2 text-sm text-muted-foreground">Buscando...</p>}
            {!isFetching && trimmed.length >= 2 && !hasResults && (
              <p className="px-3 py-2 text-sm text-muted-foreground">
                Nada encontrado para "{trimmed}". Confira a grafia ou busque pelo documento.
              </p>
            )}

            {results && results.guests.length > 0 && (
              <ResultGroup icon={Users} label="Hóspedes">
                {results.guests.map((guest) => (
                  <button key={guest.id} type="button" onClick={() => goTo('/hospedes')} className={RESULT_BUTTON_CLASS}>
                    <span className="font-medium">{guest.full_name}</span>
                    <span className="text-xs text-muted-foreground">
                      {DOCUMENT_TYPE_LABELS[guest.document_type]} {guest.document_number}
                    </span>
                  </button>
                ))}
              </ResultGroup>
            )}

            {results && results.rooms.length > 0 && (
              <ResultGroup icon={BedDouble} label="Quartos">
                {results.rooms.map((room) => (
                  <button key={room.id} type="button" onClick={() => goTo('/quartos')} className={RESULT_BUTTON_CLASS}>
                    <span>
                      <span className="font-display font-semibold">Quarto {room.number}</span>
                      {room.room_types?.name && (
                        <span className="ml-2 text-xs text-muted-foreground">{room.room_types.name}</span>
                      )}
                    </span>
                    <Badge variant={roomStatusVariant(room.status)}>{ROOM_STATUS_LABELS[room.status]}</Badge>
                  </button>
                ))}
              </ResultGroup>
            )}

            {results && results.reservations.length > 0 && (
              <ResultGroup icon={ClipboardList} label="Reservas">
                {results.reservations.map((reservation) => (
                  <button
                    key={reservation.id}
                    type="button"
                    onClick={() => goTo('/reservas')}
                    className={RESULT_BUTTON_CLASS}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {reservation.guests?.full_name ?? '—'}, quarto {reservation.rooms?.number ?? '—'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(`${reservation.check_in}T00:00:00`).toLocaleDateString('pt-BR')} a{' '}
                        {new Date(`${reservation.check_out}T00:00:00`).toLocaleDateString('pt-BR')}
                      </span>
                    </span>
                    <Badge variant={reservationStatusVariant(reservation.status)}>
                      {RESERVATION_STATUS_LABELS[reservation.status]}
                    </Badge>
                  </button>
                ))}
              </ResultGroup>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
