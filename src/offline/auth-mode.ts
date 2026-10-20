import type { OfflineIdentity } from '@/offline/identity'

/** sessao = login válido; offline = sem rede, usando a última pessoa; bloqueado = offline há mais de 3 dias. */
export type AuthMode = 'sessao' | 'offline' | 'bloqueado' | 'deslogado'

export function decideStartupMode(input: {
  hasSession: boolean
  networkError: boolean
  identity: OfflineIdentity | null
  expired: boolean
}): AuthMode {
  if (input.hasSession) return 'sessao'
  if (input.networkError && input.identity) return input.expired ? 'bloqueado' : 'offline'
  return 'deslogado'
}
