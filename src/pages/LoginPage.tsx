import { zodResolver } from '@hookform/resolvers/zod'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { Navigate, useLocation } from 'react-router-dom'
import { toast } from 'sonner'

import { AuthHeading, AuthShell } from '@/components/AuthShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import {
  forgotPasswordSchema,
  loginSchema,
  type ForgotPasswordInput,
  type LoginInput,
} from '@/lib/validations'

const TEXT_LINK_CLASS =
  'text-sm font-medium text-mint-strong underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/**
 * "Esqueci minha senha": pede ao Supabase um e-mail de recuperação. O link do e-mail abre
 * /redefinir-senha (tela que já existia para o convite), onde a pessoa define a senha nova.
 */
function ForgotPasswordForm({ defaultEmail, onBack }: { defaultEmail: string; onBack: () => void }) {
  const [submitting, setSubmitting] = React.useState(false)
  const [sentTo, setSentTo] = React.useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: defaultEmail },
  })

  async function onSubmit(values: ForgotPasswordInput) {
    setSubmitting(true)
    const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    })
    setSubmitting(false)
    if (error) {
      toast.error('Não foi possível enviar o e-mail agora. Aguarde alguns minutos e tente de novo.')
      return
    }
    setSentTo(values.email)
  }

  if (sentTo) {
    return (
      <>
        <AuthHeading
          title="Confira seu e-mail"
          description={`Se ${sentTo} tiver uma conta no sistema, chega em instantes um link para definir a senha nova. Veja também a caixa de spam.`}
        />
        <Button variant="outline" size="lg" className="w-full" onClick={onBack}>
          Voltar para o login
        </Button>
      </>
    )
  }

  return (
    <>
      <AuthHeading
        title="Esqueci minha senha"
        description="Informe o e-mail da sua conta. Vamos enviar um link para você definir uma senha nova."
      />
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="reset-email">E-mail</Label>
          <Input id="reset-email" type="email" autoComplete="email" className="h-11" {...register('email')} />
          {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={submitting}>
          {submitting ? 'Enviando...' : 'Enviar link'}
        </Button>
        <button type="button" onClick={onBack} className={TEXT_LINK_CLASS}>
          Voltar para o login
        </button>
      </form>
    </>
  )
}

export function LoginPage() {
  const { session } = useAuth()
  const location = useLocation()
  const [submitting, setSubmitting] = React.useState(false)
  const [mode, setMode] = React.useState<'login' | 'forgot'>('login')

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) })

  if (session) {
    const from = (location.state as { from?: Location })?.from?.pathname ?? '/'
    return <Navigate to={from} replace />
  }

  async function onSubmit(values: LoginInput) {
    setSubmitting(true)
    const { error } = await supabase.auth.signInWithPassword(values)
    setSubmitting(false)
    if (error) {
      toast.error('Não foi possível entrar. Confira e-mail e senha.')
    }
  }

  if (mode === 'forgot') {
    return (
      <AuthShell>
        <ForgotPasswordForm defaultEmail={getValues('email') ?? ''} onBack={() => setMode('login')} />
      </AuthShell>
    )
  }

  return (
    <AuthShell>
      <AuthHeading title="Entrar" description="Use o e-mail e a senha da sua conta na equipe do hotel." />
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" type="email" autoComplete="email" className="h-11" {...register('email')} />
          {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="password">Senha</Label>
            <button type="button" onClick={() => setMode('forgot')} className={TEXT_LINK_CLASS}>
              Esqueci minha senha
            </button>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            className="h-11"
            {...register('password')}
          />
          {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={submitting}>
          {submitting ? 'Entrando...' : 'Entrar'}
        </Button>
      </form>
    </AuthShell>
  )
}
