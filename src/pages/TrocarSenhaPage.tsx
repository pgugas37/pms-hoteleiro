import { zodResolver } from '@hookform/resolvers/zod'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { newPasswordSchema, type NewPasswordInput } from '@/lib/validations'
import { ROLE_LABELS } from '@/types/auth'

export function TrocarSenhaPage() {
  const { profile } = useAuth()
  const [submitting, setSubmitting] = React.useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<NewPasswordInput>({ resolver: zodResolver(newPasswordSchema) })

  async function onSubmit(values: NewPasswordInput) {
    setSubmitting(true)
    const { error } = await supabase.auth.updateUser({ password: values.password })
    setSubmitting(false)

    if (error) {
      toast.error('Não foi possível trocar a senha.')
      return
    }

    toast.success('Senha atualizada com sucesso.')
    reset()
  }

  return (
    <div className="mx-auto max-w-sm space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Minha conta</h1>
        {profile && (
          <p className="text-sm text-muted-foreground">
            {profile.full_name} · {ROLE_LABELS[profile.role]}
          </p>
        )}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Trocar senha</CardTitle>
          <CardDescription>Defina uma nova senha para sua conta.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Nova senha</Label>
              <Input id="password" type="password" {...register('password')} />
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar senha</Label>
              <Input id="confirmPassword" type="password" {...register('confirmPassword')} />
              {errors.confirmPassword && (
                <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
              )}
            </div>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Salvando...' : 'Salvar nova senha'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
