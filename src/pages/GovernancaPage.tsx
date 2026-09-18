import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { supabase } from '@/lib/supabase'
import type { RoomWithType } from '@/types/room'

async function fetchRoomsAwaitingCleaning(): Promise<RoomWithType[]> {
  const { data, error } = await supabase
    .from('rooms')
    .select('*, room_types(id, name)')
    .eq('status', 'limpeza')
    .order('number', { ascending: true })
  if (error) throw error
  return (data as unknown as RoomWithType[]) ?? []
}

function rpcErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: string }).message
    if (message) return message
  }
  return fallback
}

export function GovernancaPage() {
  const queryClient = useQueryClient()

  const { data: rooms, isLoading } = useQuery({
    queryKey: ['governanca-rooms'],
    queryFn: fetchRoomsAwaitingCleaning,
  })

  const markClean = useMutation({
    mutationFn: async (roomId: string) => {
      const { error } = await supabase.rpc('mark_room_clean', { p_room_id: roomId })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['governanca-rooms'] })
      queryClient.invalidateQueries({ queryKey: ['rooms-select'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-room-stats'] })
      toast.success('Quarto marcado como limpo.')
    },
    onError: (error) => toast.error(rpcErrorMessage(error, 'Não foi possível marcar o quarto como limpo.')),
  })

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Governança</h1>
        <p className="text-sm text-muted-foreground">Quartos aguardando limpeza depois de um check-out ou cancelamento.</p>
      </div>

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
