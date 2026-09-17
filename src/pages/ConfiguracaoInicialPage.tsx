import { zodResolver } from '@hookform/resolvers/zod'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'
import { bootstrapSchema, type BootstrapInput } from '@/lib/validations'

export function ConfiguracaoInicialPage() {
  const [submitting, setSubmitting] = React.useState(false)
  const [done, setDone] = React.useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<BootstrapInput>({ resolver: zodResolver(bootstrapSchema) })

  async function onSubmit(values: BootstrapInput) {
    setSubmitting(true)
    const { error } = await supabase.functions.invoke('create-user', {
      body: { ...values, role: 'admin', hotel_id: null },
    })
    setSubmitting(false)

    if (error) {
      toast.error(
        'Não foi possível criar o administrador. Se o sistema já tem um administrador, use a tela de login.'
      )
      return
    }

    setDone(true)
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Card className="w-full max-w-sm text-center">
          <CardHeader>
            <CardTitle>Administrador criado</CardTitle>
            <CardDescription>
              Enviamos um e-mail de convite. Abra-o e defina sua senha para poder entrar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link to="/login">Ir para o login</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Configuração inicial</CardTitle>
          <CardDescription>
            Crie a primeira conta de administrador do sistema. Isso só funciona se ainda não
            existir nenhum usuário cadastrado.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Criando...' : 'Criar administrador'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
