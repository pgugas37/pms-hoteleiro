import { z } from 'zod'

import { ROLES } from '@/types/auth'

export const loginSchema = z.object({
  email: z.string().min(1, 'Informe o e-mail.').email('E-mail inválido.'),
  password: z.string().min(1, 'Informe a senha.'),
})
export type LoginInput = z.infer<typeof loginSchema>

export const bootstrapSchema = z.object({
  full_name: z.string().min(2, 'Informe o nome completo.'),
  email: z.string().min(1, 'Informe o e-mail.').email('E-mail inválido.'),
})
export type BootstrapInput = z.infer<typeof bootstrapSchema>

export const createUserSchema = z.object({
  full_name: z.string().min(2, 'Informe o nome completo.'),
  email: z.string().min(1, 'Informe o e-mail.').email('E-mail inválido.'),
  role: z.enum(ROLES, { errorMap: () => ({ message: 'Selecione um papel.' }) }),
})
export type CreateUserInput = z.infer<typeof createUserSchema>

export const newPasswordSchema = z
  .object({
    password: z.string().min(8, 'A senha precisa ter ao menos 8 caracteres.'),
    confirmPassword: z.string().min(1, 'Confirme a senha.'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'As senhas não conferem.',
    path: ['confirmPassword'],
  })
export type NewPasswordInput = z.infer<typeof newPasswordSchema>
