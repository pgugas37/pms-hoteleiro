import { useQuery } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'

export function HomePage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['supabase-health'],
    queryFn: async () => {
      const { error } = await supabase.auth.getSession()
      if (error) throw error
      return true
    },
  })

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-3xl font-bold tracking-tight">PMS Hoteleiro</h1>
      <p className="max-w-md text-muted-foreground">
        Módulo 01 — Fundação e arquitetura. React + Vite + TypeScript + Tailwind CSS +
        shadcn/ui, conectado ao Supabase.
      </p>
      <div className="rounded-lg border bg-card px-4 py-3 text-sm">
        {isLoading && 'Verificando conexão com o Supabase...'}
        {isError && 'Não foi possível conectar ao Supabase. Confira o .env.local.'}
        {data && 'Conectado ao Supabase com sucesso.'}
      </div>
      <Button>Botão de exemplo (shadcn/ui)</Button>
    </div>
  )
}
