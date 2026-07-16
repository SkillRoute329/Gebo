import { createClient } from '@supabase/supabase-js'

// Llaves de tu Laboratorio Local de Supabase (Generadas en Fase 4)
const supabaseUrl = 'http://127.0.0.1:54321'
const supabaseAnonKey = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
