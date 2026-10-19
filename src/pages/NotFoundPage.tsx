import { Link } from 'react-router-dom'

import simboloUrl from '@/assets/brand/millenium-simbolo.png'
import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <img src={simboloUrl} alt="" className="mb-2 h-12 w-12" />
      <h1 className="text-[32px] font-semibold leading-tight">Página não encontrada</h1>
      <p className="text-muted-foreground">O endereço acessado não existe.</p>
      <Button asChild>
        <Link to="/">Voltar para o início</Link>
      </Button>
    </div>
  )
}
