import { Download, Share } from 'lucide-react'
import * as React from 'react'

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { hasInstallPrompt, isIos, isStandalone, promptInstall, subscribeInstallPrompt } from '@/pwa/install'

const ITEM_CLASS =
  'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[14px] text-sidebar-foreground/70 transition-colors hover:bg-white/[0.05] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint'

/** "Instalar app" no menu: convite do navegador (Chrome/Edge/Android) ou passo a passo do iPhone. */
export function InstallAppButton() {
  const canPrompt = React.useSyncExternalStore(subscribeInstallPrompt, hasInstallPrompt)
  const [iosHelp, setIosHelp] = React.useState(false)

  if (isStandalone()) return null

  if (canPrompt) {
    return (
      <button type="button" className={ITEM_CLASS} onClick={() => void promptInstall()}>
        <Download className="h-[18px] w-[18px] shrink-0 text-mint" />
        Instalar app
      </button>
    )
  }

  if (!isIos()) return null

  return (
    <>
      <button type="button" className={ITEM_CLASS} onClick={() => setIosHelp(true)}>
        <Download className="h-[18px] w-[18px] shrink-0 text-mint" />
        Instalar no iPhone
      </button>
      <Dialog open={iosHelp} onOpenChange={setIosHelp}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Instalar no iPhone</DialogTitle>
            <DialogDescription>Três toques, no Safari:</DialogDescription>
          </DialogHeader>
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li>
              Toque em <Share className="inline h-4 w-4" /> <strong>Compartilhar</strong>, na barra de baixo.
            </li>
            <li>
              Escolha <strong>Adicionar à Tela de Início</strong>.
            </li>
            <li>
              Toque em <strong>Adicionar</strong>. O ícone do HotelFlow aparece junto dos outros apps.
            </li>
          </ol>
        </DialogContent>
      </Dialog>
    </>
  )
}
