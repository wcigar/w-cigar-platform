import { supabase } from './supabase'

export async function logAudit(event, description, operator) {
  try {
    await supabase.from('audit_logs').insert({
      event, description: (description || '').slice(0, 500), operator: operator || 'SYSTEM'
    })
  } catch (e) { console.error('audit log failed', e) }
}
