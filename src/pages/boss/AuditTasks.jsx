// 老闆 / 老闆娘（珊珊）查核員工每日拍照任務
// 通過：audit_status='approved'
// 駁回：audit_status='rejected' + audit_reason + sop_penalties $50 + LINE 私推員工
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { CheckCircle2, XCircle, Calendar } from 'lucide-react'
import { format, subDays } from 'date-fns'

export default function AuditTasks() {
  const { user } = useAuth()
  const [date, setDate] = useState(format(subDays(new Date(), 1), 'yyyy-MM-dd'))
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('pending')
  const [acting, setActing] = useState(null)

  useEffect(() => { load() }, [date, filter])

  async function load() {
    setLoading(true)
    let q = supabase.from('task_status').select('*')
      .eq('date', date)
      .eq('completed', true)
      .not('photo_url', 'is', null)
      .neq('photo_url', '')
      .order('owner').order('completed_at')
    const { data, error } = await q
    if (error) { console.error(error); setLoading(false); return }
    let filtered = data || []
    if (filter === 'pending') filtered = filtered.filter(t => !t.audit_status)
    else if (filter === 'approved') filtered = filtered.filter(t => t.audit_status === 'approved')
    else if (filter === 'rejected') filtered = filtered.filter(t => t.audit_status === 'rejected')
    setTasks(filtered)
    setLoading(false)
  }

  async function approve(t) {
    setActing(t.id)
    const { error } = await supabase.from('task_status').update({
      audit_status: 'approved', audited_by: user.name, audited_at: new Date().toISOString()
    }).eq('id', t.id)
    setActing(null)
    if (error) { alert('❌ 失敗：' + error.message); return }
    load()
  }

  async function reject(t) {
    const reason = window.prompt(`駁回「${t.title}」(${t.owner})\n理由（會 LINE 私推員工 + 扣 $50）：`)
    if (!reason || !reason.trim()) return
    setActing(t.id)
    // 1. 標記 rejected
    const { error: updErr } = await supabase.from('task_status').update({
      audit_status: 'rejected', audit_reason: reason.trim(),
      audited_by: user.name, audited_at: new Date().toISOString()
    }).eq('id', t.id)
    if (updErr) { setActing(null); alert('❌ 更新失敗：' + updErr.message); return }
    // 2. 加 $50 罰款
    const { error: penErr } = await supabase.from('sop_penalties').insert({
      date: t.date, employee_id: t.owner, task_id: t.task_id, task_title: t.title,
      category: t.category, reason: `${user.name}駁回：${reason.trim()}`, amount: 50
    })
    if (penErr) console.warn('罰款寫入失敗:', penErr.message)
    // 3. LINE 私推員工
    const { data: empRow } = await supabase.from('employees').select('line_user_id, name').eq('id', t.owner).maybeSingle()
    if (empRow?.line_user_id) {
      const msg = `⚠️ 任務照片不合規（${t.date}）\n━━━━━━━━━━\n\n${empRow.name} 您好：\n\n${user.name}查核您 ${t.date} 的「${t.title}」拍照、判定不合規：\n\n📝 駁回原因：${reason.trim()}\n\n💸 已記 $50 罰款\n📷 今天請務必確實重新拍照\n\n（此訊息私下發送、僅你可見）`
      try {
        await supabase.functions.invoke('staff-reminders', {
          body: { target_user_id: empRow.line_user_id, message: msg }
        })
      } catch (e) { console.warn('LINE push failed:', e) }
    } else {
      alert(`⚠️ ${t.owner} 未綁定 LINE、只在系統內顯示駁回紀錄`)
    }
    setActing(null)
    load()
  }

  const grouped = {}
  tasks.forEach(t => { if (!grouped[t.owner]) grouped[t.owner] = []; grouped[t.owner].push(t) })

  return (
    <div className="page-container fade-in">
      <div className="section-title">📋 任務查核</div>
      <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12 }}>
        查核員工每日拍照、駁回會 LINE 私推員工 + 扣 $50。
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <Calendar size={14} color="var(--gold)" />
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          style={{ padding: 8, borderRadius: 6, background: 'var(--black-card)', color: 'var(--text)', border: '1px solid var(--border)', fontSize: 13 }} />
        <button onClick={() => setDate(format(subDays(new Date(), 1), 'yyyy-MM-dd'))}
          style={{ padding: '6px 12px', borderRadius: 6, fontSize: 11, background: 'transparent', color: 'var(--gold)', border: '1px solid var(--border-gold)', cursor: 'pointer' }}>昨天</button>
        <button onClick={() => setDate(format(new Date(), 'yyyy-MM-dd'))}
          style={{ padding: '6px 12px', borderRadius: 6, fontSize: 11, background: 'transparent', color: 'var(--gold)', border: '1px solid var(--border-gold)', cursor: 'pointer' }}>今天</button>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {[
          { k: 'pending', l: '待審', c: 'var(--gold)' },
          { k: 'rejected', l: '已駁回', c: 'var(--red)' },
          { k: 'approved', l: '已通過', c: 'var(--green)' },
          { k: 'all', l: '全部', c: 'var(--text)' },
        ].map(f => (
          <button key={f.k} onClick={() => setFilter(f.k)}
            style={{ flex: 1, padding: '7px 8px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: filter === f.k ? 'var(--gold-glow)' : 'transparent', color: filter === f.k ? f.c : 'var(--text-dim)', border: filter === f.k ? '1px solid var(--border-gold)' : '1px solid var(--border)' }}>
            {f.l}
          </button>
        ))}
      </div>

      {loading && <div className="loading-shimmer" style={{ height: 100 }} />}

      {!loading && tasks.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>
          {filter === 'pending' ? '✅ 此日無待審任務' : '無紀錄'}
        </div>
      )}

      {Object.entries(grouped).map(([owner, items]) => (
        <div key={owner} style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)', marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid var(--border)' }}>
            👤 {owner} ({items.length})
          </div>
          {items.map(t => {
            const isPending = !t.audit_status
            const isApproved = t.audit_status === 'approved'
            const isRejected = t.audit_status === 'rejected'
            return (
              <div key={t.id} className="card" style={{ padding: 12, marginBottom: 8, borderColor: isApproved ? 'rgba(77,168,108,.3)' : isRejected ? 'rgba(196,77,77,.3)' : 'var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{t.title}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{t.category} · {t.completed_by} · {t.completed_at ? format(new Date(t.completed_at), 'HH:mm') : ''}</div>
                  </div>
                  {isApproved && <span style={{ fontSize: 10, padding: '2px 8px', background: 'rgba(77,168,108,.15)', color: 'var(--green)', borderRadius: 6, fontWeight: 600 }}>✓ {t.audited_by}</span>}
                  {isRejected && <span style={{ fontSize: 10, padding: '2px 8px', background: 'rgba(196,77,77,.15)', color: 'var(--red)', borderRadius: 6, fontWeight: 600 }}>✗ 駁回</span>}
                </div>
                {t.photo_url && (
                  <img src={t.photo_url} alt={t.title}
                    onClick={() => window.open(t.photo_url, '_blank')}
                    style={{ width: '100%', maxHeight: 280, objectFit: 'cover', borderRadius: 8, cursor: 'pointer', border: '1px solid var(--border)' }} />
                )}
                {t.note && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6 }}>📝 {t.note}</div>}
                {isRejected && t.audit_reason && (
                  <div style={{ marginTop: 8, padding: 8, background: 'rgba(196,77,77,.08)', borderRadius: 6, fontSize: 11, color: 'var(--red)' }}>
                    駁回原因：{t.audit_reason}
                  </div>
                )}
                {isPending && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                    <button disabled={acting === t.id} onClick={() => approve(t)}
                      style={{ flex: 1, padding: '10px 12px', borderRadius: 8, fontSize: 13, fontWeight: 700, background: 'rgba(77,168,108,.15)', color: 'var(--green)', border: '1px solid rgba(77,168,108,.4)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                      <CheckCircle2 size={14} /> {acting === t.id ? '...' : '通過'}
                    </button>
                    <button disabled={acting === t.id} onClick={() => reject(t)}
                      style={{ flex: 1, padding: '10px 12px', borderRadius: 8, fontSize: 13, fontWeight: 700, background: 'rgba(196,77,77,.12)', color: 'var(--red)', border: '1px solid rgba(196,77,77,.4)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                      <XCircle size={14} /> {acting === t.id ? '...' : '駁回 ($50)'}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
