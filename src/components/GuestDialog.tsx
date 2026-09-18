import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
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
import { formatCnpj, formatCpf } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { guestSchema, type GuestInput } from '@/lib/validations'
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS, type DocumentType, type Guest } from '@/types/guest'

function errorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return (error as { code?: string }).code
  }
  return undefined
}

function formatDocumentNumber(type: DocumentType, value: string) {
  if (type === 'cpf') return formatCpf(value)
  if (type === 'cnpj') return formatCnpj(value)
  return value
}

interface GuestDialogProps {
  guest?: Guest
  /** Elemento customizado que abre o modal. Se omitido, usa um botão padrão ("Novo hóspede" / "Editar"). */
  trigger?: React.ReactNode
  /** Chamado depois que o hóspede é criado ou atualizado com sucesso. */
  onSaved?: (guest: Guest) => void
}

export function GuestDialog({ guest, trigger, onSaved }: GuestDialogProps) {
  const queryClient = useQueryClient()
  const [open, setOpen] = React.useState(false)
  const isEdit = !!guest

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<GuestInput>({
    resolver: zodResolver(guestSchema),
    defaultValues: guest
      ? {
          full_name: guest.full_name,
          document_type: guest.document_type,
          document_number: guest.document_number,
          email: guest.email ?? '',
          phone: guest.phone ?? '',
          birth_date: guest.birth_date ?? '',
          nationality: guest.nationality,
          notes: guest.notes ?? '',
        }
      : {
          full_name: '',
          document_type: 'cpf',
          document_number: '',
          email: '',
          phone: '',
          birth_date: '',
          nationality: 'Brasileira',
          notes: '',
        },
  })

  const documentType = watch('document_type')

  const saveGuest = useMutation({
    mutationFn: async (values: GuestInput): Promise<Guest> => {
      const payload = {
        full_name: values.full_name,
        document_type: values.document_type,
        document_number: values.document_number,
        email: values.email || null,
        phone: values.phone || null,
        birth_date: values.birth_date || null,
        nationality: values.nationality,
        notes: values.notes || null,
      }
      const { data, error } = isEdit
        ? await supabase.from('guests').update(payload).eq('id', guest.id).select().single()
        : await supabase.from('guests').insert(payload).select().single()
      if (error) throw error
      return data as Guest
    },
    onSuccess: (savedGuest) => {
      queryClient.invalidateQueries({ queryKey: ['guests'] })
      queryClient.invalidateQueries({ queryKey: ['guests-select'] })
      toast.success(isEdit ? 'Hóspede atualizado.' : 'Hóspede cadastrado.')
      reset()
      setOpen(false)
      onSaved?.(savedGuest)
    },
    onError: (error) => {
      toast.error(
        errorCode(error) === '23505'
          ? 'Já existe um hóspede com esse documento.'
          : 'Não foi possível salvar o hóspede.'
      )
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant={isEdit ? 'outline' : 'default'} size={isEdit ? 'sm' : 'default'}>
            {isEdit ? 'Editar' : 'Novo hóspede'}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? `Editar ${guest.full_name}` : 'Novo hóspede'}</DialogTitle>
          <DialogDescription>Dados de identificação e contato do hóspede.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit((values) => saveGuest.mutate(values))} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="full_name">Nome completo</Label>
            <Input id="full_name" {...register('full_name')} />
            {errors.full_name && <p className="text-sm text-destructive">{errors.full_name.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tipo de documento</Label>
              <Controller
                control={control}
                name="document_type"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(value) => {
                      field.onChange(value)
                      setValue('document_number', '')
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DOCUMENT_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {DOCUMENT_TYPE_LABELS[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="document_number">Número</Label>
              <Input
                id="document_number"
                value={watch('document_number')}
                onChange={(e) => setValue('document_number', formatDocumentNumber(documentType, e.target.value))}
                placeholder={documentType === 'cpf' ? '000.000.000-00' : documentType === 'cnpj' ? '00.000.000/0000-00' : undefined}
              />
              {errors.document_number && (
                <p className="text-sm text-destructive">{errors.document_number.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail (opcional)</Label>
              <Input id="email" type="email" {...register('email')} />
              {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Telefone (opcional)</Label>
              <Input id="phone" {...register('phone')} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="birth_date">Data de nascimento (opcional)</Label>
              <Input id="birth_date" type="date" {...register('birth_date')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nationality">Nacionalidade</Label>
              <Input id="nationality" {...register('nationality')} />
              {errors.nationality && (
                <p className="text-sm text-destructive">{errors.nationality.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Observações (opcional)</Label>
            <Input id="notes" {...register('notes')} />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={saveGuest.isPending}>
              {saveGuest.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
