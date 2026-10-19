import { Link } from 'react-router-dom'

import simboloUrl from '@/assets/brand/millenium-simbolo.png'
import { Button } from '@/components/ui/button'

export function AcessoNegadoPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <img src={simboloUrl} alt="" className="mb-2 h-12 w-12" />
      <h1 className="text-[32px] font-semibold leading-tight">Acesso negado</h1>
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
