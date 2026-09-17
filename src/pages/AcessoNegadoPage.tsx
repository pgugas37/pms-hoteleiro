import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'

export function AcessoNegadoPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-3xl font-bold tracking-tight">Acesso negado</h1>
      <p className="max-w-md text-muted-foreground">
        Sua conta não tem permissão para acessar esta página. Se você acredita que isso é um
        engano, fale com um administrador do sistema.
      </p>
      <Button asChild>
        <Link to="/">Voltar para o início</Link>
      </Button>
    </div>
  )
}
