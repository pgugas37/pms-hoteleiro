import type { Profile } from '@/types/auth'

const IDENTITY_KEY = 'hotelflow:identidade'
const CONTACT_KEY = 'hotelflow:ultimo-contato'

/** Depois disso sem falar com o servidor, o app pede internet para continuar. */
export const OFFLINE_LIMIT_MS = 3 * 24 * 60 * 60 * 1000

export interface OfflineIdentity {
  userId: string
  email: string | null
  profile: Profile
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // armazenamento bloqueado: o modo offline só não fica disponível
  }
}

export function saveIdentity(identity: OfflineIdentity): void {
  write(IDENTITY_KEY, JSON.stringify(identity))
}

export function loadIdentity(): OfflineIdentity | null {
  const raw = read(IDENTITY_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as OfflineIdentity
  } catch {
    return null
  }
}

export function clearIdentity(): void {
  write(IDENTITY_KEY, null)
  write(CONTACT_KEY, null)
}

export function markServerContact(at = Date.now()): void {
  write(CONTACT_KEY, String(at))
}

export function lastServerContact(): number | null {
  const raw = read(CONTACT_KEY)
  return raw ? Number(raw) : null
}

export function offlineAccessExpired(now = Date.now()): boolean {
  const last = lastServerContact()
  return last === null || now - last > OFFLINE_LIMIT_MS
}
