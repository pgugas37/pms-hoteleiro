import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
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
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { supabase } from '@/lib/supabase'
import { createUserSchema, type CreateUserInput } from '@/lib/validations'
import { ROLE_LABELS, ROLES, type Profile, type Role } from '@/types/auth'

async function fetchProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('full_name', { ascending: true })
  if (error) throw error
  return (data as Profile[]) ?? []
}

export function UsersListPage() {
  const queryClient = useQueryClient()
  const { data: profiles, isLoading } = useQuery({
    queryKey: ['profiles'],
    queryFn: fetchProfiles,
  })

  const updateProfile = useMutation({
    mutationFn: async ({ id, changes }: { id: string; changes: Partial<Pick<Profile, 'role' | 'active'>> }) => {
      const { error } = await supabase.from('profiles').update(changes).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] })
      toast.success('Usuário atualizado.')
    },
    onError: () => toast.error('Não foi possível atualizar o usuário.'),
  })

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Usuários</h1>
          <p className="text-sm text-muted-foreground">Gerencie os acessos ao sistema.</p>
        </div>
        <CreateUserDialog />
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando usuários...</p>}

      {profiles && profiles.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Papel</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {profiles.map((profile) => (
              <TableRow key={profile.id}>
                <TableCell>{profile.full_name}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{ROLE_LABELS[profile.role]}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={profile.active ? 'default' : 'outline'}>
                    {profile.active ? 'Ativo' : 'Inativo'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <EditUserDialog
                    profile={profile}
                    onSave={(changes) => updateProfile.mutate({ id: profile.id, changes })}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {profiles && profiles.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum usuário encontrado.</p>
      )}
    </div>
  )
}

function CreateUserDialog() {
  const queryClient = useQueryClient()
  const [open, setOpen] = React.useState(false)

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<CreateUserInput>({ resolver: zodResolver(createUserSchema) })

  const createUser = useMutation({
    mutationFn: async (values: CreateUserInput) => {
      const { error, data } = await supabase.functions.invoke('create-user', {
        body: { ...values, hotel_id: null },
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] })
      toast.success('Usuário convidado por e-mail.')
      reset()
      setOpen(false)
    },
    onError: () => toast.error('Não foi possível criar o usuário.'),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Novo usuário</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo usuário</DialogTitle>
          <DialogDescription>
            Um e-mail de convite será enviado para a pessoa definir a própria senha.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={handleSubmit((values) => createUser.mutate(values))}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="full_name">Nome completo</Label>
            <Input id="full_name" {...register('full_name')} />
            {errors.full_name && (
              <p className="text-sm text-destructive">{errors.full_name.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" {...register('email')} />
            {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
          </div>
          <div className="space-y-2">
            <Label>Papel</Label>
            <Controller
              control={control}
              name="role"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um papel" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((role) => (
                      <SelectItem key={role} value={role}>
                        {ROLE_LABELS[role]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.role && <p className="text-sm text-destructive">{errors.role.message}</p>}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={createUser.isPending}>
              {createUser.isPending ? 'Criando...' : 'Criar usuário'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EditUserDialog({
  profile,
  onSave,
}: {
  profile: Profile
  onSave: (changes: Partial<Pick<Profile, 'role' | 'active'>>) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [role, setRole] = React.useState<Role>(profile.role)
  const [active, setActive] = React.useState(profile.active)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Editar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{profile.full_name}</DialogTitle>
          <DialogDescription>Altere o papel ou o status de acesso.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Papel</Label>
            <Select value={role} onValueChange={(value) => setRole(value as Role)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="active">Usuário ativo</Label>
            <Switch id="active" checked={active} onCheckedChange={setActive} />
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={() => {
              onSave({ role, active })
              setOpen(false)
            }}
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
