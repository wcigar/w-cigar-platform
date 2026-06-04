// Dealer Supabase client（w-cigar-dealer project: oecagouzanoddmwfrvka）
// 客戶端 customer UI 走這個、跟 platform 完全隔離
import { createClient } from '@supabase/supabase-js'

const DEALER_URL = 'https://oecagouzanoddmwfrvka.supabase.co'
const DEALER_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lY2Fnb3V6YW5vZGRtd2ZydmthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NjQxMDIsImV4cCI6MjA5MTI0MDEwMn0.QTfo2sCcZLbOwHLm_ybzvOWPzO_sJYwCQyOHgNTU7Y8'

export const supabaseDealer = createClient(DEALER_URL, DEALER_ANON, {
  auth: { autoRefreshToken: false, persistSession: false },
})
