export interface InternalNote {
  id: string
  guest_id: string | null
  room_id: string | null
  content: string
  created_by: string | null
  created_by_name: string
  created_at: string
}
