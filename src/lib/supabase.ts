import { createClient } from '@supabase/supabase-js'

import { offlineAwareFetch } from '@/offline/connectivity'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Variaveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY nao configuradas. Confira o arquivo .env.local.'
  )
}

// O fetch próprio só existe para o modo de teste offline (hotelflowTeste.offline(true) no console).
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: offlineAwareFetch },
})
