export interface HotelAddress {
  street: string
  number: string
  neighborhood: string
  city: string
  state: string
  zip: string
}

export interface Hotel {
  id: string
  name: string
  cnpj: string | null
  address: HotelAddress | null
  timezone: string
  created_at: string
  updated_at: string
}

export const BRAZIL_STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const

export const BRAZIL_TIMEZONES = [
  { value: 'America/Noronha', label: 'Fernando de Noronha (UTC-2)' },
  { value: 'America/Sao_Paulo', label: 'Brasília (UTC-3)' },
  { value: 'America/Manaus', label: 'Manaus (UTC-4)' },
  { value: 'America/Rio_Branco', label: 'Acre (UTC-5)' },
] as const
