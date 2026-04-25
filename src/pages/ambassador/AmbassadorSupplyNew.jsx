// src/pages/ambassador/AmbassadorSupplyNew.jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, AlertTriangle } from 'lucide-react'
import { getAmbassadorSession } from '../../lib/services/ambassadorAuth'
import { submitRequest, SUPPLY_CATEGORIES } from '../../lib/services/supplies'
import PageShell, { Card } from '../../components/PageShell'

export default function AmbassadorSupplyNew() {
  const navigate = useNavigate()
  const session = getAmbassadorSession()

  const [urgency, setUrgency] = useState('normal')
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [customName, setCustomName] = useState('')
  const [items, setItems] = useState(SUPPLY_CATEGORIES.map(c => ({ code: c.code, name: c.name, unit: c.unit, highRisk: !!c.highRisk, qty: 0 })))
  const [submitting, setSubmitting] = useState(false)

  function updateQty(code, qty) {
    setItems(items.map(it => it.code === code ? { ...it, qty: Math.max(0, parseInt(qty) || 0) } : it))
  }

  const selected = items.filter(it => it.qty > 0)
  const hasHighRisk = selected.some(it => it.highRisk)

  async function handleSubmit() {
    if (selected.length === 0) { alert('請至少選一項耗材'); return }
    if (!reason.trim()) { alert('請填寫申請原因'); return }
    if (items.find(it => it.code === 'other' && it.qty > 0) && !customName.trim()) {
      alert('選了「其他」請填寫品項名稱'); return
    }
    setSubmitting(true)
    const payload = {
      ambassador_id: session.ambassador_id,
      venue_id: session.default_venue_id,
      urgency, reason, note,
      items: selected.map(it => ({
        code: it.code,
        custom_name: it.code === 'other' ? customName.trim() : null,
        qty: it.qty,
      })),
    }
    try {
      await submitRequest(payload)
      alert(hasHighRisk ? '申請已送出（含高風險耗材，需主管核准）' : '申請已送出')
      navigate('/ambassador/supplies')
    } catch (e) {
      alert('送出失敗：' + (e.message || '未知錯誤'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <PageShell
      title="新增耗材申請"
      subtitle="SUPPLY REQUEST · NEW"
      actions={<button onClick={() => navigate(-1)} style={backBtn()}><ArrowLeft size={14} /> 返回</button>}
    >
      <Card style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: '#8a8278', letterSpacing: 1, marginBottom: 8 }}>急迫程度</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <RadioTile active={urgency === 'normal'} onClick={() => setUrgency('normal')} color="#c9a84c">一般</RadioTile>
          <RadioTile active={urgency === 'urgent'} onClick={() => setUrgency('urgent')} color="#f87171">急件</RadioTile>
        </div>
      </Card>

      <Card style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: '#8a8278', letterSpacing: 1, marginBottom: 10 }}>品項與數量</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map(it => (
            <div key={it.code} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, fontSize: 14, color: '#e8e0d0' }}>
                {it.name}
                {it.highRisk && <span style={{ marginLeft: 6, fontSize: 10, color: '#fbbf24' }}>（高風險·需主管核准）</span>}
              </div>
              <div style={{ fontSize: 10, color: '#6a655c', width: 24 }}>{it.unit}</div>
              <input type="number" min="0" value={it.qty || ''}
                onChange={e => updateQty(it.code, e.target.value)}
                style={{ width: 64, padding: '6px 8px', background: '#1a1714', border: '1px solid #2a2520', borderRadius: 6, color: '#e8dcc8', textAlign: 'right', fontSize: 13 }} />
            </div>
          ))}
        </div>

        {items.find(it => it.code === 'other' && it.qty > 0) && (
          <div style={{ marginTop: 10 }}>
            <input placeholder="其他品項名稱（必填）" value={customName} onChange={e => setCustomName(e.target.value)}
              style={inputStyle()} />
          </div>
        )}
      </Card>

      <Card style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: '#8a8278', letterSpacing: 1, marginBottom: 8 }}>申請原因（必填）</div>
        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2}
          placeholder="例如：下週週末團訂桌，預估需要..."
          style={{ ...inputStyle(), resize: 'vertical' }} />
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: '#8a8278', letterSpacing: 1, marginBottom: 8 }}>備註（選填）</div>
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
          style={{ ...inputStyle(), resize: 'vertical' }} />
      </Card>

      {hasHighRisk && (
        <Card style={{ marginBottom: 14, borderColor: 'rgba(251,191,36,0.35)', background: 'rgba(245,158,11,0.08)' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <AlertTriangle size={16} color="#fbbf24" style={{ marginTop: 2 }} />
            <div style={{ color: '#fde68a', fontSize: 12, lineHeight: 1.6 }}>
              本申請包含高風險耗材（瓦斯 / 剪 / 鑽孔器 / 通針），需主管額外核准，處理時間可能較長。
            </div>
          </div>
        </Card>
      )}

      <button onClick={handleSubmit} disabled={submitting}
        style={{
          width: '100%', padding: 14, borderRadius: 10, border: 'none',
          background: 'linear-gradient(135deg, #c9a84c 0%, #8b6d2f 100%)',
          color: '#0a0a0a', fontSize: 15, fontWeight: 700, cursor: 'pointer', letterSpacing: 2,
          opacity: submitting ? 0.6 : 1,
        }}>
        {submitting ? '送出中...' : '送出申請'}
      </button>
    </PageShell>
  )
}

function RadioTile({ active, onClick, color, children }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: '10px 12px', borderRadius: 8,
      background: active ? `${color}22` : 'rgba(255,255,255,0.02)',
      border: `1px solid ${active ? color : '#2a2520'}`,
      color: active ? color : '#8a8278', fontSize: 13, cursor: 'pointer', fontWeight: active ? 600 : 400,
    }}>{children}</button>
  )
}

function inputStyle() {
  return { width: '100%', padding: '10px 12px', background: '#1a1714', border: '1px solid #2a2520', borderRadius: 8, color: '#e8dcc8', fontSize: 14, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }
}

function backBtn() {
  return { background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.2)', color: '#c9a84c', padding: '6px 10px', borderRadius: 6, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }
}
