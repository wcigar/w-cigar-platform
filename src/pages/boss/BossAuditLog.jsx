import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { ShieldAlert, RefreshCw, AlertTriangle, Eye, Download, Lock, Tag } from 'lucide-react'

const GOLD = '#c9a84c'

// 敏感/可疑事件：紅色高亮，方便老闆一眼抓出「有人在撈資料」
const EVENT_META = {
  blocked_access:        { label: '🚫 被擋·支出/廠商', color: '#e74c3c', alert: true },
  blocked_member_access: { label: '🚫 被擋·查會員', color: '#e74c3c', alert: true },
  view_customer:         { label: '👁 查看會員', color: '#f59e0b', alert: true },
  export_expense:        { label: '⬇ 匯出支出報表', color: '#f59e0b', alert: true },
  price_override:        { label: '✏ POS 改價', color: '#f59e0b', alert: true },
}
function metaOf(e) { return EVENT_META[e] || { label: e, color: '#8a8278', alert: false } }

export default function BossAuditLog() {
  const { user } = useAuth()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [onlyAlert, setOnlyAlert] = useState(false)
  const [operator, setOperator] = useState('all')

  async function load() {
    setLoading(true); setErr('')
    const { data, error } = await supabase.rpc('hr_audit_logs', { p_token: user?.hr_token, p_limit: 500 })
    if (error) { setErr(error.message); setLoading(false); return }
    if (!data?.ok) { setErr(data?.error === 'unauthorized' ? '權限不足或登入逾期，請重新登入後再試' : (data?.error || '讀取失敗')); setLoading(false); return }
    setRows(data.list || []); setLoading(false)
  }
  useEffect(() => { if (user?.hr_token) load(); else { setErr('需重新登入以取得權杖'); setLoading(false) } }, [user?.hr_token])

  const operators = useMemo(() => [...new Set(rows.map(r => r.operator).filter(Boolean))].sort(), [rows])
  const filtered = useMemo(() => rows.filter(r => {
    if (onlyAlert && !metaOf(r.event).alert) return false
    if (operator !== 'all' && r.operator !== operator) return false
    return true
  }), [rows, onlyAlert, operator])
  const alertCount = rows.filter(r => metaOf(r.event).alert).length

  return (
    <div className="page-container fade-in" style={{ maxWidth: 560, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, paddingTop: 8 }}>
        <ShieldAlert size={22} color={GOLD} />
        <span className="section-title" style={{ marginBottom: 0 }}>智能監控 · 稽核日誌</span>
        <button onClick={load} style={{ marginLeft: 'auto', background: 'none', border: '1px solid var(--border)', borderRadius: 8, color: GOLD, padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}><RefreshCw size={13} /> 重新整理</button>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--text-dim)', lineHeight: 1.7, marginBottom: 12 }}>
        記錄誰在何時存取/匯出重點資料、或嘗試開啟被鎖的頁面。<b style={{ color: '#e74c3c' }}>紅色＝可疑或被擋</b>，留意短期/新進員工是否頻繁觸碰會員與成本。
      </div>

      {!loading && !err && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <div className="card" style={{ flex: 1, padding: 10, textAlign: 'center' }}><div style={{ fontSize: 10, color: 'var(--text-dim)' }}>近期事件</div><div style={{ fontSize: 20, fontWeight: 700, color: GOLD }}>{rows.length}</div></div>
          <div className="card" style={{ flex: 1, padding: 10, textAlign: 'center', borderColor: alertCount ? 'rgba(231,76,60,.4)' : undefined }}><div style={{ fontSize: 10, color: 'var(--text-dim)' }}>可疑/被擋</div><div style={{ fontSize: 20, fontWeight: 700, color: alertCount ? '#e74c3c' : 'var(--green)' }}>{alertCount}</div></div>
        </div>
      )}

      {!loading && !err && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => setOnlyAlert(v => !v)} style={{ padding: '6px 12px', borderRadius: 16, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: onlyAlert ? 'rgba(231,76,60,.15)' : 'transparent', color: onlyAlert ? '#e74c3c' : 'var(--text-dim)', border: `1px solid ${onlyAlert ? 'rgba(231,76,60,.4)' : 'var(--border)'}` }}><AlertTriangle size={12} style={{ verticalAlign: -2, marginRight: 4 }} />只看可疑/被擋</button>
          <select value={operator} onChange={e => setOperator(e.target.value)} style={{ fontSize: 12, padding: '6px 10px', borderRadius: 8, background: 'var(--black-card)', border: '1px solid var(--border)', color: 'var(--text)' }}>
            <option value="all">全部人員</option>
            {operators.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      )}

      {loading ? <div>{[1, 2, 3].map(i => <div key={i} className="loading-shimmer" style={{ height: 56, marginBottom: 8, borderRadius: 10 }} />)}</div>
        : err ? <div className="card" style={{ padding: 20, color: 'var(--red)', textAlign: 'center' }}>{err}</div>
          : filtered.length === 0 ? <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>目前沒有符合條件的紀錄</div>
            : filtered.map(r => {
              const m = metaOf(r.event)
              return (
                <div key={r.id} className="card" style={{ padding: '10px 12px', marginBottom: 6, borderColor: m.alert ? 'rgba(231,76,60,.3)' : 'var(--border)', borderLeft: `3px solid ${m.color}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: m.color }}>{m.label}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{r.time ? new Date(r.time).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--text)', marginTop: 4 }}>{r.description}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 3 }}>操作者：<b style={{ color: 'var(--text)' }}>{r.operator}</b></div>
                </div>
              )
            })}
    </div>
  )
}
