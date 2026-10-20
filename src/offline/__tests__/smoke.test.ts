import { describe, expect, it } from 'vitest'

describe('ambiente de teste', () => {
  it('tem IndexedDB falso e localStorage', () => {
    expect(typeof indexedDB.open).toBe('function')
    localStorage.setItem('x', '1')
    expect(localStorage.getItem('x')).toBe('1')
  })
})
