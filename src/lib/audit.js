import { supabase } from './supabase'

// audit_logs 為 deny_all（RLS 全擋），必須走 SECURITY DEFINER RPC log_audit。
// 直接 insert 會 silent fail（先前的 price_override 稽核其實沒寫進去）。
export async function logAudit(event, description, operator) {
  try {
    await supabase.rpc('log_audit', {
      p_event: event, p_description: (description || '').slice(0, 500), p_operator: operator || 'SYSTEM',
    })
  } catch (e) { console.error('audit log failed', e) }
}
