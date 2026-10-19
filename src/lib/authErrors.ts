import type { AuthError } from '@supabase/supabase-js'

/**
 * Traduz os erros mais comuns do Supabase ao definir/trocar senha. Antes a tela mostrava sempre
 * uma mensagem genérica ("o link pode ter expirado"), mesmo quando o motivo era outro.
 */
export function passwordUpdateErrorMessage(error: AuthError, fallback: string): string {
  if (error.code === 'same_password') return 'A senha nova precisa ser diferente da senha atual.'
  if (error.code === 'weak_password') {
    return 'Essa senha é fraca demais. Use pelo menos 8 caracteres, misturando letras e números.'
  }
  if (error.code === 'session_not_found' || error.code === 'session_expired') {
    return 'Sua sessão expirou. Peça um novo link em "Esqueci minha senha" na tela de login.'
  }
  return fallback
}
