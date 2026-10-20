import { beforeEach, describe, expect, it } from 'vitest'

import { decideStartupMode } from '@/offline/auth-mode'
import { clearIdentity, loadIdentity, markServerContact, offlineAccessExpired, saveIdentity } from '@/offline/identity'
import type { Profile } from '@/types/auth'

const DAY = 24 * 60 * 60 * 1000
const profile: Profile = {
  id: 'u1',
  full_name: 'Ana',
  role: 'recepcao',
  active: true,
  hotel_id: null,
  created_at: '',
  updated_at: '',
}

beforeEach(() => {
  localStorage.clear()
})

describe('identidade guardada', () => {
  it('salva, lê e apaga', () => {
    saveIdentity({ userId: 'u1', email: 'ana@hotel.com', profile })
    expect(loadIdentity()?.profile.role).toBe('recepcao')
    clearIdentity()
    expect(loadIdentity()).toBeNull()
  })

  it('3 dias sem falar com o servidor travam o acesso offline', () => {
    const now = Date.now()
    expect(offlineAccessExpired(now)).toBe(true)
    markServerContact(now - 2 * DAY)
    expect(offlineAccessExpired(now)).toBe(false)
    markServerContact(now - 4 * DAY)
    expect(offlineAccessExpired(now)).toBe(true)
  })
})

describe('decideStartupMode', () => {
  const identity = { userId: 'u1', email: null, profile }

  it('sessão válida vence tudo', () => {
    expect(decideStartupMode({ hasSession: true, networkError: false, identity: null, expired: true })).toBe('sessao')
  })
  it('sem rede e com identidade recente: offline', () => {
    expect(decideStartupMode({ hasSession: false, networkError: true, identity, expired: false })).toBe('offline')
  })
  it('sem rede e identidade velha: bloqueado', () => {
    expect(decideStartupMode({ hasSession: false, networkError: true, identity, expired: true })).toBe('bloqueado')
  })
  it('sem identidade, ou sem erro de rede: deslogado', () => {
    expect(decideStartupMode({ hasSession: false, networkError: true, identity: null, expired: false })).toBe('deslogado')
    expect(decideStartupMode({ hasSession: false, networkError: false, identity, expired: false })).toBe('deslogado')
  })
})
