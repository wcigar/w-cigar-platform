import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://yzujoxdltvklrehphzsl.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6dWpveGRsdHZrbHJlaHBoenNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NDgzOTUsImV4cCI6MjA5MTEyNDM5NX0.xMDhOKXfFNueC_XIGQ-zzUutNpBXpnuo97Gf5IEKUcs'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
