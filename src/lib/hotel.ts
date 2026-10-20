import { getHotel } from '@/offline/queries'
import type { Hotel } from '@/types/hotel'

/** Dados do hotel, lidos da cópia local (funciona sem internet). */
export async function fetchHotel(): Promise<Hotel | null> {
  return getHotel()
}
