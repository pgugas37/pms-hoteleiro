export const DOCUMENT_TYPES = ['cpf', 'cnpj', 'passport'] as const
export type DocumentType = (typeof DOCUMENT_TYPES)[number]

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  cpf: 'CPF',
  cnpj: 'CNPJ',
  passport: 'Passaporte',
}

export interface Guest {
  id: string
  full_name: string
  document_type: DocumentType
  document_number: string
  email: string | null
  phone: string | null
  birth_date: string | null
  nationality: string
  notes: string | null
  active: boolean
  created_at: string
  updated_at: string
}
