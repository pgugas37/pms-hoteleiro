import { zodResolver } from '@hookform/resolvers/zod'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { AuthHeading, AuthShell } from '@/components/AuthShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { passwordUpdateErrorMessage } from '@/lib/authErrors'
import { supabase } from '@/lib/supabase'
import { newPasswordSchema, type NewPasswordInput } from '@/lib/validations'

export function RedefinirSenhaPage() {
  const navigate = useNavigate()
  const [submitting, setSubmitting] = React.useState(false)
  const [ready, setReady] = React.useState(false)

  React.useEffect(() => {
    // O link de convite/redefinição do Supabase cria uma sessão temporária de recuperação
    // assim que a página carrega (o cliente lê o token direto da URL).
    supabase.auth.getSession().then(({ data }) => setReady(!!data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        setReady(true)
      }
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<NewPasswordInput>({ resolver: zodResolver(newPasswordSchema) })

  async function onSubmit(values: NewPasswordInput) {
    setSubmitting(true)
    const { error } = await supabase.auth.updateUser({ password: values.password })
    setSubmitting(false)

    if (error) {
      toast.error(passwordUpdateErrorMessage(error, 'Não foi possível definir a senha. O link pode ter expirado.'))
      return
    }

    toast.success('Senha definida com sucesso.')
    navigate('/', { replace: true })
  }

  return (
    <AuthShell>
      <AuthHeading
        title="Definir senha"
        description={
          ready
            ? 'Escolha a senha que você vai usar para entrar no sistema.'
            : 'Abra esta página a partir do link enviado por e-mail.'
        }
      />
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="password">Nova senha</Label>
          <Input id="password" type="password" className="h-11" {...register('password')} />
          {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirmar senha</Label>
          <Input id="confirmPassword" type="password" className="h-11" {...register('confirmPassword')} />
          {errors.confirmPassword && <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>}
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={submitting || !ready}>
          {submitting ? 'Salvando...' : 'Salvar senha'}
        </Button>
      </form>
    </AuthShell>
  )
}
