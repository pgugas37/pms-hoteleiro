import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { internalNoteSchema, type InternalNoteInput } from '@/lib/validations'
import type { InternalNote } from '@/types/note'

type NoteSubjectType = 'guest' | 'room'

async function fetchNotes(subjectType: NoteSubjectType, subjectId: string): Promise<InternalNote[]> {
  const column = subjectType === 'guest' ? 'guest_id' : 'room_id'
  const { data, error } = await supabase
    .from('internal_notes')
    .select('*')
    .eq(column, subjectId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data as InternalNote[]) ?? []
}

/**
 * Botão + dialog reutilizável pra ver e adicionar observações internas (log com autor e data)
 * de um hóspede ou quarto. Diferente do campo "observações" único do cadastro: aqui é um
 * histórico, nunca sobrescreve o que já foi anotado antes.
 */
export function NotesDialog({
  subjectType,
  subjectId,
  subjectLabel,
}: {
  subjectType: NoteSubjectType
  subjectId: string
  subjectLabel: string
}) {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const queryClient = useQueryClient()
  const [open, setOpen] = React.useState(false)
  const queryKey = ['internal-notes', subjectType, subjectId]

  const { data: notes, isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchNotes(subjectType, subjectId),
    enabled: open,
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<InternalNoteInput>({
    resolver: zodResolver(internalNoteSchema),
    defaultValues: { content: '' },
  })

  const addNote = useMutation({
    mutationFn: async (values: InternalNoteInput) => {
      const column = subjectType === 'guest' ? 'guest_id' : 'room_id'
      const { error } = await supabase.from('internal_notes').insert({
        [column]: subjectId,
        content: values.content,
        created_by: profile?.id,
        created_by_name: profile?.full_name ?? 'Usuário',
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
      reset()
      toast.success('Observação registrada.')
    },
    onError: () => toast.error('Não foi possível registrar a observação.'),
  })

  const deleteNote = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('internal_notes').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
      toast.success('Observação excluída.')
    },
    onError: () => toast.error('Não foi possível excluir a observação.'),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Notas{notes && notes.length > 0 ? ` (${notes.length})` : ''}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Observações internas</DialogTitle>
          <DialogDescription>
            {subjectType === 'guest' ? 'Hóspede' : 'Quarto'}: {subjectLabel}. Visível pra toda a equipe, nunca pro
            hóspede.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit((values) => addNote.mutate(values, { onSuccess: () => reset() }))}
          className="space-y-2"
        >
          <Textarea placeholder="Escreva uma observação..." rows={3} {...register('content')} />
          {errors.content && <p className="text-sm text-destructive">{errors.content.message}</p>}
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={addNote.isPending}>
              {addNote.isPending ? 'Salvando...' : 'Adicionar'}
            </Button>
          </div>
        </form>

        <div className="max-h-72 space-y-3 overflow-y-auto border-t pt-3">
          {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
          {!isLoading && (notes ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma observação registrada ainda.</p>
          )}
          {(notes ?? []).map((note) => (
            <div key={note.id} className="space-y-1 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{note.created_by_name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {new Date(note.created_at).toLocaleString('pt-BR')}
                  </span>
                  {isAdmin && (
                    <button
                      type="button"
                      className="text-xs text-destructive hover:underline"
                      onClick={() => {
                        if (window.confirm('Excluir esta observação?')) deleteNote.mutate(note.id)
                      }}
                    >
                      Excluir
                    </button>
                  )}
                </div>
              </div>
              <p className="whitespace-pre-wrap text-muted-foreground">{note.content}</p>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
