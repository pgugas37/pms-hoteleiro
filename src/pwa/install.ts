/* Convite de instalação do navegador (Chrome, Edge, Android), guardado mesmo se chegar antes do React montar. */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())

export function captureInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferred = event as BeforeInstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    notify()
  })
}

export function hasInstallPrompt(): boolean {
  return deferred !== null
}

export function subscribeInstallPrompt(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export async function promptInstall(): Promise<void> {
  if (!deferred) return
  await deferred.prompt()
  deferred = null
  notify()
}

/** Já está aberto como app instalado? */
export function isStandalone(): boolean {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
  return window.matchMedia('(display-mode: standalone)').matches || iosStandalone
}

export function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}
