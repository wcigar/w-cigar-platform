import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://yzujoxdltvklrehphzsl.supabase.co'
const supabaseAnonKey = 'sb_publishable_gtr2N8UbDtmJbTcmibKYwQ_Pl6oK-GU'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
