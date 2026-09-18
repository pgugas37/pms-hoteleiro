import { z } from 'zod'

import { isValidCnpj, isValidCpf } from '@/lib/documents'
import { BRAZIL_STATES } from '@/types/hotel'
import { ROLES } from '@/types/auth'
import { ROOM_STATUSES } from '@/types/room'
import { DOCUMENT_TYPES } from '@/types/guest'
import { RESERVATION_STATUSES } from '@/types/reservation'

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

export const hotelSchema = z.object({
  name: z.string().min(2, 'Informe o nome do hotel.'),
  cnpj: z.string().refine(isValidCnpj, 'CNPJ inválido.'),
  timezone: z.string().min(1, 'Selecione o fuso horário.'),
  street: z.string().min(1, 'Informe a rua.'),
  number: z.string().min(1, 'Informe o número.'),
  neighborhood: z.string().min(1, 'Informe o bairro.'),
  city: z.string().min(1, 'Informe a cidade.'),
  state: z.enum(BRAZIL_STATES, { errorMap: () => ({ message: 'Selecione o estado.' }) }),
  zip: z.string().refine((value) => value.replace(/\D/g, '').length === 8, 'CEP precisa ter 8 dígitos.'),
})
export type HotelInput = z.infer<typeof hotelSchema>

export const roomTypeSchema = z.object({
  name: z.string().min(1, 'Informe o nome do tipo de quarto.'),
  description: z.string().optional(),
  capacity_adults: z.coerce.number().int().min(1, 'Mínimo de 1 adulto.'),
  capacity_children: z.coerce.number().int().min(0, 'Não pode ser negativo.'),
  base_price: z.coerce.number().min(0, 'O preço não pode ser negativo.'),
})
export type RoomTypeInput = z.infer<typeof roomTypeSchema>

export const roomSchema = z.object({
  room_type_id: z.string().min(1, 'Selecione o tipo de quarto.'),
  number: z.string().min(1, 'Informe o número do quarto.'),
  floor: z.string().optional(),
  status: z.enum(ROOM_STATUSES, { errorMap: () => ({ message: 'Selecione o status.' }) }),
  notes: z.string().optional(),
})
export type RoomInput = z.infer<typeof roomSchema>

export const guestSchema = z
  .object({
    full_name: z.string().min(2, 'Informe o nome completo.'),
    document_type: z.enum(DOCUMENT_TYPES, {
      errorMap: () => ({ message: 'Selecione o tipo de documento.' }),
    }),
    document_number: z.string().min(1, 'Informe o número do documento.'),
    email: z.union([z.string().email('E-mail inválido.'), z.literal('')]).optional(),
    phone: z.string().optional(),
    birth_date: z.string().optional(),
    nationality: z.string().min(1, 'Informe a nacionalidade.'),
    notes: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.document_type === 'cpf') return isValidCpf(data.document_number)
      if (data.document_type === 'cnpj') return isValidCnpj(data.document_number)
      return data.document_number.trim().length > 0
    },
    { message: 'Documento inválido para o tipo selecionado.', path: ['document_number'] }
  )
export type GuestInput = z.infer<typeof guestSchema>

export const reservationSchema = z
  .object({
    guest_id: z.string().min(1, 'Selecione o hóspede.'),
    room_id: z.string().min(1, 'Selecione o quarto.'),
    check_in: z.string().min(1, 'Informe a data de entrada.'),
    check_out: z.string().min(1, 'Informe a data de saída.'),
    adults: z.coerce.number().int().min(1, 'Mínimo de 1 adulto.'),
    children: z.coerce.number().int().min(0, 'Não pode ser negativo.'),
    daily_rate: z.coerce.number().min(0, 'A diária não pode ser negativa.'),
    status: z.enum(RESERVATION_STATUSES, { errorMap: () => ({ message: 'Selecione o status.' }) }),
    notes: z.string().optional(),
  })
  .refine((data) => new Date(data.check_out) > new Date(data.check_in), {
    message: 'A data de saída precisa ser depois da entrada.',
    path: ['check_out'],
  })
export type ReservationInput = z.infer<typeof reservationSchema>
