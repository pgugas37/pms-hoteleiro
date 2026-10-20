import * as React from 'react'
import { toast } from 'sonner'
import { useRegisterSW } from 'virtual:pwa-register/react'

const UPDATE_CHECK_MS = 60 * 60 * 1000

/** Avisa quando há versão nova publicada; não recarrega sozinho no meio de um cadastro. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (registration) setInterval(() => void registration.update(), UPDATE_CHECK_MS)
    },
  })

  React.useEffect(() => {
    if (!needRefresh) return
    toast('Nova versão disponível.', {
      duration: Infinity,
      action: { label: 'Atualizar', onClick: () => void updateServiceWorker(true) },
    })
  }, [needRefresh, updateServiceWorker])

  return null
}
