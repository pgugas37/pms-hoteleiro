import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'

import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import * as actions from '@/offline/actions'
import { listRoomsWithType } from '@/offline/queries'
import { useActor } from '@/offline/use-actor'
import type { RoomWithType } from '@/types/room'

/** Quartos aguardando limpeza, lidos da cópia local (funciona sem internet). */
async function fetchRoomsAwaitingCleaning(): Promise<RoomWithType[]> {
  return (await listRoomsWithType()).filter((room) => room.status === 'limpeza')
}

export function GovernancaPage() {
  const actor = useActor()

  const { data: rooms, isLoading } = useQuery({
    queryKey: ['governanca-rooms'],
    queryFn: fetchRoomsAwaitingCleaning,
  })

  // Funciona sem internet: libera o quarto na cópia local e entra no caderninho de envio.
  const markClean = useMutation({
    mutationFn: (roomId: string) => actions.markRoomClean(actions.requireActor(actor), roomId),
    onSuccess: () => toast.success('Quarto marcado como limpo.'),
    onError: (error) => toast.error(actions.actionErrorMessage(error, 'Não foi possível marcar o quarto como limpo.')),
  })

  return (
    <div className="page">
      <PageHeader
        title="Governança"
        description="Quartos aguardando limpeza depois de um check-out ou cancelamento."
      />

      <Card>
        <CardHeader>
          <CardTitle>Aguardando limpeza</CardTitle>
          <CardDescription>Marque o quarto como limpo assim que ele estiver pronto para o próximo hóspede.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}

          {!isLoading && rooms && rooms.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum quarto aguardando limpeza no momento.</p>
          )}

          {rooms && rooms.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quarto</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Andar</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rooms.map((room) => (
                  <TableRow key={room.id}>
                    <TableCell>{room.number}</TableCell>
                    <TableCell>{room.room_types?.name ?? '—'}</TableCell>
                    <TableCell>{room.floor ?? '—'}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" onClick={() => markClean.mutate(room.id)} disabled={markClean.isPending}>
                        Marcar como limpo
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
