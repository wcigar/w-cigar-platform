import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://yzujoxdltvklrehphzsl.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6dWpveGRsdHZrbHJlaHBoenNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NDgzOTUsImV4cCI6MjA5MTEyNDM5NX0.xMDhOKXfFNueC_XIGQ-zzUutNpBXpnuo97Gf5IEKUcs'

export const supabase = createClient(supabaseUrl, supabaseKey)
