import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'

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
import { formatCnpj, formatCpf } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { guestSchema, type GuestInput } from '@/lib/validations'
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS, type DocumentType, type Guest } from '@/types/guest'
import type { Role } from '@/types/auth'

const STAFF_ROLES: Role[] = ['admin', 'gerente', 'recepcao']

async function fetchGuests(): Promise<Guest[]> {
  const { data, error } = await supabase.from('guests').select('*').order('full_name', { ascending: true })
  if (error) throw error
  return (data as Guest[]) ?? []
}

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

export function GuestsPage() {
  const { profile } = useAuth()
  const isStaff = !!profile && STAFF_ROLES.includes(profile.role)
  const isAdmin = profile?.role === 'admin'
  const queryClient = useQueryClient()
  const [search, setSearch] = React.useState('')

  const { data: guests, isLoading } = useQuery({ queryKey: ['guests'], queryFn: fetchGuests })

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

  const deleteGuest = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('guests').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guests'] })
      toast.success('Hóspede excluído.')
    },
    onError: (error) => {
      toast.error(
        errorCode(error) === '23503'
          ? 'Não é possível excluir: há reservas vinculadas a este hóspede.'
          : 'Não foi possível excluir o hóspede.'
      )
    },
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
                    {isStaff && (
                      <TableCell className="space-x-2 text-right">
                        <GuestDialog guest={guest} />
                        {isAdmin && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (window.confirm(`Excluir o hóspede "${guest.full_name}"?`)) {
                                deleteGuest.mutate(guest.id)
                              }
                            }}
                          >
                            Excluir
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

function GuestDialog({ guest }: { guest?: Guest }) {
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
    mutationFn: async (values: GuestInput) => {
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
      const { error } = isEdit
        ? await supabase.from('guests').update(payload).eq('id', guest.id)
        : await supabase.from('guests').insert(payload)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guests'] })
      toast.success(isEdit ? 'Hóspede atualizado.' : 'Hóspede cadastrado.')
      reset()
      setOpen(false)
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
        <Button variant={isEdit ? 'outline' : 'default'} size={isEdit ? 'sm' : 'default'}>
          {isEdit ? 'Editar' : 'Novo hóspede'}
        </Button>
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
