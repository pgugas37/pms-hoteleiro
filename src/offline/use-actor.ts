import { useAuth } from '@/lib/auth-context'
import type { Actor } from '@/offline/actions'

/** Quem está fazendo a ação (id e cargo), com ou sem internet. */
export function useActor(): Actor | null {
  const { profile } = useAuth()
  return profile ? { id: profile.id, role: profile.role } : null
}
