import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  // eslint-disable-next-line no-console
  console.error('Missing Supabase env vars. Copy .env.example to .env and fill them in, then restart `npm run dev`.')
}

export const supabase = createClient(url, key)
