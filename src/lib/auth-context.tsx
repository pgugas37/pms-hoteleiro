import { isAuthRetryableFetchError, type Session } from '@supabase/supabase-js'
import * as React from 'react'

import { supabase } from '@/lib/supabase'
import { decideStartupMode, type AuthMode } from '@/offline/auth-mode'
import { browserSaysOffline, isSimulatedOffline } from '@/offline/connectivity'
import { wipeLocalDataSafely } from '@/offline/db'
import { clearIdentity, loadIdentity, markServerContact, offlineAccessExpired, saveIdentity } from '@/offline/identity'
import type { Profile } from '@/types/auth'

interface AuthContextValue {
  session: Session | null
  userId: string | null
  profile: Profile | null
  /** sessao = login válido; offline = sem rede com a última pessoa; bloqueado = offline há mais de 3 dias. */
  mode: AuthMode
  isAuthenticated: boolean
  /** O servidor recusou a sessão (ex.: senha trocada). A cópia e o caderninho continuam guardados. */
  needsLogin: boolean
  loading: boolean
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined)

const STARTUP_TIMEOUT_MS = 5000

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | 'timeout'> {
  return Promise.race([promise, new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), ms))])
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null)
  const [profile, setProfile] = React.useState<Profile | null>(null)
  const [mode, setMode] = React.useState<AuthMode>('deslogado')
  const [needsLogin, setNeedsLogin] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const signingOut = React.useRef(false)

  const loadProfile = React.useCallback(async (current: Session) => {
    const useSavedProfile = () => {
      const identity = loadIdentity()
      setProfile(identity?.userId === current.user.id ? identity.profile : null)
    }
    // Sabidamente sem rede: nem tenta (a biblioteca repete a busca algumas vezes e a abertura demorava ~5 s).
    if (browserSaysOffline() || isSimulatedOffline()) return useSavedProfile()
    const { data, error, status } = await supabase.from('profiles').select('*').eq('id', current.user.id).maybeSingle()
    if (error && (status === 0 || status >= 500)) return useSavedProfile() // sem rede: perfil guardado
    const loaded = (data as Profile | null) ?? null
    setProfile(loaded)
    if (loaded) {
      saveIdentity({ userId: current.user.id, email: current.user.email ?? null, profile: loaded })
      markServerContact()
    }
  }, [])

  React.useEffect(() => {
    let active = true

    void (async () => {
      const result = await withTimeout(supabase.auth.getSession(), STARTUP_TIMEOUT_MS)
      if (!active) return
      const identity = loadIdentity()
      if (result === 'timeout') {
        const next = decideStartupMode({ hasSession: false, networkError: true, identity, expired: offlineAccessExpired() })
        setMode(next)
        setProfile(next === 'offline' ? identity?.profile ?? null : null)
        setLoading(false)
        return
      }
      const { data, error } = result
      const next = decideStartupMode({
        hasSession: !!data.session,
        networkError: !!error && isAuthRetryableFetchError(error),
        identity,
        expired: offlineAccessExpired(),
      })
      setMode(next)
      if (next === 'sessao' && data.session) {
        setSession(data.session)
        await loadProfile(data.session)
      } else if (next === 'offline') {
        setProfile(identity?.profile ?? null)
      } else if (next === 'deslogado' && identity) {
        setNeedsLogin(true) // a sessão sumiu sem a pessoa clicar em Sair
      }
      if (active) setLoading(false)
    })()

    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === 'SIGNED_OUT') {
        setSession(null)
        setMode('deslogado')
        if (signingOut.current) {
          signingOut.current = false
          setProfile(null)
          setNeedsLogin(false)
        } else if (loadIdentity()) {
          setNeedsLogin(true) // servidor recusou: guarda tudo e pede login
        } else {
          setProfile(null)
        }
        return
      }
      if (!newSession) return // eventos sem sessão (ex.: falha de rede ao renovar) não derrubam o modo offline
      setSession(newSession)
      setMode('sessao')
      setNeedsLogin(false)
      markServerContact()
      // Não chamar o Supabase dentro deste callback (recomendação do supabase-js); por isso o setTimeout.
      if (event === 'TOKEN_REFRESHED') {
        setTimeout(() => void loadProfile(newSession), 0)
      } else {
        setLoading(true)
        setTimeout(async () => {
          await loadProfile(newSession)
          setLoading(false)
        }, 0)
      }
    })

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [loadProfile])

  const signOut = React.useCallback(async () => {
    signingOut.current = true
    try {
      // só neste aparelho; funciona sem internet
      await supabase.auth.signOut({ scope: 'local' })
    } catch {
      // mesmo com erro, a cópia é apagada abaixo
    }
    await wipeLocalDataSafely()
    clearIdentity()
    setSession(null)
    setProfile(null)
    setMode('deslogado')
    setNeedsLogin(false)
  }, [])

  const refreshProfile = React.useCallback(async () => {
    if (session) await loadProfile(session)
  }, [session, loadProfile])

  const value: AuthContextValue = {
    session,
    userId: session?.user.id ?? profile?.id ?? null,
    profile,
    mode,
    isAuthenticated: mode === 'sessao' || mode === 'offline',
    needsLogin,
    loading,
    signOut,
    refreshProfile,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = React.useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth precisa ser usado dentro de um AuthProvider.')
  }
  return ctx
}
