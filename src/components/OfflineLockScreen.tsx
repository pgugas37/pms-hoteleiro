import { WifiOff } from 'lucide-react'

import { AuthHeading, AuthShell } from '@/components/AuthShell'
import { Button } from '@/components/ui/button'

/** Mais de 3 dias sem falar com o servidor: a cópia fica guardada, mas travada até a internet voltar. */
export function OfflineLockScreen() {
  return (
    <AuthShell>
      <AuthHeading
        title="Conecte-se à internet"
        description="Este aparelho está há mais de 3 dias sem falar com o servidor. Os dados continuam guardados aqui; assim que houver internet, o sistema volta a abrir."
      />
      <Button className="h-11 w-full" onClick={() => window.location.reload()}>
        <WifiOff className="h-4 w-4" />
        Tentar de novo
      </Button>
    </AuthShell>
  )
}
