import * as React from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface ConfirmOptions {
  title: string
  description?: React.ReactNode
  /** Texto do botão que confirma, com o verbo da ação (ex.: "Excluir reserva"). */
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = React.createContext<ConfirmFn | null>(null)

/**
 * Janela de confirmação do próprio sistema, no lugar do `window.confirm` do navegador.
 * O navegador embutido do app Claude (e alguns navegadores com pop-ups bloqueados) não mostra
 * a caixa nativa e devolve "cancelar" na hora — o botão "Excluir" parecia não fazer nada.
 * Uso: `const confirm = useConfirm()` e `if (await confirm({ title: '...' })) { ... }`.
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = React.useState<ConfirmOptions | null>(null)
  const [open, setOpen] = React.useState(false)
  const resolverRef = React.useRef<((value: boolean) => void) | null>(null)

  const confirm = React.useCallback<ConfirmFn>((next) => {
    resolverRef.current?.(false)
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve
      setOptions(next)
      setOpen(true)
    })
  }, [])

  function close(result: boolean) {
    resolverRef.current?.(result)
    resolverRef.current = null
    setOpen(false)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={open} onOpenChange={(isOpen) => !isOpen && close(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{options?.title}</DialogTitle>
            {options?.description && <DialogDescription>{options.description}</DialogDescription>}
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => close(false)}>
              {options?.cancelLabel ?? 'Voltar'}
            </Button>
            <Button variant={options?.destructive ? 'destructive' : 'default'} onClick={() => close(true)}>
              {options?.confirmLabel ?? 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  )
}

export function useConfirm(): ConfirmFn {
  const confirm = React.useContext(ConfirmContext)
  if (!confirm) throw new Error('useConfirm precisa estar dentro de <ConfirmProvider>.')
  return confirm
}
