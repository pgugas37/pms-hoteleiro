import { useQuery } from '@tanstack/react-query'
import * as React from 'react'
import { toast } from 'sonner'

import { useConfirm } from '@/components/ConfirmDialog'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import * as actions from '@/offline/actions'
import { db } from '@/offline/db'
import { emitLocalChange, emitServerChange } from '@/offline/events'
import { discardItem } from '@/offline/outbox'
import type { OutboxItem } from '@/offline/outbox-types'
import { listRoomsWithType, overlappingRoomIds } from '@/offline/queries'
import { useActor } from '@/offline/use-actor'

function when(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

/** O que foi feito neste aparelho e ainda não chegou ao banco, ou foi recusado por ele. */
export function PendenciasPage() {
  const confirm = useConfirm()
  const { data: items = [] } = useQuery({
    queryKey: ['outbox-items'],
    queryFn: () => db.outbox.orderBy('seq').toArray(),
  })
  const rejected = items.filter((item) => item.status === 'recusado')
  const waiting = items.filter((item) => item.status !== 'recusado')

  async function discard(item: OutboxItem) {
    const ok = await confirm({
      title: 'Descartar esta ação?',
      description: `"${item.description}" será desfeita neste aparelho. Se outras ações dependiam dela, também serão descartadas.`,
      confirmLabel: 'Descartar',
      destructive: true,
    })
    if (!ok) return
    await discardItem(item.seq!)
    emitLocalChange()
    emitServerChange()
    toast.success('Ação descartada.')
  }

  return (
    <div className="page">
      <PageHeader
        title="Pendências"
        description="O que foi feito neste aparelho e ainda não chegou ao banco, ou foi recusado por ele."
      />

      <Card>
        <CardHeader>
          <CardTitle>Recusadas pelo banco</CardTitle>
          <CardDescription>Resolva ou descarte cada uma. Elas existem só neste aparelho.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {rejected.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma ação recusada.</p>}
          {rejected.map((item) => (
            <div key={item.seq} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0 space-y-1">
                <p className="font-medium">{item.description}</p>
                <p className="text-sm text-destructive">{item.error?.message}</p>
                <p className="text-xs text-muted-foreground">Feita em {when(item.createdAt)}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                {item.kind === 'reservation.create' && item.error?.reason === 'conflito_quarto' && (
                  <ResolveReservationDialog item={item} />
                )}
                <Button variant="outline" size="sm" onClick={() => void discard(item)}>
                  Descartar
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Aguardando envio</CardTitle>
          <CardDescription>
            Serão enviadas sozinhas quando houver internet, na ordem em que foram feitas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {waiting.length === 0 && <p className="text-sm text-muted-foreground">Tudo enviado.</p>}
          {waiting.map((item) => (
            <div key={item.seq} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">{item.description}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{when(item.createdAt)}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

/** Reserva recusada porque o quarto já foi pego em outro aparelho: trocar quarto ou datas e reenviar. */
function ResolveReservationDialog({ item }: { item: Extract<OutboxItem, { kind: 'reservation.create' }> }) {
  const actor = useActor()
  const [open, setOpen] = React.useState(false)
  const row = item.payload.row
  const [roomId, setRoomId] = React.useState(row.room_id)
  const [checkIn, setCheckIn] = React.useState(row.check_in)
  const [checkOut, setCheckOut] = React.useState(row.check_out)
  const [dailyRate, setDailyRate] = React.useState(String(row.daily_rate))
  const [saving, setSaving] = React.useState(false)

  const { data: rooms = [] } = useQuery({ queryKey: ['rooms-select'], queryFn: listRoomsWithType, enabled: open })
  const { data: busy = new Set<string>() } = useQuery({
    queryKey: ['resolve-busy-rooms', row.id, checkIn, checkOut],
    queryFn: () => overlappingRoomIds(checkIn, checkOut, row.id),
    enabled: open && checkOut > checkIn,
  })
  const freeRooms = rooms.filter((room) => !busy.has(room.id))

  async function save() {
    setSaving(true)
    try {
      await actions.resolveReservationConflict(actions.requireActor(actor), item.seq!, {
        room_id: roomId,
        check_in: checkIn,
        check_out: checkOut,
        daily_rate: Number(dailyRate),
      })
      toast.success('Reserva corrigida. Ela será enviada de novo.')
      setOpen(false)
    } catch (error) {
      toast.error(actions.actionErrorMessage(error, 'Não foi possível corrigir a reserva.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Resolver
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Escolher outro quarto ou outras datas</DialogTitle>
            <DialogDescription>{item.description}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="resolver-entrada">Entrada</Label>
              <Input id="resolver-entrada" type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="resolver-saida">Saída</Label>
              <Input id="resolver-saida" type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Quarto livre</Label>
              <Select value={roomId} onValueChange={setRoomId}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha" />
                </SelectTrigger>
                <SelectContent>
                  {freeRooms.map((room) => (
                    <SelectItem key={room.id} value={room.id}>
                      Quarto {room.number}
                      {room.room_types ? ` · ${room.room_types.name}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="resolver-diaria">Diária (R$)</Label>
              <Input
                id="resolver-diaria"
                type="number"
                min="0"
                step="0.01"
                value={dailyRate}
                onChange={(e) => setDailyRate(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Voltar
            </Button>
            <Button onClick={() => void save()} disabled={saving || !(checkOut > checkIn)}>
              Salvar e reenviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
