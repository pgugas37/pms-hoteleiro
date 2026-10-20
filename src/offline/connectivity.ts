const SIMULATE_KEY = 'hotelflow:simular-offline'

/** Modo de teste: o navegador do app não tem botão de desligar a internet. */
export function isSimulatedOffline(): boolean {
  try {
    return localStorage.getItem(SIMULATE_KEY) === '1'
  } catch {
    return false
  }
}

export function setSimulatedOffline(on: boolean): void {
  try {
    if (on) localStorage.setItem(SIMULATE_KEY, '1')
    else localStorage.removeItem(SIMULATE_KEY)
  } catch {
    // sem armazenamento, sem modo de teste
  }
  window.dispatchEvent(new Event(on ? 'offline' : 'online'))
}

/** fetch usado pelo cliente Supabase: no modo de teste, falha como se não houvesse rede. */
export const offlineAwareFetch: typeof fetch = (input, init) => {
  if (isSimulatedOffline()) return Promise.reject(new TypeError('Failed to fetch (modo de teste offline)'))
  return fetch(input, init)
}

export function browserSaysOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

/** O próprio site (Netlify) responde? Separa "sem internet" de "banco fora do ar". */
export async function siteReachable(): Promise<boolean> {
  if (isSimulatedOffline() || browserSaysOffline()) return false
  try {
    const response = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
    return response.ok
  } catch {
    return false
  }
}

declare global {
  interface Window {
    hotelflowTeste?: { offline: (on: boolean) => void }
  }
}

/** No console: hotelflowTeste.offline(true) corta a "internet" do app; offline(false) devolve. */
export function exposeTestHelpers(): void {
  window.hotelflowTeste = { offline: setSimulatedOffline }
}
