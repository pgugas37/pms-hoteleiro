import { supabase } from '@/lib/supabase'
import type { Hotel } from '@/types/hotel'

export async function fetchHotel(): Promise<Hotel | null> {
  const { data, error } = await supabase.from('hotels').select('*').limit(1).maybeSingle()
  if (error) throw error
  return data as Hotel | null
}
